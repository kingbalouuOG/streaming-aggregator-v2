// Mirror of src/lib/recommendations-v2/titleAdapter.ts — IN-466 / ADR-011.
//
// Edge-side adjustments vs the client copy:
// - GENRE_NAMES is imported from _shared/genreNames.ts (existing pre-IN-466)
//   instead of @/lib/constants/genres.
// - buildPosterUrl is inlined (one line of string concat) — no client TMDb
//   module to import from.
// - ContentItem is the local type from ./types.ts (mirrors the client
//   component shape).

import { GENRE_NAMES } from '../genreNames.ts';
import type { ContentItem, TitleRow } from './types.ts';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

function buildPosterUrl(path: string | null, size = 'w342'): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function titleRowToContentItem(row: TitleRow, matchPercentage?: number): ContentItem {
  const genreIds = row.genre_ids || [];
  const primaryGenreId = genreIds[0];
  const genreName = primaryGenreId ? GENRE_NAMES[primaryGenreId] : undefined;

  return {
    id: `${row.media_type}-${row.tmdb_id}`,
    title: row.title,
    image: buildPosterUrl(row.poster_path) || '',
    services: [],
    rating: row.vote_average ?? undefined,
    year: row.release_year ?? undefined,
    type: row.media_type,
    matchPercentage,
    runtime: row.runtime ?? undefined,
    genre: genreName,
    genreIds,
    originalLanguage: row.original_language ?? undefined,
    popularity: row.popularity ?? undefined,
    voteCount: row.vote_count ?? undefined,
  };
}
