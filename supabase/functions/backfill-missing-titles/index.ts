/**
 * Backfill Missing Titles Edge Function (IN-PX-50).
 *
 * Recurring, scheduled counterpart to
 * `scripts/enrichment/backfill_missing_titles.ts`. Closes the recurring
 * half of IN-465: `streaming_availability` gains rows (from the daily SA
 * sync) whose (tmdb_id, media_type) has no joining `titles` row, because
 * `titles` is only ever written by the manual `scripts/sync-content.ts`
 * and this function. Each run fetches TMDb metadata for the missing keys
 * and upserts them into `titles`; the daily `enrich-new-titles` (06:30
 * UTC) and `embed-new-titles` (06:45 UTC) crons then pick up the new rows.
 *
 * The anti-join is done in-DB via the `list_missing_title_ids` RPC
 * (migration 054) so this function stays memory-light — it never pulls
 * the full streaming_availability/titles tables into Deno the way the
 * one-off script does.
 *
 * SELF-CHAINING (A2, 2026-08-25). One invocation processes ONE slice —
 * SLICE_LIMIT rows or SLICE_BUDGET_MS, whichever comes first — persists its
 * progress, then enqueues the next slice through `enqueue_function_call`
 * (migration 067) and returns. The weekly cron only ever starts slice 0.
 *
 * Why: pg_net severs every cron→function call at 30s, so nothing
 * downstream ever learned whether a run worked. Measured on the 2026-08-23
 * run — 105s of wall clock, HTTP 200, `failed=300`, and no trace of it
 * anywhere a human would look. Slices are short enough to outlive nothing,
 * flush every FLUSH_EVERY rows so a severed slice cannot discard completed
 * work, and record their outcome in `sync_log` before handing off.
 *
 * Chain totals live on one `sync_log` row (`sync_type='backfill'`), keyed
 * by `runId` and carried in `chain_state`. `titles_added` on that row is
 * the only honest title count the system produces.
 *
 * Deploy: npx supabase functions deploy backfill-missing-titles --project-ref fmusugdcnnwiuzkbjquo
 * Manual: curl -X POST https://<project>.supabase.co/functions/v1/backfill-missing-titles \
 *           -H "Authorization: Bearer <service_role_key>"
 *
 * Required Supabase Functions env vars (set via `supabase secrets set`):
 *   - SUPABASE_URL                (auto-provided)
 *   - SUPABASE_SERVICE_ROLE_KEY   (auto-provided)
 *   - TMDB_API_KEY                (already provisioned for enrich-new-titles)
 *
 * NOTE on TMDb key sourcing: the brief suggested Vault "same pattern as
 * migration 039", but 039's Vault entry is the service-role JWT used in
 * the cron Authorization header — which this function's cron reuses. The
 * TMDb key itself follows the established enrich-new-titles precedent
 * (TMDB_API_KEY env secret): it's already set, avoids a second secret
 * store, and keeps the two TMDb-fetching Edge Functions consistent.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Config ───────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_DELAY = 260; // ms — matches sync-content.ts + the backfill script

// ── Slice budget (A2) ────────────────────────────────────
// 50 rows x 260ms = ~13s of pacing plus fetch latency, targeting ~15-18s
// per invocation. SLICE_BUDGET_MS is the real guarantee: the row count is
// only a hint, since TMDb latency is not ours to control.
const SLICE_LIMIT = 50;
const SLICE_BUDGET_MS = 18_000;

// Flush every 10 rows (~3s of work). Previously titles flushed at 100 and
// skips only at the very end of a 300-row run, so anything that cut the
// run short discarded everything it had fetched.
const FLUSH_EVERY = 10;

// Hard ceiling on chain length: 40 x 50 = 2,000 titles per chain. Deep
// enough to be useful against the 22,260-row backlog, shallow enough that
// a misbehaving chain cannot run away. Clearing the backlog outright is A4
// and needs its own go-ahead.
const MAX_CHAIN_DEPTH = 40;

// A chain that has not heartbeated in this long is presumed dead, so a new
// one may start. Comfortably longer than one slice.
const CHAIN_STALE_MS = 120_000;

// ── Helpers ──────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TmdbTitle {
  id: number;
  title?: string;
  name?: string;
  overview?: string | null;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genre_ids?: number[];
  genres?: Array<{ id: number; name: string }>;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  original_language?: string;
  runtime?: number;
  episode_run_time?: number[];
}

// Thrown to abort the whole run the instant TMDb rejects our credential.
// See CredentialError's use site for why this is fatal rather than counted.
class CredentialError extends Error {
  constructor(status: number, ref: string) {
    super(
      `TMDb rejected the credential (HTTP ${status}) on ${ref}. ` +
      `TMDB_API_KEY is missing, revoked, or is a v4 read token being sent ` +
      `as a v3 api_key parameter. Aborting the run — every remaining fetch ` +
      `would fail identically.`
    );
    this.name = 'CredentialError';
  }
}

// Discriminated result: 'notfound' is a CONFIRMED TMDb 404 (permanently
// skippable); null is any other failure (retry exhaustion, TMDb incident)
// and must NOT enter the skip-list — recording those as 404s during one bad
// Sunday run would permanently blacklist up to 300 legitimate titles
// (pre-launch review 2026-07-12). A 401/403 throws instead of returning
// null: it is not a per-row failure, it is the whole run being dead.
async function tmdbFetch(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<TmdbTitle | 'notfound' | null> {
  const url = new URL(`${TMDB_BASE}/${mediaType}/${tmdbId}`);
  url.searchParams.set('api_key', TMDB_API_KEY);

  // Two retries on 429/5xx with exponential backoff; a 404 means TMDb has
  // no such title (deleted stub) — leave it missing and move on.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString());
    if (res.status === 404) return 'notfound';
    if (res.ok) return (await res.json()) as TmdbTitle;
    // Fail fast on a bad credential. Every weekly run from 2026-06-07 to
    // 2026-08-23 spent ~105 s walking 300 IDs at 260 ms apiece, took a 401
    // on every single one, recorded `failed=300` in a log nobody reads, and
    // returned HTTP 200. Seventy-nine days of green ticks over a dead key.
    if (res.status === 401 || res.status === 403) {
      throw new CredentialError(res.status, `${mediaType}/${tmdbId}`);
    }
    if (res.status === 429 || res.status >= 500) {
      const backoff = Math.pow(2, attempt + 2) * 1000;
      console.warn(`  retry ${attempt + 1}/3 after ${backoff}ms (HTTP ${res.status}) for ${mediaType}/${tmdbId}`);
      await sleep(backoff);
      continue;
    }
    // 4xx other than 404/429: unexpected, skip this row this run, but
    // don't blacklist it.
    console.error(`  TMDb ${res.status} for ${mediaType}/${tmdbId}`);
    return null;
  }
  console.error(`  TMDb retries exhausted for ${mediaType}/${tmdbId}`);
  return null;
}

// Mirrors buildTitleRow in scripts/enrichment/backfill_missing_titles.ts
// (which mirrors stageTmdb in sync-content.ts). Keep the three in sync.
function buildTitleRow(item: TmdbTitle, mediaType: 'movie' | 'tv') {
  const rawDate = mediaType === 'movie' ? item.release_date : item.first_air_date;
  const releaseDate = rawDate && rawDate.length > 0 ? rawDate : null;
  const releaseYear = releaseDate ? Number(releaseDate.slice(0, 4)) : null;
  const genreIds = item.genres
    ? item.genres.map((g) => g.id)
    : (item.genre_ids ?? []);
  const runtime = mediaType === 'movie'
    ? (item.runtime ?? null)
    : (item.episode_run_time?.[0] ?? null);

  return {
    tmdb_id: item.id,
    media_type: mediaType,
    title: item.title ?? item.name ?? '',
    overview: item.overview ?? null,
    release_date: releaseDate,
    release_year: Number.isFinite(releaseYear) ? releaseYear : null,
    poster_path: item.poster_path ?? null,
    backdrop_path: item.backdrop_path ?? null,
    genre_ids: genreIds,
    vote_average: item.vote_average ?? null,
    vote_count: item.vote_count ?? null,
    popularity: item.popularity ?? null,
    original_language: item.original_language ?? null,
    runtime,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

interface MissingRow {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
}

interface RunStats {
  missing: number;
  upserted: number;
  skipped404: number;
  failed: number;
  remaining: number;
  // Aggregated by message so 300 identical failures collapse to one entry
  // with count=300 rather than 300 rows of the same string.
  failures: Record<string, number>;
}

function noteFailure(stats: RunStats, message: string): void {
  stats.failures[message] = (stats.failures[message] ?? 0) + 1;
}

// ── Slice runner (A2) ────────────────────────────────────
//
// One invocation = one slice. Sized to finish in well under 20s so it can
// never be the thing that hits a wall-clock limit, and bounded by elapsed
// time as well as row count — a slow TMDb makes the count budget a lie.
async function runBackfillSlice(): Promise<RunStats> {
  const stats: RunStats = {
    missing: 0, upserted: 0, skipped404: 0, failed: 0, remaining: 0, failures: {},
  };
  const startedAt = Date.now();

  const { data, error } = await supabase.rpc('list_missing_title_ids', {
    p_limit: SLICE_LIMIT,
  });
  if (error) throw new Error(`list_missing_title_ids failed: ${error.message}`);

  const missing = (data ?? []) as MissingRow[];
  stats.missing = missing.length;
  console.log(`  slice: ${missing.length} missing IDs (cap ${SLICE_LIMIT})`);

  const buffer: ReturnType<typeof buildTitleRow>[] = [];
  const skips: MissingRow[] = [];

  async function flushTitles() {
    if (buffer.length === 0) return;
    const rows = buffer.splice(0, buffer.length);
    const { error: upErr } = await supabase
      .from('titles')
      .upsert(rows, { onConflict: 'tmdb_id,media_type' });
    if (upErr) {
      stats.failed += rows.length;
      stats.failures[`titles upsert: ${upErr.message}`] =
        (stats.failures[`titles upsert: ${upErr.message}`] ?? 0) + rows.length;
      console.error(`  upsert error (${rows.length} rows): ${upErr.message}`);
    } else {
      stats.upserted += rows.length;
    }
  }

  // 404s must be RECORDED, not just skipped: list_missing_title_ids is
  // ordered by tmdb_id, so an unrecorded dead ID re-fills the cap every
  // run and the backlog never drains (migration 063 root-cause note).
  async function flushSkips() {
    if (skips.length === 0) return;
    const rows = skips.splice(0, skips.length);
    const { error: skipErr } = await supabase
      .from('backfill_skips')
      .upsert(rows, { onConflict: 'tmdb_id,media_type', ignoreDuplicates: true });
    if (skipErr) {
      // Non-fatal: the run's inserts stand; these IDs resurface next slice.
      stats.failures[`backfill_skips upsert: ${skipErr.message}`] =
        (stats.failures[`backfill_skips upsert: ${skipErr.message}`] ?? 0) + rows.length;
      console.error(`  backfill_skips upsert error (${rows.length} rows): ${skipErr.message}`);
    }
  }

  // Flush BOTH buffers every FLUSH_EVERY rows. The old code held titles to
  // 100 and skips to the very end of a 300-row run, so anything that cut
  // the run short threw away every completed fetch. Flushing at 10 caps
  // the loss at 10 rows — roughly 3 seconds of work.
  async function flushBoth() {
    await flushTitles();
    await flushSkips();
  }

  for (const row of missing) {
    // Elapsed-time guard. Checked before the sleep so a slice that is
    // already over budget stops immediately rather than paying another
    // 260ms first. Unfinished rows stay in list_missing_title_ids and the
    // next slice picks them up — nothing is lost by stopping early.
    if (Date.now() - startedAt > SLICE_BUDGET_MS) {
      console.log(`  slice budget reached after ${stats.upserted + stats.skipped404 + stats.failed} rows`);
      break;
    }

    await sleep(TMDB_DELAY);
    const tmdb = await tmdbFetch(row.tmdb_id, row.media_type);
    if (tmdb === 'notfound') {
      stats.skipped404++;
      skips.push(row);
    } else if (tmdb === null) {
      // Transient/unknown failure: count it, DON'T blacklist it — the
      // row stays in list_missing_title_ids for the next slice.
      stats.failed++;
      // Deliberately id-free so the counter aggregates. The individual IDs
      // are already in the function logs via tmdbFetch's console.error.
      noteFailure(stats, 'TMDb fetch failed (non-404, retries exhausted)');
    } else {
      buffer.push(buildTitleRow(tmdb, row.media_type));
    }

    if (buffer.length + skips.length >= FLUSH_EVERY) await flushBoth();
  }
  await flushBoth();

  return stats;
}

// A slice that touched rows but moved nothing forward means the head of
// the queue is systematically broken. Chaining another 39 slices into it
// just burns TMDb calls, so the chain stops and says why.
function madeNoProgress(stats: RunStats): boolean {
  return stats.missing > 0 && stats.upserted === 0 && stats.skipped404 === 0;
}

/// ── Edge Function handler ────────────────────────────────
//
// One invocation = one slice. Slice 0 is kicked off by the weekly cron
// (migration 062); every subsequent slice is enqueued by its predecessor
// via enqueue_function_call (migration 067), which queues the request
// inside Postgres so the handoff cannot be lost when this isolate exits.
//
// The 30s pg_net ceiling is therefore no longer load-bearing: nothing
// waits on this response, and no single invocation runs long enough to be
// killed. See migration 067 for the measurements behind that.

interface ChainState {
  depth: number;
  slices: number;
  gap_at_start: number | null;
  gap_at_end: number | null;
  failures: Record<string, number>;
  skipped_404: number;
  stopped_because: string | null;
}

function emptyChainState(gapAtStart: number | null): ChainState {
  return {
    depth: 0,
    slices: 0,
    gap_at_start: gapAtStart,
    gap_at_end: null,
    failures: {},
    skipped_404: 0,
    stopped_because: null,
  };
}

async function countMissing(): Promise<number | null> {
  // ~2.3s. Called at chain start and chain end only — never per slice.
  const { data, error } = await supabase.rpc('count_missing_title_ids');
  if (error) {
    console.error(`count_missing_title_ids failed: ${error.message}`);
    return null;
  }
  return typeof data === 'number' ? data : Number(data ?? 0);
}

function unauthorized() {
  return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  // JWT check — same pattern as enrich-new-titles/index.ts:157-172. Both
  // the migration-062 cron and the chain handoff pass a service-role
  // bearer (Vault-sourced); reject anything else.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return unauthorized();
  try {
    const payload = JSON.parse(atob(authHeader.split(' ')[1].split('.')[1]));
    if (payload.role !== 'service_role') throw new Error('not service_role');
  } catch {
    return unauthorized();
  }

  // Chain position. Cron posts '{}', so an absent depth means slice 0.
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
    return new Response(
      JSON.stringify({ status: 'stopped', reason: 'max chain depth', depth }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── Chain start: reap, guard re-entrancy, open the sync_log row ──
  if (depth === 0) {
    const { error: reapError } = await supabase.rpc('reap_stale_sync_runs');
    if (reapError) console.error('reap_stale_sync_runs failed:', reapError.message);

    // Don't start a second chain on top of a live one — a manual trigger
    // during the Sunday cron would otherwise double the TMDb call rate and
    // have both chains fighting over the same head of the queue.
    const { data: active } = await supabase
      .from('sync_log')
      .select('id')
      .eq('sync_type', 'backfill')
      .eq('status', 'running')
      .gte('heartbeat_at', new Date(Date.now() - CHAIN_STALE_MS).toISOString())
      .limit(1);
    if (active && active.length > 0) {
      console.log(`chain already running (sync_log ${active[0].id}) — skipping`);
      return new Response(
        JSON.stringify({ status: 'skipped', reason: 'chain already running' }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    const gap = await countMissing();
    // A1: the only scheduled job that inserts into `titles`, so the only
    // honest source of sync_log.titles_added. Until now it wrote no
    // sync_log row at all, which is why a 79-day freeze left no trace.
    const { data: syncLog, error: logError } = await supabase
      .from('sync_log')
      .insert({
        sync_type: 'backfill',
        source: 'tmdb',
        status: 'running',
        heartbeat_at: new Date().toISOString(),
        chain_state: emptyChainState(gap),
      })
      .select('id')
      .single();
    if (logError || !syncLog) {
      const message = logError?.message ?? 'sync_log insert returned no row';
      console.error('sync_log insert failed:', message);
      return new Response(JSON.stringify({ status: 'error', message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    runId = syncLog.id;
    console.log(`backfill chain ${runId} starting — gap ${gap ?? 'unknown'}`);
  }

  if (!runId) {
    return new Response(
      JSON.stringify({ status: 'error', message: 'chained slice called without runId' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── Load accumulated chain state ─────────────────────────────────
  const { data: current, error: readError } = await supabase
    .from('sync_log')
    .select('titles_processed, titles_added, errors, chain_state, status')
    .eq('id', runId)
    .single();
  if (readError || !current) {
    const message = readError?.message ?? `sync_log ${runId} not found`;
    console.error('chain state read failed:', message);
    return new Response(JSON.stringify({ status: 'error', message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // A chain whose row was reaped or closed while a slice was in flight must
  // not resurrect it.
  if (current.status !== 'running') {
    console.warn(`chain ${runId} is ${current.status} — not continuing`);
    return new Response(
      JSON.stringify({ status: 'stopped', reason: `run is ${current.status}` }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
  const state: ChainState = {
    ...emptyChainState(null),
    ...((current.chain_state ?? {}) as Partial<ChainState>),
  };

  // ── Run one slice ────────────────────────────────────────────────
  let stats: RunStats | null = null;
  let fatal: string | null = null;
  try {
    stats = await runBackfillSlice();
  } catch (err) {
    fatal = err instanceof Error ? err.message : String(err);
    console.error(`slice at depth ${depth} failed:`, fatal);
  }

  // Merge this slice into the chain totals.
  state.depth = depth;
  state.slices += 1;
  if (stats) {
    state.skipped_404 += stats.skipped404;
    for (const [message, count] of Object.entries(stats.failures)) {
      state.failures[message] = (state.failures[message] ?? 0) + count;
    }
  }

  const totals = {
    processed: (current.titles_processed ?? 0) + (stats?.missing ?? 0),
    added: (current.titles_added ?? 0) + (stats?.upserted ?? 0),
    errors: (current.errors ?? 0) + (stats?.failed ?? 0) + (fatal ? 1 : 0),
  };

  // ── Decide whether the chain continues ───────────────────────────
  let stop: string | null = null;
  if (fatal) {
    stop = `fatal: ${fatal}`;
  } else if (stats && madeNoProgress(stats)) {
    stop = 'slice made no forward progress — head of queue is systematically failing';
  } else if (stats && stats.missing < SLICE_LIMIT) {
    stop = 'queue drained';
  } else if (depth + 1 >= MAX_CHAIN_DEPTH) {
    stop = `chain depth cap (${MAX_CHAIN_DEPTH}) reached — backlog remains`;
  }

  // Aggregated failures make a non-null error_details mean something. A
  // clean chain leaves it NULL.
  const failureEntries = Object.entries(state.failures);
  const errorDetail =
    failureEntries.length === 0 && !fatal
      ? null
      : {
          total: totals.errors,
          fatal,
          skipped_404: state.skipped_404,
          errors: failureEntries
            .sort((a, b) => b[1] - a[1])
            .slice(0, 25)
            .map(([message, count]) => ({ message, count })),
        };

  if (stop) {
    state.stopped_because = stop;
    state.gap_at_end = await countMissing();
    // 'failed' is reserved for chains that stopped because something is
    // wrong. Draining the queue or hitting the depth cap are both normal
    // completions, even though neither necessarily empties the backlog.
    const failed = Boolean(fatal) || (stats !== null && madeNoProgress(stats));
    await supabase
      .from('sync_log')
      .update({
        status: failed ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
        titles_processed: totals.processed,
        titles_added: totals.added,
        errors: totals.errors,
        error_details: errorDetail,
        chain_state: state,
      })
      .eq('id', runId);

    console.log(
      `backfill chain ${runId} ${failed ? 'FAILED' : 'done'} after ${state.slices} slice(s): ` +
      `titles_added=${totals.added} errors=${totals.errors} ` +
      `gap ${state.gap_at_start ?? '?'} -> ${state.gap_at_end ?? '?'} — ${stop}`
    );
    return new Response(
      JSON.stringify({
        status: failed ? 'error' : 'ok',
        runId,
        depth,
        slices: state.slices,
        titlesAdded: totals.added,
        errors: totals.errors,
        gapAtStart: state.gap_at_start,
        gapAtEnd: state.gap_at_end,
        stopped: stop,
      }),
      { status: failed ? 500 : 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── Persist progress, then hand off the next slice ───────────────
  // Progress is written BEFORE the handoff, so if the enqueue fails the
  // work this slice did is already durable.
  await supabase
    .from('sync_log')
    .update({
      heartbeat_at: new Date().toISOString(),
      titles_processed: totals.processed,
      titles_added: totals.added,
      errors: totals.errors,
      error_details: errorDetail,
      chain_state: state,
    })
    .eq('id', runId);

  const { error: chainError } = await supabase.rpc('enqueue_function_call', {
    p_function: 'backfill-missing-titles',
    p_body: { depth: depth + 1, runId },
  });
  if (chainError) {
    // The slice's writes stand. Close the row rather than leaving it
    // 'running' for the reaper to pick up ten minutes later.
    console.error(`chain handoff failed at depth ${depth}:`, chainError.message);
    state.stopped_because = `chain handoff failed: ${chainError.message}`;
    await supabase
      .from('sync_log')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        errors: totals.errors + 1,
        error_details: {
          skipped_404: state.skipped_404,
          errors: errorDetail?.errors ?? [],
          total: totals.errors + 1,
          fatal: `enqueue_function_call failed: ${chainError.message}`,
        },
        chain_state: state,
      })
      .eq('id', runId);
    return new Response(
      JSON.stringify({ status: 'error', message: chainError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log(
    `slice ${depth} done (added=${stats?.upserted ?? 0} skipped404=${stats?.skipped404 ?? 0} ` +
    `failed=${stats?.failed ?? 0}) — queued depth ${depth + 1}`
  );
  return new Response(
    JSON.stringify({
      status: 'ok',
      runId,
      depth,
      chained: depth + 1,
      sliceAdded: stats?.upserted ?? 0,
      sliceSkipped404: stats?.skipped404 ?? 0,
      sliceFailed: stats?.failed ?? 0,
      titlesAdded: totals.added,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
