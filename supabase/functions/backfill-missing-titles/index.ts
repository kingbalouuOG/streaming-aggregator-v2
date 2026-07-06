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
 * (migration 049) so this function stays memory-light — it never pulls
 * the full streaming_availability/titles tables into Deno the way the
 * one-off script does.
 *
 * Per-invocation budget: BATCH_LIMIT rows. At 260 ms per TMDb call that is
 * ~78 s for 300 rows, comfortably under the Edge Function wall-clock
 * limit. If more than BATCH_LIMIT are pending, subsequent scheduled runs
 * clear the backlog (see the weekly cron in migration 049). `remaining`
 * in the response body shows whether the queue is keeping up.
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
const BATCH_LIMIT = 300; // max missing IDs fetched per invocation (~78 s)

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

async function tmdbFetch(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<TmdbTitle | null> {
  const url = new URL(`${TMDB_BASE}/${mediaType}/${tmdbId}`);
  url.searchParams.set('api_key', TMDB_API_KEY);

  // Two retries on 429/5xx with exponential backoff; a 404 means TMDb has
  // no such title (deleted stub) — leave it missing and move on.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString());
    if (res.status === 404) return null;
    if (res.ok) return (await res.json()) as TmdbTitle;
    if (res.status === 429 || res.status >= 500) {
      const backoff = Math.pow(2, attempt + 2) * 1000;
      console.warn(`  retry ${attempt + 1}/3 after ${backoff}ms (HTTP ${res.status}) for ${mediaType}/${tmdbId}`);
      await sleep(backoff);
      continue;
    }
    // 4xx other than 404/429: unexpected, skip this row rather than abort.
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
}

async function runBackfillBatch(): Promise<RunStats> {
  const stats: RunStats = { missing: 0, upserted: 0, skipped404: 0, failed: 0, remaining: 0 };

  const { data, error } = await supabase.rpc('list_missing_title_ids', {
    p_limit: BATCH_LIMIT,
  });
  if (error) throw new Error(`list_missing_title_ids failed: ${error.message}`);

  const missing = (data ?? []) as MissingRow[];
  stats.missing = missing.length;
  console.log(`backfill-missing-titles: ${missing.length} missing IDs (cap ${BATCH_LIMIT})`);

  const buffer: ReturnType<typeof buildTitleRow>[] = [];
  const CHUNK = 100;

  async function flush() {
    if (buffer.length === 0) return;
    const rows = buffer.splice(0, buffer.length);
    const { error: upErr } = await supabase
      .from('titles')
      .upsert(rows, { onConflict: 'tmdb_id,media_type' });
    if (upErr) {
      stats.failed += rows.length;
      console.error(`  upsert error (${rows.length} rows): ${upErr.message}`);
    } else {
      stats.upserted += rows.length;
    }
  }

  for (const row of missing) {
    await sleep(TMDB_DELAY);
    const tmdb = await tmdbFetch(row.tmdb_id, row.media_type);
    if (tmdb === null) {
      stats.skipped404++;
      continue;
    }
    buffer.push(buildTitleRow(tmdb, row.media_type));
    if (buffer.length >= CHUNK) await flush();
  }
  await flush();

  // How many are still missing after this run — makes the cron logs show
  // whether a weekly cadence is keeping up or a backlog is building.
  const { data: remainingData, error: remErr } = await supabase.rpc('list_missing_title_ids', {
    p_limit: BATCH_LIMIT + 1,
  });
  if (!remErr && remainingData) {
    stats.remaining = (remainingData as MissingRow[]).length;
  }

  return stats;
}

// ── Edge Function handler ────────────────────────────────

Deno.serve(async (req) => {
  // JWT check — same pattern as enrich-new-titles/index.ts:157-172. The
  // migration-049 cron passes a service-role bearer (Vault-sourced);
  // reject anything else.
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
    const stats = await runBackfillBatch();
    console.log(
      `backfill-missing-titles done: missing=${stats.missing} upserted=${stats.upserted} ` +
      `skipped404=${stats.skipped404} failed=${stats.failed} remaining=${stats.remaining}`
    );
    return new Response(JSON.stringify({ status: 'ok', ...stats }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('backfill-missing-titles failed:', message);
    return new Response(JSON.stringify({ status: 'error', message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
