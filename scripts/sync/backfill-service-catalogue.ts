/**
 * Backfill one vendor catalogue into `streaming_availability`.
 *
 * WHY THIS EXISTS. Two syncs write availability and neither can populate a
 * catalogue that is new to Videx:
 *
 *   - `scripts/sync-content.ts` stage 'sa' walks `titles` and asks the
 *     vendor for each one, but skips any title that already has ANY
 *     availability row. A title already carrying a Netflix row is never
 *     revisited, so a service that launches later is invisible to it.
 *   - `supabase/functions/sync-incremental` walks the vendor's `changes`
 *     feed per catalogue in SA_SERVICES_GB. It only ever returns deltas,
 *     so adding a catalogue there makes it fresh from that day forward and
 *     does nothing about the back catalogue.
 *
 * Measured on 2026-09-10: HBO Max launched in the UK on 26 March 2026 and
 * had zero rows, while Discovery+, Pluto TV, MUBI and Crunchyroll rows were
 * all written 16-20 March and never re-verified since.
 *
 * This script closes that gap by walking the vendor's catalogue listing
 * directly (20 shows per request, cursor-paginated) instead of asking per
 * title, which is roughly two orders of magnitude cheaper against the SA
 * API quota (R-032).
 *
 * SCOPE BOUNDARY. It writes `streaming_availability` ONLY. `titles` is
 * owned by sync-content.ts and backfill_missing_titles.ts; a catalogue
 * entry whose title Videx does not hold is counted and skipped, not
 * inserted. Run the title backfill first if that count is high.
 *
 * Usage:
 *   npx tsx scripts/sync/backfill-service-catalogue.ts --service hbo --dry-run
 *   npx tsx scripts/sync/backfill-service-catalogue.ts --service hbo
 *   npx tsx scripts/sync/backfill-service-catalogue.ts --service hbo --max-requests 40
 *
 * Flags:
 *   --service <vendor id>   required; vendor catalogue id (hbo, discovery,
 *                           crunchyroll, mubi, plutotv, netflix, ...)
 *   --dry-run               fetch and report, write nothing (default off)
 *   --max-requests <n>      hard ceiling on vendor requests (default 300)
 *   --prune                 after a COMPLETE walk, delete this service's
 *                           rows for titles the vendor no longer lists.
 *                           Refused on a partial walk (see below).
 *
 * ⚠ BULK WRITES AND MIGRATION 075. `streaming_availability` carries a
 * per-row trigger that maintains `titles.available_services`. This script
 * writes in batches of a few hundred rows, which the trigger handles
 * comfortably; it does NOT disable the trigger. After a very large run,
 * verify with `select public.count_available_services_drift()`.
 *
 * Prerequisites (.env): SA_API_KEY, VITE_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Env ──────────────────────────────────────────────────

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
const SA_API_KEY = ENV.SA_API_KEY;
const SUPABASE_URL = ENV.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;

if (!SA_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing env. Need SA_API_KEY, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ── CLI ──────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const saServiceId = flag('service');
const dryRun = args.includes('--dry-run');
const prune = args.includes('--prune');
const maxRequests = flag('max-requests') ? parseInt(flag('max-requests')!, 10) : 300;

if (!saServiceId) {
  console.error('Missing --service <vendor catalogue id>');
  process.exit(1);
}

// Same identity mapping the sync scripts use. Kept local rather than
// imported because this file runs under tsx with no Vite path aliases.
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
  hbo: 'hbo',
  discovery: 'discovery',
  crunchyroll: 'crunchyroll',
  mubi: 'mubi',
  plutotv: 'plutotv',
};

const videxServiceId = SA_TO_VIDEX[saServiceId];
if (!videxServiceId) {
  console.error(`Unknown vendor catalogue '${saServiceId}'. Known: ${Object.keys(SA_TO_VIDEX).join(', ')}`);
  process.exit(1);
}

// ── Vendor client ────────────────────────────────────────

const SA_BASE_URL = 'https://api.movieofthenight.com/v4';
const SA_DELAY = 120;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

let requestsUsed = 0;

async function saFetch(path: string): Promise<any> {
  if (requestsUsed >= maxRequests) {
    throw new Error(`request ceiling reached (${maxRequests}) — rerun to continue`);
  }
  await delay(SA_DELAY);
  requestsUsed++;
  const res = await fetch(`${SA_BASE_URL}${path}`, { headers: { 'X-Api-Key': SA_API_KEY } });
  if (res.status === 429) throw new Error('SA API 429 — quota or throttle; stopping rather than retrying');
  if (!res.ok) throw new Error(`SA API ${res.status}: ${path}`);
  return res.json();
}

// ── Row shape ────────────────────────────────────────────
// Mirrors the row built by sync-content.ts stage 'sa' so both writers
// produce identical records.

interface AvailabilityRow {
  tmdb_id: number;
  media_type: string;
  service_id: string;
  sa_service_id: string;
  stream_type: string;
  deep_link_url: string | null;
  video_link_url: string | null;
  quality: string;
  price_amount: number | null;
  price_currency: string | null;
  price_formatted: string | null;
  addon_id: string | null;
  addon_name: string | null;
  expires_soon: boolean;
  expires_on: string | null;
  available_since: string | null;
  last_verified_at: string;
}

/** The vendor returns tmdbId as "movie/1054867" or "tv/224372". */
function parseTmdbRef(ref: unknown): { tmdbId: number; mediaType: string } | null {
  if (typeof ref !== 'string') return null;
  const [mediaType, id] = ref.split('/');
  const tmdbId = Number(id);
  if (!Number.isInteger(tmdbId) || (mediaType !== 'movie' && mediaType !== 'tv')) return null;
  return { tmdbId, mediaType };
}

