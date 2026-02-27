import { useState, useEffect, useCallback } from 'react';
import { generateRecommendations, type Recommendation } from '@/lib/utils/recommendationEngine';
import { buildPosterUrl } from '@/lib/api/tmdb';
import type { ContentItem } from '@/components/ContentCard';

function recommendationToContentItem(rec: Recommendation): ContentItem {
  return {
    id: `${rec.type}-${rec.id}`,
    title: rec.metadata.title,
    image: buildPosterUrl(rec.metadata.posterPath) || '',
    services: [],
    rating: rec.metadata.voteAverage || undefined,
    year: rec.metadata.releaseDate ? parseInt(rec.metadata.releaseDate.substring(0, 4), 10) : undefined,
    type: rec.type === 'tv' ? 'tv' : 'movie',
    language: rec.metadata.originalLanguage,
  };
}

export function useRecommendations(
  providerIds: number[],
  fetchMovies = true,
  fetchTV = true,
  filterGenreIds: number[] = [],
) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const providerStr = providerIds.join(',');
  const filterGenreStr = filterGenreIds.join(',');

  const load = useCallback(async () => {
    if (!providerStr) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const filterOpts = { fetchMovies, fetchTV, filterGenreIds };
      const recommendations = await generateRecommendations(providerIds, 'GB', filterOpts);
      setItems(recommendations.map(recommendationToContentItem));
    } catch (error) {
      console.error('[useRecommendations] Error:', error);
    } finally {
      setLoading(false);
    }
  }, [providerStr, fetchMovies, fetchTV, filterGenreStr]);

  useEffect(() => { load(); }, [load]);

  return { items, loading, reload: load };
}
