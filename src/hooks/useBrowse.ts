import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { discoverMovies, discoverTV } from '@/lib/api/tmdb';
import { tmdbMovieToContentItem, tmdbTVToContentItem, type TMDbContentResult } from '@/lib/adapters/contentAdapter';
import type { ContentItem } from '@/components/ContentCard';
import type { FilterState } from '@/lib/search/filterState';
import { serviceIdsToProviderIds, providerIdsToServiceIds } from '@/lib/adapters/platformAdapter';
import { GENRE_NAME_TO_ID } from '@/lib/constants/genres';
import { getServiceProviders } from '@/lib/utils/serviceCache';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import type { ServiceId } from '@/components/platformLogos';

export type BrowseSortBy = 'popularity.desc' | 'vote_average.desc' | 'title.asc' | 'title.desc';

/** Minimal shape of a cachedRequest-wrapped TMDb /discover response. */
interface DiscoverResponse {
  success: boolean;
  data?: {
    results?: TMDbContentResult[];
    total_pages?: number;
    total_results?: number;
  };
  error?: string;
}

/** Page payload cached under ['tmdb','browse',…]. Serializable —
 *  persisted across sessions by the queryClient localStorage persister. */
interface BrowsePageData {
  items: ContentItem[];
  totalPages: number;
  totalResults: number;
}

/** One dispatched page load. `append` mirrors the old load(page, append)
 *  call shape; `nonce` makes re-dispatches of the same page distinct so
 *  the apply effect runs once per dispatch (not once per cache entry). */
interface BrowseSubmission {
  page: number;
  append: boolean;
  nonce: number;
}

