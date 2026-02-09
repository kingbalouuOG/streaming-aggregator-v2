import storage from '../storage';

const DEBUG = __DEV__;

const WATCHLIST_KEY = '@app_watchlist';

export interface WatchlistItemMetadata {
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  releaseDate: string;
  voteAverage: number;
  genreIds: number[];
  runtime: number | null;
  numberOfSeasons: number | null;
}

export interface WatchlistItem {
  id: number;
  type: 'movie' | 'tv';
  status: 'want_to_watch' | 'watched';
  rating: -1 | 0 | 1;
  addedAt: number;
  updatedAt: number;
  watchedAt: number | null;
  metadata: WatchlistItemMetadata;
  syncStatus: 'local_only' | 'pending_sync' | 'synced';
  lastSyncedAt: number | null;
  version: number;
}

interface WatchlistData {
  items: WatchlistItem[];
  lastModified: number;
  schemaVersion: number;
}

const DEFAULT_WATCHLIST: WatchlistData = { items: [], lastModified: Date.now(), schemaVersion: 1 };

export const getWatchlist = async (): Promise<WatchlistData> => {
  try {
    const data = await storage.getItem(WATCHLIST_KEY);
    if (!data) return { ...DEFAULT_WATCHLIST };
    return JSON.parse(data);
  } catch {
    return { ...DEFAULT_WATCHLIST };
  }
};

const saveWatchlist = async (watchlist: WatchlistData) => {
  await storage.setItem(WATCHLIST_KEY, JSON.stringify({ ...watchlist, lastModified: Date.now() }));
};

export const getWatchlistItem = async (id: number, type: string): Promise<WatchlistItem | null> => {
  const watchlist = await getWatchlist();
  return watchlist.items.find((item) => item.id === id && item.type === type) || null;
};

export const isInWatchlist = async (id: number, type: string): Promise<boolean> => {
  return (await getWatchlistItem(id, type)) !== null;
};

export const addToWatchlist = async (id: number, type: 'movie' | 'tv', metadata: any, status: 'want_to_watch' | 'watched' = 'want_to_watch'): Promise<WatchlistItem> => {
  const watchlist = await getWatchlist();
  const existingIndex = watchlist.items.findIndex((item) => item.id === id && item.type === type);

  if (existingIndex >= 0) {
    return (await updateWatchlistItem(id, type, { status, metadata }))!;
  }

  const now = Date.now();
  const newItem: WatchlistItem = {
    id, type, status, rating: 0, addedAt: now, updatedAt: now,
    watchedAt: status === 'watched' ? now : null,
    metadata: {
      title: metadata?.title || metadata?.name || 'Unknown Title',
      posterPath: metadata?.posterPath || metadata?.poster_path || null,
      backdropPath: metadata?.backdropPath || metadata?.backdrop_path || null,
      overview: metadata?.overview || '',
      releaseDate: metadata?.releaseDate || metadata?.release_date || metadata?.first_air_date || '',
      voteAverage: metadata?.voteAverage || metadata?.vote_average || 0,
      genreIds: metadata?.genreIds || metadata?.genre_ids || [],
      runtime: metadata?.runtime || null,
      numberOfSeasons: metadata?.numberOfSeasons || metadata?.number_of_seasons || null,
    },
    syncStatus: 'local_only', lastSyncedAt: null, version: 1,
  };

  watchlist.items.unshift(newItem);
  await saveWatchlist(watchlist);
  if (DEBUG) console.log('[Watchlist] Added:', newItem.metadata.title);
  return newItem;
};

export const updateWatchlistItem = async (id: number, type: string, updates: Partial<WatchlistItem>): Promise<WatchlistItem | null> => {
  const watchlist = await getWatchlist();
  const index = watchlist.items.findIndex((item) => item.id === id && item.type === type);
  if (index < 0) return null;

  const existing = watchlist.items[index];
  const now = Date.now();
  let watchedAt = existing.watchedAt;
  if (updates.status === 'watched' && existing.status !== 'watched') watchedAt = now;
  else if (updates.status === 'want_to_watch') watchedAt = null;

  const updatedItem: WatchlistItem = {
    ...existing, ...updates, watchedAt, updatedAt: now,
    syncStatus: 'pending_sync', version: existing.version + 1,
    metadata: updates.metadata ? { ...existing.metadata, ...updates.metadata } : existing.metadata,
  };

  watchlist.items[index] = updatedItem;
  await saveWatchlist(watchlist);
  return updatedItem;
};

export const removeFromWatchlist = async (id: number, type: string): Promise<boolean> => {
  const watchlist = await getWatchlist();
  const initialLength = watchlist.items.length;
  watchlist.items = watchlist.items.filter((item) => !(item.id === id && item.type === type));
  if (watchlist.items.length === initialLength) return false;
  await saveWatchlist(watchlist);
  return true;
};

export const setWatchlistStatus = async (id: number, type: string, status: 'want_to_watch' | 'watched') => {
  return updateWatchlistItem(id, type, { status });
};

export const setWatchlistRating = async (id: number, type: string, rating: -1 | 0 | 1) => {
  return updateWatchlistItem(id, type, { rating });
};

export const getWatchlistByStatus = async (status: string): Promise<WatchlistItem[]> => {
  const watchlist = await getWatchlist();
  return watchlist.items.filter((item) => item.status === status);
};

export const getWatchedWithRating = async (rating: number): Promise<WatchlistItem[]> => {
  const watchlist = await getWatchlist();
  return watchlist.items.filter((item) => item.status === 'watched' && item.rating === rating);
};

export const getWatchlistStats = async () => {
  const watchlist = await getWatchlist();
  const items = watchlist.items;
  return {
    total: items.length,
    wantToWatch: items.filter((i) => i.status === 'want_to_watch').length,
    watched: items.filter((i) => i.status === 'watched').length,
    liked: items.filter((i) => i.rating === 1).length,
    disliked: items.filter((i) => i.rating === -1).length,
    movies: items.filter((i) => i.type === 'movie').length,
    tvShows: items.filter((i) => i.type === 'tv').length,
  };
};

export const clearWatchlist = async () => {
  await storage.removeItem(WATCHLIST_KEY);
};
