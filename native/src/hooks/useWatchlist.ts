import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import { buildBackdropUrl, buildPosterUrl } from '@/lib/api/imageUrls';
import type { ContentItem } from '@/lib/types/content';
import {
  addToWatchlist,
  getWatchlist,
  removeFromWatchlist,
  setWatchlistStatus,
  type WatchlistItem,
} from '@/lib/storage/watchlist';

// Native watchlist hook (NATIVE-2 W5a). Reads/writes through the shared
// storage/watchlist lib (dual backend: MMKV local when signed out,
// Supabase when signed in — handled inside the lib). React Query keeps
// the Watchlist screen and the detail-page bookmark button consistent:
// every mutation invalidates the single ['native','watchlist'] query.

const WATCHLIST_KEY = ['native', 'watchlist'] as const;
const TMDB_IMG_PREFIX = /^https?:\/\/image\.tmdb\.org\/t\/p\/[^/]+/;

/** Reverse buildImageUrl → the raw TMDb path the watchlist stores, so
 *  data stays consistent with web-added (and Supabase-synced) rows. */
function toTmdbPath(url: string | undefined): string | null {
  if (!url) return null;
  if (TMDB_IMG_PREFIX.test(url)) return url.replace(TMDB_IMG_PREFIX, '');
  return url.startsWith('/') ? url : null;
}

function imageFromPath(path: string | null, kind: 'poster' | 'backdrop'): string {
  if (!path) return '';
  if (path.startsWith('http')) return path; // already absolute (defensive)
  return (kind === 'poster' ? buildPosterUrl(path) : buildBackdropUrl(path)) ?? '';
}

export function watchlistItemToContentItem(item: WatchlistItem): ContentItem {
  const { metadata } = item;
  const year = metadata.releaseDate ? parseInt(metadata.releaseDate.slice(0, 4), 10) : undefined;
  return {
    id: `${item.type}-${item.id}`,
    title: metadata.title,
    image: imageFromPath(metadata.posterPath, 'poster'),
    backdrop: imageFromPath(metadata.backdropPath, 'backdrop'),
    services: [],
    year: Number.isNaN(year) ? undefined : year,
    type: item.type,
    rating: metadata.voteAverage || undefined,
    overview: metadata.overview || undefined,
    genreIds: metadata.genreIds,
    originalLanguage: metadata.originalLanguage ?? undefined,
  };
}

function contentItemToMetadata(item: ContentItem) {
  return {
    title: item.title,
    poster_path: toTmdbPath(item.image),
    backdrop_path: toTmdbPath(item.backdrop),
    overview: item.overview ?? '',
    release_date: item.year ? `${item.year}-01-01` : '',
    vote_average: item.rating ?? 0,
    genre_ids: item.genreIds ?? [],
    original_language: item.originalLanguage ?? null,
  };
}

export function useWatchlist() {
  return useQuery({
    queryKey: WATCHLIST_KEY,
    queryFn: async () => (await getWatchlist()).items,
    staleTime: 60 * 1000,
  });
}

/** True when the title is in the watchlist (any status). Derives from the
 *  same query so it stays in sync with the screen. */
export function useIsBookmarked(contentItemId: string): boolean {
  const { data } = useWatchlist();
  if (!data) return false;
  const { tmdbId, mediaType } = parseContentItemId(contentItemId);
  return data.some((i) => i.id === tmdbId && i.type === mediaType);
}

/** Minimal client-side WatchlistItem for optimistic cache writes. The next
 *  invalidate replaces it with the server row; only id/type/status are read
 *  by the detail-page buttons, the rest are sane defaults. */
