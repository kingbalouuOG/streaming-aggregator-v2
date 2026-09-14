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
 * SCOPE BOUNDARY. It writes `streaming_availability` (and `sa_show_map`)
 * ONLY. `titles` is owned by sync-content.ts and backfill_missing_titles.ts.
 * By default a catalogue entry whose title Videx does not hold is counted
 * and skipped. With `--include-unknown-titles` its availability rows are
 * written anyway — still no `titles` write — so the nightly
 * `backfill-missing-titles` chain (05:00 UTC) creates the title from the
 * row, exactly as it does for rows the daily sync writes. That is how the
 * IN-SC-001 title gap (~3,979 entries across the wave-1 five) can drain
 * through machinery that already exists. It is opt-in because it changes
 * catalogue composition (roughly 1,700 of those are anime), which service
 * fingerprints, mood clusters and taste vectors all derive from — run
 * `npm run eval:fingerprints` before and after, and let Joe decide.
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
 *   --map-only              write ONLY `sa_show_map` (vendor show id ->
 *                           TMDb id, migration 083); touch no availability
 *                           row and never prune. This is how the map that
 *                           `sync-incremental` resolves `/changes` against
 *                           is seeded (IN-SY-001), and how a catalogue's
 *                           walk cost is measured without writing
 *                           availability. --dry-run still writes nothing.
 *   --map-out <file>        also save the staged map entries as JSON. Works
 *                           under --dry-run, so a measuring walk need not be
 *                           paid for twice: seed the map later from the file.
 *   --map-in <file>         upsert `sa_show_map` from a --map-out file and
 *                           exit. Zero vendor requests.
 *   --include-unknown-titles
 *                           also write availability rows for catalogue
 *                           entries `titles` does not hold (see SCOPE
 *                           BOUNDARY). Default off.
 *   --catalog <id>          walk this vendor catalogue instead of the bare
 *                           service id, attributing rows to --service. The
 *                           vendor's catalogue ids are `service` or
 *                           `service.type` with type in subscription |
 *                           rent | buy | free | addon (addon NAMES such as
 *                           now.entertainment are rejected: "unknown
 *                           streaming option type"). Needed because the
 *                           bare listing is NOT the whole service for
 *                           addon-tiered services: NOW is
 *                           `subscription: false, addons: movies |
 *                           entertainment | hayu`, and `catalogs=now`
 *                           listed ~318 entries where `now.addon` holds the
 *                           tiers. Measured 2026-09-11 the hard way: a
 *                           --prune off the bare listing deleted NOW's
 *                           March tiers. A --catalog walk is partial by
 *                           definition, so --prune is refused. Prime and
 *                           Apple have the same shape (channels), so never
 *                           --prune them off the bare listing either.
 *   --rows-in <file>        replay the availability writes from the
 *                           `<map-out>.rows.json` a previous run saved,
 *                           with zero vendor requests. Exists because the
 *                           2026-09-11 Prime walk (2,625 requests, 153,840
 *                           rows) died at row 5,400 on a transient
 *                           "fetch failed" from Supabase and nothing had
 *                           been persisted. --map-out now also writes the
 *                           staged rows next to the map, and every write
 *                           retries transient failures.
 *   --cursor <cursor>       resume a walk from the cursor a previous run
 *                           printed when it hit its request ceiling, so a
 *                           large catalogue (Prime: >24,000 entries, not
 *                           finished in 1,200 requests) is never paid for
 *                           twice. A resumed walk never saw the head of the
 *                           catalogue, so it is partial by definition and
 *                           --prune is refused.
 *
 * THE MAP IS A SIDE EFFECT OF EVERY LIVE WALK. `/shows/search/filters`
 * returns both the vendor's own `id` and the real `tmdbId` for every
 * catalogue entry, so any non-dry run upserts every entry it sees into
 * `sa_show_map` — including entries whose title Videx does not hold,
 * because a later `/changes` row for that title must still resolve to a
 * real TMDb id (which is what feeds the title backfill queue).
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
import { readFileSync, writeFileSync } from 'fs';
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
const mapOnly = args.includes('--map-only');
const mapOut = flag('map-out');
const mapIn = flag('map-in');
const includeUnknownTitles = args.includes('--include-unknown-titles');
const startCursor = flag('cursor');
const catalogOverride = flag('catalog');
const rowsIn = flag('rows-in');
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

// ── Vendor id → TMDb id map (migration 083, IN-SY-001) ───
//
// `sync-incremental` consumes `/changes`, which identifies a title only by
// the vendor's own `showId`. This walk is the cheapest source of the
// (showId → tmdbId) pairs it needs: both ids arrive on every entry.

interface ShowMapRow {
  sa_show_id: string;
  tmdb_id: number;
  media_type: string;
  title: string | null;
  source: 'catalogue-walk';
  last_seen_at: string;
}

/**
 * A Supabase write that fails with "fetch failed" / ECONNRESET / a timeout
 * is a network blip, not a data problem; the walk that staged the rows
 * cost thousands of vendor requests and must not be thrown away for it.
 * Three attempts, 3s / 8s / 20s.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const waits = [3000, 8000, 20000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const transient = /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|timeout|socket hang up|502|503|504/i.test(msg);
      if (!transient || attempt >= waits.length) throw err;
      console.log(`  ${label}: transient failure (${msg.slice(0, 80)}) — retry ${attempt + 1}/${waits.length} in ${waits[attempt] / 1000}s`);
      await delay(waits[attempt]);
    }
  }
}

async function upsertShowMap(rows: ShowMapRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    await withRetry(`sa_show_map upsert at ${i}`, async () => {
      const { error } = await supabase
        .from('sa_show_map')
        .upsert(rows.slice(i, i + 500), { onConflict: 'sa_show_id' });
      if (error) throw new Error(`sa_show_map upsert at ${i}: ${error.message}`);
    });
  }
}

function saveStagedRows(mapPath: string, rows: AvailabilityRow[]): string {
  const p = resolve(mapPath.replace(/\.json$/i, '') + '.rows.json');
  writeFileSync(p, JSON.stringify({ catalogue: saServiceId, videxServiceId, savedAt: new Date().toISOString(), rows }));
  return p;
}

function loadStagedRows(path: string): AvailabilityRow[] {
  const parsed = JSON.parse(readFileSync(resolve(path), 'utf-8'));
  if (parsed?.videxServiceId !== videxServiceId) {
    throw new Error(`${path}: saved for service '${parsed?.videxServiceId}', not '${videxServiceId}'`);
  }
  const rows: unknown[] = parsed?.rows;
  if (!Array.isArray(rows)) throw new Error(`${path}: expected a .rows.json file`);
  return rows as AvailabilityRow[];
}

function saveShowMap(path: string, rows: ShowMapRow[]): void {
  writeFileSync(resolve(path), JSON.stringify({ catalogue: saServiceId, savedAt: new Date().toISOString(), rows }));
}

function loadShowMap(path: string): ShowMapRow[] {
  const parsed = JSON.parse(readFileSync(resolve(path), 'utf-8'));
  const rows: unknown[] = Array.isArray(parsed) ? parsed : parsed?.rows;
  if (!Array.isArray(rows)) throw new Error(`${path}: expected a --map-out file`);
  return rows.map((r: any) => {
    if (typeof r?.sa_show_id !== 'string' || !Number.isInteger(r?.tmdb_id) || (r?.media_type !== 'movie' && r?.media_type !== 'tv')) {
      throw new Error(`${path}: malformed map row ${JSON.stringify(r).slice(0, 120)}`);
    }
    return {
      sa_show_id: r.sa_show_id,
      tmdb_id: r.tmdb_id,
      media_type: r.media_type,
      title: typeof r.title === 'string' ? r.title : null,
      source: 'catalogue-walk',
      last_seen_at: new Date().toISOString(),
    };
  });
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
    await withRetry(`delete (${mediaType})`, async () => {
      const { error } = await supabase
        .from('streaming_availability')
        .delete()
        .eq('service_id', videxServiceId)
        .eq('media_type', mediaType)
        .in('tmdb_id', [...new Set(ids)]);
      if (error) throw new Error(`delete (${mediaType}): ${error.message}`);
    });
  }

  // Delete-then-insert is idempotent per batch, so a retried insert after
  // a lost response cannot duplicate: the unique index would reject it and
  // the next attempt re-runs the delete first anyway.
  await withRetry('insert', async () => {
    const { error } = await supabase.from('streaming_availability').insert(batch);
    if (error) throw new Error(`insert: ${error.message}`);
  });
}

async function writeRows(rows: AvailabilityRow[]): Promise<void> {
  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    await replaceBatch(batch);
    written += batch.length;
    if (written % 2000 === 0 || written === rows.length) console.log(`  written ${written}/${rows.length}`);
  }
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
    // `tmdb-backfill` rows come from TMDb watch/providers, not from this
    // vendor (scripts/fingerprints/backfill-tmdb-providers.ts). The walk
    // only knows the vendor's view, so it may only prune what the vendor
    // wrote: NOW carries ~290 such rows that a vendor-scoped prune would
    // otherwise delete.
    const { data, error } = await supabase
      .from('streaming_availability')
      .select('id, tmdb_id, media_type')
      .eq('service_id', videxServiceId)
      .neq('sa_service_id', 'tmdb-backfill')
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
  if (mapIn) {
    const rows = loadShowMap(mapIn);
    console.log(`Seeding sa_show_map from ${mapIn}: ${rows.length} entries (no vendor requests)`);
    if (dryRun) {
      console.log('  DRY RUN — nothing written.');
      return;
    }
    await upsertShowMap(rows);
    console.log(`  sa_show_map upserted: ${rows.length}`);
    return;
  }

  if (rowsIn) {
    const rows = loadStagedRows(rowsIn);
    console.log(`Replaying ${rows.length} staged availability rows for '${videxServiceId}' from ${rowsIn} (no vendor requests)`);
    if (dryRun) {
      console.log('  DRY RUN — nothing written.');
      return;
    }
    await writeRows(rows);
    console.log('\n  Done. Verify available_services drift:');
    console.log('    select public.count_available_services_drift();');
    return;
  }

  console.log(`Backfill catalogue '${saServiceId}' -> service_id '${videxServiceId}'`);
  console.log(
    `  mode: ${dryRun ? 'DRY RUN (no writes)' : mapOnly ? 'MAP ONLY (sa_show_map only, no availability writes)' : 'LIVE'}`,
  );
  console.log(`  request ceiling: ${maxRequests}`);
  if (includeUnknownTitles) {
    console.log('  unknown titles: INCLUDED — rows written for entries `titles` lacks; the 05:00 backfill creates the titles');
  }
  console.log();

  let cursor: string | undefined = startCursor;
  if (startCursor) console.log(`  resuming from cursor ${startCursor} — partial walk, --prune refused`);
  if (catalogOverride) console.log(`  walking catalogue '${catalogOverride}' for service '${saServiceId}' — partial by definition, --prune refused`);
  let page = 0;
  // A prune may only run off a walk that reached the end of the catalogue.
  // Pruning from a truncated walk would delete every title the walk never
  // reached, which is the whole tail of the catalogue.
  let walkComplete = false;
  let catalogueEntries = 0;
  let missingTitles = 0;
  const rows: AvailabilityRow[] = [];
  const seen = new Set<string>();
  const mapRows: ShowMapRow[] = [];
  const mapSeen = new Set<string>();

  while (true) {
    const params = new URLSearchParams({
      country: 'gb',
      catalogs: catalogOverride ?? saServiceId!,
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
      // The vendor documents `id` as an opaque string ("6", "22007718");
      // keep it as text, never as a number.
      const showId = show.id != null ? String(show.id) : null;
      if (showId && !mapSeen.has(showId)) {
        mapSeen.add(showId);
        mapRows.push({
          sa_show_id: showId,
          tmdb_id: ref.tmdbId,
          media_type: ref.mediaType,
          title: typeof show.title === 'string' ? show.title : null,
          source: 'catalogue-walk',
          last_seen_at: new Date().toISOString(),
        });
      }
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
        if (!includeUnknownTitles) continue;
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
      // Reached the end — but only a walk that started at the head has
      // seen the whole catalogue. Pruning off a resumed walk would delete
      // everything before the start cursor.
      walkComplete = !startCursor && !catalogOverride;
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
  console.log(
    `  titles Videx does not hold:  ${missingTitles}` +
      (includeUnknownTitles ? ' (rows written; titles arrive via the 05:00 backfill)' : ' (skipped)'),
  );
  console.log(`  availability rows to write:  ${rows.length}`);
  console.log(`  sa_show_map entries:         ${mapRows.length}`);
  console.log(`  walk complete:               ${walkComplete ? 'yes' : 'NO (stopped at request ceiling)'}`);

  const byType = new Map<string, number>();
  for (const r of rows) byType.set(r.stream_type, (byType.get(r.stream_type) ?? 0) + 1);
  for (const [t, n] of [...byType].sort()) console.log(`    ${t}: ${n}`);

  const stale = prune && !mapOnly ? await findStaleRows(rows, walkComplete) : [];
  if (prune && mapOnly) {
    console.log('  --prune ignored under --map-only.');
  } else if (prune) {
    if (walkComplete) {
      console.log(`  stale rows to prune:         ${stale.length}`);
    } else {
      console.log('  --prune REFUSED: the walk stopped before the end of the catalogue.');
    }
  }

  if (mapOut) {
    saveShowMap(mapOut, mapRows);
    console.log(`  saved ${mapRows.length} map entries to ${mapOut}`);
    if (!mapOnly && rows.length > 0) {
      const p = saveStagedRows(mapOut, rows);
      console.log(`  saved ${rows.length} staged availability rows to ${p} (replay with --rows-in)`);
    }
  }

  if (dryRun) {
    console.log('\n  DRY RUN — nothing written.');
    return;
  }

  // The map goes first and unconditionally: it is what makes the next
  // /changes run resolve, and it is cheap.
  await upsertShowMap(mapRows);
  console.log(`  sa_show_map upserted: ${mapRows.length}`);
  if (mapOnly) {
    console.log('\n  MAP ONLY — availability untouched.');
    return;
  }

  await writeRows(rows);

  for (let i = 0; i < stale.length; i += 200) {
    const slice = stale.slice(i, i + 200);
    await withRetry(`prune at row ${i}`, async () => {
      const { error } = await supabase
        .from('streaming_availability')
        .delete()
        .in('id', slice);
      if (error) throw new Error(`prune at row ${i}: ${error.message}`);
    });
  }
  if (stale.length > 0) console.log(`  pruned ${stale.length} stale rows`);

  console.log('\n  Done. Verify available_services drift:');
  console.log('    select public.count_available_services_drift();');
}

main().catch((err) => {
  console.error(`FAILED after ${requestsUsed} vendor requests: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
