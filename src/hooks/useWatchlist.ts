import { useState, useEffect, useCallback } from 'react';
import {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  setWatchlistStatus,
  type WatchlistItem,
} from '@/lib/storage/watchlist';
import { watchlistItemToContentItem, parseContentItemId } from '@/lib/adapters/contentAdapter';
import type { ContentItem } from '@/components/ContentCard';

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await getWatchlist();
    setItems(data.items);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived lists as ContentItem[]
  const watchlist: ContentItem[] = items
    .filter((i) => i.status === 'want_to_watch')
    .map(watchlistItemToContentItem);

  const watched: ContentItem[] = items
    .filter((i) => i.status === 'watched')
    .map(watchlistItemToContentItem);

  const bookmarkedIds = new Set<string>(
    items.map((i) => `${i.type}-${i.id}`)
  );

  const toggleBookmark = useCallback(async (item: ContentItem) => {
    const { tmdbId, mediaType } = parseContentItemId(item.id);
    const existing = items.find((i) => i.id === tmdbId && i.type === mediaType);

    if (existing) {
      await removeFromWatchlist(tmdbId, mediaType);
      setItems((prev) => prev.filter((i) => !(i.id === tmdbId && i.type === mediaType)));
      return false; // removed
    } else {
      // Extract TMDb poster path from full URL (e.g. "https://image.tmdb.org/t/p/w342/abc.jpg" → "/abc.jpg")
      const posterPath = item.image?.match(/\/t\/p\/\w+(\/.+)$/)?.[1] || null;
      const newItem = await addToWatchlist(tmdbId, mediaType, {
        title: item.title,
        posterPath,
        overview: '',
        release_date: item.year ? `${item.year}-01-01` : '',
        vote_average: item.rating || 0,
        genre_ids: [],
      });
      setItems((prev) => [newItem, ...prev]);
      return true; // added
    }
  }, [items]);

  const removeBookmark = useCallback(async (contentItemId: string) => {
    const { tmdbId, mediaType } = parseContentItemId(contentItemId);
    await removeFromWatchlist(tmdbId, mediaType);
    setItems((prev) => prev.filter((i) => !(i.id === tmdbId && i.type === mediaType)));
  }, []);

  const moveToWatched = useCallback(async (contentItemId: string) => {
    const { tmdbId, mediaType } = parseContentItemId(contentItemId);
    await setWatchlistStatus(tmdbId, mediaType, 'watched');
    setItems((prev) =>
      prev.map((i) =>
        i.id === tmdbId && i.type === mediaType
          ? { ...i, status: 'watched' as const, watchedAt: Date.now(), updatedAt: Date.now() }
          : i
      )
    );
  }, []);

  const moveToWantToWatch = useCallback(async (contentItemId: string) => {
    const { tmdbId, mediaType } = parseContentItemId(contentItemId);
    await setWatchlistStatus(tmdbId, mediaType, 'want_to_watch');
    setItems((prev) =>
      prev.map((i) =>
        i.id === tmdbId && i.type === mediaType
          ? { ...i, status: 'want_to_watch' as const, watchedAt: null, updatedAt: Date.now() }
          : i
      )
    );
  }, []);

  return {
    watchlist,
    watched,
    bookmarkedIds,
    loading,
    toggleBookmark,
    removeBookmark,
    moveToWatched,
    moveToWantToWatch,
    reload: load,
  };
}
