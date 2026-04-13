/**
 * Refresh Service Fingerprints Edge Function (Phase 2 + 2.5)
 *
 * Recomputes 1536D centroid vectors for each streaming service from their
 * top-N most popular catalogue titles. Runs weekly (Sunday 07:00 UTC) via
 * pg_cron, after the daily content pipeline (sync → enrich → embed) has
 * settled.
 *
 * Phase 2.5 addition: Before recomputing fingerprints, runs a TMDb
 * watch/providers backfill for BBC iPlayer, NOW TV, and Sky Go — three
 * services absent or unusable from the SA API dataset. This keeps their
 * catalogues fresh in streaming_availability.
 *
 * Timing note on backfill lag: New titles discovered by the weekly backfill
 * won't be enriched/embedded until the next day's pipeline (Monday 06:30
 * enrich → 06:45 embed). They contribute to fingerprints the following
 * Sunday. This lag is acceptable because fingerprints represent service
 * character (what kind of content a service carries), not breaking content
 * (what's new this week). If a service's character shifts materially
 * mid-week, the fingerprint catches up the following Sunday.
 *
 * Service count is small (~13), each requiring only DB reads + vector math.
 * TMDb backfill adds ~5s (18 API calls at 260ms). Total runtime is well
 * under the 2-minute Edge Function timeout.
 *
 * Deploy: npx supabase functions deploy refresh-service-fingerprints --project-ref fmusugdcnnwiuzkbjquo
 * Manual: curl -X POST https://<project>.supabase.co/functions/v1/refresh-service-fingerprints \
 *           -H "Authorization: Bearer <service_role_key>"
 *
 * Required Supabase Functions env vars:
 *   - SUPABASE_URL                (auto-provided)
 *   - SUPABASE_SERVICE_ROLE_KEY   (auto-provided)
 *   - TMDB_API_KEY                (must be set explicitly — already set for enrich-new-titles)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { computeCentroid } from '../_shared/centroidMath.ts';

// ── Config ───────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TOP_N = 150;
const IN_BATCH_SIZE = 300;

// ── TMDb backfill config (Phase 2.5) ────────────────────

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_DELAY = 260; // ms — ~4 req/s, matches all other scripts
const BACKFILL_MAX_PAGES = 3; // reduced from 5 (local script) to stay under timeout

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Provider IDs verified via WU-0 preflight script against TMDb live API.
const BACKFILL_PROVIDERS = [
  { tmdb_provider_id: 38, service_id: 'bbc',   stream_type: 'free' as const },
  { tmdb_provider_id: 39, service_id: 'now',   stream_type: 'subscription' as const },
  { tmdb_provider_id: 29, service_id: 'skygo', stream_type: 'free' as const },
];

const BACKFILL_SEARCH_FALLBACKS: Record<string, (t: string) => string> = {
  bbc:   (t) => `https://www.bbc.co.uk/iplayer/search?q=${encodeURIComponent(t)}`,
  now:   (t) => `https://www.nowtv.com/watch/search?q=${encodeURIComponent(t)}`,
  skygo: (t) => `https://www.google.com/search?q=${encodeURIComponent(t)}+site:sky.com`,
};

// ── Title fetching (same logic as build script) ──────────

async function fetchTitlesForPairs(
  pairs: { tmdb_id: number; media_type: string }[],
): Promise<{ id: number; tmdb_id: number; media_type: string; popularity: number; embedding: string }[]> {
  const byType = new Map<string, number[]>();
  for (const p of pairs) {
    const arr = byType.get(p.media_type) || [];
    arr.push(p.tmdb_id);
    byType.set(p.media_type, arr);
  }

  const results: { id: number; tmdb_id: number; media_type: string; popularity: number; embedding: string }[] = [];

  for (const [mediaType, tmdbIds] of byType) {
    const uniqueIds = [...new Set(tmdbIds)];

    for (let i = 0; i < uniqueIds.length; i += IN_BATCH_SIZE) {
      const batch = uniqueIds.slice(i, i + IN_BATCH_SIZE);
      const { data, error } = await supabase
        .from('titles')
        .select('id, tmdb_id, media_type, popularity, embedding')
        .in('tmdb_id', batch)
        .eq('media_type', mediaType)
        .not('embedding', 'is', null)
        .gte('vote_count', 50)
        .order('popularity', { ascending: false });

      if (error) throw new Error(`titles query (${mediaType}): ${error.message}`);
      if (data) results.push(...data);
    }
  }

  return results;
}

// ── TMDb backfill (Phase 2.5) ───────────────────────────

async function tmdbFetch(path: string, params: Record<string, string> = {}): Promise<any> {
  await sleep(TMDB_DELAY);
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString());
    if (res.ok) return res.json();
    if ((res.status >= 500 || res.status === 429) && attempt < 2) {
      await sleep(Math.pow(2, attempt) * 1000);
      continue;
    }
    throw new Error(`TMDb ${res.status}: ${path}`);
  }
}

async function backfillTmdbProviders(): Promise<{ titles_upserted: number; sa_rows_inserted: number }> {
  let titlesUpserted = 0;
  let saRowsInserted = 0;

  for (const provider of BACKFILL_PROVIDERS) {
    const deepLinkFn = BACKFILL_SEARCH_FALLBACKS[provider.service_id];

    for (const mediaType of ['movie', 'tv']) {
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages && page <= BACKFILL_MAX_PAGES) {
        const data = await tmdbFetch(`/discover/${mediaType}`, {
          watch_region: 'GB',
          with_watch_providers: provider.tmdb_provider_id.toString(),
          sort_by: 'popularity.desc',
          page: page.toString(),
        });

        totalPages = Math.min(data.total_pages || 1, 500);

        for (const item of data.results || []) {
          const title = item.title || item.name || 'Untitled';
          const releaseYear = (item.release_date || item.first_air_date)
            ? parseInt((item.release_date || item.first_air_date).slice(0, 4), 10)
            : null;

          // Upsert title
          const { error: titleErr } = await supabase
            .from('titles')
            .upsert({
              tmdb_id: item.id,
              media_type: mediaType,
              title,
              original_title: item.original_title || item.original_name,
              overview: item.overview,
              release_date: item.release_date || item.first_air_date || null,
              release_year: releaseYear,
              poster_path: item.poster_path,
              backdrop_path: item.backdrop_path,
              genre_ids: item.genre_ids || [],
              vote_average: item.vote_average,
              vote_count: item.vote_count,
              popularity: item.popularity,
              original_language: item.original_language,
              last_synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'tmdb_id,media_type' });

          if (!titleErr) titlesUpserted++;

          // Insert streaming_availability (skip duplicates via 23505)
          const { error: saErr } = await supabase
            .from('streaming_availability')
            .insert({
              tmdb_id: item.id,
              media_type: mediaType,
              service_id: provider.service_id,
              sa_service_id: 'tmdb-backfill',
              stream_type: provider.stream_type,
              deep_link_url: deepLinkFn(title),
              quality: 'default',
              last_verified_at: new Date().toISOString(),
            });

          if (!saErr) saRowsInserted++;
          // 23505 (unique_violation) is expected on re-runs — skip silently
        }

        page++;
      }
    }
  }

  return { titles_upserted: titlesUpserted, sa_rows_inserted: saRowsInserted };
}

// ── Process one service ─────────────────────────────────

async function processService(serviceId: string): Promise<{ title_count: number } | null> {
  // Fetch (tmdb_id, media_type) pairs from streaming_availability
  const saPairs: { tmdb_id: number; media_type: string }[] = [];
  let saOffset = 0;
  const SA_PAGE_SIZE = 1000;

  while (true) {
    const { data: saPage, error: saErr } = await supabase
      .from('streaming_availability')
      .select('tmdb_id, media_type')
      .eq('service_id', serviceId)
      .in('stream_type', ['subscription', 'free'])
      .range(saOffset, saOffset + SA_PAGE_SIZE - 1);

    if (saErr) throw new Error(`SA query for ${serviceId}: ${saErr.message}`);
    if (!saPage || saPage.length === 0) break;
    saPairs.push(...saPage);
    if (saPage.length < SA_PAGE_SIZE) break;
    saOffset += SA_PAGE_SIZE;
  }

  // Deduplicate (a title can have both subscription + free entries)
  const seen = new Set<string>();
  const uniquePairs = saPairs.filter(p => {
    const key = `${p.tmdb_id}:${p.media_type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (uniquePairs.length === 0) return null;

  // Fetch titles with embeddings, split by media_type
  const allTitles = await fetchTitlesForPairs(uniquePairs);
  if (allTitles.length === 0) return null;

  // Sort by popularity, take top N
  allTitles.sort((a, b) => b.popularity - a.popularity);
  const topTitles = allTitles.slice(0, TOP_N);

  // Parse embeddings and compute centroid
  const vectors: number[][] = [];
  const titleIds: number[] = [];

  for (const t of topTitles) {
    const emb = typeof t.embedding === 'string'
      ? JSON.parse(t.embedding)
      : t.embedding;
    vectors.push(emb);
    titleIds.push(t.id);
  }

  const centroid = computeCentroid(vectors);
  const vectorStr = `[${centroid.join(',')}]`;

  // Upsert (PK is service_id, region, variant since migration 022)
  const { error: upsertErr } = await supabase
    .from('service_fingerprints')
    .upsert({
      service_id: serviceId,
      region: 'GB',
      variant: 'v1_popularity',
      centroid: vectorStr,
      title_count: topTitles.length,
      source_title_ids: titleIds,
      computed_at: new Date().toISOString(),
    }, { onConflict: 'service_id,region,variant' });

  if (upsertErr) throw new Error(`upsert ${serviceId}: ${upsertErr.message}`);

  return { title_count: topTitles.length };
}

// ── Edge Function handler ───────────────���────────────────

Deno.serve(async (req) => {
  // JWT verification — mirrors embed-new-titles/index.ts
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

  try {
    // Phase 2.5: Backfill TMDb provider data before recomputing fingerprints
    console.log('Phase 2.5 backfill: refreshing TMDb provider catalogues...');
    const backfillStats = await backfillTmdbProviders();
    console.log(`Phase 2.5 backfill done: ${backfillStats.titles_upserted} titles upserted, ${backfillStats.sa_rows_inserted} SA rows inserted`);

    // Get distinct services
    const { data: serviceRows, error: serviceErr } = await supabase
      .from('streaming_availability')
      .select('service_id')
      .in('stream_type', ['subscription', 'free']);

    if (serviceErr) throw new Error(`service query: ${serviceErr.message}`);

    const services = [...new Set((serviceRows || []).map((r: { service_id: string }) => r.service_id))].sort();

    const details: Record<string, number> = {};
    let processed = 0;
    let failed = 0;

    for (const serviceId of services) {
      try {
        const result = await processService(serviceId);
        if (result) {
          details[serviceId] = result.title_count;
          processed++;
        }
      } catch (err) {
        console.error(`${serviceId}: ${err instanceof Error ? err.message : String(err)}`);
        failed++;
      }
    }

    console.log(`refresh-service-fingerprints done: processed=${processed} failed=${failed}`);
    return new Response(JSON.stringify({ status: 'ok', services_processed: processed, services_failed: failed, details, backfill: backfillStats }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('refresh-service-fingerprints failed:', message);
    return new Response(JSON.stringify({ status: 'error', message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
