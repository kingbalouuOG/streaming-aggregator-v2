/**
 * Content Sync Script — Initial Population (Phase B1.3)
 *
 * Populates Supabase content cache from TMDb + SA API + OMDB.
 * Runs locally (not an Edge Function) for initial bulk sync.
 *
 * Usage:
 *   npx tsx scripts/sync-content.ts                    # Full sync (all 3 stages)
 *   npx tsx scripts/sync-content.ts --stage tmdb       # Stage 1 only: TMDb titles
 *   npx tsx scripts/sync-content.ts --stage sa         # Stage 2 only: SA API availability
 *   npx tsx scripts/sync-content.ts --stage omdb       # Stage 3 only: OMDB ratings
 *   # --stage vectors removed in Phase 1 (use scripts/embeddings/backfill-embeddings.ts)
 *   npx tsx scripts/sync-content.ts --limit 50         # Process max 50 titles per stage
 *   npx tsx scripts/sync-content.ts --stage sa --limit 100
 *
 * Prerequisites:
 *   - .env must have: VITE_TMDB_API_KEY, SA_API_KEY, VITE_OMDB_API_KEY,
 *     VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
// Phase 1: contentToVector import removed — embeddings handled by embed-new-titles cron

// ── Load .env manually (no Vite in script context) ───────

function loadEnv(): Record<string, string> {
  const envPath = resolve(__dirname, '..', '.env');
  const content = readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return env;
}

const ENV = loadEnv();

const TMDB_API_KEY = ENV.VITE_TMDB_API_KEY;
const SA_API_KEY = ENV.SA_API_KEY;
const OMDB_API_KEY = ENV.VITE_OMDB_API_KEY;
const SUPABASE_URL = ENV.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;

if (!TMDB_API_KEY || !SA_API_KEY || !OMDB_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required env vars. Check .env has:');
  console.error('  VITE_TMDB_API_KEY, SA_API_KEY, VITE_OMDB_API_KEY');
  console.error('  VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── CLI args ─────────────────────────────────────────────

const args = process.argv.slice(2);
const stageArg = args.includes('--stage') ? args[args.indexOf('--stage') + 1] : 'all';
const limitArg = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity;

// ── Rate limiting ────────────────────────────────────────

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rateLimitedFetch(url: string, options: RequestInit, delayMs: number, maxRetries = 3): Promise<Response> {
  await delay(delayMs);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || res.status === 404) return res;
      if ((res.status >= 500 || res.status === 429) && attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 1000;
        console.log(`  Retry ${attempt + 1}/${maxRetries} after ${backoff}ms (HTTP ${res.status})`);
        await delay(backoff);
        continue;
      }
      return res; // Return non-retryable errors as-is
    } catch (err: any) {
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 1000;
        console.log(`  Retry ${attempt + 1}/${maxRetries} after ${backoff}ms (network error)`);
        await delay(backoff);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Max retries exceeded: ${url}`);
}

// ── TMDb helpers ─────────────────────────────────────────

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_DELAY = 260; // ~4 req/s (TMDb allows 40/10s)

async function tmdbFetch(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await rateLimitedFetch(url.toString(), {}, TMDB_DELAY);
  if (!res.ok) throw new Error(`TMDb ${res.status}: ${path}`);
  return res.json();
}

// UK streaming provider IDs for TMDb discover
const UK_PROVIDER_IDS = [8, 9, 350, 337, 39, 29, 582, 38, 54, 103]; // All 10 UK services
const UK_PROVIDER_STRING = UK_PROVIDER_IDS.join('|'); // OR logic

// ── SA API helpers ───────────────────────────────────────

const SA_HOST = 'streaming-availability.p.rapidapi.com';
const SA_DELAY = 120; // ~8 req/s (Pro allows 100/s but be conservative)

const SA_HEADERS = {
  'X-RapidAPI-Key': SA_API_KEY,
  'X-RapidAPI-Host': SA_HOST,
};

// SA API service slug → Videx ServiceId
// NOTE: Also defined in src/lib/adapters/platformAdapter.ts and supabase/functions/sync-incremental/index.ts
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

async function saApiFetch(path: string): Promise<any> {
  const url = `https://${SA_HOST}${path}`;
  const res = await rateLimitedFetch(url, { headers: SA_HEADERS }, SA_DELAY);
  if (!res.ok) {
    if (res.status === 404) return null; // Title not found
    throw new Error(`SA API ${res.status}: ${path}`);
  }
  return res.json();
}

// ── OMDB helpers ─────────────────────────────────────────

const OMDB_DELAY = 100; // 1000/day limit, but fine per-request

async function omdbFetch(imdbId: string): Promise<any> {
  const url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&i=${imdbId}`;
  const res = await rateLimitedFetch(url, {}, OMDB_DELAY);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.Response === 'False') return null;
  return data;
}

// ── Sync log helpers ─────────────────────────────────────

async function createSyncLog(syncType: string, source: string): Promise<string> {
  const { data } = await supabase
    .from('sync_log')
    .insert({ sync_type: syncType, source, status: 'running' })
    .select('id')
    .single();
  return data!.id;
}

async function updateSyncLog(id: string, updates: Record<string, any>): Promise<void> {
  await supabase.from('sync_log').update(updates).eq('id', id);
}

// ── Stage 1: TMDb catalogue pull ─────────────────────────

async function stageTmdb(maxTitles: number): Promise<number> {
  console.log('\n════════════════════════════════════════');
  console.log('  STAGE 1: TMDb Catalogue Pull');
  console.log('════════════════════════════════════════\n');

  const syncId = await createSyncLog('full', 'tmdb');
  let totalProcessed = 0;
  let totalAdded = 0;
  let totalUpdated = 0;
  let errors = 0;

  for (const mediaType of ['movie', 'tv'] as const) {
    if (totalProcessed >= maxTitles) break;

    const discoverPath = `/discover/${mediaType}`;
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages && totalProcessed < maxTitles) {
      try {
        const data = await tmdbFetch(discoverPath, {
          watch_region: 'GB',
          with_watch_providers: UK_PROVIDER_STRING,
          sort_by: 'popularity.desc',
          page: page.toString(),
        });

        totalPages = Math.min(data.total_pages || 1, 500); // TMDb caps at 500

        for (const item of data.results || []) {
          if (totalProcessed >= maxTitles) break;

          const genreIds = item.genre_ids || [];
          const releaseYear = (item.release_date || item.first_air_date)
            ? parseInt((item.release_date || item.first_air_date).slice(0, 4), 10)
            : null;

          // Phase 1: embeddings handled by embed-new-titles cron (06:45 UTC)
          const titleData = {
            tmdb_id: item.id,
            media_type: mediaType,
            title: item.title || item.name || 'Untitled',
            original_title: item.original_title || item.original_name,
            overview: item.overview,
            release_date: item.release_date || item.first_air_date || null,
            release_year: releaseYear,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            genre_ids: genreIds,
            vote_average: item.vote_average,
            vote_count: item.vote_count,
            popularity: item.popularity,
            original_language: item.original_language,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const { error, status } = await supabase
            .from('titles')
            .upsert(titleData, { onConflict: 'tmdb_id,media_type' });

          if (error) {
            errors++;
            if (errors <= 5) console.error(`  ✗ Upsert error for ${item.id}:`, error.message);
          } else {
            if (status === 201) totalAdded++;
            else totalUpdated++;
          }

          totalProcessed++;
        }

        if (page % 10 === 0 || page === 1) {
          console.log(`  [${mediaType}] Page ${page}/${totalPages} — ${totalProcessed} titles processed (${totalAdded} new, ${errors} errors)`);
        }

        page++;
      } catch (err: any) {
        console.error(`  ✗ Discover error page ${page}:`, err.message);
        errors++;
        page++;
      }
    }
  }

  // Fetch IMDb IDs for titles that don't have them
  console.log('\n  Fetching IMDb IDs via external_ids...');
  const { data: titlesNeedingImdb } = await supabase
    .from('titles')
    .select('tmdb_id, media_type')
    .is('imdb_id', null)
    .limit(Math.min(maxTitles, 2000));

  let imdbFetched = 0;
  for (const title of titlesNeedingImdb || []) {
    try {
      const path = `/${title.media_type}/${title.tmdb_id}/external_ids`;
      const extIds = await tmdbFetch(path);
      if (extIds?.imdb_id) {
        await supabase
          .from('titles')
          .update({ imdb_id: extIds.imdb_id })
          .eq('tmdb_id', title.tmdb_id)
          .eq('media_type', title.media_type);
        imdbFetched++;
      }
    } catch {
      // Best effort — skip failures
    }

    if (imdbFetched % 100 === 0 && imdbFetched > 0) {
      console.log(`  IMDb IDs fetched: ${imdbFetched}/${titlesNeedingImdb!.length}`);
    }
  }

  console.log(`\n  ✓ Stage 1 complete: ${totalProcessed} titles, ${totalAdded} added, ${totalUpdated} updated, ${imdbFetched} IMDb IDs, ${errors} errors`);

  await updateSyncLog(syncId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    titles_processed: totalProcessed,
    titles_added: totalAdded,
    titles_updated: totalUpdated,
    errors,
  });

  return totalProcessed;
}

// ── Stage 2: SA API availability + deep links ────────────

async function stageSaApi(maxTitles: number): Promise<number> {
  console.log('\n════════════════════════════════════════');
  console.log('  STAGE 2: SA API Availability + Deep Links');
  console.log('════════════════════════════════════════\n');

  const syncId = await createSyncLog('full', 'sa_api');
  let totalProcessed = 0;
  let totalLinks = 0;
  let errors = 0;

  // Get all titles with IMDb IDs (paginated — Supabase caps at 1000 per query)
  const allTitles: any[] = [];
  let from = 0;
  const batchSize = 1000;
  const cap = Math.min(maxTitles, 25000);
  while (allTitles.length < cap) {
    const { data } = await supabase
      .from('titles')
      .select('tmdb_id, media_type, imdb_id')
      .not('imdb_id', 'is', null)
      .order('popularity', { ascending: false })
      .range(from, from + batchSize - 1);
    if (!data || data.length === 0) break;
    allTitles.push(...data);
    from += batchSize;
    if (data.length < batchSize) break;
  }

  // Filter to only titles not yet processed (resumable)
  const alreadyProcessedList: any[] = [];
  let apFrom = 0;
  while (true) {
    const { data } = await supabase
      .from('streaming_availability')
      .select('tmdb_id, media_type')
      .range(apFrom, apFrom + batchSize - 1);
    if (!data || data.length === 0) break;
    alreadyProcessedList.push(...data);
    apFrom += batchSize;
    if (data.length < batchSize) break;
  }

  const processedSet = new Set(
    alreadyProcessedList.map((r: any) => `${r.tmdb_id}-${r.media_type}`)
  );
  const titles = allTitles.filter(
    (t: any) => !processedSet.has(`${t.tmdb_id}-${t.media_type}`)
  );

  const total = titles?.length || 0;
  console.log(`  Found ${total} titles with IMDb IDs to process\n`);

  for (const title of titles || []) {
    if (totalProcessed >= maxTitles) break;

    try {
      const saData = await saApiFetch(`/shows/${title.imdb_id}?country=gb`);

      if (saData && saData.streamingOptions?.gb) {
        const gbOptions = saData.streamingOptions.gb;

        // Build rows — use 'default' for null quality to work with COALESCE unique index
        const rows = gbOptions.map((opt: any) => ({
          tmdb_id: title.tmdb_id,
          media_type: title.media_type,
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

        // Deduplicate rows by (service_id, stream_type, quality) — keep first occurrence
        const seen = new Set<string>();
        const uniqueRows = rows.filter((r: any) => {
          const key = `${r.service_id}-${r.stream_type}-${r.quality}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        if (uniqueRows.length > 0) {
          // Delete existing rows for this title, then insert fresh data.
          // The COALESCE functional unique index prevents duplicates but can't be
          // used with Supabase JS onConflict, so we use delete-then-insert instead.
          // Client-side dedup above ensures no duplicates within the insert batch.
          await supabase
            .from('streaming_availability')
            .delete()
            .eq('tmdb_id', title.tmdb_id)
            .eq('media_type', title.media_type);

          const { error } = await supabase
            .from('streaming_availability')
            .insert(uniqueRows);
          if (error) {
            errors++;
            if (errors <= 5) console.error(`  ✗ Insert error for ${title.imdb_id}:`, error.message);
          } else {
            totalLinks += uniqueRows.length;
          }
        }
      }
    } catch (err: any) {
      errors++;
      if (errors <= 10) console.error(`  ✗ SA API error for ${title.imdb_id}:`, err.message);
    }

    totalProcessed++;
    if (totalProcessed % 50 === 0) {
      console.log(`  [${totalProcessed}/${total}] ${totalLinks} links stored, ${errors} errors`);
    }
  }

  console.log(`\n  ✓ Stage 2 complete: ${totalProcessed} titles processed, ${totalLinks} streaming links, ${errors} errors`);

  await updateSyncLog(syncId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    titles_processed: totalProcessed,
    titles_added: totalLinks,
    errors,
  });

  return totalProcessed;
}

// ── Stage 3: OMDB ratings ────────────────────────────────

async function stageOmdb(maxTitles: number): Promise<number> {
  console.log('\n════════════════════════════════════════');
  console.log('  STAGE 3: OMDB Ratings');
  console.log('════════════════════════════════════════\n');

  const syncId = await createSyncLog('full', 'omdb');
  let totalProcessed = 0;
  let totalUpdated = 0;
  let errors = 0;

  // OMDB free tier: 1000 requests/day — limit to 950 to be safe
  const omdbLimit = Math.min(maxTitles, 950);

  const { data: titles } = await supabase
    .from('titles')
    .select('tmdb_id, media_type, imdb_id')
    .not('imdb_id', 'is', null)
    .is('rt_score', null)
    .order('popularity', { ascending: false })
    .limit(omdbLimit);

  const total = titles?.length || 0;
  console.log(`  Found ${total} titles needing OMDB ratings (limit: ${omdbLimit})\n`);

  for (const title of titles || []) {
    try {
      const omdbData = await omdbFetch(title.imdb_id);

      if (omdbData) {
        // Extract Rotten Tomatoes score
        const rtRating = omdbData.Ratings?.find((r: any) => r.Source === 'Rotten Tomatoes');
        const rtScore = rtRating?.Value || null; // e.g. "93%"
        const imdbRating = omdbData.imdbRating && omdbData.imdbRating !== 'N/A'
          ? parseFloat(omdbData.imdbRating)
          : null;

        await supabase
          .from('titles')
          .update({
            rt_score: rtScore,
            imdb_rating: imdbRating,
            last_synced_at: new Date().toISOString(),
          })
          .eq('tmdb_id', title.tmdb_id)
          .eq('media_type', title.media_type);

        totalUpdated++;
      }
    } catch (err: any) {
      errors++;
      if (errors <= 5) console.error(`  ✗ OMDB error for ${title.imdb_id}:`, err.message);
    }

    totalProcessed++;
    if (totalProcessed % 100 === 0) {
      console.log(`  [${totalProcessed}/${total}] ${totalUpdated} ratings updated, ${errors} errors`);
    }
  }

  console.log(`\n  ✓ Stage 3 complete: ${totalProcessed} titles processed, ${totalUpdated} ratings updated, ${errors} errors`);

  await updateSyncLog(syncId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    titles_processed: totalProcessed,
    titles_updated: totalUpdated,
    errors,
  });

  return totalProcessed;
}

// ── Stage: Fetch IMDb IDs only ────────────────────────────

async function stageImdbIds(maxTitles: number): Promise<number> {
  console.log('\n════════════════════════════════════════');
  console.log('  STAGE: Fetch IMDb IDs (external_ids)');
  console.log('════════════════════════════════════════\n');

  const syncId = await createSyncLog('full', 'tmdb');
  let fetched = 0;
  let errors = 0;

  // Supabase caps at 1000 rows per query — paginate to get all
  const titlesNeedingImdb: any[] = [];
  let from = 0;
  const batchSize = 1000;
  const cap = Math.min(maxTitles, 20000);
  while (titlesNeedingImdb.length < cap) {
    const { data } = await supabase
      .from('titles')
      .select('tmdb_id, media_type')
      .is('imdb_id', null)
      .order('popularity', { ascending: false })
      .range(from, from + batchSize - 1);
    if (!data || data.length === 0) break;
    titlesNeedingImdb.push(...data);
    from += batchSize;
    if (data.length < batchSize) break; // last page
  }

  const total = titlesNeedingImdb.length;
  console.log(`  Found ${total} titles without IMDb IDs\n`);

  for (const title of titlesNeedingImdb) {
    try {
      const path = `/${title.media_type}/${title.tmdb_id}/external_ids`;
      const extIds = await tmdbFetch(path);
      if (extIds?.imdb_id) {
        await supabase
          .from('titles')
          .update({ imdb_id: extIds.imdb_id })
          .eq('tmdb_id', title.tmdb_id)
          .eq('media_type', title.media_type);
        fetched++;
      }
    } catch {
      errors++;
    }

    if ((fetched + errors) % 200 === 0 && (fetched + errors) > 0) {
      console.log(`  [${fetched + errors}/${total}] ${fetched} IMDb IDs fetched, ${errors} errors`);
    }
  }

  console.log(`\n  ✓ IMDb IDs complete: ${total} processed, ${fetched} fetched, ${errors} errors`);

  await updateSyncLog(syncId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    titles_processed: total,
    titles_added: fetched,
    errors,
  });

  return fetched;
}

// Phase 1: stageVectors removed — embeddings handled by backfill-embeddings.ts
// and ongoing embed-new-titles cron

// ── Main ─────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║  Videx Content Sync — Initial Population  ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\n  Stage: ${stageArg}  |  Limit: ${limitArg === Infinity ? 'none' : limitArg}\n`);

  const startTime = Date.now();

  try {
    if (stageArg === 'all' || stageArg === 'tmdb') {
      await stageTmdb(limitArg);
    }

    if (stageArg === 'imdb') {
      await stageImdbIds(limitArg);
    }

    if (stageArg === 'all' || stageArg === 'sa') {
      await stageSaApi(limitArg);
    }

    if (stageArg === 'all' || stageArg === 'omdb') {
      await stageOmdb(limitArg);
    }
  } catch (err: any) {
    console.error('\n  ✗ Fatal error:', err.message);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  Done in ${elapsed}s`);
}

main();
