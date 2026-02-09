import { useState, useEffect, useCallback } from 'react';
import { getMovieDetails, getTVDetails, getSimilarMovies, getSimilarTV } from '@/lib/api/tmdb';
import { getRatings } from '@/lib/api/omdb';
import { getTitlePrices } from '@/lib/api/watchmode';
import { buildDetailData, type DetailData } from '@/lib/adapters/detailAdapter';
import { tmdbMovieToContentItem, tmdbTVToContentItem } from '@/lib/adapters/contentAdapter';
import type { ContentItem } from '@/components/ContentCard';

interface ContentDetailState {
  detail: DetailData | null;
  similar: ContentItem[];
  loading: boolean;
  error: string | null;
}

export function useContentDetail(contentItemId: string | null, userPlatformIds?: number[]) {
  const [state, setState] = useState<ContentDetailState>({
    detail: null,
    similar: [],
    loading: false,
    error: null,
  });

  const load = useCallback(async () => {
    if (!contentItemId) return;

    const [type, idStr] = contentItemId.split('-');
    const tmdbId = parseInt(idStr, 10);
    const mediaType = type as 'movie' | 'tv';

    if (isNaN(tmdbId)) {
      setState({ detail: null, similar: [], loading: false, error: 'Invalid content ID' });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      // Fetch TMDb detail with credits and providers appended
      const detailFn = mediaType === 'movie' ? getMovieDetails : getTVDetails;
      const detailResponse = await detailFn(tmdbId);
      const tmdbDetail = detailResponse.data;

      if (!tmdbDetail) {
        setState({ detail: null, similar: [], loading: false, error: 'Content not found' });
        return;
      }

      // Fetch OMDB ratings and WatchMode prices in parallel (non-blocking)
      const imdbId = tmdbDetail.external_ids?.imdb_id || tmdbDetail.imdb_id;
      const [omdbResult, watchModePrices] = await Promise.allSettled([
        imdbId ? getRatings(imdbId, mediaType) : Promise.resolve(null),
        getTitlePrices(tmdbId, mediaType),
      ]);

      const omdbRatings = omdbResult.status === 'fulfilled' && omdbResult.value?.success
        ? omdbResult.value.data
        : undefined;

      const prices = watchModePrices.status === 'fulfilled'
        ? watchModePrices.value
        : undefined;

      const detail = buildDetailData(tmdbDetail, mediaType, omdbRatings, prices, userPlatformIds);

      // Fetch similar content with match scoring
      const similarFn = mediaType === 'movie' ? getSimilarMovies : getSimilarTV;
      const similarResponse = await similarFn(tmdbId);
      const sourceGenres: number[] = tmdbDetail.genres?.map((g: any) => g.id) || tmdbDetail.genre_ids || [];
      const sourceRating: number = tmdbDetail.vote_average || 0;

      const similar = (similarResponse.data?.results || [])
        .map((item: any) => {
          const itemGenres: number[] = item.genre_ids || [];
          const genreOverlap = sourceGenres.length > 0
            ? itemGenres.filter((g: number) => sourceGenres.includes(g)).length / sourceGenres.length
            : 0;
          const ratingProximity = 1 - Math.abs((item.vote_average || 0) - sourceRating) / 10;
          const popularityFactor = Math.min((item.popularity || 0) / 100, 1);
          const matchScore = Math.round((genreOverlap * 0.6 + ratingProximity * 0.2 + popularityFactor * 0.2) * 100);

          const contentItem = mediaType === 'movie' ? tmdbMovieToContentItem(item) : tmdbTVToContentItem(item);
          contentItem.matchPercentage = Math.max(0, Math.min(100, matchScore));
          return contentItem;
        })
        .sort((a: ContentItem, b: ContentItem) => (b.matchPercentage || 0) - (a.matchPercentage || 0))
        .slice(0, 10);

      setState({ detail, similar, loading: false, error: null });
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false, error: err.message || 'Failed to load details' }));
    }
  }, [contentItemId, userPlatformIds?.join(',')]);

  useEffect(() => { load(); }, [load]);

  return { ...state, reload: load };
}
