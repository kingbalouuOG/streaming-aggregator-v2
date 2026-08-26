/**
 * Embed New Titles Edge Function (Phase 1)
 *
 * Ongoing embedding of newly enriched titles. Runs daily at 06:45 UTC,
 * 15 minutes after enrich-new-titles (06:30), so titles that were synced
 * (06:00) and enriched (06:30) flow into embeddings the same day.
 *
 * Work queue: WHERE embedding IS NULL AND keywords IS NOT NULL
 *   - keywords IS NOT NULL ensures only enriched rows are embedded
 *   - TMDb-404 rows with NULL keywords are excluded
 *
 * BATCHED + SLICED + SELF-CHAINING (2026-08-25/26). Three changes, in
 * order of how much they matter:
 *
 *  1. BATCHING. This function used to call `embedSingle` per row — one
 *     HTTP request to OpenAI per title, 100 requests per invocation. The
 *     shared client has always exposed `embedBatch`, which takes an array
 *     and returns one embedding per input in positional order. Sending
 *     EMBED_CHUNK titles per request collapses those 100 requests into 1.
 *     OpenAI's embeddings endpoint is built for this; we were paying
 *     per-request latency ~100x over for no reason.
 *
 *  2. BULK WRITES (migration 069). Embeddings are written a chunk at a
 *     time through `bulk_set_title_embeddings` rather than one UPDATE per
 *     row. Measured 2026-08-26: the per-row round trips cost ~400ms each
 *     and capped a 75s slice at ~200 rows, which was too close to the
 *     ~1,900 rows/day that daily backfill (A5) produces.
 *
 *  3. SLICING. One invocation processes one slice and chains the next via
 *     `enqueue_function_call` (migrations 067/068), so the queue depth is
 *     no longer capped by what fits in a single invocation.
 *
 * Why it changed: the old 100-rows/day cap was invisible while the
 * catalogue was frozen. Once the backfill was repaired it became a hard
 * ceiling on what users can actually see — a title with no embedding is
 * not retrievable by `match_titles_by_vector` and therefore cannot appear
 * in For You at all. A single backfill chain on 2026-08-25 added 379
 * titles against a 100/day drain rate.
 *
 * Deploy: npx supabase functions deploy embed-new-titles --project-ref fmusugdcnnwiuzkbjquo
 * Manual: curl -X POST https://<project>.supabase.co/functions/v1/embed-new-titles \
 *           -H "Authorization: Bearer <service_role_key>"
 *
 * Required Supabase Functions env vars (set via `supabase secrets set`):
 *   - SUPABASE_URL                (auto-provided)
 *   - SUPABASE_SERVICE_ROLE_KEY   (auto-provided)
 *   - OPENAI_API_KEY              (must be set explicitly)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildEmbeddingText } from '../_shared/embeddingTemplate.ts';
import { embedBatch } from '../_shared/openaiEmbeddings.ts';

// ── Config ───────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Slice budget ─────────────────────────────────────────
// Titles per OpenAI request. The endpoint accepts far more, but 100 keeps
// each request's payload and failure blast-radius small — one bad chunk
// costs 100 rows of retry, not 500.
const EMBED_CHUNK = 100;

// 500 rows is ~5 OpenAI requests plus ~5 bulk writes. Before migration
// 069 this was ~5 requests plus 500 individual UPDATE round trips, and
// live runs only reached ~200 rows inside the 75s budget — the DB round
// trips, not OpenAI, were the constraint. With bulk writes the full 500
// fits comfortably.
const SLICE_LIMIT = 500;
const SLICE_BUDGET_MS = 75_000;
const MAX_CHAIN_DEPTH = 12; // 12 x 500 = 6,000 rows per chain
const HANDOFF_DELAY_MS = 3_000;
const CHAIN_STALE_MS = 120_000;

// ── Types ────────────────────────────────────────────────

interface TitleRow {
  id: number;
  tmdb_id: number;
  title: string;
  release_year: number;
  media_type: 'movie' | 'tv';
  genre_ids: number[];
  overview: string | null;
  keywords: string[];
  cast_top_5: string[];
  runtime: number | null;
}

interface SliceStats {
  fetched: number;
  processed: number;
  failed: number;
  total_tokens: number;
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
  failures: Record<string, number>;
}

function emptySliceStats(): SliceStats {
  return { fetched: 0, processed: 0, failed: 0, total_tokens: 0, truncated: false, failures: {} };
}

function noteFailure(stats: SliceStats, message: string, count = 1): void {
  stats.failures[message] = (stats.failures[message] ?? 0) + count;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Core ─────────────────────────────────────────────────

async function runEmbeddingSlice(stats: SliceStats, runId: string): Promise<void> {
  const startedAt = Date.now();

  const { data: rows, error } = await supabase
    .from('titles')
    .select('id, tmdb_id, title, release_year, media_type, genre_ids, overview, keywords, cast_top_5, runtime')
    .is('embedding', null)
    .not('keywords', 'is', null)
    .order('id', { ascending: true })
    .limit(SLICE_LIMIT);

  if (error) throw new Error(`Supabase select failed: ${error.message}`);

  const queue = (rows ?? []) as TitleRow[];
  stats.fetched = queue.length;
  console.log(`  slice: ${queue.length} rows (cap ${SLICE_LIMIT}, chunk ${EMBED_CHUNK})`);

  for (let i = 0; i < queue.length; i += EMBED_CHUNK) {
    if (Date.now() - startedAt > SLICE_BUDGET_MS) {
      console.log(`  slice budget reached after ${stats.processed + stats.failed} rows`);
      stats.truncated = true;
      break;
    }

    const chunk = queue.slice(i, i + EMBED_CHUNK);
    const texts = chunk.map((row) =>
      buildEmbeddingText({
        title: row.title,
        release_year: row.release_year,
        media_type: row.media_type,
        genre_ids: row.genre_ids ?? [],
        overview: row.overview,
        keywords: row.keywords ?? [],
        cast_top_5: row.cast_top_5 ?? [],
        runtime: row.runtime,
      })
    );

    const batch = await embedBatch(texts, OPENAI_API_KEY, { delayMs: 100, maxRetries: 3 });

    if (!batch) {
      // Whole request failed after retries. embedBatch returns null rather
      // than throwing, so this is the only place the failure surfaces —
      // count every row in the chunk and keep going; they stay in the
      // queue for the next slice.
      stats.failed += chunk.length;
      noteFailure(stats, 'OpenAI embeddings request failed after retries', chunk.length);
      console.error(`  chunk of ${chunk.length} failed: OpenAI returned null`);
      continue;
    }

    stats.total_tokens += batch.total_tokens;

    // Collect the chunk, then write it in ONE statement via
    // bulk_set_title_embeddings (migration 069). This used to be an UPDATE
    // per row: measured 2026-08-26 at ~400ms each, which made the DB round
    // trips — not OpenAI — the binding constraint on this whole job.
    const ids: number[] = [];
    const vectors: string[] = [];
    for (let j = 0; j < chunk.length; j++) {
      const row = chunk[j];
      const result = batch.results[j];
      if (!result) {
        stats.failed++;
        noteFailure(stats, 'OpenAI returned no embedding for row');
        console.error(`  fail  ${row.media_type}/${row.tmdb_id}: no embedding in batch response`);
        continue;
      }
      ids.push(row.id);
      vectors.push(`[${result.embedding.join(',')}]`);
    }

    if (ids.length > 0) {
      const { data: updated, error: updateError } = await supabase.rpc(
        'bulk_set_title_embeddings',
        { p_ids: ids, p_embeddings: vectors }
      );
      if (updateError) {
        // The whole chunk failed to write. The rows keep embedding IS NULL,
        // so the next slice picks them up — nothing is lost.
        stats.failed += ids.length;
        noteFailure(stats, `bulk_set_title_embeddings failed: ${updateError.message}`, ids.length);
        console.error(`  chunk of ${ids.length} failed to write: ${updateError.message}`);
      } else {
        const written = typeof updated === 'number' ? updated : ids.length;
        stats.processed += written;
        if (written < ids.length) {
          // Fewer rows matched than we sent — an id disappeared between the
          // SELECT and the write. Rare, but count it rather than silently
          // reporting more progress than was made.
          const missing = ids.length - written;
          stats.failed += missing;
          noteFailure(stats, 'row no longer existed when the embedding was written', missing);
          console.warn(`  ${missing} row(s) vanished before their embedding could be written`);
        }
      }
    }

    // Heartbeat once per chunk so resume_stalled_chains() (migration 068)
    // can tell a working slice from a dead one.
    await supabase
      .from('sync_log')
      .update({ heartbeat_at: new Date().toISOString() })
      .eq('id', runId);
  }
}

// ── Chain plumbing ───────────────────────────────────────

interface ChainState {
  depth: number;
  slices: number;
  queue_at_start: number | null;
  queue_at_end: number | null;
  failures: Record<string, number>;
  total_tokens: number;
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
    total_tokens: 0,
    stopped_because: null,
    last_request_id: null,
  };
}

async function countQueue(): Promise<number | null> {
  const { count, error } = await supabase
    .from('titles')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null)
    .not('keywords', 'is', null);
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
      .eq('sync_type', 'embed')
      .eq('status', 'running')
      .gte('heartbeat_at', new Date(Date.now() - CHAIN_STALE_MS).toISOString())
      .limit(1);
    if (active && active.length > 0) {
      console.log(`embed chain already running (sync_log ${active[0].id}) — skipping`);
      return json({ status: 'skipped', reason: 'chain already running' });
    }

    const queue = await countQueue();
    const { data: syncLog, error: logError } = await supabase
      .from('sync_log')
      .insert({
        sync_type: 'embed',
        source: 'openai',
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
    console.log(`embed chain ${runId} starting — queue ${queue ?? 'unknown'}`);
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
    await runEmbeddingSlice(stats, runId);
  } catch (err) {
    fatal = err instanceof Error ? err.message : String(err);
    console.error(`slice at depth ${depth} failed:`, fatal);
  }

  state.depth = depth;
  state.slices += 1;
  state.total_tokens += stats.total_tokens;
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
  else if (stats.processed === 0) {
    // Every row failed — almost certainly the OpenAI credential or a
    // service outage. Chaining another 11 slices into that just burns
    // requests, so stop and say so.
    stop = 'slice made no forward progress — OpenAI is failing every request';
  } else if (!stats.truncated && stats.fetched < SLICE_LIMIT) stop = 'queue drained';
  else if (depth + 1 >= MAX_CHAIN_DEPTH) stop = `chain depth cap (${MAX_CHAIN_DEPTH}) reached`;

  const failureEntries = Object.entries(state.failures);
  const errorDetail =
    failureEntries.length === 0 && !fatal
      ? null
      : {
          total: totals.errors,
          fatal,
          errors: failureEntries
            .sort((a, b) => b[1] - a[1])
            .slice(0, 25)
            .map(([message, count]) => ({ message, count })),
        };

  if (stop) {
    state.stopped_because = stop;
    state.queue_at_end = await countQueue();
    const failed = Boolean(fatal) || (stats.fetched > 0 && stats.processed === 0);
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
      `embed chain ${runId} ${failed ? 'FAILED' : 'done'} after ${state.slices} slice(s): ` +
      `embedded=${totals.processed} errors=${totals.errors} tokens=${state.total_tokens} ` +
      `queue ${state.queue_at_start ?? '?'} -> ${state.queue_at_end ?? '?'} — ${stop}`
    );
    return json(
      {
        status: failed ? 'error' : 'ok',
        runId, slices: state.slices,
        embedded: totals.processed, errors: totals.errors,
        total_tokens: state.total_tokens,
        queueAtStart: state.queue_at_start, queueAtEnd: state.queue_at_end,
        stopped: stop,
      },
      failed ? 500 : 200
    );
  }

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
    p_function: 'embed-new-titles',
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
          errors: errorDetail?.errors ?? [],
          total: totals.errors + 1,
          fatal: `enqueue_function_call failed: ${chainError.message}`,
        },
        chain_state: state,
      })
      .eq('id', runId);
    return json({ status: 'error', message: chainError.message }, 500);
  }

  state.last_request_id = typeof requestId === 'number' ? requestId : null;
  await supabase.from('sync_log').update({ chain_state: state }).eq('id', runId);

  console.log(
    `slice ${depth} done (embedded=${stats.processed} failed=${stats.failed} ` +
    `tokens=${stats.total_tokens}) — queued depth ${depth + 1}`
  );
  return json({
    status: 'ok', runId, depth, chained: depth + 1,
    sliceEmbedded: stats.processed,
    sliceFailed: stats.failed,
    embedded: totals.processed,
  });
});
