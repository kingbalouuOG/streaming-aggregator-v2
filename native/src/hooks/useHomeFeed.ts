import { useQuery } from '@tanstack/react-query';

import { useUserServices } from '@/hooks/useUserServices';
import {
  tmdbMovieToContentItem,
  tmdbTVToContentItem,
  type TMDbContentResult,
} from '@/lib/adapters/contentAdapter';
import { serviceIdsToProviderIds } from '@/lib/adapters/platformAdapter';
import { discoverMovies, discoverTV, getTrendingMovies, getTrendingTV } from '@/lib/api/tmdb';
import { buildFilterSets, getAvailableTmdbIds } from '@/lib/recommendations-v2/hardFilters';
import { dailyPick, dailyShuffleTopN } from '@/lib/utils/dailyShuffle';
import { fetchGenreSpotlight } from '@/lib/recommendations-v2/rows/home/genreSpotlight';
import { fetchPaidTitles } from '@/lib/recommendations-v2/rows/home/paidRow';
import { fetchPerServiceCharts } from '@/lib/recommendations-v2/rows/home/perServiceChart';
import type { PerServiceChartRow } from '@/lib/recommendations-v2/rows/home/perServiceChart';
import { getV2TasteProfile } from '@/lib/taste-v2/tasteProfileV2';
import type { ContentItem, ServiceId } from '@/lib/types/content';

// Native Home feed hook. Calls the SAME lib row-builders the web Home
// uses. NATIVE-1: per-service charts. NATIVE-3 W7: scored against the
// user's onboarding-saved services. NATIVE-3.5: adds Recently Added +
// personalised genre spotlights (the curated "For You on Home" rows).

const SPOTLIGHT_COUNT = 3;
// UK free-to-air services — "Free Tonight" is no-subscription content, so it's
// scoped to these regardless of the user's selected stack.
const FREE_UK_SERVICES: ServiceId[] = ['bbc', 'itvx', 'channel4'];

export interface GenreSpotlight {
  clusterName: string;
  items: ContentItem[];
}

export interface UpcomingItem {
  item: ContentItem;
  /** ISO release date (YYYY-MM-DD). */
  date: string;
}

export interface HomeFeed {
  hero: ContentItem | null;
  recentlyAdded: ContentItem[];
  popular: ContentItem[];
  freeTonight: ContentItem[];
  /** "New to rent or buy" — newest rent/buy titles on the user's services. */
  paid: ContentItem[];
  upcoming: UpcomingItem[];
  rows: PerServiceChartRow[];
  spotlights: GenreSpotlight[];
}

// Interleave two provider-scoped result lists 1:1, dropping imageless +
// duplicate items. Shared by the discover-backed Home rows.
function interleaveDedupe(movies: ContentItem[], tv: ContentItem[], limit?: number): ContentItem[] {
  const out: ContentItem[] = [];
  const seen = new Set<string>();
  const maxLen = Math.max(movies.length, tv.length);
  for (let i = 0; i < maxLen; i++) {
    for (const item of [movies[i], tv[i]]) {
      if (item && item.image && !seen.has(item.id)) {
        seen.add(item.id);
        out.push(item);
      }
    }
  }
  return limit ? out.slice(0, limit) : out;
}

/** Recently Added — TMDb discover by release date, providers-filtered.
 *  Mirrors the web "Just In" row (useSectionData discover params). */
async function fetchRecentlyAdded(services: ServiceId[]): Promise<ContentItem[]> {
  const providerIds = serviceIdsToProviderIds(services);
  if (providerIds.length === 0) return [];
  const watchProviders = providerIds.join('|');
  const today = new Date().toISOString().split('T')[0];

  const [movieRes, tvRes] = await Promise.all([
    discoverMovies({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'primary_release_date.desc',
      'primary_release_date.lte': today,
      'vote_count.gte': 50,
    }),
    discoverTV({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'first_air_date.desc',
      'first_air_date.lte': today,
      'vote_count.gte': 30,
    }),
  ]);

  const movies = ((movieRes.data?.results ?? []) as TMDbContentResult[]).map(tmdbMovieToContentItem);
  const tv = ((tvRes.data?.results ?? []) as TMDbContentResult[]).map(tmdbTVToContentItem);
  return interleaveDedupe(movies, tv, 18);
}

