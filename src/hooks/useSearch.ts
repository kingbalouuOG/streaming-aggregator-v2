import { useState, useCallback, useRef, useEffect } from 'react';
import { searchMovies, searchTV } from '@/lib/api/tmdb';
import { tmdbMovieToContentItem, tmdbTVToContentItem, parseContentItemId } from '@/lib/adapters/contentAdapter';
import { getCachedServices } from '@/lib/utils/serviceCache';
import { extractYearFromQuery, reRankSearchResults } from '@/lib/utils/searchUtils';
import type { ContentItem } from '@/components/ContentCard';
import type { ServiceId } from '@/components/platformLogos';
import { API_CONFIG } from '@/lib/constants/config';

const BADGE_FLUSH_INTERVAL_MS = 200;

export function useSearch(userServices?: ServiceId[], initialQuery?: string, initialResults?: ContentItem[]) {
  const [query, setQuery] = useState(initialQuery || '');
  const [results, setResults] = useState<ContentItem[]>(initialResults || []);
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
  const unavailableIdsRef = useRef<Set<string>>(new Set());

  // Stabilize dependency to avoid infinite re-renders
  const servicesKey = userServices?.join(',') || '';

  const tooShort = query.trim().length > 0 && query.trim().length < 2;

  // Flush accumulated badge updates + remove unavailable items in a single setResults call
  const flushBadges = useCallback((q: string) => {
    if (currentQueryRef.current !== q) return;
    const pending = pendingBadgesRef.current;
    const unavailable = unavailableIdsRef.current;
    if (pending.size === 0 && unavailable.size === 0) return;

    const badgeUpdates = new Map(pending);
    pending.clear();
    const removeIds = new Set(unavailable);
    unavailable.clear();

    setResults(prev => {
      const filtered = removeIds.size > 0
        ? prev.filter(item => !removeIds.has(item.id))
        : prev;
      return badgeUpdates.size > 0
        ? filtered.map(item => {
            const services = badgeUpdates.get(item.id);
            return services ? { ...item, services } : item;
          })
        : filtered;
    });
  }, []);

  // Non-blocking provider fetch: populates badges + removes items with no UK availability
  const fetchBadgesInBackground = useCallback((items: ContentItem[], q: string, connectedServices: ServiceId[]) => {
    pendingBadgesRef.current.clear();
    unavailableIdsRef.current.clear();
    if (badgeFlushRef.current) clearTimeout(badgeFlushRef.current);

    let completed = 0;
    const total = items.length;

    items.forEach(async (item) => {
      try {
        const { tmdbId, mediaType } = parseContentItemId(item.id);
        const allItemServices = await getCachedServices(String(tmdbId), mediaType);

        if (allItemServices.length === 0) {
          // No UK availability at all — mark for removal
          unavailableIdsRef.current.add(item.id);
        } else if (connectedServices.length > 0) {
          // Has UK availability — check for badge matches
          const matching = allItemServices.filter((s) => connectedServices.includes(s));
          if (matching.length > 0) {
            pendingBadgesRef.current.set(item.id, matching);
          }
        }
      } catch {
        // Silently skip failed lookups — item stays visible
      } finally {
        completed++;
        // Schedule a flush every BADGE_FLUSH_INTERVAL_MS, and one final flush when all complete
        if (completed === total) {
          if (badgeFlushRef.current) clearTimeout(badgeFlushRef.current);
          flushBadges(q);
        } else if (!badgeFlushRef.current) {
          badgeFlushRef.current = setTimeout(() => {
            badgeFlushRef.current = undefined;
            flushBadges(q);
            // Schedule next flush if still pending
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

      const [movieRes, tvRes] = await Promise.all([
        shouldFetchMovies ? searchMovies(cleanQuery, searchPage, year) : null,
        shouldFetchTV ? searchTV(cleanQuery, searchPage, year) : null,
      ]);

      // Guard against stale results
      if (currentQueryRef.current !== q) return;

      const movieItems = (movieRes?.data?.results || []).map(tmdbMovieToContentItem);
      const tvItems = (tvRes?.data?.results || []).map(tmdbTVToContentItem);
      const merged = [...movieItems, ...tvItems];
      const ranked = reRankSearchResults(merged, cleanQuery);

      // Pagination: has more if either endpoint has more pages
      const movieTotalPages = movieRes?.data?.total_pages || 0;
      const tvTotalPages = tvRes?.data?.total_pages || 0;
      const maxTotalPages = Math.max(movieTotalPages, tvTotalPages);

      if (append) {
        setResults(prev => [...prev, ...ranked]);
      } else {
        setResults(ranked);
      }
      setPage(searchPage);
      setHasMore(searchPage < maxTotalPages);

      // Fire non-blocking provider fetch for badges + UK availability filter
      fetchBadgesInBackground(ranked, q, userServices || []);
    } catch (err: any) {
      if (currentQueryRef.current !== q) return;
      setError(err.message || 'Search failed');
      if (!append) setResults([]);
    } finally {
      if (currentQueryRef.current === q) {
        setLoading(false);
      }
    }
  }, [servicesKey, fetchBadgesInBackground]);

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

  return { query, setQuery, results, loading, error, clearSearch, hasMore, loadMore, activeCategory, setActiveCategory, tooShort };
}
