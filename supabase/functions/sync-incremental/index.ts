/**
 * Incremental Sync Edge Function (Phase C1.2)
 *
 * Fetches only changed titles since the last sync using the SA API /changes endpoint.
 * Designed to run daily via pg_cron or manual invocation.
 *
 * Deploy: supabase functions deploy sync-incremental
 * Manual: curl -X POST https://<project>.supabase.co/functions/v1/sync-incremental \
 *           -H "Authorization: Bearer <service_role_key>"
 *
 * Query params:
 *   ?since=<unix_timestamp>  Override the "since" timestamp (default: last sync)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// Phase 1: contentToVector import removed — embeddings handled by embed-new-titles cron

// ── Types ─────────────────────────────────────────────────

interface HistoryEvent {
  tmdb_id: number;
  media_type: string;
  service_id: string;
  event_type: 'added' | 'removed' | 'updated' | 'price_changed';
  stream_type: string | null;
  quality: string | null;
  link: string | null;
  price_amount: number | null;
  price_currency: string | null;
  old_price_amount: number | null;
  sync_run_id: string | null;
}

// ── Config ───────────────────────────────────────────────

const SA_API_KEY = Deno.env.get('SA_API_KEY')!;
const SA_API_HOST = 'streaming-availability.p.rapidapi.com';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SA_HEADERS = {
  'X-RapidAPI-Key': SA_API_KEY,
  'X-RapidAPI-Host': SA_API_HOST,
};

// SA API service slug → Videx ServiceId
// NOTE: Also defined in src/lib/adapters/platformAdapter.ts and scripts/sync-content.ts
const SA_TO_VIDEX: Record<string, string> = {
  netflix: 'netflix',
  prime: 'prime',
  apple: 'apple',
  disney: 'disney',
  now: 'now',
  paramount: 'paramount',
  itvx: 'itvx',
  all4: 'channel4',
  iplayer: 'bbc',
};

// All SA API services with UK catalogue data
const SA_SERVICES_GB = [
  'netflix', 'prime', 'disney', 'apple', 'itvx',
  'paramount', 'now', 'all4',
];

const CHANGE_TYPES = ['new', 'updated', 'removed', 'expiring'] as const;

// ── Helpers ──────────────────────────────────────────────

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Observability (A1) ───────────────────────────────────
//
// `sync_log.error_details` was NULL on every run ever recorded, including
// 2026-08-12..15 which each logged errors=17 with nothing to show for it.
// The cause turned out to be TMDb 401s — the same message 17 times over.
//
// So: aggregate by (scope, message) rather than appending. 600 identical
// failures collapse to one row with count=600, which both fits in a JSONB
// column and reads better than a truncated list of duplicates.
const MAX_DISTINCT_ERRORS = 25;

interface ErrorBucket {
  scope: string;
  message: string;
  count: number;
  first_seen: string;
  sample: string | null;
}

class ErrorCollector {
  private readonly buckets = new Map<string, ErrorBucket>();
  private totalCount = 0;
  private droppedDistinct = 0;

  record(scope: string, err: unknown, sample?: string): void {
    this.totalCount++;
    const message = err instanceof Error ? err.message : String(err);
    const key = `${scope} :: ${message}`;
    const existing = this.buckets.get(key);
    if (existing) {
      existing.count++;
      return;
    }
    if (this.buckets.size >= MAX_DISTINCT_ERRORS) {
      this.droppedDistinct++;
      return;
    }
    this.buckets.set(key, {
      scope,
      message,
      count: 1,
      first_seen: new Date().toISOString(),
      sample: sample ?? null,
    });
  }

  get total(): number {
    return this.totalCount;
  }

  // A chained run spans several invocations, so the collector has to
  // survive as JSON in sync_log.chain_state and come back on the far side.
  toBuckets(): ErrorBucket[] {
    return [...this.buckets.values()];
  }

  static fromBuckets(buckets: ErrorBucket[] | undefined | null): ErrorCollector {
    const collector = new ErrorCollector();
    for (const bucket of buckets ?? []) {
      collector.buckets.set(`${bucket.scope} :: ${bucket.message}`, { ...bucket });
      collector.totalCount += bucket.count;
    }
    return collector;
  }

  // Returns null when clean, so `error_details` stays NULL on healthy runs
  // and a non-NULL value always means something actually went wrong.
  toJson(): Record<string, unknown> | null {
    if (this.totalCount === 0) return null;
    const errors = [...this.buckets.values()].sort((a, b) => b.count - a.count);
    return {
      total: this.totalCount,
      distinct: this.buckets.size,
      dropped_distinct: this.droppedDistinct,
      errors,
    };
  }
}

// Heartbeat: proves the run is still alive so reap_stale_sync_runs()
// (migration 066) can tell a working job from one that was killed. Killed
// runs used to sit at status='running' forever — 4 of the last 14.
const HEARTBEAT_INTERVAL_MS = 15_000;
let lastHeartbeat = 0;

async function heartbeat(syncId: string | undefined, force = false): Promise<void> {
  if (!syncId) return;
  const now = Date.now();
  if (!force && now - lastHeartbeat < HEARTBEAT_INTERVAL_MS) return;
  lastHeartbeat = now;
  const { error } = await supabase
    .from('sync_log')
    .update({ heartbeat_at: new Date().toISOString() })
    .eq('id', syncId);
  if (error) console.error('heartbeat failed:', error.message);
}

/**
 * RapidAPI has refused because the plan's quota is spent, not because we
 * are briefly too fast.
 *
 * The distinction matters at a hard spend cap. A short-term rate limit
 * SHOULD be retried — it clears in a second. An exhausted quota will not
 * clear for the rest of the billing period, so retrying it three times
 * per request, across every remaining change-type and service, spends
 * money to be told "no" repeatedly. This carries the refusal straight out
 * of the slice instead.
 */
class QuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaError';
  }
}

// Billable SA (RapidAPI) requests made by THIS invocation.
//
// Counted here rather than in saApiFetch because RapidAPI bills every
// request that leaves, including the retries a 429 or 5xx provokes — so a
// count of logical calls would understate spend exactly when spend spikes.
// fetchWithRetry has one caller (saApiFetch), so this counts SA and
// nothing else.
//
// Folded into stats.saRequests after each slice; that field rides in
// chain_state, so a chained run reports the whole chain's total rather
// than the last slice's.
let saRequestsThisSlice = 0;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      saRequestsThisSlice++;
      const res = await fetch(url, options);
      if (res.ok || res.status === 404) return res;
      // A 429 carrying "no requests remaining" is quota exhaustion, not
      // pacing: RapidAPI sets this header on every response, so an
      // explicit '0' is a reliable signal. Fail out rather than retry —
      // see QuotaError.
      if (res.status === 429 && res.headers.get('x-ratelimit-requests-remaining') === '0') {
        const limit = res.headers.get('x-ratelimit-requests-limit') ?? 'unknown';
        throw new QuotaError(
          `RapidAPI quota exhausted (limit ${limit}, remaining 0) — aborting without retry`,
        );
      }
      // Retry on server errors and transient rate limits
      if (res.status >= 500 || res.status === 429) {
        if (attempt < maxRetries) {
          // Honour Retry-After when present (RapidAPI returns it on 429).
          // Falls back to exponential backoff for 5xx without a header.
          const retryAfter = res.headers.get('retry-after');
          const headerMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 0;
          const backoff = headerMs > 0 ? headerMs : Math.pow(2, attempt) * 1000;
          console.log(`Retry ${attempt + 1}/${maxRetries} after ${backoff}ms (HTTP ${res.status}${retryAfter ? `, Retry-After=${retryAfter}s` : ''})`);
          await delay(backoff);
          continue;
        }
      }
      throw new Error(`HTTP ${res.status}: ${url}`);
    } catch (err: any) {
      if (err instanceof QuotaError) throw err;
      if (attempt < maxRetries && err.message?.includes('fetch failed')) {
        const backoff = Math.pow(2, attempt) * 1000;
        console.log(`Retry ${attempt + 1}/${maxRetries} after ${backoff}ms (network error)`);
        await delay(backoff);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Max retries exceeded: ${url}`);
}

async function saApiFetch(path: string): Promise<any> {
  const url = `https://${SA_API_HOST}${path}`;
  const res = await fetchWithRetry(url, { headers: SA_HEADERS });
  if (res.status === 404) return null;
  return res.json();
}

// ── Sync logic ───────────────────────────────────────────

// Cap the lookback window so a stuck/failed run can't compound API spend
// when the next run finally succeeds. 36h is generous enough to cover one
// missed daily run without balloning pagination on the SA API side.
const MAX_SINCE_LOOKBACK_SECONDS = 36 * 3600;

// ── Slice budget (A2) ────────────────────────────────────
// A slice stops after 18s and hands off, so no single invocation is ever
// long enough to be killed. A full window took ~128s on recent runs, so
// roughly 8 slices; the cap allows ~9 minutes of work before giving up.
// RESIZED 2026-08-25: the backfill chain died at slice 12 with an Edge
// Runtime 502 because workers linger minutes past their request and twelve
// 18s invocations exhausted the worker allowance. Invocation count is the
// scarce resource, not duration — so slices get bigger and fewer. 75s is
// well inside what we have evidence completes (105s, 128s) and well under
// the ~150s zone where runs were being killed. A full ~128s window is now
// 2 slices instead of 8.
const SLICE_BUDGET_MS = 75_000;

// ── SA request budget (A2 cost control) ──────────────────
// A hard ceiling on billable RapidAPI requests per CHAIN, so a pathological
// window cannot spend without bound. Sized above real need, not at it:
//
//   healthy day        ~145 requests (3.5k changes at SA's fixed 25/page)
//   catch-up after a
//   failed run (36h)   ~220
//   plus retries       some headroom
//
// 500 is ~3.4x a healthy day — high enough that it should never fire in
// normal operation, low enough to bound a runaway. If it starts tripping
// routinely that is a signal to investigate, not to raise the number.
//
// Tripping is NOT data loss: the slice saves its resume point, the run is
// marked 'failed' so getLastSyncTimestamp() does not advance past pages
// nobody fetched, and the next run picks the window up from the same
// place. Work is deferred, never dropped.
const SA_REQUEST_BUDGET = 500;

// Depth 20 = ~25 minutes of slice time. Sized off a real catch-up run:
// 2026-08-26 06:00 processed 3,518 changes in 540s of slice time and STILL
// hit its depth cap without consuming the window, because two failed runs
// in a row had pushed `since` back to the 36h lookback cap.
//
// That combination is a stall trap. getLastSyncTimestamp() only advances
// on a COMPLETED run, so if a catch-up window can never finish inside the
// cap, every subsequent run re-requests the same 36h window, hits the cap,
// is marked failed, and re-requests it again — burning SA API quota
// forever without ever making progress. The cap has to be comfortably
// larger than the worst-case window, not merely larger than a normal one.
// A routine 24h window consumes ~2 slices and stops early, so a high cap
// costs nothing on ordinary days.
const MAX_CHAIN_DEPTH = 20;

// Pause before handing off, giving the outgoing worker a moment to wind
// down before its successor starts.
const HANDOFF_DELAY_MS = 3_000;

// A chain that has not heartbeated in this long is presumed dead.
const CHAIN_STALE_MS = 120_000;

// Where a slice stopped, and what the chain has accumulated so far.
// Persisted to sync_log.chain_state between invocations.
interface SyncChainState {
  since: number;
  ti: number;             // index into CHANGE_TYPES
  si: number;             // index into SA_SERVICES_GB
  cursor: string | null;  // SA API pagination cursor at (ti, si)
  depth: number;
  slices: number;
  stats: SyncStats;
  errorBuckets: ErrorBucket[];
  stopped_because: string | null;
  // Set when the SA request budget trips. Distinct from stopped_because
  // (which the handler writes) because it must also STOP the chain rather
  // than hand off — a handoff would resume and immediately re-trip.
  sa_budget_stop?: string | null;
  // Set after each handoff so resume_stalled_chains() (migration 068) can
  // report WHY a chain stalled, not merely that it did.
  last_request_id: number | null;
  resumes?: number;
  last_delivery_status?: string;
}

async function getLastSyncTimestamp(): Promise<number> {
  const { data } = await supabase
    .from('sync_log')
    .select('completed_at')
    .eq('status', 'completed')
    .eq('sync_type', 'incremental')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();

  const nowSec = Math.floor(Date.now() / 1000);
  const minSince = nowSec - MAX_SINCE_LOOKBACK_SECONDS;

  if (data?.completed_at) {
    const lastCompleted = Math.floor(new Date(data.completed_at).getTime() / 1000);
    return Math.max(lastCompleted, minSince);
  }

  // If no previous incremental sync, default to 24 hours ago
  return nowSec - 86400;
}

function extractTmdbId(saApiTmdbId: string): { tmdbId: number; mediaType: 'movie' | 'tv' } {
  // SA API returns tmdbId as "movie/238" or "tv/1396"
  const parts = saApiTmdbId.split('/');
  return {
    tmdbId: parseInt(parts[1], 10),
    mediaType: parts[0] === 'series' ? 'tv' : 'movie',
  };
}

/**
 * Compute and store a content vector for a title using its existing DB metadata.
 * Returns 'vectorised' | 'skipped' | 'error'.
 * Skips if the title isn't in the titles table yet — it will be vectorised
 * during the next full stageTmdb() run.
 */
async function insertHistoryBatch(events: HistoryEvent[]): Promise<void> {
  if (events.length === 0) return;
  const BATCH_SIZE = 100;
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const result = await supabase
      .from('streaming_history')
      .insert(events.slice(i, i + BATCH_SIZE));
    if (result?.error) console.error('History batch insert error:', result.error.message);
  }
}

