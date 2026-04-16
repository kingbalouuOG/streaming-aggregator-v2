import { useState, useEffect, useCallback } from 'react';
import { getMovieDetails, getTVDetails, getSimilarMovies, getSimilarTV, getMovieRecommendations, getTVRecommendations, discoverMovies, discoverTV } from '@/lib/api/tmdb';
import { getRatings } from '@/lib/api/omdb';
import { getStreamingLinks } from '@/lib/api/supabaseContent';
import { buildDetailData, type DetailData } from '@/lib/adapters/detailAdapter';
import { tmdbMovieToContentItem, tmdbTVToContentItem } from '@/lib/adapters/contentAdapter';
import { supabase } from '@/lib/supabase';
import { cosineSimilarity } from '@/lib/taste-v2/vectorOps';
import { getV2TasteProfile } from '@/lib/taste-v2/tasteProfileV2';
import { emitDetailView } from '@/lib/storage/interactions';
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
      // Fire Supabase streaming links immediately (only needs tmdbId + mediaType, no TMDb data)
      const streamingPromise = getStreamingLinks(tmdbId, mediaType);

      // Fetch TMDb detail with credits and providers appended
      const detailFn = mediaType === 'movie' ? getMovieDetails : getTVDetails;
      const detailResponse = await detailFn(tmdbId);
      const tmdbDetail = detailResponse.data;

      if (!tmdbDetail) {
        setState({ detail: null, similar: [], loading: false, error: 'Content not found' });
        return;
      }

      // Fetch OMDB ratings (needs imdb_id from TMDb) + await streaming links (already in-flight)
      const imdbId = tmdbDetail.external_ids?.imdb_id || tmdbDetail.imdb_id;
      const [omdbResult, streamingResult] = await Promise.allSettled([
        imdbId ? getRatings(imdbId, mediaType) : Promise.resolve(null),
        streamingPromise,
      ]);

      const omdbRatings = omdbResult.status === 'fulfilled' && omdbResult.value?.success
        ? omdbResult.value.data
        : undefined;

      const streamingLinks = streamingResult.status === 'fulfilled'
        ? streamingResult.value
        : undefined;

      const detail = buildDetailData(tmdbDetail, mediaType, omdbRatings, streamingLinks, userPlatformIds);

      // Extract source characteristics for discover params
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

      // --- V2 batch query pattern (Phase 1 locked) ---
      // Batch-fetch 1536D embeddings for all candidates + source title
      const candidateIds = mergedCandidates.map((c: any) => c.id);
      const allTmdbIds = [tmdbId, ...candidateIds];

      const { data: embeddingRows } = await supabase
        .from('titles' as any)
        .select('tmdb_id, media_type, embedding')
        .in('tmdb_id', allTmdbIds)
        .not('embedding', 'is', null);

      // Build embedding lookup: JSON.parse(row.embedding as string) — Phase 1 locked pattern
      const embeddingMap = new Map<string, number[]>();
      for (const row of ((embeddingRows as any[]) || [])) {
        const emb: number[] = typeof row.embedding === 'string'
          ? JSON.parse(row.embedding)
          : row.embedding;
        embeddingMap.set(`${row.media_type}-${row.tmdb_id}`, emb);
      }

      const sourceEmbedding = embeddingMap.get(`${mediaType}-${tmdbId}`);

      // Load v2 taste vector for personalized scoring
      let tasteVector: number[] | null = null;
      try {
        const profile = await getV2TasteProfile();
        tasteVector = profile?.tasteVector || null;
      } catch { /* no taste vector yet — use content similarity fallback */ }

      // Score and sort candidates
      const similar = mergedCandidates
        .map((item: any) => {
          // Try both media types since candidate might be movie or tv
          const candidateEmbedding = embeddingMap.get(`movie-${item.id}`)
            || embeddingMap.get(`tv-${item.id}`);

          let matchScore: number;

          if (candidateEmbedding) {
            if (tasteVector) {
              // Personalized: cosine similarity against user's taste vector
              matchScore = cosineSimilarity(tasteVector, candidateEmbedding) * 100;
            } else if (sourceEmbedding) {
              // Content similarity fallback: cosine similarity against source title
              matchScore = cosineSimilarity(sourceEmbedding, candidateEmbedding) * 100;
            } else {
              // No embeddings at all — use rating/popularity heuristic
              matchScore = Math.min(((item.vote_average || 0) / 10) * 80 + 10, 95);
            }
          } else {
            // Candidate has no embedding — TMDb-only heuristic
            matchScore = Math.min(((item.vote_average || 0) / 10) * 80 + 10, 95);
          }

          const contentItem = mediaType === 'movie' ? tmdbMovieToContentItem(item) : tmdbTVToContentItem(item);
          contentItem.matchPercentage = Math.max(30, Math.min(95, Math.round(matchScore)));
          return contentItem;
        })
        .sort((a: ContentItem, b: ContentItem) => (b.matchPercentage || 0) - (a.matchPercentage || 0))
        .slice(0, 10);

      setState({ detail, similar, loading: false, error: null });
      emitDetailView(tmdbId, mediaType, detail.title);
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false, error: err.message || 'Failed to load details' }));
    }
  }, [contentItemId, userPlatformIds?.join(',')]);

  useEffect(() => { load(); }, [load]);

  return { ...state, reload: load };
}
