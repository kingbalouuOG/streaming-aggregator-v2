/**
 * Recommendations V2 — Types
 *
 * Types for the minimal Stage-1-only ranker.
 */

import type { ContentItem } from '@/components/ContentCard';

/** Input to the ranker */
export interface RankerInput {
  tasteVector: number[];
  userServiceIds: string[];
  dismissedIds: Set<string>;       // format: "movie-12345" or "tv-12345"
  thumbsDownIds: Set<string>;      // same format
  watchlistIds: Set<string>;       // same format
  mediaTypeFilter?: 'movie' | 'tv'; // optional content-mix filter
  limit?: number;                   // default 20
}

/** Raw row returned by match_titles_by_vector RPC */
export interface MatchedTitle {
  id: number;
  tmdb_id: number;
  title: string;
  media_type: 'movie' | 'tv';
  distance: number;
}

/** Extended title row with metadata (fetched separately) */
export interface TitleRow {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  release_date: string | null;
  release_year: number | null;
  genre_ids: number[] | null;
  vote_average: number | null;
  vote_count: number | null;
  popularity: number | null;
  original_language: string | null;
  runtime: number | null;
}

/** Hidden Gems filter thresholds */
export const HIDDEN_GEMS_FILTERS = {
  minPopularity: 2.0,
  maxPopularity: 20,
  minVoteCount: 50,
  minVoteAverage: 7.0,
  maxResults: 15,
  maxPerGenre: 2,
};

export type { ContentItem };
