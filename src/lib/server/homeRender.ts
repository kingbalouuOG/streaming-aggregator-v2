/**
 * Server-side Home render — B5.
 *
 * Gives Home the treatment For You already had: one Worker endpoint doing
 * the orchestration, returning a finished payload. Home was making ~15-20
 * round trips from the device per uncached load — roughly 10 TMDb (via the
 * Worker's proxy, so device→Worker→TMDb) and ~9 Supabase.
 *
 * ⚠ THIS IS A SECOND IMPLEMENTATION, NOT A MOVE. `native/src/hooks/
 * useHomeFeed.ts` keeps its client-side render as the fallback path, so
 * the two must produce the same shape. The row builders are shared
 * (`recommendations-v2/rows/home/*`, which now take an explicit client),
 * but the composition below — interleaving, dedup, hero extraction, daily
 * rotation — is duplicated. Change one, change the other. The alternative
 * was deleting the client path outright, which would leave Home with no
 * fallback if the Worker is down; For You accepts that, Home should not,
 * since it is the "New" tab a user lands on when For You fails.
 *
 * Composition order is deliberately identical to the client:
 *   hero → recentlyAdded → freeTonight → popular → paid → upcoming
 *   → per-service rows → genre spotlights
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  tmdbMovieToContentItem,
  tmdbTVToContentItem,
  type TMDbContentResult,
} from '../adapters/contentAdapter';
import type { ContentItem, ServiceId } from '../types/content';
import {
  fetchPerServiceChartsScoped,
  type PerServiceChartRow,
} from '../recommendations-v2/rows/home/perServiceChart';
import { fetchPaidTitlesScoped } from '../recommendations-v2/rows/home/paidRow';
import { fetchGenreSpotlight } from '../recommendations-v2/rows/home/genreSpotlight';
import { dailyPick, dailyShuffleTopN } from '../utils/dailyShuffle';
import type { UserScope } from './userScope';
import type { TmdbServerClient } from './tmdbServer';

// ── Tunables, mirrored from the client render ───────────────────────

const SPOTLIGHT_COUNT = 3;
const SPOTLIGHT_SIZE = 15;
const SPOTLIGHT_FETCH_SIZE = 20;
/** Below this many service-available trending titles the intersection is
 *  treated as too thin and backfilled, so the ribbon never collapses. */
const MIN_TRENDING_ITEMS = 8;

/** UK services with a free tier — the "Free tonight" row. */
const FREE_UK_SERVICES = ['bbc', 'itvx', 'channel4', 'plutotv'];

export interface HomeRenderInput {
  services: string[];
  /** TMDb provider ids for the user's services, resolved by the caller —
   *  the mapping table lives in the client adapter tree. */
  providerIds: number[];
  /** Provider ids for FREE_UK_SERVICES, likewise resolved by the caller. */
  freeProviderIds: number[];
  selectedClusters: string[];
}

export interface HomeRenderDeps {
  client: SupabaseClient;
  scope: UserScope;
  tmdb: TmdbServerClient;
}

/** Mirrors `HomeFeed` in native/src/hooks/useHomeFeed.ts — the client
 *  consumes this payload directly, so the two shapes must stay identical. */
export interface RenderedHomePayload {
  hero: ContentItem | null;
  recentlyAdded: ContentItem[];
  popular: ContentItem[];
  freeTonight: ContentItem[];
  paid: ContentItem[];
  upcoming: { item: ContentItem; date: string }[];
  rows: PerServiceChartRow[];
  spotlights: { clusterName: string; items: ContentItem[] }[];
}

// ── Helpers ─────────────────────────────────────────────────────────

type TmdbResult = TMDbContentResult & {
  release_date?: string;
  first_air_date?: string;
};

/** Alternate two lists, dropping ids already taken. Mirrors the client's
 *  interleaveDedupe so both paths produce the same ribbon. */
function interleaveDedupe(a: ContentItem[], b: ContentItem[], limit?: number): ContentItem[] {
  const out: ContentItem[] = [];
  const seen = new Set<string>();
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    for (const item of [a[i], b[i]]) {
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
      if (limit != null && out.length >= limit) return out;
    }
  }
  return out;
}

const today = () => new Date().toISOString().split('T')[0];

// ── Row builders (TMDb-backed) ──────────────────────────────────────

