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

export interface GenreSpotlight {
  clusterName: string;
  items: ContentItem[];
}

export interface HomeFeed {
  hero: ContentItem | null;
  recentlyAdded: ContentItem[];
  rows: PerServiceChartRow[];
  spotlights: GenreSpotlight[];
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

  // Interleave 1:1, dedupe.
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
  return out.slice(0, 18);
}

async function fetchHomeFeed(services: ServiceId[]): Promise<HomeFeed> {
  const [charts, profile, filterSets, recentlyAdded] = await Promise.all([
    fetchPerServiceCharts(services),
    getV2TasteProfile(),
    buildFilterSets(services),
    fetchRecentlyAdded(services),
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

  return { hero, recentlyAdded, rows, spotlights };
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
