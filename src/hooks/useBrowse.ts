import { useState, useEffect, useCallback, useRef } from 'react';
import { discoverMovies, discoverTV } from '@/lib/api/tmdb';
import { tmdbMovieToContentItem, tmdbTVToContentItem } from '@/lib/adapters/contentAdapter';
import type { ContentItem } from '@/components/ContentCard';
import type { FilterState } from '@/components/FilterSheet';
import { serviceIdsToProviderIds, providerIdsToServiceIds } from '@/lib/adapters/platformAdapter';
import { GENRE_NAME_TO_ID } from '@/lib/constants/genres';
import { getCachedServices } from '@/lib/utils/serviceCache';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import type { ServiceId } from '@/components/platformLogos';

export function useBrowse(filters: FilterState, providerIds: number[]) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);
  const loadRef = useRef<(pageNum?: number, append?: boolean) => Promise<void>>(null!);

  // Stabilize providerIds to avoid infinite re-renders from array ref changes
  const providerStr = providerIds.join(',');

  const buildDiscoverParams = useCallback(() => {
    const params: Record<string, unknown> = {
      watch_region: 'GB',
      sort_by: 'popularity.desc',
    };

    // Provider filter: use filters.services if set, otherwise user's providers
    if (filters.services.length > 0) {
      const filterProviderIds = serviceIdsToProviderIds(filters.services as ServiceId[]);
      params.with_watch_providers = filterProviderIds.join('|');
    } else if (providerStr) {
      params.with_watch_providers = providerStr.replace(/,/g, '|');
    }

    // Genre filter
    if (filters.genres.length > 0) {
      const genreIds = filters.genres
        .map((name) => GENRE_NAME_TO_ID[name])
        .filter((id): id is number => id !== undefined);
      if (genreIds.length > 0) params.with_genres = genreIds.join(',');
    }

    // Rating filter
    if (filters.minRating > 0) {
      params['vote_average.gte'] = filters.minRating;
      params['vote_count.gte'] = 50;
    }

    // Cost filter (monetization type)
    if (filters.cost === 'Free') {
      params.with_watch_monetization_types = 'flatrate|free|ads';
    } else if (filters.cost === 'Paid') {
      params.with_watch_monetization_types = 'rent|buy';
      // Remove provider constraint — we want ANY rent/buy title in GB,
      // then post-filter to exclude titles also available as flatrate on user's platforms
      delete params.with_watch_providers;
    }

    return params;
  }, [filters, providerStr]);

  const load = useCallback(async (pageNum = 1, append = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const params = { ...buildDiscoverParams(), page: pageNum };
      const shouldFetchMovies = filters.contentType === 'All' || filters.contentType === 'Movies' || filters.contentType === 'Docs';
      const shouldFetchTV = filters.contentType === 'All' || filters.contentType === 'TV';

      const promises: Promise<any>[] = [];
      if (shouldFetchMovies) promises.push(discoverMovies(params));
      if (shouldFetchTV) promises.push(discoverTV(params));

      const responses = await Promise.all(promises);

      let newItems: ContentItem[] = [];
      let idx = 0;
      if (shouldFetchMovies) {
        newItems.push(...(responses[idx].data?.results || []).map((m: any) => tmdbMovieToContentItem(m)));
        idx++;
      }
      if (shouldFetchTV) {
        newItems.push(...(responses[idx].data?.results || []).map((t: any) => tmdbTVToContentItem(t)));
      }

      // Sort by popularity (interleave movies and TV)
      newItems.sort(() => Math.random() - 0.5);

      // Post-filter for "Paid": exclude titles that have free flatrate on user's platforms
      if (filters.cost === 'Paid') {
        const userServiceIds = providerIdsToServiceIds(providerIds);
        const checks = await Promise.all(
          newItems.map(async (item) => {
            const { tmdbId, mediaType } = parseContentItemId(item.id);
            const services = await getCachedServices(String(tmdbId), mediaType);
            return !services.some((s) => userServiceIds.includes(s));
          })
        );
        newItems = newItems.filter((_, i) => checks[i]);
      }

      const totalPages = Math.max(...responses.map((r: any) => r.data?.total_pages || 1));
      setHasMore(pageNum < totalPages);

      if (append) {
        setItems((prev) => [...prev, ...newItems]);
      } else {
        setItems(newItems);
      }
      setPage(pageNum);
    } catch (err: any) {
      setError(err.message || 'Failed to load content');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [buildDiscoverParams, providerStr, filters.contentType]);

  // Always keep ref pointing to latest load to avoid stale closures
  loadRef.current = load;

  // Stable key from actual filter values — avoids infinite loop from unstable function refs
  const filterKey = `${filters.contentType}|${filters.cost}|${filters.services.join(',')}|${filters.genres.join(',')}|${filters.minRating}|${providerStr}`;

  // Reload when filters change
  useEffect(() => {
    loadRef.current(1, false);
  }, [filterKey]);

  const loadMore = useCallback(() => {
    if (hasMore && !loadingRef.current) {
      loadRef.current(page + 1, true);
    }
  }, [hasMore, page]);

  return { items, loading, error, hasMore, loadMore };
}