function buildRow(opt: any, tmdbId: number, mediaType: string): AvailabilityRow {
  return {
    tmdb_id: tmdbId,
    media_type: mediaType,
    service_id: videxServiceId,
    sa_service_id: saServiceId!,
    stream_type: opt.type,
    deep_link_url: opt.link ?? null,
    video_link_url: opt.videoLink ?? null,
    quality: opt.quality || 'default',
    price_amount: opt.price ? parseFloat(opt.price.amount) : null,
    price_currency: opt.price?.currency ?? null,
    price_formatted: opt.price?.formatted ?? null,
    addon_id: opt.addon?.id ?? null,
    addon_name: opt.addon?.name ?? null,
    expires_soon: opt.expiresSoon || false,
    expires_on: opt.expiresOn ? new Date(opt.expiresOn * 1000).toISOString() : null,
    available_since: opt.availableSince ? new Date(opt.availableSince * 1000).toISOString() : null,
    last_verified_at: new Date().toISOString(),
  };
}

// ── Title membership ─────────────────────────────────────

/** Which of these (tmdb_id, media_type) pairs does `titles` already hold? */
async function knownTitles(
  pairs: { tmdbId: number; mediaType: string }[],
): Promise<Set<string>> {
  const known = new Set<string>();
  const byType = new Map<string, number[]>();
  for (const p of pairs) {
    const arr = byType.get(p.mediaType) ?? [];
    arr.push(p.tmdbId);
    byType.set(p.mediaType, arr);
  }

  for (const [mediaType, ids] of byType) {
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += 300) {
      const { data, error } = await supabase
        .from('titles')
        .select('tmdb_id')
        .eq('media_type', mediaType)
        .in('tmdb_id', unique.slice(i, i + 300));
      if (error) throw new Error(`titles lookup: ${error.message}`);
      for (const row of data ?? []) known.add(`${row.tmdb_id}:${mediaType}`);
    }
  }
  return known;
}

/**
 * Delete-then-insert, scoped to THIS service and only the titles in the
 * batch. Two constraints force this shape:
 *
 *   - The table's unique index is on COALESCE(quality,'default'), an
 *     expression, and PostgREST's on_conflict only accepts plain columns.
 *     sync-content.ts hit the same wall and solved it the same way.
 *   - The delete must NOT be scoped to (tmdb_id, media_type) alone the way
 *     sync-content.ts scopes it, because that wipes every other service's
 *     rows for the title. sync-content.ts gets away with it by rewriting
 *     the whole title from one response; this script only ever holds one
 *     service's view, so it scopes by service_id too — the same fix the
 *     incremental sync applied to the old upsertAvailability.
 *
 * Scoping this way also makes a partial run safe: a run that stops on the
 * request ceiling has added and refreshed, never removed.
 */
async function replaceBatch(batch: AvailabilityRow[]): Promise<void> {
  const byType = new Map<string, number[]>();
  for (const r of batch) {
    const arr = byType.get(r.media_type) ?? [];
    arr.push(r.tmdb_id);
    byType.set(r.media_type, arr);
  }

  for (const [mediaType, ids] of byType) {
    const { error } = await supabase
      .from('streaming_availability')
      .delete()
      .eq('service_id', videxServiceId)
      .eq('media_type', mediaType)
      .in('tmdb_id', [...new Set(ids)]);
    if (error) throw new Error(`delete (${mediaType}): ${error.message}`);
  }

  const { error } = await supabase.from('streaming_availability').insert(batch);
  if (error) throw new Error(`insert: ${error.message}`);
}

/**
 * Rows this service still holds for titles the vendor's current catalogue
 * no longer lists. These are the residue of a catalogue that stopped being
 * synced: measured 2026-09-10, Pluto TV held 196 rows written in March
 * against a live catalogue of 513 entries, only 142 of which Videx even
 * has titles for — so a chunk of those 196 were titles that had left.
 *
 * The daily `changes` walk emits a 'removed' event for departures, so once
 * a catalogue is in SA_SERVICES_GB this stops accumulating. It cannot
 * retroactively remove what departed while nobody was watching, which is
 * what this is for.
 *
 * Returns row ids, and ONLY when the walk saw the whole catalogue.
 */
