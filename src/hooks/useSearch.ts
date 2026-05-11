import { useState, useCallback, useRef, useEffect } from 'react';
import { searchMovies, searchTV } from '@/lib/api/tmdb';
import { tmdbMovieToContentItem, tmdbTVToContentItem, parseContentItemId } from '@/lib/adapters/contentAdapter';
import { getCachedServices } from '@/lib/utils/serviceCache';
import { extractYearFromQuery, reRankSearchResults } from '@/lib/utils/searchUtils';
import type { ContentItem } from '@/components/ContentCard';
import type { ServiceId } from '@/components/platformLogos';
import { API_CONFIG } from '@/lib/constants/config';
import { emitSearch } from '@/lib/storage/interactions';
import { getAvailableTmdbIds } from '@/lib/recommendations-v2/hardFilters';

const BADGE_FLUSH_INTERVAL_MS = 200;

interface UseSearchOptions {
  /** When true, results not available on any of `userServices` are
   *  dropped before render. When false, they stay in the grid but get
   *  flagged in `unavailableIds` so the renderer can tag them
   *  notOnYours. Defaults to true to match `FilterState.onlyOnMyServices`
   *  default. */
  onlyOnMyServices?: boolean;
}

export function useSearch(
  userServices?: ServiceId[],
  initialQuery?: string,
  initialResults?: ContentItem[],
  options: UseSearchOptions = {},
) {
  const { onlyOnMyServices = true } = options;
  const [query, setQuery] = useState(initialQuery || '');
  const [results, setResults] = useState<ContentItem[]>(initialResults || []);
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const isRestoredRef = useRef(!!initialQuery);
  const currentQueryRef = useRef(query);
  const badgeFlushRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingBadgesRef = useRef<Map<string, ServiceId[]>>(new Map());

  // Stabilize dependency to avoid infinite re-renders
  const servicesKey = userServices?.join(',') || '';

  const tooShort = query.trim().length > 0 && query.trim().length < 2;

  // Flush accumulated badge updates in a single setResults call. The
  // pre-call RPC now owns availability filtering (see search() below);
  // this path only paints the per-item badge stack — it never removes
  // items.
  const flushBadges = useCallback((q: string) => {
    if (currentQueryRef.current !== q) return;
    const pending = pendingBadgesRef.current;
    if (pending.size === 0) return;

    const badgeUpdates = new Map(pending);
    pending.clear();

    setResults(prev =>
      prev.map(item => {
        const services = badgeUpdates.get(item.id);
        return services ? { ...item, services } : item;
      })
    );
  }, []);

  // Non-blocking per-item provider fetch — populates badges only.
  // Availability filtering moved to the pre-call get_available_tmdb_ids
  // RPC in `search()` so off-services items are dropped (or tagged)
  // upfront instead of trickling out item-by-item.
  const fetchBadgesInBackground = useCallback((items: ContentItem[], q: string, connectedServices: ServiceId[]) => {
    if (connectedServices.length === 0) return;
    pendingBadgesRef.current.clear();
    if (badgeFlushRef.current) clearTimeout(badgeFlushRef.current);

    let completed = 0;
    const total = items.length;

    items.forEach(async (item) => {
      try {
        const { tmdbId, mediaType } = parseContentItemId(item.id);
        const allItemServices = await getCachedServices(String(tmdbId), mediaType);
        const matching = allItemServices.filter((s) => connectedServices.includes(s));
        if (matching.length > 0) {
          pendingBadgesRef.current.set(item.id, matching);
        }
      } catch {
        // Silently skip failed lookups — item stays visible
      } finally {
        completed++;
        // Periodic flush; final one when all complete
        if (completed === total) {
          if (badgeFlushRef.current) clearTimeout(badgeFlushRef.current);
          flushBadges(q);
        } else if (!badgeFlushRef.current) {
          badgeFlushRef.current = setTimeout(() => {
            badgeFlushRef.current = undefined;
            flushBadges(q);
            if (completed < total) {
              badgeFlushRef.current = setTimeout(() => {
                badgeFlushRef.current = undefined;
                flushBadges(q);
              }, BADGE_FLUSH_INTERVAL_MS);
            }
          }, BADGE_FLUSH_INTERVAL_MS);
        }
      }
    });
  }, [flushBadges]);

  const search = useCallback(async (q: string, searchPage: number, append: boolean, category: string) => {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 2) {
      if (!append) {
        setResults([]);
        setUnavailableIds(new Set());
        setLoading(false);
      }
      return;
    }

    if (!append) setLoading(true);
    setError(null);
    currentQueryRef.current = q;

    try {
      const { cleanQuery, year } = extractYearFromQuery(trimmed);
      const shouldFetchMovies = category === 'All' || category === 'Movies';
      const shouldFetchTV = category === 'All' || category === 'TV';
      // Fire the availability RPC in parallel with TMDb so we don't pay
      // an extra round-trip — both finish before the first paint.
      // Skip the RPC when there are no user services to intersect
      // against (logged-out / pre-onboarding); without it we have no
      // way to compute "not on yours" anyway, so every item stays.
      const services = userServices || [];

      const [movieRes, tvRes, availableTmdbIds] = await Promise.all([
        shouldFetchMovies ? searchMovies(cleanQuery, searchPage, year) : null,
        shouldFetchTV ? searchTV(cleanQuery, searchPage, year) : null,
        services.length > 0 ? getAvailableTmdbIds(services) : Promise.resolve<Set<number>>(new Set()),
      ]);

      // Guard against stale results
      if (currentQueryRef.current !== q) return;

      const movieItems = (movieRes?.data?.results || []).map(tmdbMovieToContentItem);
      const tvItems = (tvRes?.data?.results || []).map(tmdbTVToContentItem);
      const merged = [...movieItems, ...tvItems];
      const ranked = reRankSearchResults(merged, cleanQuery);

      // Partition into available vs unavailable using the pre-fetched
      // ID set. When the user has no services connected, the set is
      // empty and we treat every item as available — there's no
      // ground truth to compare against.
      const hasAvailability = services.length > 0 && availableTmdbIds.size > 0;
      const isAvailable = (item: ContentItem) => {
        if (!hasAvailability) return true;
        const { tmdbId } = parseContentItemId(item.id);
        return availableTmdbIds.has(tmdbId);
      };

      let finalItems: ContentItem[];
      let nextUnavailable: Set<string>;
      if (onlyOnMyServices && hasAvailability) {
        // Filter unavailable items out before they hit the grid.
        finalItems = ranked.filter(isAvailable);
        nextUnavailable = new Set();
      } else {
        // Keep all items, tag the off-services ones so the renderer
        // can apply the "Not on yours" pill + 0.75 opacity treatment.
        finalItems = ranked;
        nextUnavailable = new Set(
          hasAvailability ? ranked.filter((i) => !isAvailable(i)).map((i) => i.id) : [],
        );
      }

      // Pagination: has more if either endpoint has more pages
      const movieTotalPages = movieRes?.data?.total_pages || 0;
      const tvTotalPages = tvRes?.data?.total_pages || 0;
      const maxTotalPages = Math.max(movieTotalPages, tvTotalPages);

      if (append) {
        setResults(prev => [...prev, ...finalItems]);
        setUnavailableIds(prev => {
          const merged = new Set(prev);
          nextUnavailable.forEach((id) => merged.add(id));
          return merged;
        });
      } else {
        setResults(finalItems);
        setUnavailableIds(nextUnavailable);
        emitSearch(cleanQuery, finalItems.length);
      }
      setPage(searchPage);
      setHasMore(searchPage < maxTotalPages);

      // Fire non-blocking per-item provider fetch for badge population.
      // Availability filtering already happened above; this hook now
      // only paints the per-card ServiceStack.
      fetchBadgesInBackground(finalItems, q, services);
    } catch (err: any) {
      if (currentQueryRef.current !== q) return;
      setError(err.message || 'Search failed');
      if (!append) {
        setResults([]);
        setUnavailableIds(new Set());
      }
    } finally {
      if (currentQueryRef.current === q) {
        setLoading(false);
      }
    }
  }, [servicesKey, fetchBadgesInBackground, onlyOnMyServices]);

  // Reset page when category changes
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) return;
    // Skip on initial restore
    if (isRestoredRef.current) return;
    setPage(1);
    setResults([]);
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      search(query, 1, false, activeCategory);
    }, API_CONFIG.DEBOUNCE_DELAY_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [activeCategory]);

  // Debounced query effect
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults(initialResults && isRestoredRef.current ? initialResults : []);
      setLoading(false);
      setHasMore(false);
      setPage(1);
      return;
    }

    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setHasMore(false);
      return;
    }

    // Skip the initial search when restoring from saved state
    if (isRestoredRef.current) {
      isRestoredRef.current = false;
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      search(query, 1, false, activeCategory);
    }, API_CONFIG.DEBOUNCE_DELAY_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      search(query, page + 1, true, activeCategory);
    }
  }, [hasMore, loading, query, page, activeCategory, search]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setUnavailableIds(new Set());
    setError(null);
    setPage(1);
    setHasMore(false);
    currentQueryRef.current = '';
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (badgeFlushRef.current) clearTimeout(badgeFlushRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    query, setQuery, results, loading, error, clearSearch,
    hasMore, loadMore, activeCategory, setActiveCategory, tooShort,
    /** Content IDs that aren't available on any of the user's services.
     *  Empty when `onlyOnMyServices` is true (items get filtered out
     *  instead). Renderer uses this to tag off-services cards with the
     *  "Not on yours" pill + 0.75 opacity. */
    unavailableIds,
  };
}