function buildDiscoverParams(
  filters: FilterState,
  providerStr: string,
  sortBy: BrowseSortBy,
): Record<string, unknown> {
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

  // Provider filter. Only constrain when "Only on my services" is
  // ON — otherwise the user has explicitly asked to see options
  // beyond their stack, so we let TMDb return the broader GB
  // catalogue and rely on useItemAvailability to tag off-service
  // items downstream.
  if (filters.onlyOnMyServices) {
    if (filters.services.length > 0) {
      const filterProviderIds = serviceIdsToProviderIds(filters.services as ServiceId[]);
      params.with_watch_providers = filterProviderIds.join('|');
    } else if (providerStr) {
      params.with_watch_providers = providerStr.replace(/,/g, '|');
    }
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
}

/** Fetch + transform one /discover page. Pure with respect to its
 *  arguments, so the result is safely cacheable under the query key. */
async function fetchBrowsePage(
  filters: FilterState,
  providerIds: number[],
  providerStr: string,
  sortBy: BrowseSortBy,
  pageNum: number,
): Promise<BrowsePageData> {
  const params = { ...buildDiscoverParams(filters, providerStr, sortBy), page: pageNum };
  const shouldFetchMovies = filters.contentType === 'all' || filters.contentType === 'movie' || filters.contentType === 'doc';
  const shouldFetchTV = filters.contentType === 'all' || filters.contentType === 'tv';

  const promises: Promise<DiscoverResponse>[] = [];
  if (shouldFetchMovies) promises.push(discoverMovies(params));
  if (shouldFetchTV) promises.push(discoverTV(params));

  const responses = await Promise.all(promises);

  // cachedRequest never rejects — failures surface as success:false
  // with fallback data. Throw only when EVERY requested endpoint
  // failed (total outage); a partial failure degrades to the same
  // partial results the pre-Query hook produced.
  if (responses.length > 0 && responses.every((r) => !r.success)) {
    throw new Error(responses[0].error || 'Failed to load content');
  }

  let newItems: ContentItem[] = [];
  let idx = 0;
  if (shouldFetchMovies) {
    newItems.push(...(responses[idx].data?.results || []).map((m) => tmdbMovieToContentItem(m)));
    idx++;
  }
  if (shouldFetchTV) {
    newItems.push(...(responses[idx].data?.results || []).map((t) => tmdbTVToContentItem(t)));
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

  const totalPages = Math.max(...responses.map((r) => r.data?.total_pages || 1));
  // Sum total_results across movie + tv responses so the mode
  // indicator can show the catalogue ceiling, not just the
  // currently-loaded slice.
  const totalResults = responses.reduce(
    (sum, r) => sum + (r.data?.total_results || 0),
    0,
  );

  return { items: newItems, totalPages, totalResults };
}

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
  /** TMDb-reported total result count across all pages for the current
   *  query. Cap of the catalogue we could surface; the actually-shown
   *  count drops below this after the user-side post-filter +
   *  availability check. */
  const [totalResults, setTotalResults] = useState(0);
  const loadingRef = useRef(false);
  const nonceRef = useRef(0);
  const [submission, setSubmission] = useState<BrowseSubmission | null>(null);

  // Stabilize providerIds to avoid infinite re-renders from array ref changes
  const providerStr = providerIds.join(',');

  // Stable key from actual filter values — avoids infinite loop from unstable function refs
  const filterKey = `${filters.contentType}|${[...filters.costs].sort().join(',')}|${filters.services.join(',')}|${filters.genres.join(',')}|${filters.minRating}|${providerStr}|${sortBy}|${filters.onlyOnMyServices ? '1' : '0'}`;

  // Latest inputs for the queryFn — the key already pins identity via
  // filterKey + page, so reading through refs avoids key churn from
  // unstable array/object identities.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const providerIdsRef = useRef(providerIds);
  providerIdsRef.current = providerIds;

  const dispatch = useCallback((pageNum: number, append: boolean) => {
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    nonceRef.current += 1;
    setSubmission({ page: pageNum, append, nonce: nonceRef.current });
  }, []);

  // The page query. Persisted under the ['tmdb', …] namespace (24h
  // stale/gc per queryClient defaults). retry:false matches the old
  // single-attempt load semantics.
  const browseQuery = useQuery<BrowsePageData, Error>({
    queryKey: ['tmdb', 'browse', filterKey, submission?.page ?? 1],
    queryFn: () => fetchBrowsePage(
      filtersRef.current,
      providerIdsRef.current,
      providerStr,
      sortBy,
      submission?.page ?? 1,
    ),
    enabled: !skip && submission !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });

  // Apply query results to the public state exactly the way the old
  // imperative load() did. Stamped per (dispatch nonce, fetch time) so
  // a re-render doesn't re-append.
  const appliedRef = useRef('');
  useEffect(() => {
    if (!submission) return;
    if (browseQuery.isPlaceholderData) return;
    const data = browseQuery.data;
    if (!data) return;
    const stamp = `ok:${submission.nonce}:${browseQuery.dataUpdatedAt}`;
    if (appliedRef.current === stamp) return;
    appliedRef.current = stamp;

    // Only update totals on page 1 — TMDb's total is stable across
    // pages for a given query.
    if (submission.page === 1) setTotalResults(data.totalResults);
    setHasMore(submission.page < data.totalPages);
    if (submission.append) {
      setItems((prev) => [...prev, ...data.items]);
    } else {
      setItems(data.items);
    }
    setPage(submission.page);
    setLoading(false);
    loadingRef.current = false;
  }, [submission, browseQuery.data, browseQuery.isPlaceholderData, browseQuery.dataUpdatedAt]);

  useEffect(() => {
    if (!submission) return;
    if (!browseQuery.isError) return;
    const stamp = `err:${submission.nonce}:${browseQuery.errorUpdatedAt}`;
    if (appliedRef.current === stamp) return;
    appliedRef.current = stamp;
    const err = browseQuery.error;
    setError(err instanceof Error && err.message ? err.message : 'Failed to load content');
    setLoading(false);
    loadingRef.current = false;
  }, [submission, browseQuery.isError, browseQuery.error, browseQuery.errorUpdatedAt]);

  // Reload when filters change. `skip` lets BrowsePage call this hook
  // unconditionally (React rules) but suppress the /discover round-
  // trip when the user is searching by text — useSearch owns that
  // path and useBrowse's results would be ignored anyway.
  useEffect(() => {
    if (skip) return;
    dispatch(1, false);
  }, [filterKey, skip, dispatch]);

  const loadMore = useCallback(() => {
    if (hasMore && !loadingRef.current) {
      dispatch(page + 1, true);
    }
  }, [hasMore, page, dispatch]);

  return { items, loading, error, hasMore, loadMore, totalResults };
}
