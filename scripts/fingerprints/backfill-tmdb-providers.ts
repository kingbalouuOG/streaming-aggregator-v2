/**
 * Phase 2.5 — TMDb Watch/Providers Backfill (WU-1)
 *
 * Backfills streaming_availability with TMDb watch/providers data for
 * BBC iPlayer, NOW TV, and Sky Go — three services absent or unusable
 * from the SA API dataset.
 *
 * For each provider, queries TMDb /discover/movie and /discover/tv with
 * with_watch_providers={id}&watch_region=GB to build a catalogue. Upserts
 * titles into the `titles` table and inserts streaming_availability rows.
 *
 * stream_type assignments:
 *   BBC iPlayer → 'free'        (funded by TV licence, no app subscription)
 *   NOW TV      → 'subscription' (paid streaming subscription — deviates from
 *                                 SA API's 'addon' classification. NOW is a
 *                                 standalone subscription from the user's
 *                                 mental model and from Pillar 3 fingerprint
 *                                 logic, regardless of how Sky bundles it
 *                                 commercially. Existing SA API addon rows
 *                                 are left untouched.)
 *   Sky Go      → 'free'        (included with Sky TV subscription)
 *
 * sa_service_id is set to 'tmdb-backfill' for all rows to distinguish
 * from SA API-sourced data (the column is NOT NULL per migration 001).
 *
 * Resume-safe via checkpoint + idempotent insert (23505 unique_violation
 * is caught and skipped). The functional unique index on streaming_availability
 * uses COALESCE(quality, 'default'), so we set quality='default' explicitly.
 *
 * Usage:
 *   npx tsx scripts/fingerprints/backfill-tmdb-providers.ts              # full run
 *   npx tsx scripts/fingerprints/backfill-tmdb-providers.ts --dry-run    # fetch + report, no writes
 *   npx tsx scripts/fingerprints/backfill-tmdb-providers.ts --limit 50   # cap total titles
 *   npx tsx scripts/fingerprints/backfill-tmdb-providers.ts --pages 3    # max pages per endpoint
 *
 * Prerequisites (.env):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   VITE_TMDB_API_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ── Load .env manually (no Vite in script context) ───────

function loadEnv(): Record<string, string> {
  const envPath = resolve(__dirname, '..', '..', '.env');
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
const SUPABASE_URL = ENV.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
const TMDB_API_KEY = ENV.VITE_TMDB_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TMDB_API_KEY) {
  console.error('Missing required env vars. Check .env has:');
  console.error('  VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_TMDB_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── CLI args ─────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitTitles = args.includes('--limit')
  ? parseInt(args[args.indexOf('--limit') + 1], 10)
  : Infinity;
const maxPages = args.includes('--pages')
  ? parseInt(args[args.indexOf('--pages') + 1], 10)
  : 5;

// ── Rate limiting ────────────────────────────────────────

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_DELAY = 260; // ms — ~4 req/s, matches sync-content.ts

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rateLimitedFetch(url: string, delayMs: number, maxRetries = 3): Promise<Response> {
  await delay(delayMs);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return res;
      if ((res.status >= 500 || res.status === 429) && attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 1000;
        console.log(`  retry ${attempt + 1}/${maxRetries} after ${backoff}ms (HTTP ${res.status})`);
        await delay(backoff);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 1000;
        console.log(`  retry ${attempt + 1}/${maxRetries} after ${backoff}ms (${err instanceof Error ? err.message : 'network error'})`);
        await delay(backoff);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Max retries exceeded: ${url}`);
}

async function tmdbFetch(path: string, params: Record<string, string> = {}): Promise<any> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await rateLimitedFetch(url.toString(), TMDB_DELAY);
  if (!res.ok) throw new Error(`TMDb ${res.status}: ${path}`);
  return res.json();
}

// ── Checkpoint + failures ────────────────────────────────

const CHECKPOINT_PATH = resolve(__dirname, '.backfill-checkpoint.json');
const FAILURES_PATH = resolve(__dirname, '.backfill-failures.jsonl');

interface BackfillCheckpoint {
  completed_providers: string[];
  started_at: string;
}

function loadCheckpoint(): BackfillCheckpoint | null {
  if (!existsSync(CHECKPOINT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function writeCheckpoint(cp: BackfillCheckpoint): void {
  const body = JSON.stringify(cp, null, 2);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      writeFileSync(CHECKPOINT_PATH, body);
      return;
    } catch (err) {
      lastErr = err;
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'EPERM'
      ) {
        const until = Date.now() + 50;
        while (Date.now() < until) { /* spin — Windows file-watcher transient handle */ }
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function appendFailure(record: object): void {
  appendFileSync(FAILURES_PATH, JSON.stringify(record) + '\n');
}

// ── Provider configuration ───────────────────────────────

interface ProviderConfig {
  tmdb_provider_id: number;
  service_id: string;
  stream_type: 'subscription' | 'free';
  deep_link_fn: (title: string) => string;
}

// Provider IDs verified via WU-0 preflight script against TMDb live API.
// Do NOT change these without re-running preflight-tmdb-providers.ts.
const PROVIDERS: ProviderConfig[] = [
  {
    tmdb_provider_id: 38,
    service_id: 'bbc',
    stream_type: 'free',
    deep_link_fn: (t) => `https://www.bbc.co.uk/iplayer/search?q=${encodeURIComponent(t)}`,
  },
  {
    tmdb_provider_id: 39,
    service_id: 'now',
    stream_type: 'subscription',
    deep_link_fn: (t) => `https://www.nowtv.com/watch/search?q=${encodeURIComponent(t)}`,
  },
  {
    tmdb_provider_id: 29,
    service_id: 'skygo',
    stream_type: 'free',
    deep_link_fn: (t) => `https://www.google.com/search?q=${encodeURIComponent(t)}+site:sky.com`,
  },
];

