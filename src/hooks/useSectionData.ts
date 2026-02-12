import { useState, useEffect, useCallback, useRef } from 'react';
import { discoverMovies, discoverTV } from '@/lib/api/tmdb';
import { tmdbMovieToContentItem, tmdbTVToContentItem } from '@/lib/adapters/contentAdapter';
import { getSectionCache, setSectionCache } from '@/lib/sectionSessionCache';
import type { ContentItem } from '@/components/ContentCard';
import type { GenreAffinities } from '@/lib/utils/recommendationEngine';

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
  /** Genre affinities for scoring (genre sections only) */
  genreAffinities?: GenreAffinities | null;
  /** Whether to sort by genre affinity */
  applyScoring?: boolean;
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

/** Simple affinity score for genre row sorting */
function scoreByAffinity(item: BufferedItem, affinities: GenreAffinities): number {
  let score = 0;
  for (const gId of item._genreIds || []) {
    score += affinities[gId] || 0;
  }
  // Normalize genre score
  score = Math.min(score / 10, 1) * 70;
  // Popularity tiebreaker
  score += Math.min((item._popularity || 0) / 100, 1) * 10;
  // Rating bonus
  const rating = item.rating || 0;
  if (rating >= 7) score += (rating - 7) * 3;
  return score;
}

/** Convert raw TMDb result to BufferedItem (ContentItem + scoring fields) */
function toBufferedMovie(movie: any): BufferedItem {
  const item = tmdbMovieToContentItem(movie) as BufferedItem;
  item._genreIds = movie.genre_ids || [];
  item._popularity = movie.popularity || 0;
  return item;
}

function toBufferedTV(tv: any): BufferedItem {
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
    genreAffinities,
    applyScoring = false,
    initialSize = 10,
    batchSize = 5,
    maxItems = 50,
  } = options;

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

    const [movieRes, tvRes] = await Promise.all([
      fetchMovies
        ? discoverMovies({ ...baseParams, ...movieParams, page: moviePage })
        : Promise.resolve({ data: { results: [], total_pages: 0 } }),
      fetchTV
        ? discoverTV({ ...baseParams, ...tvParams, page: tvPage })
        : Promise.resolve({ data: { results: [], total_pages: 0 } }),
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
  }, [baseParams, movieParams, tvParams, fetchMovies, fetchTV]);

  /** Deduplicate items against the shared exclude set */
  const dedup = useCallback((itemList: BufferedItem[]): BufferedItem[] => {
    if (!excludeIds || excludeIds.size === 0) return itemList;
    return itemList.filter((item) => !excludeIds.has(item.id));
  }, [excludeIds]);

  /** Sort buffer by affinity if scoring is enabled */
  const sortBuffer = useCallback((buf: BufferedItem[]): BufferedItem[] => {
    if (!applyScoring || !genreAffinities) return buf;
    return [...buf].sort((a, b) => scoreByAffinity(b, genreAffinities) - scoreByAffinity(a, genreAffinities));
  }, [applyScoring, genreAffinities]);

  /** Register item IDs in the shared exclude set */
  const registerItems = useCallback((newItems: ContentItem[]) => {
    if (onNewIds) {
      onNewIds(newItems.map((i) => i.id));
    }
  }, [onNewIds]);

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
      const { items: fetched, apiDone } = await fetchOnePage();
      const deduped = dedup(fetched);
      const sorted = sortBuffer(deduped);

      const display = sorted.slice(0, initialSize);
      const buffer = sorted.slice(initialSize);

      bufferRef.current = buffer;
      setItems(display);
      setHasMore(buffer.length > 0 || !apiDone);
      registerItems(display);
      saveToCache(display, buffer);
    } catch (err) {
      console.error(`[useSectionData] Error loading ${sectionKey}:`, err);
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
