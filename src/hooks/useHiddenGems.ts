import { useState, useEffect, useCallback } from 'react';
import { generateHiddenGems, type Recommendation } from '@/lib/utils/recommendationEngine';
import { buildPosterUrl } from '@/lib/api/tmdb';
import type { ContentItem } from '@/components/ContentCard';

function gemToContentItem(rec: Recommendation): ContentItem {
  return {
    id: `${rec.type}-${rec.id}`,
    title: rec.metadata.title,
    image: buildPosterUrl(rec.metadata.posterPath) || '',
    services: [],
    rating: rec.metadata.voteAverage || undefined,
    year: rec.metadata.releaseDate ? parseInt(rec.metadata.releaseDate.substring(0, 4), 10) : undefined,
    type: rec.type === 'tv' ? 'tv' : 'movie',
  };
}

export function useHiddenGems(providerIds: number[]) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const providerStr = providerIds.join(',');

  const load = useCallback(async () => {
    if (!providerStr) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const gems = await generateHiddenGems(providerIds, 'GB');
      setItems(gems.map(gemToContentItem));
    } catch (error) {
      console.error('[useHiddenGems] Error:', error);
    } finally {
      setLoading(false);
    }
  }, [providerStr]);

  useEffect(() => { load(); }, [load]);

  return { items, loading, reload: load };
}
