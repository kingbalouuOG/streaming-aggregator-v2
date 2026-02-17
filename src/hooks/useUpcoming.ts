import { useState, useEffect, useCallback } from 'react';
import { discoverMovies, discoverTV, buildPosterUrl } from '@/lib/api/tmdb';
import type { ServiceId } from '@/components/platformLogos';

export interface UpcomingRelease {
  id: string;
  tmdbId: number;
  title: string;
  image: string;
  releaseDate: string;
  type: 'movie' | 'tv';
  genre: string;
  genreIds: number[];
  services: ServiceId[];
  overview: string;
  rating?: number;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function useUpcoming(providerIds: number[], fetchMovies = true, fetchTV = true) {
  const [items, setItems] = useState<UpcomingRelease[]>([]);
  const [loading, setLoading] = useState(true);

  const providerStr = providerIds.join(',');

  const load = useCallback(async () => {
    if (!providerStr) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const today = new Date();
      const todayStr = formatDate(today);
      const future = new Date(today);
      future.setDate(future.getDate() + 30);
      const futureStr = formatDate(future);

      const providerPipe = providerStr.replace(/,/g, '|');

      const [moviesRes, tvRes] = await Promise.all([
        fetchMovies ? discoverMovies({
          'primary_release_date.gte': todayStr,
          'primary_release_date.lte': futureStr,
          with_watch_providers: providerPipe,
          watch_region: 'GB',
          sort_by: 'primary_release_date.asc',
        }) : Promise.resolve({ data: { results: [] } }),
        fetchTV ? discoverTV({
          'first_air_date.gte': todayStr,
          'first_air_date.lte': futureStr,
          with_watch_providers: providerPipe,
          watch_region: 'GB',
          sort_by: 'first_air_date.asc',
        }) : Promise.resolve({ data: { results: [] } }),
      ]);

      const movies: UpcomingRelease[] = (moviesRes.data?.results || []).map((m: any) => ({
        id: `movie-${m.id}`,
        tmdbId: m.id,
        title: m.title || 'Untitled',
        image: buildPosterUrl(m.poster_path) || '',
        releaseDate: m.release_date || todayStr,
        type: 'movie' as const,
        genre: m.genre_ids?.[0] ? getGenreShort(m.genre_ids[0]) : '',
        genreIds: m.genre_ids || [],
        services: [] as ServiceId[],
        overview: m.overview || '',
        rating: m.vote_average || undefined,
      }));

      const tv: UpcomingRelease[] = (tvRes.data?.results || []).map((t: any) => ({
        id: `tv-${t.id}`,
        tmdbId: t.id,
        title: t.name || t.title || 'Untitled',
        image: buildPosterUrl(t.poster_path) || '',
        releaseDate: t.first_air_date || todayStr,
        type: 'tv' as const,
        genre: t.genre_ids?.[0] ? getGenreShort(t.genre_ids[0]) : '',
        genreIds: t.genre_ids || [],
        services: [] as ServiceId[],
        overview: t.overview || '',
        rating: t.vote_average || undefined,
      }));

      const merged = [...movies, ...tv].sort(
        (a, b) => new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime()
      );

      setItems(merged);
    } catch (error) {
      console.error('[useUpcoming] Error:', error);
    } finally {
      setLoading(false);
    }
  }, [providerStr, fetchMovies, fetchTV]);

  useEffect(() => { load(); }, [load]);

  return { items, loading, reload: load };
}

const GENRE_SHORT: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Doc', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  53: 'Thriller', 10752: 'War', 37: 'Western', 10759: 'Action', 10762: 'Kids',
  10764: 'Reality', 10767: 'Talk', 10768: 'Politics',
};

function getGenreShort(id: number): string {
  return GENRE_SHORT[id] || '';
}
