import { useState, useEffect, useCallback } from 'react';
import { rankTitles } from '@/lib/recommendations-v2/ranker';
import { buildFilterSets } from '@/lib/recommendations-v2/hardFilters';
import { getV2TasteProfile } from '@/lib/taste-v2/tasteProfileV2';
import { providerIdToServiceId } from '@/lib/adapters/platformAdapter';
import type { ContentItem } from '@/components/ContentCard';

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
      const profile = await getV2TasteProfile();
      if (!profile?.tasteVector) {
        setItems([]);
        return;
      }

      // Convert TMDb provider IDs to Videx service IDs
      const serviceIds: string[] = providerIds
        .map(id => providerIdToServiceId(id))
        .filter(Boolean) as string[];

      const { dismissedIds, thumbsDownIds, watchlistIds, availableTmdbIds } = await buildFilterSets(serviceIds);

      // Determine media type filter from fetchMovies/fetchTV
      const mediaTypeFilter = fetchMovies && !fetchTV ? 'movie' as const
        : !fetchMovies && fetchTV ? 'tv' as const
        : undefined;

      const results = await rankTitles({
        tasteVector: profile.tasteVector,
        availableTmdbIds,
        dismissedIds,
        thumbsDownIds,
        watchlistIds,
        mediaTypeFilter,
        limit: 20,
      });

      setItems(results);
    } catch (error) {
      console.error('[useRecommendations] Error:', error);
    } finally {
      setLoading(false);
    }
  }, [providerStr, fetchMovies, fetchTV, filterGenreStr]);

  useEffect(() => { load(); }, [load]);

  return { items, loading, reload: load };
}
