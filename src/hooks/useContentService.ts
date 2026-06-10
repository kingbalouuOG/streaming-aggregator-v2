/** @deprecated Replaced by useHomeContent.ts — kept for reference */
import { useState, useEffect, useCallback, useRef } from 'react';
import { discoverMovies, discoverTV } from '@/lib/api/tmdb';
import { tmdbMovieToContentItem, tmdbTVToContentItem, type TMDbContentResult } from '@/lib/adapters/contentAdapter';
import { getHomeGenres } from '@/lib/storage/userPreferences';
import { GENRE_NAMES, GENRE_NAME_TO_ID } from '@/lib/constants/genres';
import { serviceIdsToProviderIds, providerIdsToServiceIds } from '@/lib/adapters/platformAdapter';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import { getCachedServices } from '@/lib/utils/serviceCache';
import type { ContentItem } from '@/components/ContentCard';
import type { FilterState } from '@/lib/search/filterState';
import type { ServiceId } from '@/components/platformLogos';

export interface GenreRow {
  genreId: number;
  name: string;
  items: ContentItem[];
}

interface ContentServiceState {
  popular: ContentItem[];
  highestRated: ContentItem[];
  recentlyAdded: ContentItem[];
  genreRows: GenreRow[];
  featured: ContentItem | null;
  loading: boolean;
  error: string | null;
}

/** Remove items whose IDs are in the exclusion set */
function deduplicate(items: ContentItem[], exclude: Set<string>): ContentItem[] {
  return items.filter((item) => !exclude.has(item.id));
}

