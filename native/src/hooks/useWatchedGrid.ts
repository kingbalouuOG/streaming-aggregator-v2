import { useQuery } from '@tanstack/react-query';

import { buildPosterUrl } from '@/lib/api/imageUrls';
import { supabase } from '@/lib/supabase';

// Watched-grid candidate pool for onboarding Step 3 (NATIVE-3 W3).
// Replicates the web dual-query (OnboardingFlow.tsx): canonical, globally
// popular titles regardless of service — the grid is a taste signal
// ("have you seen this?"), so availability is irrelevant.
//   Movies: vote_count ≥ 5000   TV: vote_count ≥ 1500 + popularity ≥ 20
// Both ordered by vote_count DESC (canon over trending), interleaved 1:1,
// lightly shuffled within each round of 6.

export const TITLES_PER_ROUND = 6;

export interface WatchedGridTitle {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster: string;
  year: number | null;
}

interface TitleRow {
  tmdb_id: number;
  media_type: string;
  title: string;
  poster_path: string | null;
  release_year: number | null;
}

async function fetchWatchedPool(): Promise<WatchedGridTitle[]> {
  const [movieRes, tvRes] = await Promise.all([
    supabase
      .from('titles')
      .select('tmdb_id, media_type, title, poster_path, release_year, vote_count')
      .eq('media_type', 'movie')
      .gte('vote_count', 5000)
      .not('poster_path', 'is', null)
      .not('embedding', 'is', null)
      .order('vote_count', { ascending: false })
      .limit(36),
    supabase
      .from('titles')
      .select('tmdb_id, media_type, title, poster_path, release_year, vote_count')
      .eq('media_type', 'tv')
      .gte('vote_count', 1500)
      .gte('popularity', 20)
      .not('poster_path', 'is', null)
      .not('embedding', 'is', null)
      .order('vote_count', { ascending: false })
      .limit(36),
  ]);

  const toTitle = (t: TitleRow): WatchedGridTitle => ({
    tmdbId: t.tmdb_id,
    mediaType: t.media_type as 'movie' | 'tv',
    title: t.title,
    poster: buildPosterUrl(t.poster_path) ?? '',
    year: t.release_year,
  });
  const movies = ((movieRes.data ?? []) as TitleRow[]).map(toTitle);
  const tv = ((tvRes.data ?? []) as TitleRow[]).map(toTitle);

  // Interleave movies and TV 1:1 so each round mixes both media.
  const balanced: WatchedGridTitle[] = [];
  const maxLen = Math.max(movies.length, tv.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < movies.length) balanced.push(movies[i]);
    if (i < tv.length) balanced.push(tv[i]);
  }

  // Light shuffle within each round of 6 — preserves canon-first ordering
  // across rounds while breaking the deterministic interleave inside one.
  for (let g = 0; g < balanced.length; g += TITLES_PER_ROUND) {
    const end = Math.min(g + TITLES_PER_ROUND, balanced.length);
    for (let i = end - 1; i > g; i--) {
      const j = g + Math.floor(Math.random() * (i - g + 1));
      [balanced[i], balanced[j]] = [balanced[j], balanced[i]];
    }
  }

  return balanced;
}

export function useWatchedGrid() {
  return useQuery({
    queryKey: ['native', 'onboarding', 'watchedGrid'],
    queryFn: fetchWatchedPool,
    staleTime: Infinity, // one pool per onboarding session
  });
}