async function fetchRecentlyAdded(
  tmdb: TmdbServerClient,
  providerIds: number[],
): Promise<ContentItem[]> {
  if (providerIds.length === 0) return [];
  const watchProviders = providerIds.join('|');

  const [movieRes, tvRes] = await Promise.all([
    tmdb.discoverMovies<TmdbResult>({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'primary_release_date.desc',
      'primary_release_date.lte': today(),
      'vote_count.gte': 50,
    }),
    tmdb.discoverTV<TmdbResult>({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'first_air_date.desc',
      'first_air_date.lte': today(),
      'vote_count.gte': 30,
    }),
  ]);

  return interleaveDedupe(
    (movieRes.data?.results ?? []).map(tmdbMovieToContentItem),
    (tvRes.data?.results ?? []).map(tmdbTVToContentItem),
    18,
  );
}

async function fetchFreeTonight(
  tmdb: TmdbServerClient,
  freeProviderIds: number[],
): Promise<ContentItem[]> {
  if (freeProviderIds.length === 0) return [];
  const watchProviders = freeProviderIds.join('|');

  const [movieRes, tvRes] = await Promise.all([
    tmdb.discoverMovies<TmdbResult>({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'popularity.desc',
      'vote_count.gte': 50,
    }),
    tmdb.discoverTV<TmdbResult>({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'popularity.desc',
      'vote_count.gte': 30,
    }),
  ]);

  return interleaveDedupe(
    (movieRes.data?.results ?? []).map(tmdbMovieToContentItem),
    (tvRes.data?.results ?? []).map(tmdbTVToContentItem),
    12,
  );
}

