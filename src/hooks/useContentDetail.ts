import { useState, useEffect, useCallback } from 'react';
import { getMovieDetails, getTVDetails, getSimilarMovies, getSimilarTV, getMovieRecommendations, getTVRecommendations, discoverMovies, discoverTV } from '@/lib/api/tmdb';
import { getRatings } from '@/lib/api/omdb';
import { getTitlePrices } from '@/lib/api/watchmode';
import { buildDetailData, type DetailData } from '@/lib/adapters/detailAdapter';
import { tmdbMovieToContentItem, tmdbTVToContentItem } from '@/lib/adapters/contentAdapter';
import { contentToVector } from '@/lib/taste/contentVectorMapping';
import { cosineSimilarity, DIMENSION_WEIGHTS } from '@/lib/taste/tasteVector';
import { getTasteProfile } from '@/lib/storage/tasteProfile';
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

      // Extract source characteristics (needed for discover params + scoring)
      const sourceGenres: number[] = tmdbDetail.genres?.map((g: any) => g.id) || tmdbDetail.genre_ids || [];
      const sourceRating: number = tmdbDetail.vote_average || 0;

      // Fetch candidates from 3 sources in parallel — graceful degradation if any fails
      const similarFn = mediaType === 'movie' ? getSimilarMovies : getSimilarTV;
      const recoFn = mediaType === 'movie' ? getMovieRecommendations : getTVRecommendations;
      const discoverFn = mediaType === 'movie' ? discoverMovies : discoverTV;

      const topGenres = sourceGenres.slice(0, 2);
      const minRating = Math.max(5.0, sourceRating - 1.5);
      const discoverParams: Record<string, unknown> = {
        with_genres: topGenres.join(','),
        'vote_average.gte': minRating,
        'vote_count.gte': 50,
        sort_by: 'vote_average.desc',
      };

      const [similarResult, recoResult, discoverResult] = await Promise.allSettled([
        similarFn(tmdbId),
        recoFn(tmdbId),
        discoverFn(discoverParams),
      ]);

      // Merge and deduplicate — similar > recommendations > discover priority
      const similarItems = similarResult.status === 'fulfilled' ? (similarResult.value.data?.results || []) : [];
      const recoItems = recoResult.status === 'fulfilled' ? (recoResult.value.data?.results || []) : [];
      const discoverItems = discoverResult.status === 'fulfilled' ? (discoverResult.value.data?.results || []) : [];

      const seen = new Set<number>();
      seen.add(tmdbId);
      const mergedCandidates: any[] = [];
      for (const item of [...similarItems, ...recoItems, ...discoverItems]) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          mergedCandidates.push(item);
        }
      }

      // Build source content vector for similarity comparison
      const releaseDate = tmdbDetail.release_date || tmdbDetail.first_air_date;
      const sourceVector = contentToVector({
        genreIds: sourceGenres,
        popularity: tmdbDetail.popularity,
        voteCount: tmdbDetail.vote_count,
        releaseYear: releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : null,
        originalLanguage: tmdbDetail.original_language,
      });

      // Load taste profile for personalized blending (fire-and-forget on failure)
      let tasteVector = null;
      let confidence = undefined;
      try {
        const profile = await getTasteProfile();
        if (profile?.vector) {
          tasteVector = profile.vector;
          confidence = profile.confidence;
        }
      } catch { /* pre-quiz users won't have a profile */ }

      const sourceLang = tmdbDetail.original_language || 'en';
      const sourcePrimaryGenre = sourceGenres[0] ?? null;

      const similar = mergedCandidates
        .map((item: any) => {
          const itemGenres: number[] = item.genre_ids || [];
          const itemReleaseDate = item.release_date || item.first_air_date;
          const candidateVector = contentToVector({
            genreIds: itemGenres,
            popularity: item.popularity,
            voteCount: item.vote_count,
            releaseYear: itemReleaseDate ? parseInt(itemReleaseDate.slice(0, 4), 10) : null,
            originalLanguage: item.original_language,
          });

          // 1. Vector similarity (tone, genre weight, pacing, etc.) — 0-100 scale
          const sourceSimilarity = cosineSimilarity(sourceVector, candidateVector);

          // 2. Classic genre overlap — shared genres / total unique genres
          const sharedGenres = itemGenres.filter((g) => sourceGenres.includes(g));
          const totalUnique = new Set([...sourceGenres, ...itemGenres]).size;
          const genreOverlap = totalUnique > 0 ? (sharedGenres.length / totalUnique) * 100 : 0;

          // 3. Primary genre bonus/penalty
          let primaryGenreBonus = 0;
          if (sourcePrimaryGenre !== null) {
            if (itemGenres.includes(sourcePrimaryGenre)) primaryGenreBonus = 15;
            else if (sharedGenres.length === 0) primaryGenreBonus = -20;
          }

          // 4. Language affinity — same language no change, different language penalty
          const langBonus = (item.original_language || 'en') === sourceLang ? 0 : -10;

          // 5. Rating proximity — how close in quality tier (0-10 scale)
          const ratingProximity = 1 - Math.abs((item.vote_average || 0) - sourceRating) / 10;

          let matchScore: number;
          if (tasteVector) {
            // Zero out era weight — detail page should match on genre/tone, not release era bias
            const detailWeights = { ...DIMENSION_WEIGHTS, era: 0 };
            const tasteSimilarity = cosineSimilarity(tasteVector, candidateVector, detailWeights, confidence);
            matchScore = Math.round(
              sourceSimilarity * 0.5
              + genreOverlap * 0.2
              + tasteSimilarity * 0.2
              + ratingProximity * 10 * 0.1
              + primaryGenreBonus
              + langBonus
            );
          } else {
            const popularityFactor = Math.min((item.popularity || 0) / 100, 1);
            matchScore = Math.round(
              sourceSimilarity * 0.5
              + genreOverlap * 0.3
              + ratingProximity * 10 * 0.1
              + popularityFactor * 100 * 0.1
              + primaryGenreBonus
              + langBonus
            );
          }

          const contentItem = mediaType === 'movie' ? tmdbMovieToContentItem(item) : tmdbTVToContentItem(item);
          // Clamp to [30, 95] — avoids awkward 0% or 100% in UI
          contentItem.matchPercentage = Math.max(30, Math.min(95, matchScore));
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