function optimisticWatchlistItem(
  item: ContentItem,
  status: 'want_to_watch' | 'watched',
): WatchlistItem {
  const { tmdbId, mediaType } = parseContentItemId(item.id);
  const now = Date.now();
  return {
    id: tmdbId,
    type: mediaType,
    status,
    rating: 0,
    addedAt: now,
    updatedAt: now,
    watchedAt: status === 'watched' ? now : null,
    metadata: {
      title: item.title,
      posterPath: toTmdbPath(item.image),
      backdropPath: toTmdbPath(item.backdrop),
      overview: item.overview ?? '',
      releaseDate: item.year ? `${item.year}-01-01` : '',
      voteAverage: item.rating ?? 0,
      genreIds: item.genreIds ?? [],
      runtime: null,
      numberOfSeasons: null,
      originalLanguage: item.originalLanguage ?? null,
    },
    syncStatus: 'local_only',
    lastSyncedAt: null,
    version: 1,
  };
}

export function useWatchlistMutations() {
  const qc = useQueryClient();
  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: WATCHLIST_KEY }), [qc]);

  // Optimistic cache write + rollback. Without instant feedback the detail
  // buttons only flip after the round-trip + refetch, which is what drove
  // the duplicate-tap "Mark as Watched" bug (the button never appeared to
  // respond, so users tapped again and again).
  const optimistic = useCallback(
    async (mutate: (old: WatchlistItem[]) => WatchlistItem[]) => {
      await qc.cancelQueries({ queryKey: WATCHLIST_KEY });
      const prev = qc.getQueryData<WatchlistItem[]>(WATCHLIST_KEY);
      qc.setQueryData<WatchlistItem[]>(WATCHLIST_KEY, (old) => mutate(old ?? []));
      return { prev };
    },
    [qc],
  );
  const rollback = useCallback(
    (ctx: { prev?: WatchlistItem[] } | undefined) => {
      if (ctx?.prev) qc.setQueryData(WATCHLIST_KEY, ctx.prev);
    },
    [qc],
  );

  const toggle = useMutation({
    mutationFn: async (item: ContentItem) => {
      const { tmdbId, mediaType } = parseContentItemId(item.id);
      const current = (await getWatchlist()).items;
      const exists = current.some((i) => i.id === tmdbId && i.type === mediaType);
      if (exists) {
        await removeFromWatchlist(tmdbId, mediaType);
      } else {
        await addToWatchlist(tmdbId, mediaType, contentItemToMetadata(item));
      }
    },
    onMutate: (item: ContentItem) => {
      const { tmdbId, mediaType } = parseContentItemId(item.id);
      return optimistic((old) =>
        old.some((i) => i.id === tmdbId && i.type === mediaType)
          ? old.filter((i) => !(i.id === tmdbId && i.type === mediaType))
          : [optimisticWatchlistItem(item, 'want_to_watch'), ...old],
      );
    },
    onError: (_e, _item, ctx) => rollback(ctx),
    onSettled: invalidate,
  });

  // Mark watched / un-mark — a SINGLE idempotent write. addToWatchlist
  // upserts the row with the target status (inserting it if the title was
  // never listed), so "Mark as Watched" always lands as `watched` instead
  // of racing a separate update against a row that may not exist yet.
  const markWatched = useMutation({
    mutationFn: async ({ item, watched }: { item: ContentItem; watched: boolean }) => {
      const { tmdbId, mediaType } = parseContentItemId(item.id);
      if (watched) {
        await setWatchlistStatus(tmdbId, mediaType, 'want_to_watch');
      } else {
        await addToWatchlist(tmdbId, mediaType, contentItemToMetadata(item), 'watched');
      }
    },
    onMutate: ({ item, watched }: { item: ContentItem; watched: boolean }) => {
      const { tmdbId, mediaType } = parseContentItemId(item.id);
      const next: 'want_to_watch' | 'watched' = watched ? 'want_to_watch' : 'watched';
      return optimistic((old) =>
        old.some((i) => i.id === tmdbId && i.type === mediaType)
          ? old.map((i) =>
              i.id === tmdbId && i.type === mediaType ? { ...i, status: next } : i,
            )
          : [optimisticWatchlistItem(item, next), ...old],
      );
    },
    onError: (_e, _vars, ctx) => rollback(ctx),
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { tmdbId, mediaType } = parseContentItemId(id);
      await removeFromWatchlist(tmdbId, mediaType);
    },
    onSuccess: invalidate,
  });

  return { toggle, markWatched, remove };
}