// Every count here is a STREAMING OPTION, never a title. This function has
// no `.from('titles')` write of any kind — it cannot add a title. The old
// field names (`added`/`updated`/`removed`) were written straight into
// sync_log.titles_* and are the reason the log claimed 925 titles added on
// a day the catalogue did not move at all.
interface SyncStats {
  processed: number;
  availabilityAdded: number;
  availabilityUpdated: number;
  availabilityRemoved: number;
  /** Billable SA requests across the whole chain (A2 cost control). */
  saRequests: number;
}

function emptyStats(): SyncStats {
  return {
    processed: 0,
    availabilityAdded: 0,
    availabilityUpdated: 0,
    availabilityRemoved: 0,
    saRequests: 0,
  };
}

// Runs ONE slice: from the position saved in `state` until either the work
// is exhausted or SLICE_BUDGET_MS elapses. Returns true when the whole
// window has been consumed, false when it stopped early — in which case
// `state` holds the exact point to resume from.
//
// What this replaces: the old loop had a MAX_RUNTIME_MS check that logged
// "Will resume on next invocation" and returned. There was no next
// invocation, and no position was saved. The handler then marked the run
// 'completed', which let getLastSyncTimestamp() advance the window past
// pages that were never fetched. Silent, permanent data loss on every run
// long enough to trip it.
//
// `stats` is owned by the caller and mutated in place, so a fatal error
// partway through still leaves the partial counts readable in the catch
// block rather than dying with the stack frame.
async function runSyncSlice(
  state: SyncChainState,
  syncId: string | undefined,
  errors: ErrorCollector,
  stats: SyncStats
): Promise<boolean> {
  const since = state.since;
  // Cleared per slice so a flag left in chain_state by an earlier slice
  // cannot stop a later one that has not itself overspent.
  state.sa_budget_stop = null;
  const historyEvents: HistoryEvent[] = [];
  const startTime = Date.now();
  const overBudget = () => Date.now() - startTime > SLICE_BUDGET_MS;

  // Clears after writing, so calling it twice cannot double-insert. Every
  // exit path from this function goes through it (including the `finally`
  // below), which is what makes "flush early" actually hold.
  const flushHistory = async () => {
    if (historyEvents.length === 0) return;
    await insertHistoryBatch(historyEvents);
    historyEvents.length = 0;
  };

  // Captured before the loops mutate them, so the resume test below stays
  // anchored to where THIS slice started.
  const resumeTi = state.ti;
  const resumeSi = state.si;
  const resumeCursor = state.cursor;

  console.log(
    `slice ${state.depth}: since ${new Date(since * 1000).toISOString()}, ` +
    `resuming at [${resumeTi}/${resumeSi}]${resumeCursor ? ` cursor=${resumeCursor}` : ''}`
  );

  try {
  for (let ti = resumeTi; ti < CHANGE_TYPES.length; ti++) {
    const changeType = CHANGE_TYPES[ti];
    // Only the change-type we resumed into starts partway down the service
    // list; every later one starts from the beginning.
    for (let si = ti === resumeTi ? resumeSi : 0; si < SA_SERVICES_GB.length; si++) {
      const service = SA_SERVICES_GB[si];

      // The cursor belongs to exactly one (changeType, service) pair.
      let cursor: string | undefined =
        ti === resumeTi && si === resumeSi ? (resumeCursor ?? undefined) : undefined;
      let hasMore = true;

      while (hasMore) {
        // Chain total: what earlier slices already spent, plus this one.
        const saSpent = stats.saRequests + saRequestsThisSlice;
        if (saSpent >= SA_REQUEST_BUDGET) {
          state.ti = ti;
          state.si = si;
          state.cursor = cursor ?? null;
          state.sa_budget_stop =
            `SA request budget reached (${saSpent}/${SA_REQUEST_BUDGET}) at [${ti}/${si}] ` +
            `(${changeType}/${service}) — deferring the rest of the window`;
          await flushHistory();
          console.warn(state.sa_budget_stop);
          return false;
        }

        if (overBudget()) {
          // Save the exact resume point and flush before handing off, so a
          // slice that stops early loses nothing.
          state.ti = ti;
          state.si = si;
          state.cursor = cursor ?? null;
          await flushHistory();
          console.log(
            `slice budget reached at [${ti}/${si}] (${changeType}/${service}) — handing off`
          );
          return false;
        }

        try {
          let path = `/changes?country=gb&change_type=${changeType}&catalogs=${service}&item_type=show&from=${since}`;
          if (cursor) path += `&cursor=${cursor}`;

          const result = await saApiFetch(path);
          if (!result) { hasMore = false; break; }

          for (const change of result.changes || []) {
            try {
              // SA API new format: showId is a plain numeric string (e.g. "28584"),
              // showType is "movie" or "series" as a separate field.
              // Old format had show.tmdbId = "movie/238" — keep fallback for safety.
              let tmdbId: number;
              let mediaType: 'movie' | 'tv';
              if (change.showId && change.showType) {
                tmdbId = parseInt(change.showId, 10);
                mediaType = change.showType === 'series' ? 'tv' : 'movie';
              } else if (change.show?.tmdbId) {
                ({ tmdbId, mediaType } = extractTmdbId(change.show.tmdbId));
              } else {
                errors.record('change.shape', 'missing showId/showType', Object.keys(change).join(','));
                console.error(`Skipping change: missing showId/showType. Keys: ${Object.keys(change).join(', ')}`);
                continue;
              }
              if (!tmdbId || isNaN(tmdbId)) {
                errors.record('change.shape', 'invalid tmdbId', String(change.showId));
                console.error(`Skipping change: invalid tmdbId "${change.showId}"`);
                continue;
              }
              const saServiceId = change.service?.id || service;
              const serviceId = SA_TO_VIDEX[saServiceId] || saServiceId;
              const streamType = change.streamingOptionType as string;

              if (changeType === 'removed') {
                // Capture existing rows before deletion for history
                const { data: existingRows } = await supabase
                  .from('streaming_availability')
                  .select('service_id, stream_type, quality, deep_link_url, price_amount, price_currency')
                  .eq('tmdb_id', tmdbId)
                  .eq('media_type', mediaType)
                  .eq('service_id', serviceId)
                  .eq('stream_type', streamType);

                for (const row of existingRows || []) {
                  historyEvents.push({
                    tmdb_id: tmdbId, media_type: mediaType,
                    service_id: row.service_id,
                    event_type: 'removed',
                    stream_type: row.stream_type, quality: row.quality,
                    link: row.deep_link_url,
                    price_amount: row.price_amount, price_currency: row.price_currency,
                    old_price_amount: null, sync_run_id: syncId || null,
                  });
                }

                await supabase
                  .from('streaming_availability')
                  .delete()
                  .eq('tmdb_id', tmdbId)
                  .eq('media_type', mediaType)
                  .eq('service_id', serviceId)
                  .eq('stream_type', streamType);
                stats.availabilityRemoved++;
              } else {
                // new / updated / expiring: upsert this individual streaming option.
                // For 'updated': read existing row before delete for price comparison.
                let existingRow: { price_amount: number | null; price_currency: string | null } | null = null;
                if (changeType === 'updated') {
                  const { data } = await supabase
                    .from('streaming_availability')
                    .select('price_amount, price_currency')
                    .eq('tmdb_id', tmdbId)
                    .eq('media_type', mediaType)
                    .eq('service_id', serviceId)
                    .eq('stream_type', streamType)
                    .limit(1)
                    .maybeSingle();
                  existingRow = data;
                }

                // Delete existing row(s) for this option, then insert fresh.
                // Scoped to service_id + stream_type (not whole title) to avoid
                // clobbering other services' rows as the old upsertAvailability did.
                await supabase
                  .from('streaming_availability')
                  .delete()
                  .eq('tmdb_id', tmdbId)
                  .eq('media_type', mediaType)
                  .eq('service_id', serviceId)
                  .eq('stream_type', streamType);

                const newRow = {
                  tmdb_id: tmdbId,
                  media_type: mediaType,
                  service_id: serviceId,
                  sa_service_id: saServiceId,
                  stream_type: streamType,
                  deep_link_url: change.link,
                  video_link_url: change.videoLink || null,
                  quality: change.quality || null,
                  price_amount: change.price ? parseFloat(change.price.amount) : null,
                  price_currency: change.price?.currency || null,
                  price_formatted: change.price?.formatted || null,
                  addon_id: change.addon?.id || null,
                  addon_name: change.addon?.name || null,
                  expires_soon: change.expiresSoon || false,
                  expires_on: change.expiresOn ? new Date(change.expiresOn * 1000).toISOString() : null,
                  available_since: change.timestamp ? new Date(change.timestamp * 1000).toISOString() : null,
                  last_verified_at: new Date().toISOString(),
                };

                const { error: insertError } = await supabase
                  .from('streaming_availability')
                  .insert(newRow);
                if (insertError) throw insertError;

                // Log history event
                const newPrice = change.price ? parseFloat(change.price.amount) : null;
                const oldPrice = existingRow?.price_amount ?? null;
                const isPriceChanged = changeType === 'updated' && existingRow && newPrice !== null && oldPrice !== null && newPrice !== oldPrice;
                historyEvents.push({
                  tmdb_id: tmdbId, media_type: mediaType, service_id: serviceId,
                  event_type: changeType === 'new' ? 'added' : isPriceChanged ? 'price_changed' : 'updated',
                  stream_type: streamType,
                  quality: change.quality || null,
                  link: change.link,
                  price_amount: newPrice, price_currency: change.price?.currency || null,
                  old_price_amount: isPriceChanged ? oldPrice : null,
                  sync_run_id: syncId || null,
                });

                if (changeType === 'new') stats.availabilityAdded++;
                else stats.availabilityUpdated++;

                // Phase 1: embeddings handled by embed-new-titles cron (06:45 UTC)
              }
              stats.processed++;
            } catch (err: any) {
              errors.record(
                `change.${changeType}`,
                err,
                `${change.showType ?? '?'}/${change.showId ?? change.show?.tmdbId ?? '?'}`
              );
              console.error(`Error processing ${changeType} for ${change.showId ?? change.show?.tmdbId}:`, err.message);
            }
          }

          // Flush history after each page rather than holding it for the
          // whole slice.
          if (historyEvents.length >= 200) await flushHistory();

          hasMore = result.hasMore || false;
          cursor = result.nextCursor;
          await heartbeat(syncId);
          // Pace requests below RapidAPI's per-second cap on the BASIC tier.
          await delay(1100);
        } catch (err: any) {
          // Anything else here is per-(type,service) and the loop moves on.
          // A quota refusal is not: continuing would issue another request
          // for every remaining pair, each one spending to be refused
          // again. Abandon the slice so the chain stops and resumes later.
          if (err instanceof QuotaError) throw err;
          console.error(`Error fetching ${changeType} changes for ${service}:`, err.message);
          errors.record(`fetch.${changeType}`, err, service);
          hasMore = false;
        }
      }
    }
  }

  } finally {
    // Also covers the throw path: a slice that dies mid-window still
    // persists the history events it had already built.
    await flushHistory();
  }

  // Walked every change type and every service — the window is consumed.
  state.cursor = null;
  return true;
}

