import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getMovieDetails,
  getTVDetails,
  getSimilarMovies,
  getSimilarTV,
  getMovieRecommendations,
  getTVRecommendations,
  discoverMovies,
  discoverTV,
} from '@/lib/api/tmdb';
import { getRatings, type RatingsData } from '@/lib/api/omdb';
import { getStreamingLinks, type StreamingLink } from '@/lib/api/supabaseContent';
import { buildDetailData, type DetailData, type TMDbDetailResponse } from '@/lib/adapters/detailAdapter';
import { tmdbMovieToContentItem, tmdbTVToContentItem, type TMDbContentResult } from '@/lib/adapters/contentAdapter';
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

/**
 * TMDb detail payload fields this hook reads beyond the adapter's view.
 * The API client returns the raw TMDb response (untyped); this captures
 * exactly the extra fields the legacy orchestration accessed.
 */
interface TMDbDetailFull extends TMDbDetailResponse {
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
  genres?: Array<{ id: number; name: string }>;
  genre_ids?: number[];
}

interface TMDbListResponse {
  results?: TMDbContentResult[];
}

/**
 * Detail-page data, served through TanStack Query (PLAT-1).
 *
 * Query graph (parallelism preserved from the legacy orchestration):
 * - ['tmdb','detail',mediaType,tmdbId]  — fires immediately
 * - ['sa','links',mediaType,tmdbId]     — fires immediately, CONCURRENT with
 *   the TMDb detail fetch (the ENG-era 200-400ms win; not chained)
 * - ['tmdb','similar'|'recommendations',mediaType,tmdbId] — independent of detail
 * - ['omdb','ratings',imdbId]           — enabled: needs imdb_id from detail
 * - ['tmdb','discover',…]               — enabled: needs genres/rating from detail
 *
 * The final assembly (embedding batch query + taste-vector scoring) is not a
 * cached query — it ran fresh on every open in the legacy hook and still does.
 */
