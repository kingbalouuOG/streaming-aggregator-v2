/**
 * Phase 5.5 C18 / IN-465 — backfill missing titles from SA + TMDb.
 *
 * For every (tmdb_id, media_type) in streaming_availability that has
 * no joining titles row, fetch TMDb metadata and upsert into titles.
 * Downstream cron jobs (enrich-new-titles 06:30 UTC,
 * embed-new-titles 06:45 UTC) pick up the new rows the next morning.
 *
 * ── Dual role: one-off backfill AND recurring maintenance ───────────
 *
 * C17's IN-465 investigation surfaced that the `titles` table is
 * created exclusively by `scripts/sync-content.ts:stageTmdb` (a
 * manual script Joe runs), NOT by the `daily-content-sync` cron
 * (which only refreshes `streaming_availability` via the
 * `sync-incremental` Edge Function — see
 * `docs/v2/investigations/in-465-catalogue-sync-gap.md`).
 *
 * This script's query — `streaming_availability LEFT JOIN titles
 * WHERE titles IS NULL` — IS the recurring catalogue-gap closer.
 * Every run catches whatever SA has added since the last run. Joe
 * runs this manually as maintenance (e.g. monthly) until the Phase
 * 6 follow-up (IN-PX-50) wraps it in a scheduled Edge Function.
 *
 * Mirrors the upsert shape from scripts/sync-content.ts:stageTmdb so
 * any column drift surfaces here too. Uses onConflict
 * 'tmdb_id,media_type' so re-runs are idempotent — the script can be
 * killed mid-run and re-started without re-doing the work.
 *
 * Rate limit: 260ms / ~4 req/s (matches sync-content.ts). At ~5,400
 * missing IDs (C17 measurement), total wall time ~24 minutes.
 *
 * Usage:
 *   # Dry-run — prints what would happen, no writes.
 *   npx tsx scripts/backfill_missing_titles.ts --dry-run
 *
 *   # Live run.
 *   npx tsx scripts/backfill_missing_titles.ts
 *
 *   # Bound to first N missing IDs (testing).
 *   npx tsx scripts/backfill_missing_titles.ts --limit 50 --dry-run
 *
 * Env: .env must have VITE_TMDB_API_KEY, VITE_SUPABASE_URL,
 *      SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ── Args ─────────────────────────────────────────────────────────────

const ARGV = process.argv.slice(2);
const DRY_RUN = ARGV.includes('--dry-run');
const LIMIT_IDX = ARGV.indexOf('--limit');
const LIMIT = LIMIT_IDX >= 0 ? Number(ARGV[LIMIT_IDX + 1]) : Infinity;

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
  } catch { /* optional */ }
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

// ── TMDb fetch with rate-limit + retry (mirror of sync-content.ts) ───

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_DELAY = 260; // ~4 req/s
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