// One shape for both the success and failure paths, so a run that dies
// halfway still records what it managed to do and why it stopped. The old
// catch block wrote `errors: 1` and nothing else.
function syncLogUpdate(
  status: 'completed' | 'failed',
  stats: SyncStats,
  errors: ErrorCollector
) {
  return {
    status,
    completed_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
    titles_processed: stats.processed,
    // This function never writes `titles`. Saying 0 is the whole point of A1.
    titles_added: 0,
    availability_added: stats.availabilityAdded,
    availability_updated: stats.availabilityUpdated,
    availability_removed: stats.availabilityRemoved,
    sa_requests: stats.saRequests,
    errors: errors.total,
    error_details: errors.toJson(),
  };
}

/// ── Edge Function handler ────────────────────────────────
//
// One invocation = one slice. The daily cron (migration 062) starts slice
// 0; each slice enqueues its successor through `enqueue_function_call`
// (migration 067), which queues the request inside Postgres so the handoff
// survives this isolate exiting.
//
// Why the window must never be marked 'completed' early:
// getLastSyncTimestamp() advances from the last COMPLETED run, so calling
// a partial window complete silently skips every page it never fetched.
// A chain that runs out of depth, or dies, is therefore marked FAILED —
// which correctly makes the next run re-cover the same window.