export function useContentDetail(contentItemId: string | null, userPlatformIds?: number[]) {
  const [state, setState] = useState<ContentDetailState>({
    detail: null,
    similar: [],
    loading: false,
    error: null,
  });
  const [pipelineRun, setPipelineRun] = useState(0);
  const runIdRef = useRef(0);

  const parsed = useMemo(() => {
    if (!contentItemId) return null;
    const [type, idStr] = contentItemId.split('-');
    const tmdbId = parseInt(idStr, 10);
    return { mediaType: type as 'movie' | 'tv', tmdbId, valid: !Number.isNaN(tmdbId) };
  }, [contentItemId]);

  const mediaType: 'movie' | 'tv' = parsed?.mediaType ?? 'movie';
  const tmdbId = parsed?.tmdbId ?? 0;
  const queriesEnabled = !!parsed && parsed.valid;

  // TMDb detail (credits, providers, external_ids appended)
  const detailQuery = useQuery({
    queryKey: ['tmdb', 'detail', mediaType, tmdbId],
    enabled: queriesEnabled,
    queryFn: async (): Promise<TMDbDetailFull> => {
      const detailFn = mediaType === 'movie' ? getMovieDetails : getTVDetails;
      const res = await detailFn(tmdbId);
      // cachedRequest never rejects: failures surface as success:false with a
      // null data fallback. The legacy hook mapped both cases to the same
      // 'Content not found' error — keep that exact message.
      if (!res.success || !res.data) throw new Error('Content not found');
      return res.data as TMDbDetailFull;
    },
  });

  // Supabase streaming links — independent of the TMDb detail fetch.
  const linksQuery = useQuery({
    queryKey: ['sa', 'links', mediaType, tmdbId],
    enabled: queriesEnabled,
    queryFn: (): Promise<StreamingLink[]> => getStreamingLinks(tmdbId, mediaType),
  });

  const detailData = detailQuery.data;
  const imdbId = detailData ? detailData.external_ids?.imdb_id || detailData.imdb_id || null : null;

  // OMDB ratings — genuinely depends on imdb_id from the TMDb detail.
  const omdbQuery = useQuery({
    queryKey: ['omdb', 'ratings', imdbId],
    enabled: queriesEnabled && !!imdbId,
    queryFn: async (): Promise<RatingsData> => {
      if (!imdbId) throw new Error('IMDb ID is required');
      const res = await getRatings(imdbId, mediaType);
      if (!res.success) throw new Error(res.error || 'Ratings unavailable');
      return res.data;
    },
  });

  // Similar + recommendations — only need the tmdbId, so they are
  // independent queries (no invented dependency on the detail fetch).
  const similarQuery = useQuery({
    queryKey: ['tmdb', 'similar', mediaType, tmdbId],
    enabled: queriesEnabled,
    queryFn: async (): Promise<TMDbListResponse> => {
      const fn = mediaType === 'movie' ? getSimilarMovies : getSimilarTV;
      const res = await fn(tmdbId);
      if (!res.success) throw new Error(res.error || 'Similar fetch failed');
      return res.data;
    },
  });

  const recoQuery = useQuery({
    queryKey: ['tmdb', 'recommendations', mediaType, tmdbId],
    enabled: queriesEnabled,
    queryFn: async (): Promise<TMDbListResponse> => {
      const fn = mediaType === 'movie' ? getMovieRecommendations : getTVRecommendations;
      const res = await fn(tmdbId);
      if (!res.success) throw new Error(res.error || 'Recommendations fetch failed');
      return res.data;
    },
  });

  // Discover candidates — params derive from the detail's genres/rating, so
  // this is a real dependency (enabled-gated), exactly as before.
  const sourceGenres: number[] = detailData
    ? detailData.genres?.map((g) => g.id) || detailData.genre_ids || []
    : [];
  const sourceRating: number = detailData?.vote_average || 0;
  const topGenres = sourceGenres.slice(0, 2);
  const minRating = Math.max(5.0, sourceRating - 1.5);

  const discoverQuery = useQuery({
    // Keyed by the derived params (not the source title) so titles sharing
    // genre/rating combos share the cached discover page — mirrors the old
    // params-hashed cache.ts key.
    queryKey: ['tmdb', 'discover', mediaType, topGenres.join(','), minRating],
    enabled: queriesEnabled && !!detailData,
    queryFn: async (): Promise<TMDbListResponse> => {
      const discoverParams: Record<string, unknown> = {
        with_genres: topGenres.join(','),
        'vote_average.gte': minRating,
        'vote_count.gte': 50,
        sort_by: 'vote_average.desc',
      };
      const fn = mediaType === 'movie' ? discoverMovies : discoverTV;
      const res = await fn(discoverParams);
      if (!res.success) throw new Error(res.error || 'Discover fetch failed');
      return res.data;
    },
  });

  // Everything buildDetailData needs has settled (success OR error — the
  // legacy Promise.allSettled tolerance: omdb/links/candidate failures
  // degrade gracefully rather than failing the page).
  const allSettled =
    detailQuery.isError ||
    (detailQuery.isSuccess &&
      (linksQuery.isSuccess || linksQuery.isError) &&
      (!imdbId || omdbQuery.isSuccess || omdbQuery.isError) &&
      (similarQuery.isSuccess || similarQuery.isError) &&
      (recoQuery.isSuccess || recoQuery.isError) &&
      (discoverQuery.isSuccess || discoverQuery.isError));

  const platformKey = userPlatformIds?.join(',');

  useEffect(() => {
    if (!contentItemId || !parsed) return;

    if (!parsed.valid) {
      setState({ detail: null, similar: [], loading: false, error: 'Invalid content ID' });
      return;
    }

    if (detailQuery.isError) {
      const message =
        detailQuery.error instanceof Error && detailQuery.error.message
          ? detailQuery.error.message
          : 'Failed to load details';
      setState({ detail: null, similar: [], loading: false, error: message });
      return;
    }

    // Still fetching — mirror the legacy single loading flag that stayed true
    // until the entire pipeline (including scoring) finished.
    setState((s) => ({ ...s, loading: true, error: null }));
    if (!allSettled || !detailData) return;

    const runId = ++runIdRef.current;
    const omdbRatings = omdbQuery.data;
    const streamingLinks = linksQuery.data;
    const similarItems = similarQuery.data?.results || [];
    const recoItems = recoQuery.data?.results || [];
    const discoverItems = discoverQuery.data?.results || [];

    const assemble = async () => {
      try {
        const detail = buildDetailData(detailData, mediaType, omdbRatings, streamingLinks, userPlatformIds);

        // Merge and deduplicate — similar > recommendations > discover priority
        const seen = new Set<number>();
        seen.add(tmdbId);
        const mergedCandidates: TMDbContentResult[] = [];
        for (const item of [...similarItems, ...recoItems, ...discoverItems]) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            mergedCandidates.push(item);
          }
        }

        // --- V2 batch query pattern (Phase 1 locked) ---
        // Batch-fetch 1536D embeddings for all candidates + source title
        const candidateIds = mergedCandidates.map((c) => c.id);
        const allTmdbIds = [tmdbId, ...candidateIds];

        const { data: embeddingRows } = await supabase
          .from('titles')
          .select('tmdb_id, media_type, embedding')
          .in('tmdb_id', allTmdbIds)
          .not('embedding', 'is', null);

        // Build embedding lookup: JSON.parse(row.embedding as string) — Phase 1 locked pattern.
        // The .not('embedding', 'is', null) filter on the query guarantees embedding is non-null
        // at runtime; the schema column is nullable so TS still widens to `unknown | null`.
        const embeddingMap = new Map<string, number[]>();
        for (const row of embeddingRows ?? []) {
          if (row.embedding == null) continue;
          const emb: number[] = typeof row.embedding === 'string'
            ? JSON.parse(row.embedding)
            : (row.embedding as number[]);
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
          .map((item) => {
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

        if (runId !== runIdRef.current) return;
        setState({ detail, similar, loading: false, error: null });
        emitDetailView(tmdbId, mediaType, detail.title);
      } catch (err) {
        if (runId !== runIdRef.current) return;
        const message = err instanceof Error && err.message ? err.message : 'Failed to load details';
        setState((s) => ({ ...s, loading: false, error: message }));
      }
    };

    void assemble();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    contentItemId,
    parsed,
    platformKey,
    allSettled,
    detailData,
    detailQuery.isError,
    omdbQuery.data,
    linksQuery.data,
    similarQuery.data,
    recoQuery.data,
    discoverQuery.data,
    pipelineRun,
  ]);

  // Legacy reload re-ran the full load(); within cache TTLs every request was
  // served from cache (failures were never cached). Mirror that: refetch only
  // the queries in error state, then re-run the assembly pipeline.
  const reload = useCallback(async () => {
    const queries = [detailQuery, linksQuery, omdbQuery, similarQuery, recoQuery, discoverQuery];
    await Promise.all(queries.filter((q) => q.isError).map((q) => q.refetch()));
    setPipelineRun((c) => c + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    contentItemId,
    platformKey,
    detailQuery.isError,
    linksQuery.isError,
    omdbQuery.isError,
    similarQuery.isError,
    recoQuery.isError,
    discoverQuery.isError,
  ]);

  return { ...state, reload };
}
