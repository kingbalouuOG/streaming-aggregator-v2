import { useQuery } from '@tanstack/react-query';

import {
  tmdbMovieToContentItem,
  tmdbTVToContentItem,
  type TMDbContentResult,
} from '@/lib/adapters/contentAdapter';
import { searchTitlesByText } from '@/lib/api/supabaseContent';
import { searchMovies, searchTV } from '@/lib/api/tmdb';
import type { ContentItem } from '@/lib/types/content';
import { extractYearFromQuery, reRankSearchResults } from '@/lib/utils/searchUtils';

// Native keyword search (NATIVE-2 W5b) — Mode A: TMDb /search/movie +
// /search/tv in parallel with a Postgres ILIKE pass, merged + re-ranked
// through the SAME shared lib the web useSearch uses. Mode C (semantic
// mood chips) and the full filter sheet are deferred.

export type SearchCategory = 'All' | 'Movies' | 'TV' | 'Docs';

async function runSearch(query: string, category: SearchCategory): Promise<ContentItem[]> {
  const { cleanQuery, year } = extractYearFromQuery(query);

  const [moviesRes, tvRes, postgres] = await Promise.all([
    searchMovies(cleanQuery, 1, year),
    searchTV(cleanQuery, 1, year),
    searchTitlesByText(cleanQuery, 20).catch(() => [] as ContentItem[]),
  ]);

  const movieItems = ((moviesRes.data?.results ?? []) as TMDbContentResult[]).map(
    tmdbMovieToContentItem,
  );
  const tvItems = ((tvRes.data?.results ?? []) as TMDbContentResult[]).map(tmdbTVToContentItem);

  // Dedupe by content id (Postgres + TMDb may overlap), then re-rank by
  // relevance to the cleaned query.
  const merged = new Map<string, ContentItem>();
  for (const item of [...postgres, ...movieItems, ...tvItems]) {
    if (!merged.has(item.id)) merged.set(item.id, item);
  }
  let items = reRankSearchResults([...merged.values()], cleanQuery);

  if (category === 'Movies') items = items.filter((i) => i.type === 'movie');
  else if (category === 'TV') items = items.filter((i) => i.type === 'tv');
  else if (category === 'Docs') items = items.filter((i) => i.type === 'doc');

  return items;
}

export function useSearch(query: string, category: SearchCategory) {
  const q = query.trim();
  return useQuery({
    queryKey: ['native', 'search', q, category],
    queryFn: () => runSearch(q, category),
    enabled: q.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}
