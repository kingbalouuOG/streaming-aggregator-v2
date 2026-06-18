import { useQuery } from '@tanstack/react-query';

import { useUserServices } from '@/hooks/useUserServices';
import {
  tmdbMovieToContentItem,
  tmdbTVToContentItem,
  type TMDbContentResult,
} from '@/lib/adapters/contentAdapter';
import { serviceIdsToProviderIds } from '@/lib/adapters/platformAdapter';
import { discoverMovies, discoverTV } from '@/lib/api/tmdb';
import { buildFilterSets } from '@/lib/recommendations-v2/hardFilters';
import { fetchGenreSpotlight } from '@/lib/recommendations-v2/rows/home/genreSpotlight';
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

/** Popular pool — TMDb discover by popularity, providers-filtered. Feeds the
 *  Trending ribbon + the editorial spotlight (the web reuses `home.popular`). */
async function fetchPopular(services: ServiceId[]): Promise<ContentItem[]> {
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
  const [charts, profile, filterSets, recentlyAdded, popular, freeTonight, upcoming] = await Promise.all([
    fetchPerServiceCharts(services),
    getV2TasteProfile(),
    buildFilterSets(services),
    fetchRecentlyAdded(services),
    fetchPopular(services),
    fetchFreeTonight(),
    fetchUpcoming(services),
  ]);

  // Hero = first row's lead title, pulled OUT of its row so the same
  // title doesn't lead the hero and row one.
  let hero: ContentItem | null = null;
  const rows = charts.map((row) => ({ ...row, items: [...row.items] }));
  const firstWithItems = rows.find((row) => row.items.length > 0);
  if (firstWithItems) {
    const lead = firstWithItems.items.shift() ?? null;
    if (lead) {
      const svc = firstWithItems.serviceId as ServiceId;
      const leadServices = lead.services.includes(svc) ? lead.services : [svc, ...lead.services];
      hero = { ...lead, services: leadServices };
    }
  }

  // Personalised genre spotlights, ordered by the user's selected
  // clusters. Cross-row dedup vs per-service charts + prior spotlights
  // (the "same title in two adjacent rows" failure).
  const picks = profile?.selectedClusters ?? [];
  const exclude = new Set<string>();
  for (const c of rows) for (const i of c.items) exclude.add(i.id);
  if (hero) exclude.add(hero.id);

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

  return { hero, recentlyAdded, popular, freeTonight, upcoming, rows, spotlights };
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
