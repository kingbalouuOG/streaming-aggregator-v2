/**
 * One-off backfill: BBC iPlayer rows in streaming_availability.
 *
 * Background: the SA API's iplayer catalog returned empty for GB until
 * 2026-04-27 (verified by maintainer in their issue tracker, confirmed
 * by scripts/_inspect_bbc_sa.mjs). Our streaming_availability table
 * was synced during the empty window, so it has zero iplayer rows.
 *
 * This script paginates the SA catalog filter for iplayer/GB, joins
 * each returned show to our `titles` table by tmdb_id, and writes
 * iplayer rows into streaming_availability without touching other
 * services' rows.
 *
 * Idempotent: re-runs delete-then-insert iplayer rows per title; other
 * services' rows are untouched. Safe to re-run if the catalog changes.
 *
 * Usage:
 *   npx tsx scripts/sync-bbc-iplayer-backfill.mjs           # dry-run (default)
 *   npx tsx scripts/sync-bbc-iplayer-backfill.mjs --commit  # actually write
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// ── Env ──
function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  const content = readFileSync(envPath, 'utf-8');
  const env = {};
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
const SA_API_KEY = ENV.SA_API_KEY;
const SUPABASE_URL = ENV.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
if (!SA_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SA_API_KEY / VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const COMMIT = process.argv.includes('--commit');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── SA API ──
const SA_HOST = 'streaming-availability.p.rapidapi.com';
const SA_HEADERS = {
  'X-RapidAPI-Key': SA_API_KEY,
  'X-RapidAPI-Host': SA_HOST,
};
const PAGE_DELAY_MS = 150;

async function saFetch(path) {
  const res = await fetch(`https://${SA_HOST}${path}`, { headers: SA_HEADERS });
  if (!res.ok) {
    return { status: res.status, body: await res.text() };
  }
  return { status: res.status, body: await res.json() };
}

async function paginateIplayerCatalog() {
  const allShows = [];
  let cursor = null;
  let pageCount = 0;

  while (true) {
    const cursorPart = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
    const path = `/shows/search/filters?country=gb&catalogs=iplayer&seriesGranularity=show&output_language=en&limit=100${cursorPart}`;
    const { status, body } = await saFetch(path);
    if (status !== 200) {
      console.error(`  Page ${pageCount}: HTTP ${status} - ${typeof body === 'string' ? body.slice(0, 120) : '[non-JSON]'}`);
      break;
    }
    const shows = body?.shows ?? [];
    allShows.push(...shows);
    pageCount++;
    process.stdout.write(`  page ${pageCount}: ${shows.length} shows (total ${allShows.length}, hasMore=${body?.hasMore})\r`);
    if (!body.hasMore) break;
    cursor = body.nextCursor ?? null;
    if (!cursor) break;
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }
  console.log();
  return allShows;
}

// ── Build candidate rows ──
function buildCandidateRows(shows) {
  const rows = [];
  let skippedNoTmdb = 0;
  let skippedNoIplayer = 0;
  for (const show of shows) {
    if (!show.tmdbId || typeof show.tmdbId !== 'string') {
      skippedNoTmdb++;
      continue;
    }
    const slashIdx = show.tmdbId.indexOf('/');
    if (slashIdx < 0) {
      skippedNoTmdb++;
      continue;
    }
    const mediaType = show.tmdbId.slice(0, slashIdx);
    const tmdbId = parseInt(show.tmdbId.slice(slashIdx + 1), 10);
    if (!['movie', 'tv'].includes(mediaType) || Number.isNaN(tmdbId)) {
      skippedNoTmdb++;
      continue;
    }

    const iplayerOpts = (show.streamingOptions?.gb ?? []).filter(
      (o) => o.service?.id === 'iplayer',
    );
    if (iplayerOpts.length === 0) {
      skippedNoIplayer++;
      continue;
    }

    for (const opt of iplayerOpts) {
      rows.push({
        tmdb_id: tmdbId,
        media_type: mediaType,
        service_id: 'bbc',
        sa_service_id: 'iplayer',
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
        expires_on: opt.expiresOn ? new Date(opt.expiresOn * 1000).toISOString() : null,
        available_since: opt.availableSince
          ? new Date(opt.availableSince * 1000).toISOString()
          : null,
        last_verified_at: new Date().toISOString(),
      });
    }
  }
  return { rows, skippedNoTmdb, skippedNoIplayer };
}

// ── Filter to titles we have ──
async function filterToKnownTitles(rows) {
  const tmdbIds = [...new Set(rows.map((r) => r.tmdb_id))];
  const known = new Set();
  // Page through .in() to avoid PostgREST URL length limits
  const chunkSize = 500;
  for (let i = 0; i < tmdbIds.length; i += chunkSize) {
    const chunk = tmdbIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('titles')
      .select('tmdb_id, media_type')
      .in('tmdb_id', chunk);
    if (error) {
      console.error(`  Title lookup failed: ${error.message}`);
      continue;
    }
    for (const t of data ?? []) {
      known.add(`${t.media_type}-${t.tmdb_id}`);
    }
  }
  return rows.filter((r) => known.has(`${r.media_type}-${r.tmdb_id}`));
}

// ── Write ──
async function writeIplayerRows(rows) {
  // Group by (tmdb_id, media_type)
  const grouped = new Map();
  for (const r of rows) {
    const key = `${r.media_type}-${r.tmdb_id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(r);
  }

  let processed = 0;
  let inserted = 0;
  let errors = 0;

  for (const [key, group] of grouped) {
    const sample = group[0];

    // Delete existing iplayer rows for this title (preserves other services).
    const { error: delErr } = await supabase
      .from('streaming_availability')
      .delete()
      .eq('tmdb_id', sample.tmdb_id)
      .eq('media_type', sample.media_type)
      .eq('service_id', 'bbc');
    if (delErr) {
      errors++;
      console.error(`  delete failed for ${key}: ${delErr.message}`);
      continue;
    }

    // De-dup within group (same service+type+quality).
    const seen = new Set();
    const unique = group.filter((r) => {
      const k = `${r.service_id}-${r.stream_type}-${r.quality}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const { error: insErr } = await supabase
      .from('streaming_availability')
      .insert(unique);
    if (insErr) {
      errors++;
      console.error(`  insert failed for ${key}: ${insErr.message}`);
      continue;
    }
    inserted += unique.length;
    processed++;
    if (processed % 100 === 0) {
      process.stdout.write(`  written ${processed}/${grouped.size} titles (${inserted} rows)\r`);
    }
  }
  console.log();
  return { processed, inserted, errors };
}

// ── Main ──
async function main() {
  console.log(`\n  Mode: ${COMMIT ? 'COMMIT' : 'DRY-RUN'}\n`);

  console.log('Fetching iplayer catalog...');
  const shows = await paginateIplayerCatalog();
  console.log(`Catalog total: ${shows.length} shows`);

  const { rows, skippedNoTmdb, skippedNoIplayer } = buildCandidateRows(shows);
  console.log(`Candidate rows: ${rows.length}`);
  console.log(`  Skipped (no tmdbId): ${skippedNoTmdb}`);
  console.log(`  Skipped (no iplayer streamingOption): ${skippedNoIplayer}`);

  console.log(`\nMatching against titles table...`);
  const insertable = await filterToKnownTitles(rows);
  console.log(`Insertable rows (titles we have): ${insertable.length}`);
  const distinctTitles = new Set(insertable.map((r) => `${r.media_type}-${r.tmdb_id}`)).size;
  console.log(`Distinct (tmdb_id, media_type): ${distinctTitles}`);

  if (!COMMIT) {
    console.log('\n[DRY-RUN] Would write the above. Re-run with --commit to apply.');
    process.exit(0);
  }

  console.log(`\nWriting iplayer rows (delete-then-insert per title)...`);
  const stats = await writeIplayerRows(insertable);
  console.log(
    `\nDone. Processed: ${stats.processed} titles | Inserted: ${stats.inserted} rows | Errors: ${stats.errors}`,
  );
}

await main();