interface ChainBody {
  depth?: number;
  runId?: string;
  since?: number;
}

function emptySyncChainState(since: number): SyncChainState {
  return {
    since,
    ti: 0,
    si: 0,
    cursor: null,
    depth: 0,
    slices: 0,
    stats: emptyStats(),
    errorBuckets: [],
    stopped_because: null,
    last_request_id: null,
  };
}

function unauthorized() {
  return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  // Verify caller has service_role — check the JWT role claim rather than doing
  // a raw string comparison against the env var (which varies by invocation method).
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return unauthorized();
  try {
    const payload = JSON.parse(atob(authHeader.split(' ')[1].split('.')[1]));
    if (payload.role !== 'service_role') throw new Error('not service_role');
  } catch {
    return unauthorized();
  }

  // Chain position. The cron posts '{}', so an absent depth means slice 0.
  let depth = 0;
  let runId: string | undefined;
  let sinceOverride: number | undefined;
  try {
    const body = (await req.json()) as ChainBody;
    if (typeof body?.depth === 'number') depth = body.depth;
    if (typeof body?.runId === 'string') runId = body.runId;
    if (typeof body?.since === 'number') sinceOverride = body.since;
  } catch {
    // No body, or not JSON — treat as a fresh chain.
  }
  // ?since= on the URL still works for manual re-runs, and wins over the body.
  const sinceParam = new URL(req.url).searchParams.get('since');
  if (sinceParam) sinceOverride = parseInt(sinceParam, 10);

  // ── Chain start ──────────────────────────────────────────────────
  if (depth === 0) {
    const { data: reaped, error: reapError } = await supabase.rpc('reap_stale_sync_runs');
    if (reapError) console.error('reap_stale_sync_runs failed:', reapError.message);
    else if (reaped) console.log(`Reaped ${reaped} stale sync_log row(s)`);

    // Never run two chains at once — they would both page the same SA
    // windows and double the API spend we are trying to reduce.
    const { data: active } = await supabase
      .from('sync_log')
      .select('id')
      .eq('sync_type', 'incremental')
      .eq('status', 'running')
      .gte('heartbeat_at', new Date(Date.now() - CHAIN_STALE_MS).toISOString())
      .limit(1);
    if (active && active.length > 0) {
      console.log(`sync chain already running (sync_log ${active[0].id}) — skipping`);
      return json({ status: 'skipped', reason: 'chain already running' });
    }

    const since = sinceOverride || (await getLastSyncTimestamp());
    const { data: syncLog, error: logError } = await supabase
      .from('sync_log')
      .insert({
        sync_type: 'incremental',
        source: 'sa_api',
        status: 'running',
        heartbeat_at: new Date().toISOString(),
        chain_state: emptySyncChainState(since),
      })
      .select('id')
      .single();
    if (logError || !syncLog) {
      const message = logError?.message ?? 'sync_log insert returned no row';
      console.error('sync_log insert failed:', message);
      return json({ status: 'error', message }, 500);
    }
    runId = syncLog.id;
    console.log(`sync chain ${runId} starting from ${new Date(since * 1000).toISOString()}`);
  }

  if (!runId) {
    return json({ status: 'error', message: 'chained slice called without runId' }, 400);
  }

  // ── Load chain state ─────────────────────────────────────────────
  const { data: current, error: readError } = await supabase
    .from('sync_log')
    .select('chain_state, status')
    .eq('id', runId)
    .single();
  if (readError || !current) {
    const message = readError?.message ?? `sync_log ${runId} not found`;
    console.error('chain state read failed:', message);
    return json({ status: 'error', message }, 500);
  }
  if (current.status !== 'running') {
    // Reaped or closed while this slice was in flight — don't resurrect it.
    console.warn(`chain ${runId} is ${current.status} — not continuing`);
    return json({ status: 'stopped', reason: `run is ${current.status}` });
  }
  if (!current.chain_state) {
    const message = `sync_log ${runId} has no chain_state — cannot resume`;
    console.error(message);
    await supabase
      .from('sync_log')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        errors: 1,
        error_details: { total: 1, fatal: message, errors: [] },
      })
      .eq('id', runId);
    return json({ status: 'error', message }, 500);
  }

  const state = current.chain_state as SyncChainState;
  state.depth = depth;
  state.slices += 1;

  // Totals and error buckets carry across the chain, so each slice adds to
  // what its predecessors already recorded rather than starting clean.
  const stats: SyncStats = { ...emptyStats(), ...state.stats };
  const errors = ErrorCollector.fromBuckets(state.errorBuckets);

  // ── Run one slice ────────────────────────────────────────────────
  let windowConsumed = false;
  let fatal: string | null = null;
  try {
    windowConsumed = await runSyncSlice(state, runId, errors, stats);
  } catch (err) {
    fatal = err instanceof Error ? err.message : String(err);
    errors.record('fatal', err);
    console.error('Sync slice failed:', fatal);
  }

  // After the try/catch, so a slice that died partway still reports the
  // requests it had already paid for.
  stats.saRequests += saRequestsThisSlice;

  state.stats = stats;
  state.errorBuckets = errors.toBuckets();

  // ── Decide whether the chain continues ───────────────────────────
  let stop: string | null = null;
  if (fatal) stop = `fatal: ${fatal}`;
  else if (windowConsumed) stop = 'window consumed';
  // Before the depth check: handing off after a budget trip would resume
  // and re-trip immediately, burning an invocation to learn nothing.
  else if (state.sa_budget_stop) stop = state.sa_budget_stop;
  else if (depth + 1 >= MAX_CHAIN_DEPTH) {
    stop = `chain depth cap (${MAX_CHAIN_DEPTH}) reached before the window was consumed`;
  }

  if (stop) {
    state.stopped_because = stop;
    // ONLY a fully consumed window may be marked 'completed'. Anything else
    // must stay 'failed' so getLastSyncTimestamp() does not advance past
    // pages this chain never fetched.
    const status = windowConsumed && !fatal ? 'completed' : 'failed';
    await supabase
      .from('sync_log')
      .update({ ...syncLogUpdate(status, stats, errors), chain_state: state })
      .eq('id', runId);

    console.log(
      `sync chain ${runId} ${status} after ${state.slices} slice(s): ` +
      `processed=${stats.processed} availability_added=${stats.availabilityAdded} ` +
      `availability_updated=${stats.availabilityUpdated} ` +
      `availability_removed=${stats.availabilityRemoved} sa_requests=${stats.saRequests} ` +
      `errors=${errors.total} — ${stop}`
    );
    return json(
      {
        status: status === 'completed' ? 'ok' : 'error',
        runId,
        slices: state.slices,
        ...stats,
        errors: errors.total,
        stopped: stop,
      },
      status === 'completed' ? 200 : 500
    );
  }

  // ── Persist progress, then hand off ──────────────────────────────
  // Written BEFORE the handoff so the resume point is durable even if the
  // enqueue fails.
  await supabase
    .from('sync_log')
    .update({
      heartbeat_at: new Date().toISOString(),
      titles_processed: stats.processed,
      titles_added: 0,
      availability_added: stats.availabilityAdded,
      availability_updated: stats.availabilityUpdated,
      availability_removed: stats.availabilityRemoved,
      sa_requests: stats.saRequests,
      errors: errors.total,
      error_details: errors.toJson(),
      chain_state: state,
    })
    .eq('id', runId);

  await delay(HANDOFF_DELAY_MS);
  const { data: requestId, error: chainError } = await supabase.rpc('enqueue_function_call', {
    p_function: 'sync-incremental',
    p_body: { depth: depth + 1, runId },
  });
  if (chainError) {
    console.error(`chain handoff failed at depth ${depth}:`, chainError.message);
    errors.record('chain', `enqueue_function_call failed: ${chainError.message}`);
    state.stopped_because = `chain handoff failed: ${chainError.message}`;
    await supabase
      .from('sync_log')
      .update({ ...syncLogUpdate('failed', stats, errors), chain_state: state })
      .eq('id', runId);
    return json({ status: 'error', message: chainError.message }, 500);
  }

  // Second write, deliberately after the enqueue: the watchdog
  // (resume_stalled_chains, migration 068) uses this id to look the
  // delivery up in net._http_response and report WHY a chain stalled. If
  // we die between the two writes the watchdog still resumes the chain —
  // it just records the delivery status as unknown.
  state.last_request_id = typeof requestId === 'number' ? requestId : null;
  await supabase.from('sync_log').update({ chain_state: state }).eq('id', runId);

  console.log(
    `slice ${depth} done at [${state.ti}/${state.si}] ` +
    `(processed=${stats.processed} errors=${errors.total}) — queued depth ${depth + 1}`
  );
  return json({
    status: 'ok',
    runId,
    depth,
    chained: depth + 1,
    resumeAt: { ti: state.ti, si: state.si, cursor: state.cursor },
    ...stats,
    errors: errors.total,
  });
});
