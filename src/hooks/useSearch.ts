import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
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

/** Mode A page payload cached under ['tmdb','search',…]. The Postgres
 *  ILIKE hits ride inside the merged item list (page 1 only) rather
 *  than getting their own persisted entry — the combined result is
 *  what the surface consumes, and the merge is deterministic for a
 *  given (query, category, page). */
interface LookupSearchData {
  items: ContentItem[];
  /** Year-stripped query — what we actually sent to TMDb and emit in
   *  the search event. */
  cleanQuery: string;
  maxTotalPages: number;
  movieTotal: number;
  tvTotal: number;
}

/** One dispatched Mode A search invocation. Mirrors the old
 *  search(q, page, append, category) call shape; `nonce` keeps
 *  re-dispatches of an identical query distinct so the apply effect
 *  (and its emitSearch side effect) runs once per dispatch. */
interface LookupSubmission {
  q: string;
  trimmed: string;
  page: number;
  append: boolean;
  category: string;
  servicesKey: string;
  nonce: number;
}

/**
 * Mode A fetch+merge: parallel sources —
 *   TMDb /search/movie + /search/tv — broad catalogue but
 *     tokenises queries by word boundary ("salt" never matches
 *     "Saltburn").
 *   Postgres titles ILIKE — covers the substring + compound-word
 *     gap for the ~20K UK-available titles we have cached.
 * First-page only for Postgres; TMDb pagination handles depth.
 * Pure with respect to its arguments — safely cacheable.
 */