async function findStaleRows(
  fresh: AvailabilityRow[],
  walkComplete: boolean,
): Promise<string[]> {
  if (!walkComplete) return [];

  const live = new Set(fresh.map((r) => `${r.tmdb_id}:${r.media_type}`));
  const stale: string[] = [];
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('streaming_availability')
      .select('id, tmdb_id, media_type')
      .eq('service_id', videxServiceId)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`stale scan: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      if (!live.has(`${row.tmdb_id}:${row.media_type}`)) stale.push(row.id as string);
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return stale;
}

// ── Main ─────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Backfill catalogue '${saServiceId}' -> service_id '${videxServiceId}'`);
  console.log(`  mode: ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log(`  request ceiling: ${maxRequests}`);
  console.log();

  let cursor: string | undefined;
  let page = 0;
  // A prune may only run off a walk that reached the end of the catalogue.
  // Pruning from a truncated walk would delete every title the walk never
  // reached, which is the whole tail of the catalogue.
  let walkComplete = false;
  let catalogueEntries = 0;
  let missingTitles = 0;
  const rows: AvailabilityRow[] = [];
  const seen = new Set<string>();

  while (true) {
    const params = new URLSearchParams({
      country: 'gb',
      catalogs: saServiceId!,
      series_granularity: 'show',
      order_by: 'popularity_1year',
    });
    if (cursor) params.set('cursor', cursor);

    const body = await saFetch(`/shows/search/filters?${params.toString()}`);
    const shows: any[] = body.shows ?? [];
    page++;

    const pairs: { tmdbId: number; mediaType: string }[] = [];
    const pending: { opt: any; tmdbId: number; mediaType: string }[] = [];

    for (const show of shows) {
      const ref = parseTmdbRef(show.tmdbId);
      if (!ref) continue;
      catalogueEntries++;
      pairs.push(ref);
      const opts: any[] = (show.streamingOptions?.gb ?? []).filter(
        (o: any) => o?.service?.id === saServiceId,
      );
      for (const opt of opts) pending.push({ opt, tmdbId: ref.tmdbId, mediaType: ref.mediaType });
    }

    const known = pairs.length > 0 ? await knownTitles(pairs) : new Set<string>();
    const missingThisPage = new Set<string>();

    for (const { opt, tmdbId, mediaType } of pending) {
      const titleKey = `${tmdbId}:${mediaType}`;
      if (!known.has(titleKey)) {
        missingThisPage.add(titleKey);
        continue;
      }
      // Dedupe on the table's unique key: (tmdb_id, media_type,
      // service_id, stream_type, quality).
      const rowKey = `${titleKey}:${opt.type}:${opt.quality || 'default'}`;
      if (seen.has(rowKey)) continue;
      seen.add(rowKey);
      rows.push(buildRow(opt, tmdbId, mediaType));
    }
    missingTitles += missingThisPage.size;

    console.log(
      `  page ${page}: ${shows.length} shows, ${rows.length} rows staged, ` +
        `${missingTitles} catalogue titles not in \`titles\``,
    );

    if (!body.hasMore || !body.nextCursor) {
      walkComplete = true;
      break;
    }
    cursor = body.nextCursor;
    if (requestsUsed >= maxRequests) {
      console.log(`  stopping: request ceiling ${maxRequests} reached (cursor ${cursor})`);
      break;
    }
  }

  console.log();
  console.log(`  vendor requests used:        ${requestsUsed}`);
  console.log(`  catalogue entries seen:      ${catalogueEntries}`);
  console.log(`  titles Videx does not hold:  ${missingTitles}`);
  console.log(`  availability rows to write:  ${rows.length}`);

  const byType = new Map<string, number>();
  for (const r of rows) byType.set(r.stream_type, (byType.get(r.stream_type) ?? 0) + 1);
  for (const [t, n] of [...byType].sort()) console.log(`    ${t}: ${n}`);

  const stale = prune ? await findStaleRows(rows, walkComplete) : [];
  if (prune) {
    if (walkComplete) {
      console.log(`  stale rows to prune:         ${stale.length}`);
    } else {
      console.log('  --prune REFUSED: the walk stopped before the end of the catalogue.');
    }
  }

  if (dryRun) {
    console.log('\n  DRY RUN — nothing written.');
    return;
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    await replaceBatch(batch);
    written += batch.length;
    console.log(`  written ${written}/${rows.length}`);
  }

  for (let i = 0; i < stale.length; i += 200) {
    const { error } = await supabase
      .from('streaming_availability')
      .delete()
      .in('id', stale.slice(i, i + 200));
    if (error) throw new Error(`prune at row ${i}: ${error.message}`);
  }
  if (stale.length > 0) console.log(`  pruned ${stale.length} stale rows`);

  console.log('\n  Done. Verify available_services drift:');
  console.log('    select public.count_available_services_drift();');
}

main().catch((err) => {
  console.error(`FAILED after ${requestsUsed} vendor requests: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