async function tmdbFetch(path: string, maxRetries = 3): Promise<TmdbTitle | null> {
  await delay(TMDB_DELAY);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const url = new URL(`${TMDB_BASE}${path}`);
    url.searchParams.set('api_key', TMDB_API_KEY);
    try {
      const res = await fetch(url.toString());
      if (res.status === 404) return null;
      if (res.ok) return (await res.json()) as TmdbTitle;
      if ((res.status >= 500 || res.status === 429) && attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 1000;
        console.error(`  retry ${attempt + 1}/${maxRetries} after ${backoff}ms (HTTP ${res.status})`);
        await delay(backoff);
        continue;
      }
      console.error(`  TMDb ${res.status}: ${path}`);
      return null;
    } catch (err) {
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 1000;
        await delay(backoff);
        continue;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  network error: ${msg}`);
      return null;
    }
  }
  return null;
}

// ── Title-row builder (mirrors stageTmdb in sync-content.ts) ────────

function buildTitleRow(item: TmdbTitle, mediaType: 'movie' | 'tv') {
  const releaseDate = mediaType === 'movie' ? item.release_date : item.first_air_date;
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
    release_date: releaseDate ?? null,
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

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();
  console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}IN-465 backfill — start`);
  console.log(`  Rate limit: ${TMDB_DELAY}ms / ~${Math.round(1000 / TMDB_DELAY)} req/s`);
  if (LIMIT < Infinity) console.log(`  Bounded to first ${LIMIT} IDs`);

  // 1. Canonical missing-count re-query. Plan v3 step 1 — never trust
  //    the plan-time snapshot.
  console.log('\n  Pulling missing IDs from streaming_availability…');
  const { data: saRows, error: saErr } = await supabase
    .from('streaming_availability')
    .select('tmdb_id, media_type');
  if (saErr || !saRows) {
    console.error('  streaming_availability query failed:', saErr?.message);
    process.exit(1);
  }
  const { data: titleRows, error: titleErr } = await supabase
    .from('titles')
    .select('tmdb_id, media_type');
  if (titleErr || !titleRows) {
    console.error('  titles query failed:', titleErr?.message);
    process.exit(1);
  }

  const knownKeys = new Set(titleRows.map((t) => `${t.media_type}-${t.tmdb_id}`));
  const missing: Array<{ tmdb_id: number; media_type: 'movie' | 'tv' }> = [];
  const missingSeen = new Set<string>();
  for (const r of saRows) {
    const key = `${r.media_type}-${r.tmdb_id}`;
    if (knownKeys.has(key)) continue;
    if (missingSeen.has(key)) continue;
    if (r.media_type !== 'movie' && r.media_type !== 'tv') continue;
    missingSeen.add(key);
    missing.push({ tmdb_id: r.tmdb_id, media_type: r.media_type });
    if (missing.length >= LIMIT) break;
  }

  console.log(`  Missing tmdb_ids: ${missing.length}`);
  if (missing.length === 0) {
    console.log('\n  Nothing to backfill. Exiting clean.');
    return;
  }

  // 2. Fetch + upsert loop. Batches the upsert in chunks of 500 so the
  //    PostgREST request body stays under its size cap on Pro tier.
  const CHUNK = 500;
  let fetched = 0;
  let skipped404 = 0;
  let errored = 0;
  let upserted = 0;
  let buffer: ReturnType<typeof buildTitleRow>[] = [];

  async function flushBuffer() {
    if (buffer.length === 0) return;
    if (DRY_RUN) {
      console.log(`  [DRY-RUN] would upsert ${buffer.length} rows`);
      buffer = [];
      return;
    }
    const { error } = await supabase
      .from('titles')
      .upsert(buffer, { onConflict: 'tmdb_id,media_type' });
    if (error) {
      console.error(`  upsert error (${buffer.length} rows):`, error.message);
      errored += buffer.length;
    } else {
      upserted += buffer.length;
    }
    buffer = [];
  }

  console.log(`\n  ${DRY_RUN ? '[DRY-RUN] simulating' : 'Fetching'} TMDb metadata + upserting…`);
  for (let i = 0; i < missing.length; i++) {
    const item = missing[i];
    const path = `/${item.media_type}/${item.tmdb_id}`;
    const tmdb = await tmdbFetch(path);
    fetched += 1;

    if (!tmdb) {
      skipped404 += 1;
      continue;
    }

    buffer.push(buildTitleRow(tmdb, item.media_type));
    if (buffer.length >= CHUNK) await flushBuffer();

    if ((i + 1) % 100 === 0) {
      const pct = ((i + 1) / missing.length * 100).toFixed(1);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`  ${i + 1}/${missing.length} (${pct}%) — upserted=${upserted}, 404=${skipped404}, errored=${errored}, elapsed=${elapsed}s`);
    }
  }
  await flushBuffer();

  // 3. Summary.
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}IN-465 backfill — complete in ${elapsed}s`);
  console.log(`  missing_n at start: ${missing.length}`);
  console.log(`  TMDb fetched:       ${fetched}`);
  console.log(`  ${DRY_RUN ? 'would upsert' : 'upserted'}:      ${upserted}`);
  console.log(`  skipped (TMDb 404): ${skipped404}`);
  console.log(`  errored (insert):   ${errored}`);
  console.log(`\n  Post-run check:`);
  console.log(`    SELECT count(*) FROM titles;  -- expect: pre-run + ${upserted}`);
  console.log(`    (Then re-run supabase/queries/in-465-investigation.sql Q1 — expect 0 or = skipped404.)`);
  console.log(`\n  Downstream pickup:`);
  console.log(`    enrich-new-titles  next 06:30 UTC cron → keywords + cast + content_rating`);
  console.log(`    embed-new-titles   next 06:45 UTC cron → 1536D embeddings`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
