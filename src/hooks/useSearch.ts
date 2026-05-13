import { useState, useCallback, useRef, useEffect } from 'react';
import { searchMovies, searchTV } from '@/lib/api/tmdb';
import { tmdbMovieToContentItem, tmdbTVToContentItem } from '@/lib/adapters/contentAdapter';
import { extractYearFromQuery, reRankSearchResults } from '@/lib/utils/searchUtils';
import type { ContentItem } from '@/components/ContentCard';
import type { ServiceId } from '@/components/platformLogos';
import { API_CONFIG } from '@/lib/constants/config';
import { emitSearch } from '@/lib/storage/interactions';
import { searchTitlesByText } from '@/lib/api/supabaseContent';
import { semanticSearch } from '@/lib/recommendations-v2/search/semanticRetrieval';
import type { FilterState } from '@/lib/search/filterState';

export type SearchMode = 'lookup' | 'semantic';

/** Mode A returning <= this many results AND the query looking
 *  "free-text" (not a title prefix match) triggers the opt-in CTA.
 *  Tunable from one place; eval rig can adjust. */
const SEMANTIC_OPT_IN_THRESHOLD = 2;

interface UseSearchOptions {
  /** Threaded into Mode C's post-retrieval filter. Mode A ignores
   *  filters at the hook level (BrowsePage applies them downstream). */
  filters?: FilterState;
  /** Threaded into Mode C's scoring (taste-fit component). Mode A
   *  ignores. Pass null/undefined when the user isn't logged in. */
  userTasteVector?: number[] | null;
  /** Snapshot restore — when restoring from BrowseStateSnapshot, the
   *  prior mode is preserved so the user lands back in the same
   *  retrieval path. Defaults to 'lookup'. */
  initialMode?: SearchMode;
}

/**
 * useSearch — text-search engine for the Phase Search V2 results
 * surface. Owns the query state, dispatches between Mode A (TMDb
 * /search + Postgres ILIKE) and Mode C (semantic embedding via
 * embed-query + match_titles_by_vector), ranks results, paginates,
 * and emits search events.
 *
 * Mode is selected by `setMode` (user-elected per strategy annex §6:
 * no silent dispatch). The hook also exposes
 * `shouldShowSemanticCTA` — true when Mode A returned a sparse free-
 * text result that's a good candidate for the Mode C opt-in.
 *
 * Availability logic (off-service tinting, rent/buy price chip,
 * cost-filter tier set) lives in useItemAvailability — call it on
 * the results returned here. Same hook also serves the filter-only
 * browse path so both surfaces share one decision tree.
 */
