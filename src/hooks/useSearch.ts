import { useState, useCallback, useRef, useEffect } from 'react';
import { searchMulti } from '@/lib/api/tmdb';
import { tmdbSearchResultToContentItem, parseContentItemId } from '@/lib/adapters/contentAdapter';
import { getCachedServices } from '@/lib/utils/serviceCache';
import type { ContentItem } from '@/components/ContentCard';
import type { ServiceId } from '@/components/platformLogos';
import { API_CONFIG } from '@/lib/constants/config';

export function useSearch(userServices?: ServiceId[]) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Stabilize dependency to avoid infinite re-renders
  const servicesKey = userServices?.join(',') || '';

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await searchMulti(q.trim());
      const rawItems = (response.data?.results || [])
        .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
        .map(tmdbSearchResultToContentItem);

      // Post-filter by service availability (TMDb search doesn't support with_watch_providers)
      if (userServices?.length) {
        const checked = await Promise.all(
          rawItems.map(async (item) => {
            const { tmdbId, mediaType } = parseContentItemId(item.id);
            const allServices = await getCachedServices(String(tmdbId), mediaType);
            const matching = allServices.filter((s) => userServices.includes(s));
            return matching.length > 0 ? { ...item, services: matching } : null;
          }),
        );
        setResults(checked.filter((item): item is ContentItem => item !== null));
      } else {
        setResults(rawItems);
      }
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [servicesKey]);

  // Debounced query effect
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(() => {
      search(query);
    }, API_CONFIG.DEBOUNCE_DELAY_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setError(null);
  }, []);

  return { query, setQuery, results, loading, error, clearSearch };
}
