/**
 * Phase 5.5 C17 / IN-465 — TMDb sampling diagnostic.
 *
 * Pulls 100 distinct (tmdb_id, media_type) rows from
 * streaming_availability that are not joined by a titles row, hits
 * TMDb for each, and aggregates the resulting metadata into a profile:
 *   - distribution by year bucket
 *   - top genres
 *   - popularity quartile breakdown
 *   - skipped-404 count (TMDb-deleted stubs)
 *
 * Read-only — never writes to titles. The C18 backfill script (separate
 * file) is the production-affecting half.
 *
 * Usage:
 *   npx tsx scripts/in-465-tmdb-sample.ts > /tmp/in-465-sample.json
 *
 * Output: JSON summary on stdout; paste into
 * docs/v2/investigations/in-465-catalogue-sync-gap.md.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ── Env ──────────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  const envPath = resolve(process.cwd(), '.env');
  const env: Record<string, string> = {};
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^['"]|['"]$/g, '');
    }
  } catch {
    /* .env optional in CI */
  }
  return env;
}

const ENV = { ...loadEnv(), ...process.env };
const SUPABASE_URL = ENV.VITE_SUPABASE_URL ?? ENV.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
const TMDB_API_KEY = ENV.VITE_TMDB_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
if (!TMDB_API_KEY) {
  console.error('Missing VITE_TMDB_API_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── TMDb rate-limited fetch (mirrors sync-content.ts) ────────────────

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_DELAY = 260; // ~4 req/s (TMDb allows 40 / 10s)
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TmdbTitle {
  id: number;
  title?: string;             // movies
  name?: string;              // TV
  release_date?: string;      // movies
  first_air_date?: string;    // TV
  genres?: Array<{ id: number; name: string }>;
  popularity?: number;
  vote_count?: number;
}

async function tmdbFetch(path: string): Promise<TmdbTitle | null> {
  await delay(TMDB_DELAY);
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  const res = await fetch(url.toString());
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error(`TMDb ${res.status}: ${path}`);
    return null;
  }
  return res.json() as Promise<TmdbTitle>;
}

// ── Aggregation buckets ──────────────────────────────────────────────

function yearBucket(year: number): string {
  if (year < 2000) return 'pre-2000';
  if (year < 2010) return '2000-2009';
  if (year < 2020) return '2010-2019';
  return '2020+';
}

function popQuartile(popularity: number): string {
  if (popularity < 5) return 'q1 (<5)';
  if (popularity < 15) return 'q2 (5-15)';
  if (popularity < 50) return 'q3 (15-50)';
  return 'q4 (50+)';
}

// ── Main ─────────────────────────────────────────────────────────────

interface SampleSummary {
  totalSampled: number;
  notFoundOnTmdb: number;
  byMediaType: Record<string, number>;
  byYearBucket: Record<string, number>;
  byPopularityQuartile: Record<string, number>;
  topGenres: Array<{ name: string; count: number }>;
  byService: Record<string, number>;
}

async function main() {
  // Pull 100 missing (tmdb_id, media_type) from streaming_availability.
  // Use a deterministic ORDER BY tmdb_id so re-runs hit the same IDs
  // and findings are comparable across days.
  console.error('Pulling 100 missing IDs from streaming_availability…');
  const { data: missing, error: missingErr } = await supabase
    .from('streaming_availability')
    .select('tmdb_id, media_type, service_id')
    .order('tmdb_id', { ascending: true })
    .limit(2000);
  if (missingErr || !missing) {
    console.error('streaming_availability query failed:', missingErr?.message);
    process.exit(1);
  }

  // Filter client-side to those NOT in titles. Pull a wider set from
  // SA then narrow — saves a per-row join query.
  const { data: titlesRows, error: titlesErr } = await supabase
    .from('titles')
    .select('tmdb_id, media_type');
  if (titlesErr || !titlesRows) {
    console.error('titles query failed:', titlesErr?.message);
    process.exit(1);
  }
  const knownTitleKeys = new Set(titlesRows.map((t) => `${t.media_type}-${t.tmdb_id}`));

  const missingDistinct: Array<{ tmdb_id: number; media_type: string; services: string[] }> = [];
  const seen = new Set<string>();
  const servicesByKey = new Map<string, Set<string>>();
  for (const row of missing) {
    const key = `${row.media_type}-${row.tmdb_id}`;
    if (knownTitleKeys.has(key)) continue;
    if (!servicesByKey.has(key)) servicesByKey.set(key, new Set());
    servicesByKey.get(key)!.add(row.service_id);
    if (!seen.has(key)) {
      seen.add(key);
      missingDistinct.push({
        tmdb_id: row.tmdb_id,
        media_type: row.media_type,
        services: [],
      });
      if (missingDistinct.length >= 100) break;
    }
  }
  for (const item of missingDistinct) {
    const key = `${item.media_type}-${item.tmdb_id}`;
    item.services = Array.from(servicesByKey.get(key) ?? []);
  }

  console.error(`Sampling ${missingDistinct.length} missing titles from TMDb…`);

  const summary: SampleSummary = {
    totalSampled: missingDistinct.length,
    notFoundOnTmdb: 0,
    byMediaType: {},
    byYearBucket: {},
    byPopularityQuartile: {},
    topGenres: [],
    byService: {},
  };

  const genreCounts = new Map<string, number>();

  for (let i = 0; i < missingDistinct.length; i++) {
    const item = missingDistinct[i];
    if (i % 10 === 0) {
      console.error(`  ${i}/${missingDistinct.length} (${item.media_type}-${item.tmdb_id})`);
    }
    summary.byMediaType[item.media_type] = (summary.byMediaType[item.media_type] ?? 0) + 1;
    for (const svc of item.services) {
      summary.byService[svc] = (summary.byService[svc] ?? 0) + 1;
    }

    const path = item.media_type === 'movie'
      ? `/movie/${item.tmdb_id}`
      : `/tv/${item.tmdb_id}`;
    const tmdb = await tmdbFetch(path);
    if (!tmdb) {
      summary.notFoundOnTmdb += 1;
      continue;
    }

    const releaseDate = item.media_type === 'movie' ? tmdb.release_date : tmdb.first_air_date;
    const year = releaseDate ? Number(releaseDate.slice(0, 4)) : null;
    if (year && !Number.isNaN(year)) {
      const bucket = yearBucket(year);
      summary.byYearBucket[bucket] = (summary.byYearBucket[bucket] ?? 0) + 1;
    } else {
      summary.byYearBucket.unknown = (summary.byYearBucket.unknown ?? 0) + 1;
    }

    if (typeof tmdb.popularity === 'number') {
      const q = popQuartile(tmdb.popularity);
      summary.byPopularityQuartile[q] = (summary.byPopularityQuartile[q] ?? 0) + 1;
    }

    for (const g of tmdb.genres ?? []) {
      genreCounts.set(g.name, (genreCounts.get(g.name) ?? 0) + 1);
    }
  }

  summary.topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  console.log(JSON.stringify(summary, null, 2));
  console.error('\nDone. Paste stdout into docs/v2/investigations/in-465-catalogue-sync-gap.md §C17.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
