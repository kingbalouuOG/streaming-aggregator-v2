/**
 * Enrich New Titles Edge Function (Phase 0.5)
 *
 * Ongoing enrichment of new titles arriving from the daily sync. Runs
 * after `daily-content-sync` (which inserts rows with keywords IS NULL)
 * and walks the work queue, populating the four enrichment columns plus
 * runtime via TMDb.
 *
 * Deploy: npx supabase functions deploy enrich-new-titles --project-ref fmusugdcnnwiuzkbjquo
 * Manual: curl -X POST https://<project>.supabase.co/functions/v1/enrich-new-titles \
 *           -H "Authorization: Bearer <service_role_key>"
 *
 * Required Supabase Functions env vars (set via `supabase secrets set`):
 *   - SUPABASE_URL                (auto-provided)
 *   - SUPABASE_SERVICE_ROLE_KEY   (auto-provided)
 *   - TMDB_API_KEY                (must be set explicitly)
 *
 * Per-invocation budget: 100 rows. At 260 ms per TMDb call this is
 * ~26 s, comfortably under the 2-minute Edge Function timeout. If more
 * than 100 rows are pending, subsequent days' invocations clear the
 * backlog. The work queue is `WHERE keywords IS NULL` — same as the
 * one-time backfill script.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractFields } from '../_shared/extract_fields.ts';

// ── Config ───────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_DELAY = 260; // ms — matches sync-content.ts:98 and the backfill script
const BATCH_LIMIT = 100; // max rows enriched per invocation

// ── Helpers ──────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchTmdbDetail(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<unknown | null> {
  const append =
    mediaType === 'movie'
      ? 'keywords,credits,release_dates'
      : 'keywords,credits,content_ratings';
  const url = new URL(`${TMDB_BASE}/${mediaType}/${tmdbId}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  url.searchParams.set('append_to_response', append);

  // Two retries on 429/5xx with exponential backoff. We're per-row in a
  // capped-100 loop, so don't burn the whole budget on a single bad row.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString());
    if (res.status === 404) return null;
    if (res.ok) return await res.json();
    if (res.status === 429 || res.status >= 500) {
      const backoff = Math.pow(2, attempt + 2) * 1000;
      console.warn(`  retry ${attempt + 1}/3 after ${backoff}ms (HTTP ${res.status}) for ${mediaType}/${tmdbId}`);
      await sleep(backoff);
      continue;
    }
    throw new Error(`TMDb ${res.status} ${res.statusText} for ${mediaType}/${tmdbId}`);
  }
  throw new Error(`TMDb retries exhausted for ${mediaType}/${tmdbId}`);
}

interface TitleRow {
  id: number;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
}

interface RunStats {
  processed: number;
  skipped: number;
  failed: number;
  remaining: number;
}

async function runEnrichmentBatch(): Promise<RunStats> {
  const stats: RunStats = { processed: 0, skipped: 0, failed: 0, remaining: 0 };

  const { data: rows, error } = await supabase
    .from('titles')
    .select('id, tmdb_id, media_type')
    .is('keywords', null)
    .order('id', { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    throw new Error(`Supabase select failed: ${error.message}`);
  }

  const queue = (rows ?? []) as TitleRow[];
  console.log(`enrich-new-titles: processing ${queue.length} rows (cap ${BATCH_LIMIT})`);

  for (const row of queue) {
    try {
      // Rate gate: 260 ms between TMDb calls.
      await sleep(TMDB_DELAY);

      const tmdbResponse = await fetchTmdbDetail(row.tmdb_id, row.media_type);

      if (tmdbResponse === null) {
        // 404 — TMDb deleted the title. Leave keywords NULL so a future
        // invocation will pick it up if TMDb re-adds the title. Counts
        // as skipped, not failed.
        stats.skipped++;
        console.warn(`  skip  ${row.media_type}/${row.tmdb_id}: TMDb 404`);
        continue;
      }

      const fields = extractFields(tmdbResponse, row.media_type);
      const { error: updateError } = await supabase
        .from('titles')
        .update(fields)
        .eq('tmdb_id', row.tmdb_id)
        .eq('media_type', row.media_type);

      if (updateError) {
        throw new Error(`Supabase update failed: ${updateError.message}`);
      }
      stats.processed++;
    } catch (err) {
      stats.failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  fail  ${row.media_type}/${row.tmdb_id}: ${message}`);
      // Never throw out of the handler — pg_cron has no retry-on-failure
      // for failed http_post calls, so we always return a 200 with the
      // failure counted in stats.
    }
  }

  // Report what's still pending after this run, so the cron logs make
  // it obvious whether the queue is keeping up or building up.
  const { count: remainingCount } = await supabase
    .from('titles')
    .select('id', { count: 'exact', head: true })
    .is('keywords', null);
  stats.remaining = remainingCount ?? 0;

  return stats;
}

// ── Edge Function handler ────────────────────────────────

Deno.serve(async (req) => {
  // JWT verification — same pattern as sync-incremental/index.ts:411-426.
  // The cron job in supabase/cron/enrich_new_titles.sql passes a
  // service-role bearer token; the function rejects anything else.
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
    const stats = await runEnrichmentBatch();
    console.log(
      `enrich-new-titles done: processed=${stats.processed} skipped=${stats.skipped} failed=${stats.failed} remaining=${stats.remaining}`
    );
    return new Response(JSON.stringify({ status: 'ok', ...stats }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('enrich-new-titles failed:', message);
    return new Response(JSON.stringify({ status: 'error', message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
