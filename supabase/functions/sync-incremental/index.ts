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

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status === 404) return res;
      // Retry on server errors and rate limits
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
  timedOut: boolean;
}

function emptyStats(): SyncStats {
  return {
    processed: 0,
    availabilityAdded: 0,
    availabilityUpdated: 0,
    availabilityRemoved: 0,
    timedOut: false,
  };
}

// `stats` is owned by the caller and mutated in place, so a fatal error
// partway through still leaves the partial counts readable in the catch
// block rather than dying with the stack frame.
async function runIncrementalSync(
  sinceOverride: number | undefined,
  syncId: string | undefined,
  errors: ErrorCollector,
  stats: SyncStats
): Promise<SyncStats> {
  const since = sinceOverride || await getLastSyncTimestamp();
  const historyEvents: HistoryEvent[] = [];
  const startTime = Date.now();

  console.log(`Incremental sync since ${new Date(since * 1000).toISOString()}`);

  for (const changeType of CHANGE_TYPES) {
    for (const service of SA_SERVICES_GB) {
      // Check wall-clock time to avoid Edge Function timeout
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log('Approaching timeout, stopping early. Will resume on next invocation.');
        stats.timedOut = true;
        return stats;
      }

      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
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

          // Flush history after each page to stay well within the 2-min timeout.
          if (historyEvents.length >= 200) {
            await insertHistoryBatch(historyEvents);
            historyEvents.length = 0;
          }

          hasMore = result.hasMore || false;
          cursor = result.nextCursor;
          await heartbeat(syncId);
          // Pace requests below RapidAPI's per-second cap on the BASIC tier.
          await delay(1100);
        } catch (err: any) {
          console.error(`Error fetching ${changeType} changes for ${service}:`, err.message);
          errors.record(`fetch.${changeType}`, err, service);
          hasMore = false;
        }
      }
    }
  }

  await insertHistoryBatch(historyEvents);
  console.log(`History: ${historyEvents.length} events logged`);

  return stats;
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
    errors: errors.total,
    error_details: errors.toJson(),
  };
}

// ── Edge Function handler ────────────────────────────────

const MAX_RUNTIME_MS = 120_000; // 2 min — leave 30s buffer before Edge Function timeout

Deno.serve(async (req) => {
  // Verify caller has service_role — check the JWT role claim rather than doing
  // a raw string comparison against the env var (which varies by invocation method).
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const payload = JSON.parse(atob(authHeader.split(' ')[1].split('.')[1]));
    if (payload.role !== 'service_role') throw new Error('not service_role');
  } catch {
    return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Declared outside try so the outer catch can mark the row as failed
  // instead of leaving it stuck in 'running' forever.
  let syncId: string | undefined;
  const errors = new ErrorCollector();
  const stats = emptyStats();

  try {
    // Close out any run killed mid-flight before starting a new one, so
    // 'running' means running (migration 066).
    const { data: reaped, error: reapError } = await supabase.rpc('reap_stale_sync_runs');
    if (reapError) console.error('reap_stale_sync_runs failed:', reapError.message);
    else if (reaped) console.log(`Reaped ${reaped} stale sync_log row(s)`);

    // Parse optional since parameter
    const url = new URL(req.url);
    const sinceParam = url.searchParams.get('since');
    const since = sinceParam ? parseInt(sinceParam, 10) : undefined;

    // Create sync log entry
    const { data: syncLog } = await supabase
      .from('sync_log')
      .insert({
        sync_type: 'incremental',
        source: 'sa_api',
        status: 'running',
        heartbeat_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    syncId = syncLog?.id;

    // Run the sync
    await runIncrementalSync(since, syncId, errors, stats);

    // Update sync log
    if (syncId) {
      await supabase
        .from('sync_log')
        .update(syncLogUpdate('completed', stats, errors))
        .eq('id', syncId);
    }

    console.log(
      `Sync complete: processed=${stats.processed} ` +
      `availability_added=${stats.availabilityAdded} ` +
      `availability_updated=${stats.availabilityUpdated} ` +
      `availability_removed=${stats.availabilityRemoved} ` +
      `errors=${errors.total} timedOut=${stats.timedOut}`
    );

    return new Response(JSON.stringify({ status: 'ok', ...stats, errors: errors.total }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Sync failed:', err.message);
    // Count the fatal error itself, then persist everything collected
    // before it — a run that dies at page 40 still knows what pages 1-39
    // hit. Previously all of that was discarded in favour of `errors: 1`.
    errors.record('fatal', err);
    if (syncId) {
      await supabase
        .from('sync_log')
        .update(syncLogUpdate('failed', stats, errors))
        .eq('id', syncId);
    }
    return new Response(JSON.stringify({ status: 'error', message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
