import { useState, useCallback, useRef, useEffect } from 'react';
import { searchMovies, searchTV } from '@/lib/api/tmdb';
import { tmdbMovieToContentItem, tmdbTVToContentItem } from '@/lib/adapters/contentAdapter';
import { extractYearFromQuery, reRankSearchResults } from '@/lib/utils/searchUtils';
import type { ContentItem } from '@/components/ContentCard';
import type { ServiceId } from '@/components/platformLogos';
import { API_CONFIG } from '@/lib/constants/config';
import { emitSearch } from '@/lib/storage/interactions';
import { searchTitlesByText } from '@/lib/api/supabaseContent';

/**
 * useSearch — text-search engine for the Phase Search V2 results
 * surface. Owns the query state, the TMDb /search + Postgres ILIKE
 * fan-out, ranking, pagination, and the search-event emission.
 *
 * Availability logic (off-service tinting, rent/buy price chip, cost-
 * filter tier set) lives in useItemAvailability — call it on the
 * results returned here. Same hook also serves the filter-only browse
 * path so both surfaces share one decision tree.
 */
export function useSearch(
  userServices?: ServiceId[],
  initialQuery?: string,
  initialResults?: ContentItem[],
) {
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

  // Stabilize dependency to avoid infinite re-renders
  const servicesKey = userServices?.join(',') || '';

  const tooShort = query.trim().length > 0 && query.trim().length < 2;

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
      // Docs ride on the /search/movie endpoint (TMDb classifies docs
      // as movies with genre 99); they get type='doc' on adapter
      // transform and we partition them out below.
      const shouldFetchMovies = category === 'All' || category === 'Movies' || category === 'Docs';
      const shouldFetchTV = category === 'All' || category === 'TV';

      // Parallel sources:
      //   TMDb /search/movie + /search/tv — broad catalogue but
      //     tokenises queries by word boundary ("salt" never matches
      //     "Saltburn").
      //   Postgres titles ILIKE — covers the substring + compound-word
      //     gap for the ~20K UK-available titles we have cached.
      // First-page only for Postgres; TMDb pagination handles depth.
      const [movieRes, tvRes, cacheItems] = await Promise.all([
        shouldFetchMovies ? searchMovies(cleanQuery, searchPage, year) : null,
        shouldFetchTV ? searchTV(cleanQuery, searchPage, year) : null,
        searchPage === 1 ? searchTitlesByText(cleanQuery, 20) : Promise.resolve<ContentItem[]>([]),
      ]);

      // Guard against stale results
      if (currentQueryRef.current !== q) return;

      const movieItems = (movieRes?.data?.results || []).map(tmdbMovieToContentItem);
      const tvItems = (tvRes?.data?.results || []).map(tmdbTVToContentItem);
      // Partition by category. Movies/Docs/TV are mutually exclusive
      // buckets; All accepts everything.
      const passesCategory = (item: ContentItem): boolean => {
        if (category === 'Movies') return item.type === 'movie';
        if (category === 'Docs') return item.type === 'doc';
        if (category === 'TV') return item.type === 'tv';
        return true;
      };
      const filteredMovies = movieItems.filter(passesCategory);
      const filteredCache = cacheItems.filter(passesCategory);

      // Dedupe by id — Postgres entries fill in compound-word gaps
      // TMDb missed; identical hits collapse cleanly.
      const seen = new Set<string>();
      const dedupedItems: ContentItem[] = [];
      const filteredTV = tvItems.filter(passesCategory);
      for (const item of [...filteredMovies, ...filteredTV, ...filteredCache]) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        dedupedItems.push(item);
      }
      const ranked = reRankSearchResults(dedupedItems, cleanQuery);

      const movieTotalPages = movieRes?.data?.total_pages || 0;
      const tvTotalPages = tvRes?.data?.total_pages || 0;
      const maxTotalPages = Math.max(movieTotalPages, tvTotalPages);

      if (append) {
        setResults(prev => {
          const have = new Set(prev.map((p) => p.id));
          const news = ranked.filter((r) => !have.has(r.id));
          return [...prev, ...news];
        });
      } else {
        setResults(ranked);
        // Mode A keyword search — semantic (Cluster B) flips this to
        // 'semantic' when the embedding path lands.
        emitSearch(cleanQuery, ranked.length, { mode: 'lookup' });
      }
      setPage(searchPage);
      setHasMore(searchPage < maxTotalPages);
    } catch (err: any) {
      if (currentQueryRef.current !== q) return;
      setError(err.message || 'Search failed');
      if (!append) setResults([]);
    } finally {
      if (currentQueryRef.current === q) {
        setLoading(false);
      }
    }
    // servicesKey is referenced indirectly via the userServices array,
    // but useSearch no longer branches on it directly — the per-item
    // availability flow (now in useItemAvailability) does. We keep it
    // in the dep list so a service-set change re-runs search and a
    // fresh availability pass kicks in downstream.
  }, [servicesKey]);

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
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    query, setQuery, results, loading, error, clearSearch,
    hasMore, loadMore, activeCategory, setActiveCategory, tooShort,
  };
}
