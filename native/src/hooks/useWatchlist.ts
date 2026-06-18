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

export function useWatchlistMutations() {
  const qc = useQueryClient();
  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: WATCHLIST_KEY }), [qc]);

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
    onSuccess: invalidate,
  });

  const setStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: 'want_to_watch' | 'watched';
    }) => {
      const { tmdbId, mediaType } = parseContentItemId(id);
      await setWatchlistStatus(tmdbId, mediaType, status);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { tmdbId, mediaType } = parseContentItemId(id);
      await removeFromWatchlist(tmdbId, mediaType);
    },
    onSuccess: invalidate,
  });

  return { toggle, setStatus, remove };
}
