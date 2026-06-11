import { useState, useEffect, useCallback, useRef } from 'react';
import { discoverMovies, discoverTV } from '@/lib/api/tmdb';
import { tmdbMovieToContentItem, tmdbTVToContentItem, type TMDbContentResult } from '@/lib/adapters/contentAdapter';
import { getSectionCache, setSectionCache } from '@/lib/sectionSessionCache';
import { sanitiseTVGenreParams } from '@/lib/constants/genres';
import { queryClient } from '@/lib/queryClient';
import type { ContentItem } from '@/components/ContentCard';
import { debug } from '@/lib/debugLogger';

/**
 * PLAT-1 (plan §1 commit 3): TanStack Query enters this hook at the
 * PAGE-FETCH boundary only. The buffer/drain mechanics, cross-section
 * dedup, and sessionStorage display-state restore stay byte-identical —
 * they are deliberately NOT cacheable by query key: the displayed items
 * depend on what OTHER sections registered into the shared exclude set
 * first (mount-order-dependent), so caching display state would let a
 * remounted section show titles another section now owns. Caching the
 * raw discover pages (pure in their params) gives the TTL + dedup +
 * persistence wins without touching that state machine.
 */

/** Stable signature for a discover param set — sorted-entries JSON,
 *  the same idea as the retiring cache.ts hashParams. */
function paramsSignature(params: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(params).sort().map((k) => [k, params[k]]));
}

/** Wrapped discover response shape this hook reads (cachedRequest never
 *  rejects — failures surface as success:false). */
interface DiscoverPage {
  success?: boolean;
  error?: string;
  data?: { results?: TMDbContentResult[]; total_pages?: number } | null;
}

/**
 * One cached discover page. Throws on success:false so failures are
 * NEVER cached under the 24h ['tmdb'] staleTime (the old cache.ts also
 * refused to cache failures); the caller's catch path produces the same
 * empty-section outcome the old silent-failure path did.
 */
function fetchDiscoverPage(
  mediaKind: 'movie' | 'tv',
  params: Record<string, unknown>,
  page: number,
): Promise<DiscoverPage> {
  const { page: _page, ...rest } = params;
  return queryClient.fetchQuery({
    queryKey: ['tmdb', 'section', paramsSignature(rest), mediaKind, page],
    queryFn: async (): Promise<DiscoverPage> => {
      const fn = mediaKind === 'movie' ? discoverMovies : discoverTV;
      const res = (await fn(params)) as DiscoverPage;
      if (res.success === false) throw new Error(res.error || 'Discover fetch failed');
      return res;
    },
  });
}

// Phase 3: scoring modes are preserved as type but all resolve to 'none'.
// Phase 4 reintroduces vector-based scoring via the v2 ranker.
export type ScoringMode = 'none' | 'affinity' | 'windowReorder' | 'hybrid';

/** ContentItem extended with raw TMDb fields for scoring */
interface BufferedItem extends ContentItem {
  _genreIds?: number[];
  _popularity?: number;
}

export interface UseSectionDataOptions {
  sectionKey: string;
  /** Base params for TMDb discover (providers, region, filters) */
  baseParams: Record<string, unknown>;
  /** Extra params merged into movie discover calls */
  movieParams?: Record<string, unknown>;
  /** Extra params merged into TV discover calls */
  tvParams?: Record<string, unknown>;
  /** Whether to fetch movies */
  fetchMovies?: boolean;
  /** Whether to fetch TV */
  fetchTV?: boolean;
  /** When false, don't fetch (used for lazy genre sections) */
  enabled?: boolean;
  /** Shared cross-section dedup set */
  excludeIds?: Set<string>;
  /** Register newly displayed IDs into the shared set */
  onNewIds?: (ids: string[]) => void;
  /** @deprecated Phase 3: genre affinities no longer used for scoring */
  genreAffinities?: Record<string, number> | null;
  /** @deprecated Phase 3: scoring always 'none' */
  applyScoring?: boolean;
  /** @deprecated Phase 3: scoring always 'none'. Phase 4 reintroduces. */
  scoringMode?: ScoringMode;
  /** @deprecated Phase 3: v1 taste vector no longer used */
  tasteVector?: unknown;
  /** Whether this is a genre-specific section (affects TV genre handling) */
  isGenreSection?: boolean;
  /** When true, skip dedup against excludeIds and onNewIds registration (for useMemo dedup) */
  skipExternalDedup?: boolean;
  /** Number of items to show initially */
  initialSize?: number;
  /** Number of items per loadMore batch */
  batchSize?: number;
  /** Hard cap on displayed items */
  maxItems?: number;
}

export interface SectionDataState {
  items: ContentItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
}