async function fetchUpcoming(
  tmdb: TmdbServerClient,
  providerIds: number[],
): Promise<{ item: ContentItem; date: string }[]> {
  if (providerIds.length === 0) return [];
  const watchProviders = providerIds.join('|');
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [movieRes, tvRes] = await Promise.all([
    tmdb.discoverMovies<TmdbResult>({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'primary_release_date.asc',
      'primary_release_date.gte': todayStr,
      'primary_release_date.lte': horizon,
    }),
    tmdb.discoverTV<TmdbResult>({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'first_air_date.asc',
      'first_air_date.gte': todayStr,
      'first_air_date.lte': horizon,
    }),
  ]);

  const out: { item: ContentItem; date: string }[] = [];
  const seen = new Set<string>();
  const add = (item: ContentItem, date: string | undefined) => {
    if (item.image && date && !seen.has(item.id)) {
      seen.add(item.id);
      out.push({ item, date });
    }
  };
  for (const r of movieRes.data?.results ?? []) {
    add(tmdbMovieToContentItem(r), r.release_date);
  }
  for (const r of tvRes.data?.results ?? []) {
    add(tmdbTVToContentItem(r), r.first_air_date);
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out.slice(0, 12);
}

/**
 * Trending, filtered to what the user can actually watch. Availability is
 * a question about the ~40 ids TMDb returned (B3), not a 321KB id list.
 */
async function fetchPopular(
  tmdb: TmdbServerClient,
  client: SupabaseClient,
  services: string[],
  providerIds: number[],
): Promise<ContentItem[]> {
  if (providerIds.length === 0) return [];

  const [movieRes, tvRes] = await Promise.all([
    tmdb.getTrendingMovies<TmdbResult>('week'),
    tmdb.getTrendingTV<TmdbResult>('week'),
  ]);

  const movies = movieRes.data?.results ?? [];
  const tv = tvRes.data?.results ?? [];
  const available = await filterToAvailableServer(
    client,
    [...movies, ...tv].map((r) => r.id),
    services,
  );

  const trending = interleaveDedupe(
    movies.filter((r) => available.has(r.id)).map(tmdbMovieToContentItem),
    tv.filter((r) => available.has(r.id)).map(tmdbTVToContentItem),
  );
  if (trending.length >= MIN_TRENDING_ITEMS) return trending;

  // Thin intersection (sparse content cache) — backfill from the
  // provider-scoped popularity pool so the ribbon never collapses.
  const watchProviders = providerIds.join('|');
  const [fbMovie, fbTv] = await Promise.all([
    tmdb.discoverMovies<TmdbResult>({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'popularity.desc',
      'vote_count.gte': 100,
    }),
    tmdb.discoverTV<TmdbResult>({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'popularity.desc',
      'vote_count.gte': 50,
    }),
  ]);
  const fallback = interleaveDedupe(
    (fbMovie.data?.results ?? []).map(tmdbMovieToContentItem),
    (fbTv.data?.results ?? []).map(tmdbTVToContentItem),
  );
  return interleaveDedupe(trending, fallback, 20);
}

/** B3 availability check, explicit-client variant. */
async function filterToAvailableServer(
  client: SupabaseClient,
  tmdbIds: number[],
  services: string[],
): Promise<Set<number>> {
  if (services.length === 0) return new Set(tmdbIds);
  if (tmdbIds.length === 0) return new Set();
  try {
    const { data, error } = await client
      .from('titles')
      .select('tmdb_id')
      .in('tmdb_id', tmdbIds)
      .overlaps('available_services', services);
    if (error || !data) return new Set(tmdbIds); // fail open, as the client does
    return new Set(data.map((r) => r.tmdb_id as number));
  } catch {
    return new Set(tmdbIds);
  }
}

// ── Orchestration ───────────────────────────────────────────────────

export async function renderHome(
  deps: HomeRenderDeps,
  input: HomeRenderInput,
): Promise<RenderedHomePayload> {
  const { client, scope, tmdb } = deps;
  const { services, providerIds, freeProviderIds, selectedClusters } = input;

  // One parallel window, exactly as the client render does post-B4 — no
  // row may serialise behind another.
  const [charts, recentlyAdded, popularRaw, freeTonight, paidRaw, upcoming] = await Promise.all([
    fetchPerServiceChartsScoped(client, scope, services),
    fetchRecentlyAdded(tmdb, providerIds),
    fetchPopular(tmdb, client, services, providerIds),
    fetchFreeTonight(tmdb, freeProviderIds),
    fetchPaidTitlesScoped(client, services),
    fetchUpcoming(tmdb, providerIds),
  ]);

  const popular = dailyShuffleTopN(popularRaw, 20, 'home:popular');

  // Hero = "Today's Pick", lifted OUT of the first per-service row so the
  // same title cannot lead both the hero and row one.
  let hero: ContentItem | null = null;
  const rows = charts.map((row) => ({ ...row, items: [...row.items] }));
  const firstWithItems = rows.find((row) => row.items.length > 0);
  if (firstWithItems) {
    const lead =
      dailyPick(firstWithItems.items, 5, `home:hero:${firstWithItems.serviceId}`) ??
      firstWithItems.items[0] ??
      null;
    if (lead) {
      const leadIdx = firstWithItems.items.findIndex((i) => i.id === lead.id);
      if (leadIdx >= 0) firstWithItems.items.splice(leadIdx, 1);
      const svc = firstWithItems.serviceId as ServiceId;
      const leadServices = lead.services.includes(svc) ? lead.services : [svc, ...lead.services];
      hero = { ...lead, services: leadServices };
    }
  }

  // "New to rent or buy" dedups against the rows above it, so a title new
  // to a service cannot appear in both.
  const paidExclude = new Set<string>([
    ...recentlyAdded.map((i) => i.id),
    ...popular.map((i) => i.id),
    ...freeTonight.map((i) => i.id),
    ...(hero ? [hero.id] : []),
  ]);
  const paid = paidRaw.filter((i) => !paidExclude.has(i.id));

  // Spotlights: concurrent fetch, collisions resolved in order afterwards
  // (B4) so dedup guarantees hold without three serial round trips.
  const exclude = new Set<string>();
  for (const c of rows) for (const i of c.items) exclude.add(i.id);
  if (hero) exclude.add(hero.id);
  for (const i of paid) exclude.add(i.id);

  const rawSpotlights = await Promise.all(
    Array.from({ length: SPOTLIGHT_COUNT }, (_, offset) =>
      fetchGenreSpotlight(
        services,
        SPOTLIGHT_FETCH_SIZE,
        offset,
        selectedClusters,
        exclude,
        client,
      ).catch(() => null),
    ),
  );

  const spotlights: { clusterName: string; items: ContentItem[] }[] = [];
  for (const sp of rawSpotlights) {
    if (!sp) continue;
    const items = sp.items.filter((i) => !exclude.has(i.id)).slice(0, SPOTLIGHT_SIZE);
    if (items.length === 0) continue;
    spotlights.push({ clusterName: sp.clusterName, items });
    for (const i of items) exclude.add(i.id);
  }

  return { hero, recentlyAdded, popular, freeTonight, paid, upcoming, rows, spotlights };
}

export { FREE_UK_SERVICES };