async function performLookupSearch(
  trimmed: string,
  searchPage: number,
  category: string,
): Promise<LookupSearchData> {
  const { cleanQuery, year } = extractYearFromQuery(trimmed);
  // Docs ride on the /search/movie endpoint (TMDb classifies docs
  // as movies with genre 99); they get type='doc' on adapter
  // transform and we partition them out below.
  const shouldFetchMovies = category === 'All' || category === 'Movies' || category === 'Docs';
  const shouldFetchTV = category === 'All' || category === 'TV';

  const [movieRes, tvRes, cacheItems] = await Promise.all([
    shouldFetchMovies ? searchMovies(cleanQuery, searchPage, year) : null,
    shouldFetchTV ? searchTV(cleanQuery, searchPage, year) : null,
    searchPage === 1 ? searchTitlesByText(cleanQuery, 20) : Promise.resolve<ContentItem[]>([]),
  ]);

  // cachedRequest never rejects — failures surface as success:false
  // with fallback data. Throw only on total failure (every requested
  // TMDb endpoint down AND no Postgres hits to fall back on); partial
  // failures degrade to the same partial merge the pre-Query hook
  // produced.
  const tmdbResponses = [movieRes, tvRes].filter((r) => r !== null);
  if (
    tmdbResponses.length > 0
    && tmdbResponses.every((r) => !r.success)
    && cacheItems.length === 0
  ) {
    throw new Error(tmdbResponses[0].error || 'Search failed');
  }

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
  const movieTotal = movieRes?.data?.total_results || 0;
  const tvTotal = tvRes?.data?.total_results || 0;

  return { items: ranked, cleanQuery, maxTotalPages, movieTotal, tvTotal };
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
 * Mode A retrieval runs through TanStack Query (PLAT-1): each
 * dispatched (query, category, page) maps to a ['tmdb','search',…]
 * entry, and an apply-effect projects resolved pages back into the
 * hook's public state so the interface (results/loading/error/
 * pagination) is unchanged from the pre-Query implementation. Mode C
 * stays fully imperative — its dispatch flow is byte-equivalent to
 * the Phase Search V2 implementation, including the mood-chip
 * `dispatch: false` arming gotcha.
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
  const [submission, setSubmission] = useState<LookupSubmission | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const isRestoredRef = useRef(!!initialQuery);
  const currentQueryRef = useRef(query);
  const nonceRef = useRef(0);
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
      } catch (err) {
        if (currentQueryRef.current !== q) return;
        setError(err instanceof Error ? err.message : 'Semantic search failed');
        if (!append) setResults([]);
      } finally {
        if (currentQueryRef.current === q) setLoading(false);
      }
      return;
    }

    // Mode A — dispatch a lookup submission. The useQuery below picks
    // it up; the apply effect projects the resolved page into state.
    nonceRef.current += 1;
    setSubmission({
      q,
      trimmed,
      page: searchPage,
      append,
      category,
      servicesKey,
      nonce: nonceRef.current,
    });
    // servicesKey is stamped into the submission (and the query key) so
    // a service-set change re-runs search and a fresh availability pass
    // kicks in downstream — same re-run trigger as the pre-Query hook,
    // where servicesKey churned this callback.
  }, [servicesKey]);

  // Mode A page query. Persisted under ['tmdb', …] (24h stale/gc per
  // queryClient defaults). keepPreviousData means a key change (typing,
  // category flip) never flashes the cache empty — results state holds
  // the previous grid until the new page applies, matching the old
  // behaviour. retry:false matches the old single-attempt semantics.
  const lookupQuery = useQuery<LookupSearchData, Error>({
    queryKey: [
      'tmdb',
      'search',
      submission?.trimmed ?? '',
      submission?.servicesKey ?? '',
      submission?.category ?? 'All',
      submission?.page ?? 1,
    ],
    queryFn: () => performLookupSearch(
      submission?.trimmed ?? '',
      submission?.page ?? 1,
      submission?.category ?? 'All',
    ),
    enabled: mode === 'lookup' && submission !== null && (submission?.trimmed.length ?? 0) >= 2,
    placeholderData: keepPreviousData,
    retry: false,
  });

  // Apply a resolved Mode A page to public state — the success half of
  // the old await-block. Stamped per (dispatch nonce, fetch time) so a
  // re-render doesn't re-append or re-emit. The currentQueryRef guard
  // preserves the old stale-result protection (clearSearch mid-flight,
  // newer dispatch in the same tick).
  const appliedRef = useRef('');
  useEffect(() => {
    if (!submission || mode !== 'lookup') return;
    if (lookupQuery.isPlaceholderData) return;
    const data = lookupQuery.data;
    if (!data) return;
    if (currentQueryRef.current !== submission.q) return;
    const stamp = `ok:${submission.nonce}:${lookupQuery.dataUpdatedAt}`;
    if (appliedRef.current === stamp) return;
    appliedRef.current = stamp;

    // Total result count across both endpoints. Set on page 1 only —
    // TMDb's total is stable for a given query so re-summing on
    // subsequent pages would just produce noise.
    if (submission.page === 1) {
      setTotalResults(data.movieTotal + data.tvTotal);
    }

    if (submission.append) {
      setResults(prev => {
        const have = new Set(prev.map((p) => p.id));
        const news = data.items.filter((r) => !have.has(r.id));
        return [...prev, ...news];
      });
    } else {
      setResults(data.items);
      // Mode A keyword search — semantic (Cluster B) flips this to
      // 'semantic' when the embedding path lands.
      emitSearch(data.cleanQuery, data.items.length, { mode: 'lookup' });
    }
    setPage(submission.page);
    setHasMore(submission.page < data.maxTotalPages);
    setLoading(false);
  }, [submission, mode, lookupQuery.data, lookupQuery.isPlaceholderData, lookupQuery.dataUpdatedAt]);

  // Error half of the old await-block.
  useEffect(() => {
    if (!submission || mode !== 'lookup') return;
    if (!lookupQuery.isError) return;
    if (currentQueryRef.current !== submission.q) return;
    const stamp = `err:${submission.nonce}:${lookupQuery.errorUpdatedAt}`;
    if (appliedRef.current === stamp) return;
    appliedRef.current = stamp;
    const err = lookupQuery.error;
    setError(err instanceof Error && err.message ? err.message : 'Search failed');
    if (!submission.append) setResults([]);
    setLoading(false);
  }, [submission, mode, lookupQuery.isError, lookupQuery.error, lookupQuery.errorUpdatedAt]);

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
    setSubmission(null);
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
