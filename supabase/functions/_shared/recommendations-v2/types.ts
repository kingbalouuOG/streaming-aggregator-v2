// Mirror of src/lib/recommendations-v2/types.ts — IN-466 / ADR-011.
// Drift enforced by shared-tree-drift CI check.
//
// Edge-side adjustments vs the client copy:
// - ContentItem is defined locally (not imported from @/components/...)
//   because Edge Functions cannot import React component types. Shape
//   matches src/components/ContentCard exactly — keep in sync if the
//   ContentItem fields ever change.
// - CandidatePool.metadata stays as Map<> to mirror the client copy
//   exactly (every consumer site uses .get()/.set()). The orchestrator
//   converts Map → Record once at the wire boundary because JSON.stringify
//   serialises a Map to "{}".

import type { SliderState } from '../taste-v2/types.ts';
import type { FilterSets } from './hardFilters.ts';

// ── ContentItem (mirrors src/components/ContentCard.tsx) ──

export interface ContentItem {
  id: string;
  title: string;
  image: string;
  services: string[];
  rating?: number;
  year?: number;
  type?: 'movie' | 'tv';
  matchPercentage?: number;
  runtime?: number;
  genre?: string;
  genreIds?: number[];
  originalLanguage?: string;
  popularity?: number;
  voteCount?: number;
}

// ── Pipeline types ──

export interface MatchedTitle {
  id: number;
  tmdb_id: number;
  title: string;
  media_type: 'movie' | 'tv';
  distance: number;
}

export interface ExtendedTitleRow {
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
  cast_top_5: string[] | null;
  director: string | null;
  rt_score: string | null;
  imdb_rating: number | null;
}

export type TitleRow = Omit<ExtendedTitleRow, 'cast_top_5' | 'director' | 'rt_score' | 'imdb_rating'>;

export type Surface = 'home' | 'foryou';

export interface PipelineInput {
  tasteVector: number[];
  filterSets: FilterSets;
  sliders: SliderState;
  surface: Surface;
  candidateLimit?: number;
}

/**
 * Cached candidate pool from Stage 1 retrieval. Mirrors the client type:
 * metadata is a Map<> for in-Edge consumers; the orchestrator serialises
 * to { matched, metadataObj, fetchedAt } at the response boundary.
 */
export interface CandidatePool {
  matched: MatchedTitle[];
  metadata: Map<string, ExtendedTitleRow>;
  fetchedAt: number;
}

export interface CandidateScores {
  taste: number;
  recency: number;
  contextual: number;
}

export interface ScoredCandidate {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  contentKey: string;
  scores: CandidateScores;
  finalScore: number;
  meta: ExtendedTitleRow;
}

export interface Stage2Weights {
  taste: number;
  recency: number;
  contextual: number;
}

export type RowType =
  | 'heroCarousel' | 'recentlyAdded' | 'trending' | 'comingSoon'
  | 'perServiceChart' | 'criticallyAcclaimed' | 'genreSpotlight'
  | 'recommendedForYou' | 'hiddenGems' | 'outsideYourUsual'
  | 'becauseYouWatched' | 'moreFromPerson' | 'fromYourWatchlist';

export interface RowConfig {
  limit?: number;
  anchorTmdbId?: number;
  anchorMediaType?: 'movie' | 'tv';
  personName?: string;
  personType?: 'director' | 'actor';
  serviceId?: string;
  clusterIndex?: number;
  excludeIds?: Set<string>;
  maxPerGenre?: number;
}

export const HIDDEN_GEMS_FILTERS = {
  minPopularity: 2.0,
  maxPopularity: 20,
  minVoteCount: 50,
  minVoteAverage: 7.0,
  maxResults: 15,
  maxPerGenre: 2,
};

export const EXTENDED_TITLE_SELECT =
  'tmdb_id, media_type, title, poster_path, backdrop_path, overview, ' +
  'release_date, release_year, genre_ids, vote_average, vote_count, ' +
  'popularity, original_language, runtime, ' +
  'cast_top_5, director, rt_score, imdb_rating';