// Below this many service-available trending titles we treat the
// intersection as too thin (sparse content cache) and backfill from the
// provider-scoped popularity query so the ribbon never collapses.
const MIN_TRENDING_ITEMS = 8;

/** Provider-scoped popularity pool — the pre-freshness behaviour, now the
 *  fallback/backfill source for the trending ribbon. */
async function fetchPopularByProvider(services: ServiceId[]): Promise<ContentItem[]> {
  const providerIds = serviceIdsToProviderIds(services);
  if (providerIds.length === 0) return [];
  const watchProviders = providerIds.join('|');

  const [movieRes, tvRes] = await Promise.all([
    discoverMovies({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'popularity.desc',
      'vote_count.gte': 100,
    }),
    discoverTV({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'popularity.desc',
      'vote_count.gte': 50,
    }),
  ]);

  const movies = ((movieRes.data?.results ?? []) as TMDbContentResult[]).map(tmdbMovieToContentItem);
  const tv = ((tvRes.data?.results ?? []) as TMDbContentResult[]).map(tmdbTVToContentItem);
  return interleaveDedupe(movies, tv);
}

/** Popular pool — real TMDb trending (rolling weekly window that TMDb
 *  refreshes daily), filtered to titles on the user's services via the
 *  availability set. Trending has no provider filter of its own, so we
 *  intersect here and backfill from the provider-scoped popularity query
 *  when the intersection is thin. Feeds the Trending ribbon + editorial
 *  spotlight (the web reuses `home.popular`). */
async function fetchPopular(
  services: ServiceId[],
  availableTmdbIds: Set<number>,
): Promise<ContentItem[]> {
  const providerIds = serviceIdsToProviderIds(services);
  if (providerIds.length === 0) return [];

  const [movieRes, tvRes] = await Promise.all([
    getTrendingMovies('week'),
    getTrendingTV('week'),
  ]);

  // Empty availability set = "skip availability filtering" (matches the
  // ranker's hard-filter convention) — keep everything in that case.
  const onServices = (r: TMDbContentResult) =>
    availableTmdbIds.size === 0 || availableTmdbIds.has(r.id);

  const movies = ((movieRes.data?.results ?? []) as TMDbContentResult[])
    .filter(onServices)
    .map(tmdbMovieToContentItem);
  const tv = ((tvRes.data?.results ?? []) as TMDbContentResult[])
    .filter(onServices)
    .map(tmdbTVToContentItem);
  const trending = interleaveDedupe(movies, tv);

  if (trending.length >= MIN_TRENDING_ITEMS) return trending;

  // Backfill: trending first (preserving momentum order), then the
  // provider-scoped popular tail for anything not already present.
  const fallback = await fetchPopularByProvider(services);
  const seen = new Set(trending.map((i) => i.id));
  return [...trending, ...fallback.filter((i) => !seen.has(i.id))];
}

/** Free Tonight — popular titles on the UK free-to-air services (iPlayer /
 *  ITVX / Channel 4). Scoped server-side to those providers so the section
 *  actually populates; the old client filter on item.services (empty from the
 *  TMDb adapters) always produced nothing. */
async function fetchFreeTonight(): Promise<ContentItem[]> {
  const providerIds = serviceIdsToProviderIds(FREE_UK_SERVICES);
  if (providerIds.length === 0) return [];
  const watchProviders = providerIds.join('|');

  const [movieRes, tvRes] = await Promise.all([
    discoverMovies({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'popularity.desc',
      'vote_count.gte': 50,
    }),
    discoverTV({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'popularity.desc',
      'vote_count.gte': 30,
    }),
  ]);

  const movies = ((movieRes.data?.results ?? []) as TMDbContentResult[]).map(tmdbMovieToContentItem);
  const tv = ((tvRes.data?.results ?? []) as TMDbContentResult[]).map(tmdbTVToContentItem);
  return interleaveDedupe(movies, tv, 12);
}

/** Upcoming releases — TMDb discover within the next 30 days, providers-
 *  filtered, ascending by date (web useUpcoming equivalent). */
