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
// through the SAME shared lib the web useSearch uses. Semantic ("Mode C")
// mood search ships separately via useSemanticSearch (Browse moods, behind
// the search_semantic flag); this hook stays keyword-only.
//
// It also stays CATEGORY-FREE. The hook used to take an All / Movies / TV /
// Docs segment and post-filter its own results by `item.type`, which the
// category pills above the grid drove. Both are gone (recommendation
// 2026-09-08-002 §9.2, Session 4): media type is `BrowseFilters.contentType`
// now, applied where the results actually come from — client-side over Mode
// A's list, `with_genres`/endpoint choice on /discover, and server-side on
// the semantic RPC. The pills only ever reached the first of those, so on the
// described route they were a control that did nothing (device testing
// 2026-09-09). Filtering by `item.type` was also the §0.2 documentary bug in
// its original habitat: the adapters overwrite `type` with 'doc', so a Docs
// segment hid every documentary series while "TV" hid documentary films.

async function runSearch(query: string): Promise<ContentItem[]> {
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
  return reRankSearchResults([...merged.values()], cleanQuery);
}

export function useSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['native', 'search', q],
    queryFn: () => runSearch(q),
    enabled: q.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}