export function useSearch(
  userServices?: ServiceId[],
  initialQuery?: string,
  initialResults?: ContentItem[],
  options: UseSearchOptions = {},
) {
  const { filters, userTasteVector, initialMode = 'lookup' } = options;
  const [query, setQuery] = useState(initialQuery || '');
  const [results, setResults] = useState<ContentItem[]>(initialResults || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  /** TMDb-reported total result count for the current query — sum of
   *  /search/movie and /search/tv totals. The grid usually shows a
   *  smaller number after availability + post-filter, but this is the
   *  catalogue ceiling the user is querying against. */
  const [totalResults, setTotalResults] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [mode, setModeState] = useState<SearchMode>(initialMode);
  const [semanticCached, setSemanticCached] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const isRestoredRef = useRef(!!initialQuery);
  const currentQueryRef = useRef(query);
  // Refs mirroring the latest filters / tasteVector so the async
  // semantic path picks them up without forcing search() into the
  // useCallback dep list (which would churn it on every render).
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const tasteVectorRef = useRef(userTasteVector);
  tasteVectorRef.current = userTasteVector;
  // Mirror mode too so the debounced effects see the live value when
  // they fire after a setMode call.
  const modeRef = useRef(mode);
  modeRef.current = mode;

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

    // Mode C path — semantic retrieval via the shared ranker. Mode
    // dispatches happen via setMode() (user-elected); we never silently
    // switch from lookup → semantic. No pagination yet: semantic
    // returns a fixed pool ranked by combined score, so `append` is
    // ignored and hasMore is always false.
    if (modeRef.current === 'semantic') {
      try {
        const result = await semanticSearch({
          query: trimmed,
          filters: filtersRef.current ?? {
            services: [],
            contentType: 'all',
            costs: [],
            runtime: 'any',
            genres: [],
            minRating: 0,
            showWatched: 'all',
            languages: [],
            onlyOnMyServices: true,
          },
          userTasteVector: tasteVectorRef.current,
        });
        if (currentQueryRef.current !== q) return;
        setResults(result.items);
        setTotalResults(result.items.length);
        setSemanticCached(result.cached);
        setHasMore(false);
        setPage(1);
        emitSearch(trimmed, result.items.length, {
          mode: 'semantic',
          metadata: { cached: result.cached },
        });
      } catch (err: any) {
        if (currentQueryRef.current !== q) return;
        setError(err?.message ?? 'Semantic search failed');
        if (!append) setResults([]);
      } finally {
        if (currentQueryRef.current === q) setLoading(false);
      }
      return;
    }

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
      // Total result count across both endpoints. Set on page 1 only —
      // TMDb's total is stable for a given query so re-summing on
      // subsequent pages would just produce noise.
      if (searchPage === 1) {
        const movieTotal = movieRes?.data?.total_results || 0;
        const tvTotal = tvRes?.data?.total_results || 0;
        setTotalResults(movieTotal + tvTotal);
      }

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
    setTotalResults(0);
    setModeState('lookup');
    setSemanticCached(false);
    currentQueryRef.current = '';
  }, []);

  // Mode dispatcher. Switching mode re-runs the current query through
  // the new retrieval path so the grid swaps in place. The caller
  // (BrowsePage) gates semantic on the feature flag — useSearch
  // doesn't second-guess, it just runs what it's told.
  //
  // `dispatch: false` arms the mode without firing a search — for
  // callers that change the mode and the query in the same tick (mood
  // chip). The debounced query effect picks up `modeRef.current` when
  // its timer fires, so dispatching here would race that timer.
  const setMode = useCallback((next: SearchMode, opts?: { dispatch?: boolean }) => {
    setModeState(next);
    modeRef.current = next;
    if (opts?.dispatch === false) return;
    const q = query.trim();
    if (!q || q.length < 2) return;
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Run immediately on explicit user action — debounce only protects
    // the typing-as-you-go flow.
    search(query, 1, false, activeCategory);
  }, [query, activeCategory, search]);

  // Mode A → Mode C opt-in trigger. Mode A returning <= threshold
  // results for a "free-text" query (length ≥ 3 chars AND no result
  // title contains the first 5 chars of the query) suggests the
  // user typed a description, not a title. The CTA is rendered when
  // this is true; never auto-dispatched.
  const shouldShowSemanticCTA = (() => {
    if (mode !== 'lookup') return false;
    const trimmed = query.trim();
    if (trimmed.length < 3) return false;
    if (loading) return false;
    if (results.length > SEMANTIC_OPT_IN_THRESHOLD) return false;
    const prefix = trimmed.toLowerCase().slice(0, 5);
    const hasTitleMatch = results.some((r) => r.title.toLowerCase().includes(prefix));
    return !hasTitleMatch;
  })();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    query, setQuery, results, loading, error, clearSearch,
    hasMore, loadMore, activeCategory, setActiveCategory, tooShort,
    totalResults,
    /** Current retrieval mode. 'lookup' = TMDb /search + Postgres
     *  ILIKE. 'semantic' = embed-query + match_titles_by_vector via
     *  the shared ranker. */
    mode,
    /** Switch retrieval mode and re-run the current query. Gated by
     *  the caller on the search_semantic feature flag — useSearch
     *  doesn't read the flag itself. */
    setMode,
    /** True when the user just embedded the same query within the
     *  Edge function's LRU window. Surfaced for the eval rig +
     *  instrumentation; not displayed in the UI. */
    semanticCached,
    /** Whether the Mode A → Mode C opt-in CTA should render. True
     *  only when in lookup mode, query is plausibly free-text, and
     *  Mode A returned a sparse result set. Never auto-dispatches;
     *  consumer renders the CTA and triggers `setMode('semantic')`
     *  on tap (gated by the feature flag). */
    shouldShowSemanticCTA,
  };
}
