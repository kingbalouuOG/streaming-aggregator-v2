import { useState, useCallback, useRef, useEffect } from 'react';
import { searchMulti } from '@/lib/api/tmdb';
import { tmdbSearchResultToContentItem } from '@/lib/adapters/contentAdapter';
import type { ContentItem } from '@/components/ContentCard';
import { API_CONFIG } from '@/lib/constants/config';

export function useSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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
      const items = (response.data?.results || [])
        .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
        .map(tmdbSearchResultToContentItem);
      setResults(items);
    } catch (err: any) {
      setError(err.message || 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