export function useContentService(providerIds: number[], filters?: FilterState) {
  const [state, setState] = useState<ContentServiceState>({
    popular: [],
    highestRated: [],
    recentlyAdded: [],
    genreRows: [],
    featured: null,
    loading: true,
    error: null,
  });

  const providerStr = providerIds.join(',');

  const load = useCallback(async () => {
    if (!providerStr) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      // Provider filter: use filters.services if set, otherwise user's providers
      let providerPipe: string;
      if (filters?.services && filters.services.length > 0) {
        const filterProviderIds = serviceIdsToProviderIds(filters.services as ServiceId[]);
        providerPipe = filterProviderIds.join('|');
      } else {
        providerPipe = providerStr.replace(/,/g, '|');
      }

      const baseParams: Record<string, unknown> = {
        with_watch_providers: providerPipe,
        watch_region: 'GB',
      };

      // Genre filter
      if (filters?.genres && filters.genres.length > 0) {
        const genreIds = filters.genres
          .map((name) => GENRE_NAME_TO_ID[name])
          .filter((id): id is number => id !== undefined);
        if (genreIds.length > 0) baseParams.with_genres = genreIds.join(',');
      }

      // Rating filter
      if (filters?.minRating && filters.minRating > 0) {
        baseParams['vote_average.gte'] = filters.minRating;
        baseParams['vote_count.gte'] = 50;
      }

      // Cost filter — multi-select. 'free' folds flatrate + free + ads
      // (all no-marginal-cost). Rent / Buy are paid tiers. When ONLY
      // paid tiers are selected (no Free), drop the provider constraint
      // and post-filter to exclude flatrate-on-user-platforms hits.
      const costSet = new Set(filters?.costs || []);
      if (costSet.size > 0) {
        const tmdbTypes: string[] = [];
        if (costSet.has('free')) tmdbTypes.push('flatrate', 'free', 'ads');
        if (costSet.has('rent')) tmdbTypes.push('rent');
        if (costSet.has('buy')) tmdbTypes.push('buy');
        baseParams.with_watch_monetization_types = tmdbTypes.join('|');
        const paidOnly = !costSet.has('free') && (costSet.has('rent') || costSet.has('buy'));
        if (paidOnly) delete baseParams.with_watch_providers;
      }

      // Post-filter helper for paid-only mode
      const isPaidFilter = !costSet.has('free') && (costSet.has('rent') || costSet.has('buy'));
      const userServiceIds = isPaidFilter ? providerIdsToServiceIds(providerIds) : [];
      async function filterPaidOnly(items: ContentItem[]): Promise<ContentItem[]> {
        if (!isPaidFilter) return items;
        const checks = await Promise.all(
          items.map(async (item) => {
            const { tmdbId, mediaType } = parseContentItemId(item.id);
            const services = await getCachedServices(String(tmdbId), mediaType);
            return !services.some((s) => userServiceIds.includes(s));
          })
        );
        return items.filter((_, i) => checks[i]);
      }

      const today = new Date().toISOString().split('T')[0];

      // Content type filter
      const contentType = filters?.contentType || 'all';
      const fetchMovies = contentType === 'all' || contentType === 'movie' || contentType === 'doc';
      const fetchTV = contentType === 'all' || contentType === 'tv';

      // Fetch main sections in parallel
      const [popularMovies, popularTV, topMovies, topTV, recentMovies, recentTV] = await Promise.all([
        fetchMovies ? discoverMovies({ ...baseParams, sort_by: 'popularity.desc', page: 1 }) : Promise.resolve({ data: { results: [] } }),
        fetchTV ? discoverTV({ ...baseParams, sort_by: 'popularity.desc', page: 1 }) : Promise.resolve({ data: { results: [] } }),
        fetchMovies ? discoverMovies({ ...baseParams, sort_by: 'vote_average.desc', 'vote_count.gte': 100, page: 1 }) : Promise.resolve({ data: { results: [] } }),
        fetchTV ? discoverTV({ ...baseParams, sort_by: 'vote_average.desc', 'vote_count.gte': 100, page: 1 }) : Promise.resolve({ data: { results: [] } }),
        fetchMovies ? discoverMovies({ ...baseParams, sort_by: 'primary_release_date.desc', 'primary_release_date.lte': today, page: 1 }) : Promise.resolve({ data: { results: [] } }),
        fetchTV ? discoverTV({ ...baseParams, sort_by: 'first_air_date.desc', 'first_air_date.lte': today, page: 1 }) : Promise.resolve({ data: { results: [] } }),
      ]);

      // Build popular (first, no exclusion)
      const popular = await filterPaidOnly([
        ...(popularMovies.data?.results || []).slice(0, 8).map((m: TMDbContentResult) => tmdbMovieToContentItem(m)),
        ...(popularTV.data?.results || []).slice(0, 8).map((t: TMDbContentResult) => tmdbTVToContentItem(t)),
      ].sort(() => Math.random() - 0.5).slice(0, 10));

      const excludeSet = new Set<string>(popular.map((i) => i.id));

      // Highest rated (exclude popular)
      const highestRated = await filterPaidOnly(deduplicate([
        ...(topMovies.data?.results || []).slice(0, 8).map((m: TMDbContentResult) => tmdbMovieToContentItem(m)),
        ...(topTV.data?.results || []).slice(0, 8).map((t: TMDbContentResult) => tmdbTVToContentItem(t)),
      ].sort((a, b) => (b.rating || 0) - (a.rating || 0)), excludeSet).slice(0, 10));

      highestRated.forEach((i) => excludeSet.add(i.id));

      // Recently added (exclude popular + highest rated)
      const recentlyAdded = await filterPaidOnly(deduplicate([
        ...(recentMovies.data?.results || []).slice(0, 8).map((m: TMDbContentResult) => tmdbMovieToContentItem(m)),
        ...(recentTV.data?.results || []).slice(0, 8).map((t: TMDbContentResult) => tmdbTVToContentItem(t)),
      ], excludeSet).slice(0, 10));

      recentlyAdded.forEach((i) => excludeSet.add(i.id));

      // Featured: first popular item for hero banner
      const featured = popular.length > 0 ? popular[0] : null;

      // Set main sections immediately so they render while genre rows load
      setState({
        popular,
        highestRated,
        recentlyAdded,
        genreRows: [],
        featured,
        loading: false,
        error: null,
      });

      // Fetch genre rows — when genre filter is active, combine with row genre (AND logic)
      try {
        const userGenres = await getHomeGenres();
        const filterGenreIds = (filters?.genres || [])
          .map((name) => GENRE_NAME_TO_ID[name])
          .filter((id): id is number => id !== undefined);

        const genrePromises = userGenres.map((genreId) => {
          const genreParam = filterGenreIds.length > 0
            ? [genreId, ...filterGenreIds].join(',')
            : String(genreId);
          return Promise.all([
            fetchMovies ? discoverMovies({ ...baseParams, with_genres: genreParam, sort_by: 'popularity.desc', page: 1 }) : Promise.resolve({ data: { results: [] } }),
            fetchTV ? discoverTV({ ...baseParams, with_genres: genreParam, sort_by: 'popularity.desc', page: 1 }) : Promise.resolve({ data: { results: [] } }),
          ]);
        });

        const genreResults = await Promise.all(genrePromises);
        const genreRows: GenreRow[] = [];

        for (let i = 0; i < userGenres.length; i++) {
          const genreId = userGenres[i];
          const name = GENRE_NAMES[genreId];
          if (!name) continue;

          const [movies, tv] = genreResults[i];
          const genreItems = await filterPaidOnly(deduplicate([
            ...(movies.data?.results || []).slice(0, 10).map((m: TMDbContentResult) => tmdbMovieToContentItem(m)),
            ...(tv.data?.results || []).slice(0, 10).map((t: TMDbContentResult) => tmdbTVToContentItem(t)),
          ].sort(() => Math.random() - 0.5), excludeSet).slice(0, 15));

          if (genreItems.length > 0) {
            genreRows.push({ genreId, name, items: genreItems });
            genreItems.forEach((item) => excludeSet.add(item.id));
          }
        }

        setState((s) => ({ ...s, genreRows }));
      } catch (genreErr) {
        console.error('[ContentService] Genre rows failed (non-blocking):', genreErr);
      }
    } catch (err) {
      console.error('[ContentService] Load failed:', err);
      const message = err instanceof Error && err.message ? err.message : 'Failed to load content';
      setState((s) => ({ ...s, loading: false, error: message }));
    }
  }, [providerStr, filters?.contentType, [...(filters?.costs || [])].sort().join(','), filters?.services?.join(','), filters?.genres?.join(','), filters?.minRating]);

  // Always keep ref pointing to latest load to avoid stale closures
  const loadRef = useRef(load);
  loadRef.current = load;

  // Stable key to trigger reloads without infinite loops
  const filterKey = `${providerStr}|${filters?.contentType || 'all'}|${[...(filters?.costs || [])].sort().join(',')}|${filters?.services?.join(',') || ''}|${filters?.genres?.join(',') || ''}|${filters?.minRating || 0}`;

  useEffect(() => {
    loadRef.current();
  }, [filterKey]);

  return { ...state, reload: () => loadRef.current() };
}
