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

async function saApiFetch(path: string): Promise<any> {
  const url = `https://${SA_API_HOST}${path}`;
  const res = await fetch(url, { headers: SA_HEADERS });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`SA API ${res.status}: ${path}`);
  }
  return res.json();
}

// ── Sync logic ───────────────────────────────────────────

async function getLastSyncTimestamp(): Promise<number> {
  const { data } = await supabase
    .from('sync_log')
    .select('completed_at')
    .eq('status', 'completed')
    .eq('sync_type', 'incremental')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();

  if (data?.completed_at) {
    return Math.floor(new Date(data.completed_at).getTime() / 1000);
  }

  // If no previous incremental sync, default to 24 hours ago
  return Math.floor(Date.now() / 1000) - 86400;
}

function extractTmdbId(saApiTmdbId: string): { tmdbId: number; mediaType: 'movie' | 'tv' } {
  // SA API returns tmdbId as "movie/238" or "tv/1396"
  const parts = saApiTmdbId.split('/');
  return {
    tmdbId: parseInt(parts[1], 10),
    mediaType: parts[0] === 'series' ? 'tv' : 'movie',
  };
}

async function upsertAvailability(
  tmdbId: number,
  mediaType: string,
  streamingOptions: any[]
): Promise<number> {
  const rows = streamingOptions.map((opt: any) => ({
    tmdb_id: tmdbId,
    media_type: mediaType,
    service_id: SA_TO_VIDEX[opt.service.id] || opt.service.id,
    sa_service_id: opt.service.id,
    stream_type: opt.type,
    deep_link_url: opt.link,
    video_link_url: opt.videoLink || null,
    quality: opt.quality || 'default',
    price_amount: opt.price ? parseFloat(opt.price.amount) : null,
    price_currency: opt.price?.currency || null,
    price_formatted: opt.price?.formatted || null,
    addon_id: opt.addon?.id || null,
    addon_name: opt.addon?.name || null,
    expires_soon: opt.expiresSoon || false,
    expires_on: opt.expiresOn
      ? new Date(opt.expiresOn * 1000).toISOString()
      : null,
    available_since: opt.availableSince
      ? new Date(opt.availableSince * 1000).toISOString()
      : null,
    last_verified_at: new Date().toISOString(),
  }));

  // Deduplicate by (service_id, stream_type, quality)
  const seen = new Set<string>();
  const uniqueRows = rows.filter((r: any) => {
    const key = `${r.service_id}-${r.stream_type}-${r.quality}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniqueRows.length > 0) {
    // Delete existing rows for this title+service, then insert fresh data.
    // The COALESCE functional unique index can't be used with Supabase JS onConflict.
    await supabase
      .from('streaming_availability')
      .delete()
      .eq('tmdb_id', tmdbId)
      .eq('media_type', mediaType);

    const { error } = await supabase
      .from('streaming_availability')
      .insert(uniqueRows);
    if (error) throw error;
  }

  return uniqueRows.length;
}

async function runIncrementalSync(sinceOverride?: number): Promise<{
  processed: number;
  added: number;
  updated: number;
  removed: number;
  errors: number;
  timedOut: boolean;
}> {
  const since = sinceOverride || await getLastSyncTimestamp();
  const stats = { processed: 0, added: 0, updated: 0, removed: 0, errors: 0, timedOut: false };
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
              const { tmdbId, mediaType } = extractTmdbId(change.show.tmdbId);

              if (changeType === 'removed') {
                // Remove availability for this title on this service
                await supabase
                  .from('streaming_availability')
                  .delete()
                  .eq('tmdb_id', tmdbId)
                  .eq('media_type', mediaType)
                  .eq('sa_service_id', service);
                stats.removed++;
              } else {
                // Upsert availability from the change data
                const gbOptions = change.show.streamingOptions?.gb || [];
                const serviceOptions = gbOptions.filter((o: any) => o.service.id === service);
                if (serviceOptions.length > 0) {
                  const count = await upsertAvailability(tmdbId, mediaType, serviceOptions);
                  if (changeType === 'new') stats.added += count;
                  else stats.updated += count;
                }
              }
              stats.processed++;
            } catch (err: any) {
              stats.errors++;
              console.error(`Error processing ${changeType} for ${change.show?.tmdbId}:`, err.message);
            }
          }

          hasMore = result.hasMore || false;
          cursor = result.nextCursor;
          await delay(150);
        } catch (err: any) {
          console.error(`Error fetching ${changeType} changes for ${service}:`, err.message);
          stats.errors++;
          hasMore = false;
        }
      }
    }
  }

  return stats;
}

// ── Edge Function handler ────────────────────────────────

const MAX_RUNTIME_MS = 120_000; // 2 min — leave 30s buffer before Edge Function timeout

Deno.serve(async (req) => {
  // Verify caller is authorized (service_role key required)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ') || authHeader.split(' ')[1] !== SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ status: 'error', message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Parse optional since parameter
    const url = new URL(req.url);
    const sinceParam = url.searchParams.get('since');
    const since = sinceParam ? parseInt(sinceParam, 10) : undefined;

    // Create sync log entry
    const { data: syncLog } = await supabase
      .from('sync_log')
      .insert({ sync_type: 'incremental', source: 'sa_api', status: 'running' })
      .select('id')
      .single();

    const syncId = syncLog?.id;

    // Run the sync
    const stats = await runIncrementalSync(since);

    // Update sync log
    if (syncId) {
      await supabase
        .from('sync_log')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          titles_processed: stats.processed,
          titles_added: stats.added,
          titles_updated: stats.updated,
          titles_removed: stats.removed,
          errors: stats.errors,
        })
        .eq('id', syncId);
    }

    console.log(`Sync complete:`, stats);

    return new Response(JSON.stringify({ status: 'ok', ...stats }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Sync failed:', err.message);
    return new Response(JSON.stringify({ status: 'error', message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
