import { useState, useEffect, useCallback, useRef } from 'react';
import { discoverMovies, discoverTV } from '@/lib/api/tmdb';
import { tmdbMovieToContentItem, tmdbTVToContentItem } from '@/lib/adapters/contentAdapter';
import type { ContentItem } from '@/components/ContentCard';
import type { FilterState } from '@/lib/search/filterState';
import { serviceIdsToProviderIds, providerIdsToServiceIds } from '@/lib/adapters/platformAdapter';
import { GENRE_NAME_TO_ID } from '@/lib/constants/genres';
import { getServiceProviders } from '@/lib/utils/serviceCache';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import type { ServiceId } from '@/components/platformLogos';

export type BrowseSortBy = 'popularity.desc' | 'vote_average.desc' | 'title.asc' | 'title.desc';

export function useBrowse(
  filters: FilterState,
  providerIds: number[],
  skip = false,
  sortBy: BrowseSortBy = 'popularity.desc',
) {
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
      sort_by: sortBy,
      // TMDb's title.asc / title.desc sort needs a min vote_count to
      // avoid drowning the top in obscure long-tail titles. Same for
      // vote_average.desc (otherwise titles with 1 perfect rating top
      // the list). 50 is the floor we use elsewhere in the codebase.
      ...((sortBy === 'vote_average.desc' || sortBy === 'title.asc' || sortBy === 'title.desc')
        ? { 'vote_count.gte': 50 }
        : {}),
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

    // Cost filter — multi-select. Each Cost maps to one or more TMDb
    // monetization types; OR them with `|`. "Free" folds flatrate +
    // free + ads (anything no-marginal-cost at point of play). When
    // only paid tiers are selected (no Free), drop the provider
    // constraint so the catalogue isn't narrowed before the paid-only
    // post-filter runs.
    const costSet = new Set(filters.costs);
    if (costSet.size > 0) {
      const tmdbTypes: string[] = [];
      if (costSet.has('free')) tmdbTypes.push('flatrate', 'free', 'ads');
      if (costSet.has('rent')) tmdbTypes.push('rent');
      if (costSet.has('buy')) tmdbTypes.push('buy');
      params.with_watch_monetization_types = tmdbTypes.join('|');
      const paidOnly = !costSet.has('free') && (costSet.has('rent') || costSet.has('buy'));
      if (paidOnly) delete params.with_watch_providers;
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
      const shouldFetchMovies = filters.contentType === 'all' || filters.contentType === 'movie' || filters.contentType === 'doc';
      const shouldFetchTV = filters.contentType === 'all' || filters.contentType === 'tv';

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

      // Movies first, then TV. Stable order — earlier code random-
      // shuffled here, which produced a fresh order on every refetch
      // (including remounts after detail-page navigation). The
      // snapshot doesn't preserve useBrowse state, so the shuffle
      // surfaced as "items reorder when you tap into a card and
      // come back."

      // Post-filter for paid-only (Rent/Buy selected without Free):
      // exclude titles already available in the user's FREE tier
      // (flatrate / true free / ads) so the user doesn't see paid
      // versions of things they could already stream for free. Note
      // we scope this to the free tier specifically — a title that
      // also happens to be rentable on a user's service should NOT
      // be excluded, because that's exactly the rent path the user
      // is asking for.
      const costSetForFilter = new Set(filters.costs);
      const paidOnly = !costSetForFilter.has('free')
        && (costSetForFilter.has('rent') || costSetForFilter.has('buy'));
      if (paidOnly) {
        const userServiceIds = providerIdsToServiceIds(providerIds);
        const checks = await Promise.all(
          newItems.map(async (item) => {
            const { tmdbId, mediaType } = parseContentItemId(item.id);
            const providers = await getServiceProviders(String(tmdbId), mediaType);
            const onUserFree = providers.free.some((s) => userServiceIds.includes(s));
            return !onUserFree;
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
  const filterKey = `${filters.contentType}|${[...filters.costs].sort().join(',')}|${filters.services.join(',')}|${filters.genres.join(',')}|${filters.minRating}|${providerStr}|${sortBy}`;

  // Reload when filters change. `skip` lets BrowsePage call this hook
  // unconditionally (React rules) but suppress the /discover round-
  // trip when the user is searching by text — useSearch owns that
  // path and useBrowse's results would be ignored anyway.
  useEffect(() => {
    if (skip) return;
    loadRef.current(1, false);
  }, [filterKey, skip]);

  const loadMore = useCallback(() => {
    if (hasMore && !loadingRef.current) {
      loadRef.current(page + 1, true);
    }
  }, [hasMore, page]);

  return { items, loading, error, hasMore, loadMore };
}
