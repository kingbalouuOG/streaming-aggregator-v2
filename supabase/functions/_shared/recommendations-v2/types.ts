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
  /** ENG-1 Workstream C: exploration-slot pick (rides the wire to the
   *  client; ContentRow tags the impression metadata). */
  exploration?: boolean;
}

// ── Pipeline types ──

export interface MatchedTitle {
  id: number;
  tmdb_id: number;
  title: string;
  media_type: 'movie' | 'tv';
  distance: number;
  /** ENG-1: source interest slot (distance is to THAT centroid). Absent on single-vector path. */
  sourceSlot?: number;
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

/** Viewing-context values stored in profiles.viewing_context.
 *  Strategy v1.8 §3.x. Lives here (not weights.ts) so PipelineContext
 *  can reference it without a circular import, and so the
 *  profiles.viewing_context boundary narrows against this union before
 *  it reaches scoring (IN-PX-27). */
export type ViewingContext =
  | 'solo'
  | 'with_partner'
  | 'with_family'
  | 'with_friends'
  | 'wind_down'
  | 'background'
  | 'focused';

/** Per-interest retrieval input — one row of user_interest_centroids (ENG-1) */
export interface InterestRetrievalInput {
  centroid: number[];
  weight: number;
  slot: number;
}

export interface PipelineInput {
  tasteVector: number[];
  filterSets: FilterSets;
  sliders: SliderState;
  surface: Surface;
  candidateLimit?: number;
  /** ENG-1: non-empty → per-centroid retrieval + weighted interleave;
   *  absent/empty → legacy single-vector retrieval (fallback ladder). */
  interests?: InterestRetrievalInput[];
}

/**
 * Runtime context passed through scoring. Phase 5: feeds the
 * contextual scorer (device, time-of-day, viewing context). Each
 * field is optional — the scorer falls back to neutral 0.5 for any
 * missing component, matching the Phase 4 placeholder behaviour for
 * absent inputs.
 *
 * Time-of-day source-of-truth (Phase 5 plan decision 9): the client
 * computes hourOfDay from new Date().getHours() (local time) and
 * passes it in the render-foryou-rows POST body. The Edge Function
 * reads from the body and falls back to UTC if absent, so the two
 * paths agree on the bucket they computed against.
 */
export interface PipelineContext {
  hourOfDay?: number;
  dayOfWeek?: number;
  devicePlatform?: 'android' | 'ios' | 'web';
  /** profiles.viewing_context narrowed against the ViewingContext union.
   *  Null for legacy users or unknown DB values (IN-PX-27). */
  viewingContext?: ViewingContext | null;
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
  /** True when the ENG-1 multi-interest path built this pool. */
  interleaved?: boolean;
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
  /** Source interest slot on the multi-interest path (ENG-1). */
  sourceSlot?: number;
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
