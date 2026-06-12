/**
 * Recommendations V2 — Title Adapter
 *
 * Converts titles table rows to the ContentItem interface used by all UI components.
 */

import { buildPosterUrl } from '../api/imageUrls';
import { GENRE_NAMES } from '../constants/genres';
import type { ContentItem } from '@/lib/types/content';
import type { TitleRow } from './types';

/** Convert a titles table row to a ContentItem */
export function titleRowToContentItem(row: TitleRow, matchPercentage?: number): ContentItem {
  const genreIds = row.genre_ids || [];
  const primaryGenreId = genreIds[0];
  const genreName = primaryGenreId ? GENRE_NAMES[primaryGenreId] : undefined;

  return {
    id: `${row.media_type}-${row.tmdb_id}`,
    title: row.title,
    image: buildPosterUrl(row.poster_path) || '',
    services: [],  // populated by the UI layer via serviceCache
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
