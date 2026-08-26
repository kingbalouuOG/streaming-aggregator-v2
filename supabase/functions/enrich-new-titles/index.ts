/**
 * Enrich New Titles Edge Function (Phase 0.5)
 *
 * Ongoing enrichment of new titles arriving from the daily sync and the
 * catalogue-gap backfill. Walks the `WHERE keywords IS NULL` work queue,
 * populating the four enrichment columns plus runtime via TMDb.
 *
 * SLICED + SELF-CHAINING (2026-08-25). One invocation processes ONE slice
 * — SLICE_LIMIT rows or SLICE_BUDGET_MS, whichever comes first — records
 * its progress, then enqueues the next slice through
 * `enqueue_function_call` (migrations 067/068) and returns. The daily cron
 * only ever starts slice 0.
 *
 * Why this changed: the old fixed cap of 100 rows/day was fine while the
 * catalogue was frozen and nothing new arrived. The moment the backfill
 * was repaired it became the binding constraint — a single backfill chain
 * on 2026-08-25 added 379 titles against a downstream capacity of 100/day.
 * A title with `keywords IS NULL` is never embedded (embed-new-titles
 * requires enrichment first), and a title with no embedding cannot be
 * retrieved by `match_titles_by_vector`, so it cannot reach For You. An
 * under-fed enrich queue is therefore invisible-catalogue, not just lag.
 *
 * Deploy: npx supabase functions deploy enrich-new-titles --project-ref fmusugdcnnwiuzkbjquo
 * Manual: curl -X POST https://<project>.supabase.co/functions/v1/enrich-new-titles \
 *           -H "Authorization: Bearer <service_role_key>"
 *
 * Required Supabase Functions env vars (set via `supabase secrets set`):
 *   - SUPABASE_URL                (auto-provided)
 *   - SUPABASE_SERVICE_ROLE_KEY   (auto-provided)
 *   - TMDB_API_KEY                (must be set explicitly)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractFields } from '../_shared/extract_fields.ts';

// ── Config ───────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_DELAY = 260; // ms — matches sync-content.ts and the backfill

// ── Slice budget ─────────────────────────────────────────
// Sized like backfill-missing-titles, and for the same reason: Edge
// Runtime workers linger minutes past their request, so INVOCATION COUNT
// is the scarce resource, not duration. 250 rows x 260ms = ~65s of pacing,
// budgeted at 75s — inside the range we have evidence completes (105s,
// 128s) and well under the ~150s zone where runs were being killed.
const SLICE_LIMIT = 250;
const SLICE_BUDGET_MS = 75_000;
const MAX_CHAIN_DEPTH = 12; // 12 x 250 = 3,000 rows per chain
const HANDOFF_DELAY_MS = 3_000;
const CHAIN_STALE_MS = 120_000;

// Heartbeat at least this often so resume_stalled_chains() (migration 068)
// can tell a working slice from a dead one before its 3-minute threshold.
const HEARTBEAT_EVERY_ROWS = 25;

// ── Helpers ──────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Thrown to abort the whole chain the instant TMDb rejects our credential.
// The 2026-06-07 → 2026-08-25 catalogue freeze was exactly this: a 401 on
// every call, counted as 100 individual per-row failures, reported as a
// 200, and visible nowhere a human would look.
class CredentialError extends Error {
  constructor(status: number, ref: string) {
    super(
      `TMDb rejected the credential (HTTP ${status}) on ${ref}. ` +
      `TMDB_API_KEY is missing, revoked, or is a v4 read token being sent ` +
      `as a v3 api_key parameter. Aborting the chain — every remaining ` +
      `fetch would fail identically.`
    );
    this.name = 'CredentialError';
  }
}

async function fetchTmdbDetail(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<unknown | null> {
  const append =
    mediaType === 'movie'
      ? 'keywords,credits,release_dates'
      : 'keywords,credits,content_ratings';
  const url = new URL(`${TMDB_BASE}/${mediaType}/${tmdbId}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  url.searchParams.set('append_to_response', append);

  // Two retries on 429/5xx with exponential backoff. We're per-row in a
  // capped loop, so don't burn the whole budget on a single bad row.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString());
    if (res.status === 404) return null;
    if (res.ok) return await res.json();
    if (res.status === 401 || res.status === 403) {
      throw new CredentialError(res.status, `${mediaType}/${tmdbId}`);
    }
    if (res.status === 429 || res.status >= 500) {
      const backoff = Math.pow(2, attempt + 2) * 1000;
      console.warn(`  retry ${attempt + 1}/3 after ${backoff}ms (HTTP ${res.status}) for ${mediaType}/${tmdbId}`);
      await sleep(backoff);
      continue;
    }
    throw new Error(`TMDb ${res.status} ${res.statusText} for ${mediaType}/${tmdbId}`);
  }
  throw new Error(`TMDb retries exhausted for ${mediaType}/${tmdbId}`);
}

interface TitleRow {
  id: number;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
}

interface SliceStats {
  fetched: number;
  processed: number;
  skipped: number;
  failed: number;
// A short fetch only means the queue is empty if the slice actually got
// THROUGH everything it fetched. Set when the elapsed-time budget cuts the
// loop short, so the drain check below cannot mistake "ran out of time" for
// "ran out of work".
//
// Found live 2026-08-26: an embed chain fetched 371 rows (under its 500
// cap), processed 200, hit the budget, and reported `queue drained` with
// 171 still pending. Nothing was lost — the rows stayed queued for the next
// scheduled run — but the chain stopped a tenth of the way through the work
// it was started to do, and said it had finished.
  truncated: boolean;
  // Aggregated by message so N identical failures collapse to one entry
  // with count=N rather than N rows of the same string.
  failures: Record<string, number>;
}

function emptySliceStats(): SliceStats {
  return { fetched: 0, processed: 0, skipped: 0, failed: 0, truncated: false, failures: {} };
}

function noteFailure(stats: SliceStats, message: string): void {
  stats.failures[message] = (stats.failures[message] ?? 0) + 1;
}

async function runEnrichSlice(stats: SliceStats, runId: string): Promise<void> {
  const startedAt = Date.now();

  const { data: rows, error } = await supabase
    .from('titles')
    .select('id, tmdb_id, media_type')
    .is('keywords', null)
    .order('id', { ascending: true })
    .limit(SLICE_LIMIT);

  if (error) throw new Error(`Supabase select failed: ${error.message}`);

  const queue = (rows ?? []) as TitleRow[];
  stats.fetched = queue.length;
  console.log(`  slice: ${queue.length} rows (cap ${SLICE_LIMIT})`);

  let sinceHeartbeat = 0;

  for (const row of queue) {
    if (Date.now() - startedAt > SLICE_BUDGET_MS) {
      console.log(`  slice budget reached after ${stats.processed + stats.skipped + stats.failed} rows`);
      stats.truncated = true;
      break;
    }

    try {
      // Rate gate: 260 ms between TMDb calls.
      await sleep(TMDB_DELAY);

      const tmdbResponse = await fetchTmdbDetail(row.tmdb_id, row.media_type);

      if (tmdbResponse === null) {
        // 404 — TMDb deleted the title. Leave keywords NULL so a future
        // invocation picks it up if TMDb re-adds it. Skipped, not failed.
        //
        // NOTE: a permanently-404 row is re-fetched on every future chain,
        // because unlike the backfill there is no skip-list here. Tolerable
        // while the count is small; if it grows, mirror backfill_skips.
        stats.skipped++;
        console.warn(`  skip  ${row.media_type}/${row.tmdb_id}: TMDb 404`);
        continue;
      }

      const fields = extractFields(tmdbResponse, row.media_type);
      const { error: updateError } = await supabase
        .from('titles')
        .update(fields)
        .eq('id', row.id);

      if (updateError) throw new Error(`Supabase update failed: ${updateError.message}`);
      stats.processed++;
    } catch (err) {
      // A dead credential is not a per-row problem — let it abort the chain.
      if (err instanceof CredentialError) throw err;
      stats.failed++;
      const message = err instanceof Error ? err.message : String(err);
      noteFailure(stats, message.replace(/\bfor (movie|tv)\/\d+$/, '').trim());
      console.error(`  fail  ${row.media_type}/${row.tmdb_id}: ${message}`);
    }

    if (++sinceHeartbeat >= HEARTBEAT_EVERY_ROWS) {
      sinceHeartbeat = 0;
      await supabase
        .from('sync_log')
        .update({ heartbeat_at: new Date().toISOString() })
        .eq('id', runId);
    }
  }
}

// ── Chain plumbing ───────────────────────────────────────

interface ChainState {
  depth: number;
  slices: number;
  queue_at_start: number | null;
  queue_at_end: number | null;
  failures: Record<string, number>;
  skipped: number;
  stopped_because: string | null;
  last_request_id: number | null;
  resumes?: number;
  last_delivery_status?: string;
}

function emptyChainState(queueAtStart: number | null): ChainState {
  return {
    depth: 0,
    slices: 0,
    queue_at_start: queueAtStart,
    queue_at_end: null,
    failures: {},
    skipped: 0,
    stopped_because: null,
    last_request_id: null,
  };
}

async function countQueue(): Promise<number | null> {
  const { count, error } = await supabase
    .from('titles')
    .select('id', { count: 'exact', head: true })
    .is('keywords', null);
  if (error) {
    console.error(`queue count failed: ${error.message}`);
    return null;
  }
  return count ?? 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function unauthorized() {
  return json({ status: 'error', message: 'Unauthorized' }, 401);
}

Deno.serve(async (req) => {
  // JWT verification — the cron and the chain handoff both pass a
  // service-role bearer (Vault-sourced); reject anything else.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return unauthorized();
  try {
    const payload = JSON.parse(atob(authHeader.split(' ')[1].split('.')[1]));
    if (payload.role !== 'service_role') throw new Error('not service_role');
  } catch {
    return unauthorized();
  }

  let depth = 0;
  let runId: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.depth === 'number') depth = body.depth;
    if (typeof body?.runId === 'string') runId = body.runId;
  } catch {
    // No body, or not JSON — treat as a fresh chain.
  }

  if (depth >= MAX_CHAIN_DEPTH) {
    console.warn(`refusing slice at depth ${depth} (cap ${MAX_CHAIN_DEPTH})`);
    // Close the run out rather than just returning. A slice that returns
    // without touching sync_log leaves the row at 'running', so
    // resume_stalled_chains() (migration 068) would keep resuming a chain
    // that is already finished until it exhausted its retry budget.
    if (runId) {
      await supabase
        .from('sync_log')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
        })
        .eq('id', runId);
    }
    return json({ status: 'stopped', reason: 'max chain depth', depth });
  }

  // ── Chain start ────────────────────────────────────────
  if (depth === 0) {
    const { error: reapError } = await supabase.rpc('reap_stale_sync_runs');
    if (reapError) console.error('reap_stale_sync_runs failed:', reapError.message);

    const { data: active } = await supabase
      .from('sync_log')
      .select('id')
      .eq('sync_type', 'enrich')
      .eq('status', 'running')
      .gte('heartbeat_at', new Date(Date.now() - CHAIN_STALE_MS).toISOString())
      .limit(1);
    if (active && active.length > 0) {
      console.log(`enrich chain already running (sync_log ${active[0].id}) — skipping`);
      return json({ status: 'skipped', reason: 'chain already running' });
    }

    const queue = await countQueue();
    const { data: syncLog, error: logError } = await supabase
      .from('sync_log')
      .insert({
        sync_type: 'enrich',
        source: 'tmdb',
        status: 'running',
        heartbeat_at: new Date().toISOString(),
        chain_state: emptyChainState(queue),
      })
      .select('id')
      .single();
    if (logError || !syncLog) {
      const message = logError?.message ?? 'sync_log insert returned no row';
      console.error('sync_log insert failed:', message);
      return json({ status: 'error', message }, 500);
    }
    runId = syncLog.id;
    console.log(`enrich chain ${runId} starting — queue ${queue ?? 'unknown'}`);
  }

  if (!runId) {
    return json({ status: 'error', message: 'chained slice called without runId' }, 400);
  }

  const { data: current, error: readError } = await supabase
    .from('sync_log')
    .select('titles_processed, errors, chain_state, status')
    .eq('id', runId)
    .single();
  if (readError || !current) {
    const message = readError?.message ?? `sync_log ${runId} not found`;
    return json({ status: 'error', message }, 500);
  }
  if (current.status !== 'running') {
    return json({ status: 'stopped', reason: `run is ${current.status}` });
  }

  const state: ChainState = {
    ...emptyChainState(null),
    ...((current.chain_state ?? {}) as Partial<ChainState>),
  };

  // ── Run one slice ──────────────────────────────────────
  const stats = emptySliceStats();
  let fatal: string | null = null;
  try {
    await runEnrichSlice(stats, runId);
  } catch (err) {
    fatal = err instanceof Error ? err.message : String(err);
    console.error(`slice at depth ${depth} failed:`, fatal);
  }

  state.depth = depth;
  state.slices += 1;
  state.skipped += stats.skipped;
  for (const [message, count] of Object.entries(stats.failures)) {
    state.failures[message] = (state.failures[message] ?? 0) + count;
  }

  const totals = {
    processed: (current.titles_processed ?? 0) + stats.processed,
    errors: (current.errors ?? 0) + stats.failed + (fatal ? 1 : 0),
  };

  let stop: string | null = null;
  if (fatal) stop = `fatal: ${fatal}`;
  else if (stats.fetched === 0) stop = 'queue drained';
  else if (stats.processed === 0 && stats.skipped === 0) {
    stop = 'slice made no forward progress — head of queue is systematically failing';
  } else if (!stats.truncated && stats.fetched < SLICE_LIMIT) stop = 'queue drained';
  else if (depth + 1 >= MAX_CHAIN_DEPTH) stop = `chain depth cap (${MAX_CHAIN_DEPTH}) reached`;

  const failureEntries = Object.entries(state.failures);
  const errorDetail =
    failureEntries.length === 0 && !fatal
      ? null
      : {
          total: totals.errors,
          fatal,
          skipped_404: state.skipped,
          errors: failureEntries
            .sort((a, b) => b[1] - a[1])
            .slice(0, 25)
            .map(([message, count]) => ({ message, count })),
        };

  if (stop) {
    state.stopped_because = stop;
    state.queue_at_end = await countQueue();
    const failed = Boolean(fatal) || (stats.fetched > 0 && stats.processed === 0 && stats.skipped === 0);
    await supabase
      .from('sync_log')
      .update({
        status: failed ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
        titles_processed: totals.processed,
        errors: totals.errors,
        error_details: errorDetail,
        chain_state: state,
      })
      .eq('id', runId);

    console.log(
      `enrich chain ${runId} ${failed ? 'FAILED' : 'done'} after ${state.slices} slice(s): ` +
      `enriched=${totals.processed} errors=${totals.errors} ` +
      `queue ${state.queue_at_start ?? '?'} -> ${state.queue_at_end ?? '?'} — ${stop}`
    );
    return json(
      {
        status: failed ? 'error' : 'ok',
        runId, slices: state.slices,
        enriched: totals.processed, errors: totals.errors,
        queueAtStart: state.queue_at_start, queueAtEnd: state.queue_at_end,
        stopped: stop,
      },
      failed ? 500 : 200
    );
  }

  // Persist BEFORE the handoff, so the work is durable even if the
  // enqueue fails.
  await supabase
    .from('sync_log')
    .update({
      heartbeat_at: new Date().toISOString(),
      titles_processed: totals.processed,
      errors: totals.errors,
      error_details: errorDetail,
      chain_state: state,
    })
    .eq('id', runId);

  await sleep(HANDOFF_DELAY_MS);
  const { data: requestId, error: chainError } = await supabase.rpc('enqueue_function_call', {
    p_function: 'enrich-new-titles',
    p_body: { depth: depth + 1, runId },
  });
  if (chainError) {
    console.error(`chain handoff failed at depth ${depth}:`, chainError.message);
    state.stopped_because = `chain handoff failed: ${chainError.message}`;
    await supabase
      .from('sync_log')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        errors: totals.errors + 1,
        error_details: {
          skipped_404: state.skipped,
          errors: errorDetail?.errors ?? [],
          total: totals.errors + 1,
          fatal: `enqueue_function_call failed: ${chainError.message}`,
        },
        chain_state: state,
      })
      .eq('id', runId);
    return json({ status: 'error', message: chainError.message }, 500);
  }

  // Second write, after the enqueue: the watchdog uses this id to look the
  // delivery up in net._http_response.
  state.last_request_id = typeof requestId === 'number' ? requestId : null;
  await supabase.from('sync_log').update({ chain_state: state }).eq('id', runId);

  console.log(
    `slice ${depth} done (enriched=${stats.processed} skipped=${stats.skipped} ` +
    `failed=${stats.failed}) — queued depth ${depth + 1}`
  );
  return json({
    status: 'ok', runId, depth, chained: depth + 1,
    sliceEnriched: stats.processed,
    sliceSkipped: stats.skipped,
    sliceFailed: stats.failed,
    enriched: totals.processed,
  });
});