// ── Main ─────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Phase 2.5 — TMDb Provider Backfill');
  console.log(`  max pages per endpoint: ${maxPages}`);
  console.log(`  mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log();

  const checkpoint = loadCheckpoint();
  const completedSet = new Set(checkpoint?.completed_providers || []);
  const providers = PROVIDERS.filter(p => !completedSet.has(p.service_id));

  if (providers.length === 0) {
    console.log('All providers already processed. Delete .backfill-checkpoint.json to re-run.');
    return;
  }

  const cp: BackfillCheckpoint = {
    completed_providers: [...completedSet],
    started_at: checkpoint?.started_at || new Date().toISOString(),
  };

  const startTime = Date.now();
  let totalTitlesUpserted = 0;
  let totalSaInserted = 0;
  let totalSaSkipped = 0;
  let totalProcessed = 0;

  for (const provider of providers) {
    console.log(`--- ${provider.service_id} (TMDb provider ${provider.tmdb_provider_id}) ---`);

    let providerTitles = 0;
    let providerSaInserted = 0;
    let providerSaSkipped = 0;

    try {
      for (const mediaType of ['movie', 'tv'] as const) {
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages && page <= maxPages && totalProcessed < limitTitles) {
          const data = await tmdbFetch(`/discover/${mediaType}`, {
            watch_region: 'GB',
            with_watch_providers: provider.tmdb_provider_id.toString(),
            sort_by: 'popularity.desc',
            page: page.toString(),
          });

          totalPages = Math.min(data.total_pages || 1, 500);

          for (const item of data.results || []) {
            if (totalProcessed >= limitTitles) break;

            const title = item.title || item.name || 'Untitled';
            const genreIds = item.genre_ids || [];
            const releaseYear = (item.release_date || item.first_air_date)
              ? parseInt((item.release_date || item.first_air_date).slice(0, 4), 10)
              : null;

            // Step 1: Upsert into titles (same shape as sync-content.ts)
            if (!dryRun) {
              const titleData = {
                tmdb_id: item.id,
                media_type: mediaType,
                title,
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

              const { error: titleErr } = await supabase
                .from('titles')
                .upsert(titleData, { onConflict: 'tmdb_id,media_type' });

              if (titleErr) {
                appendFailure({
                  tmdb_id: item.id,
                  media_type: mediaType,
                  service_id: provider.service_id,
                  reason: 'title_upsert_error',
                  message: titleErr.message,
                  at: new Date().toISOString(),
                });
                continue;
              }
            }

            providerTitles++;
            totalTitlesUpserted++;

            // Step 2: Insert into streaming_availability
            if (!dryRun) {
              const saRow = {
                tmdb_id: item.id,
                media_type: mediaType,
                service_id: provider.service_id,
                sa_service_id: 'tmdb-backfill',
                stream_type: provider.stream_type,
                deep_link_url: provider.deep_link_fn(title),
                quality: 'default',
                last_verified_at: new Date().toISOString(),
              };

              const { error: saErr } = await supabase
                .from('streaming_availability')
                .insert(saRow);

              if (saErr) {
                // 23505 = unique_violation — row already exists, skip silently
                if (saErr.code === '23505') {
                  providerSaSkipped++;
                  totalSaSkipped++;
                } else {
                  appendFailure({
                    tmdb_id: item.id,
                    media_type: mediaType,
                    service_id: provider.service_id,
                    reason: 'sa_insert_error',
                    message: saErr.message,
                    code: saErr.code,
                    at: new Date().toISOString(),
                  });
                }
              } else {
                providerSaInserted++;
                totalSaInserted++;
              }
            }

            totalProcessed++;
          }

          if (page === 1 || page % 3 === 0) {
            console.log(`  [${mediaType}] page ${page}/${Math.min(totalPages, maxPages)} — ${providerTitles} titles so far`);
          }

          page++;
        }
      }

      console.log(`  result: ${providerTitles} titles, ${providerSaInserted} SA rows inserted, ${providerSaSkipped} SA rows skipped (duplicates)`);

      if (!dryRun) {
        cp.completed_providers.push(provider.service_id);
        writeCheckpoint(cp);
      }

    } catch (err) {
      console.error(`  FAILED — ${err instanceof Error ? err.message : String(err)}`);
      appendFailure({
        service_id: provider.service_id,
        reason: 'provider_error',
        message: err instanceof Error ? err.message : String(err),
        at: new Date().toISOString(),
      });
      // Still mark as completed so resume skips it (can be retried by deleting checkpoint)
      if (!dryRun) {
        cp.completed_providers.push(provider.service_id);
        writeCheckpoint(cp);
      }
    }

    console.log();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`  providers processed: ${providers.length}`);
  console.log(`  titles upserted: ${totalTitlesUpserted}`);
  console.log(`  SA rows inserted: ${totalSaInserted}`);
  console.log(`  SA rows skipped (duplicates): ${totalSaSkipped}`);
  console.log(`  elapsed: ${elapsed}s`);
  console.log(`  mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