async function fetchUpcoming(services: ServiceId[]): Promise<UpcomingItem[]> {
  const providerIds = serviceIdsToProviderIds(services);
  if (providerIds.length === 0) return [];
  const watchProviders = providerIds.join('|');
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [movieRes, tvRes] = await Promise.all([
    discoverMovies({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'primary_release_date.asc',
      'primary_release_date.gte': todayStr,
      'primary_release_date.lte': horizon,
    }),
    discoverTV({
      with_watch_providers: watchProviders,
      watch_region: 'GB',
      sort_by: 'first_air_date.asc',
      'first_air_date.gte': todayStr,
      'first_air_date.lte': horizon,
    }),
  ]);

  const out: UpcomingItem[] = [];
  const seen = new Set<string>();
  const add = (item: ContentItem, date: string | undefined) => {
    if (item.image && date && !seen.has(item.id)) {
      seen.add(item.id);
      out.push({ item, date });
    }
  };
  for (const r of (movieRes.data?.results ?? []) as (TMDbContentResult & { release_date?: string })[]) {
    add(tmdbMovieToContentItem(r), r.release_date);
  }
  for (const r of (tvRes.data?.results ?? []) as (TMDbContentResult & { first_air_date?: string })[]) {
    add(tmdbTVToContentItem(r), r.first_air_date);
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out.slice(0, 12);
}

async function fetchHomeFeed(services: ServiceId[]): Promise<HomeFeed> {
  // Resolved once up front so fetchPopular can filter trending to the
  // user's services; buildFilterSets below reuses the same localStorage
  // cache entry (no duplicate RPC), and it's skipped entirely on warm loads.
  const availableTmdbIds = await getAvailableTmdbIds(services);

  const [charts, profile, filterSets, recentlyAdded, popularRaw, freeTonight, paidRaw, upcoming] = await Promise.all([
    fetchPerServiceCharts(services),
    getV2TasteProfile(),
    buildFilterSets(services),
    fetchRecentlyAdded(services),
    fetchPopular(services, availableTmdbIds),
    fetchFreeTonight(),
    fetchPaidTitles(services),
    fetchUpcoming(services),
  ]);

  // Daily rotation (#2): reshuffle the top of the trending pool by UTC day
  // so the ribbon + editorial spotlight visibly move day-to-day even when
  // the underlying trending set is stable. Head-only shuffle keeps quality.
  const popular = dailyShuffleTopN(popularRaw, 20, 'home:popular');

  // Hero = "Today's Pick", pulled OUT of the first per-service row so the
  // same title doesn't lead the hero and row one. Rotates daily among the
  // row's top 5 contenders (#2) while leaving the ranked row intact.
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

  // "New to rent or buy" — dedup against the recency/trending/free rows
  // above it so a title new to a service doesn't show in both "Recently
  // added" and here. (Per-service rows sit below and are subscription/
  // free-only, so they can't collide with rent/buy content.)
  const paidExclude = new Set<string>([
    ...recentlyAdded.map((i) => i.id),
    ...popular.map((i) => i.id),
    ...freeTonight.map((i) => i.id),
    ...(hero ? [hero.id] : []),
  ]);
  const paid = paidRaw.filter((i) => !paidExclude.has(i.id));

  // Personalised genre spotlights, ordered by the user's selected
  // clusters. Cross-row dedup vs per-service charts + prior spotlights
  // (the "same title in two adjacent rows" failure).
  const picks = profile?.selectedClusters ?? [];
  const exclude = new Set<string>();
  for (const c of rows) for (const i of c.items) exclude.add(i.id);
  if (hero) exclude.add(hero.id);
  for (const i of paid) exclude.add(i.id);

  const spotlights: GenreSpotlight[] = [];
  for (let offset = 0; offset < SPOTLIGHT_COUNT; offset++) {
    try {
      const sp = await fetchGenreSpotlight(filterSets.availableTmdbIds, 15, offset, picks, exclude);
      if (sp.items.length > 0) {
        spotlights.push(sp);
        for (const i of sp.items) exclude.add(i.id);
      }
    } catch {
      // A spotlight failure must not blank Home.
    }
  }

  return { hero, recentlyAdded, popular, freeTonight, paid, upcoming, rows, spotlights };
}

export function useHomeFeed() {
  const { data: services } = useUserServices();
  return useQuery({
    queryKey: ['native', 'home', 'feed', services?.join(',') ?? ''],
    queryFn: () => fetchHomeFeed(services ?? []),
    enabled: !!services,
    staleTime: 30 * 60 * 1000,
  });
}