/** Convert raw TMDb result to BufferedItem (ContentItem + scoring fields) */
function toBufferedMovie(movie: TMDbContentResult): BufferedItem {
  const item = tmdbMovieToContentItem(movie) as BufferedItem;
  item._genreIds = movie.genre_ids || [];
  item._popularity = movie.popularity || 0;
  return item;
}

function toBufferedTV(tv: TMDbContentResult): BufferedItem {
  const item = tmdbTVToContentItem(tv) as BufferedItem;
  item._genreIds = tv.genre_ids || [];
  item._popularity = tv.popularity || 0;
  return item;
}

export function useSectionData(options: UseSectionDataOptions): SectionDataState & {
  loadMore: () => void;
} {
  const {
    sectionKey,
    baseParams,
    movieParams = {},
    tvParams = {},
    fetchMovies = true,
    fetchTV = true,
    enabled = true,
    excludeIds,
    onNewIds,
    isGenreSection = false,
    skipExternalDedup = false,
    initialSize = 10,
    batchSize = 5,
    maxItems = 50,
  } = options;

  // Phase 3: all scoring modes resolve to 'none'. TMDb API ordering only.
  const scoringMode: ScoringMode = 'none';

  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Mutable state for buffer and page tracking (avoid re-renders)
  const bufferRef = useRef<BufferedItem[]>([]);
  const nextMoviePageRef = useRef(1);
  const nextTVPageRef = useRef(1);
  const hasMoreAPIRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const initializedRef = useRef(false);

  // Track section key changes to re-initialize
  const prevKeyRef = useRef(sectionKey);

  /** Fetch one page of movies + TV, return raw BufferedItems */
  const fetchOnePage = useCallback(async (): Promise<{ items: BufferedItem[]; apiDone: boolean }> => {
    const moviePage = nextMoviePageRef.current;
    const tvPage = nextTVPageRef.current;

    // Build TV params — sanitise genre IDs for non-genre sections
    const rawTvParams: Record<string, unknown> = { ...baseParams, ...tvParams, page: tvPage };
    const effectiveTvParams = (!isGenreSection && rawTvParams.with_genres)
      ? sanitiseTVGenreParams(rawTvParams)
      : rawTvParams;

    // PLAT-1: pages served through the query cache (24h tmdb staleTime,
    // in-flight dedup, localStorage persistence) — movie and TV pages as
    // separate entries so single-kind sections never fetch both.
    const [movieRes, tvRes] = await Promise.all([
      fetchMovies
        ? fetchDiscoverPage('movie', { ...baseParams, ...movieParams, page: moviePage }, moviePage)
        : Promise.resolve<DiscoverPage>({ data: { results: [], total_pages: 0 } }),
      fetchTV
        ? fetchDiscoverPage('tv', effectiveTvParams, tvPage)
        : Promise.resolve<DiscoverPage>({ data: { results: [], total_pages: 0 } }),
    ]);

    const movieResults = (movieRes.data?.results || []).map(toBufferedMovie);
    const tvResults = (tvRes.data?.results || []).map(toBufferedTV);

    const movieTotalPages = movieRes.data?.total_pages || 0;
    const tvTotalPages = tvRes.data?.total_pages || 0;

    nextMoviePageRef.current = moviePage + 1;
    nextTVPageRef.current = tvPage + 1;

    const moviesDone = moviePage >= movieTotalPages;
    const tvDone = tvPage >= tvTotalPages;
    const apiDone = moviesDone && tvDone;
    hasMoreAPIRef.current = !apiDone;

    // Interleave movies + TV
    const combined: BufferedItem[] = [];
    const maxLen = Math.max(movieResults.length, tvResults.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < movieResults.length) combined.push(movieResults[i]);
      if (i < tvResults.length) combined.push(tvResults[i]);
    }

    return { items: combined, apiDone };
  }, [baseParams, movieParams, tvParams, fetchMovies, fetchTV, isGenreSection]);

  /** Deduplicate items against the shared exclude set */
  const dedup = useCallback((itemList: BufferedItem[]): BufferedItem[] => {
    if (skipExternalDedup) return itemList;
    if (!excludeIds || excludeIds.size === 0) return itemList;
    return itemList.filter((item) => !excludeIds.has(item.id));
  }, [excludeIds, skipExternalDedup]);

  /** Sort/reorder buffer based on scoring mode (Phase 3: always 'none') */
  const sortBuffer = useCallback((buf: BufferedItem[]): BufferedItem[] => {
    return buf;
  }, []);

  /** Register item IDs in the shared exclude set */
  const registerItems = useCallback((newItems: ContentItem[]) => {
    if (skipExternalDedup || !onNewIds) return;
    onNewIds(newItems.map((i) => i.id));
  }, [onNewIds, skipExternalDedup]);

  /** Save current state to session cache */
  const saveToCache = useCallback((displayItems: ContentItem[], buffer: BufferedItem[]) => {
    setSectionCache(sectionKey, {
      displayItems,
      buffer,
      nextMoviePage: nextMoviePageRef.current,
      nextTVPage: nextTVPageRef.current,
      hasMoreAPI: hasMoreAPIRef.current,
    });
  }, [sectionKey]);

  /** Initial fetch or cache restore */
  const initialize = useCallback(async () => {
    if (!enabled || initializedRef.current) return;
    initializedRef.current = true;

    // Try session cache first
    const cached = getSectionCache(sectionKey);
    if (cached) {
      setItems(cached.displayItems);
      bufferRef.current = cached.buffer as BufferedItem[];
      nextMoviePageRef.current = cached.nextMoviePage;
      nextTVPageRef.current = cached.nextTVPage;
      hasMoreAPIRef.current = cached.hasMoreAPI;
      setHasMore(cached.buffer.length > 0 || cached.hasMoreAPI);
      // Re-register all displayed IDs for dedup
      registerItems(cached.displayItems);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const fetchStart = Date.now();
      const { items: fetched, apiDone } = await fetchOnePage();
      const deduped = dedup(fetched);
      const sorted = sortBuffer(deduped);

      const display = sorted.slice(0, initialSize);
      const buffer = sorted.slice(initialSize);

      // Log section load with reorder details
      const sectionLabel = sectionKey.split('|')[0];
      const reordered = scoringMode !== 'none' && fetched.length > 0;
      debug.info(`Section:${sectionLabel}`, 'Fetch complete', {
        fetchedCount: fetched.length,
        afterDedup: deduped.length,
        displayCount: display.length,
        bufferCount: buffer.length,
        scoringMode,
        reordered,
        timeMs: Date.now() - fetchStart,
        apiDone,
        ...(reordered && display.length >= 3 ? {
          first3: display.slice(0, 3).map((i) => ({ id: i.id, title: i.title })),
        } : {}),
      });

      bufferRef.current = buffer;
      setItems(display);
      setHasMore(buffer.length > 0 || !apiDone);
      registerItems(display);
      saveToCache(display, buffer);
    } catch (err) {
      console.error(`[useSectionData] Error loading ${sectionKey}:`, err);
      debug.error(`Section:${sectionKey.split('|')[0]}`, 'Fetch error', { error: String(err) });
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [enabled, sectionKey, fetchOnePage, dedup, sortBuffer, initialSize, registerItems, saveToCache]);

  /** Load more items (called on horizontal scroll near end) */
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    // Get current items count from the ref-based approach
    setItems((currentItems) => {
      if (currentItems.length >= maxItems) {
        setHasMore(false);
        return currentItems;
      }

      // Start async load more
      loadingMoreRef.current = true;
      setLoadingMore(true);

      const doLoadMore = async () => {
        try {
          let buffer = bufferRef.current;

          // If buffer is low and API has more, fetch another page
          if (buffer.length < batchSize && hasMoreAPIRef.current) {
            const { items: fetched } = await fetchOnePage();
            const deduped = dedup(fetched);
            const sorted = sortBuffer(deduped);
            buffer = [...buffer, ...sorted];
          }

          // Take next batch from buffer
          const remaining = maxItems - currentItems.length;
          const take = Math.min(batchSize, remaining, buffer.length);
          const newBatch = buffer.slice(0, take);
          const newBuffer = buffer.slice(take);

          bufferRef.current = newBuffer;

          if (newBatch.length > 0) {
            const updated = [...currentItems, ...newBatch];
            setItems(updated);
            registerItems(newBatch);
            setHasMore(newBuffer.length > 0 || hasMoreAPIRef.current);
            saveToCache(updated, newBuffer);
          } else {
            setHasMore(false);
          }
        } catch (err) {
          console.error(`[useSectionData] Error loading more for ${sectionKey}:`, err);
        } finally {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        }
      };

      doLoadMore();
      return currentItems; // Return unchanged for now, async update will follow
    });
  }, [maxItems, batchSize, fetchOnePage, dedup, sortBuffer, registerItems, saveToCache, sectionKey]);

  // Initialize on mount or when enabled/key changes
  useEffect(() => {
    if (prevKeyRef.current !== sectionKey) {
      // Section key changed (filters changed) — reset
      prevKeyRef.current = sectionKey;
      initializedRef.current = false;
      bufferRef.current = [];
      nextMoviePageRef.current = 1;
      nextTVPageRef.current = 1;
      hasMoreAPIRef.current = true;
      setItems([]);
      setHasMore(true);
    }
    initialize();
  }, [sectionKey, initialize]);

  return { items, loading, loadingMore, hasMore, loadMore };
}
