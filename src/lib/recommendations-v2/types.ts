/**
 * Recommendations V2 — Types
 *
 * Types for the Phase 4 multi-stage ranking pipeline.
 * Extends Phase 3 types with pipeline stages, scored candidates, and row configuration.
 */

import type { ContentItem } from '@/components/ContentCard';
import type { SliderState } from '@/lib/taste-v2/types';
import type { FilterSets } from './hardFilters';

// ── Phase 3 types (preserved for backward compat during transition) ──

/** Input to the Phase 3 ranker (deprecated — use PipelineInput) */
export interface RankerInput {
  tasteVector: number[];
  availableTmdbIds: Set<number>;
  dismissedIds: Set<string>;       // format: "movie-12345" or "tv-12345"
  thumbsDownIds: Set<string>;
  watchlistIds: Set<string>;
  mediaTypeFilter?: 'movie' | 'tv';
  limit?: number;
}

/** Raw row returned by match_titles_by_vector RPC */
export interface MatchedTitle {
  id: number;
  tmdb_id: number;
  title: string;
  media_type: 'movie' | 'tv';
  distance: number;
  /**
   * ENG-1 multi-interest path: the user_interest_centroids slot whose
   * centroid retrieved this candidate (closest source wins on dedupe).
   * `distance` is then the cosine distance to THAT centroid, so the
   * taste score is "cosine to source centroid" by construction.
   * Absent on the single-vector path.
   */
  sourceSlot?: number;
}

// ── Phase 4 extended types ──

/** Title row with full metadata for pipeline scoring */
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
  // Phase 4 additions
  cast_top_5: string[] | null;
  director: string | null;
  rt_score: string | null;          // e.g. "93%"
  imdb_rating: number | null;
}

/** The Phase 3 TitleRow — kept as alias for existing code */
export type TitleRow = Omit<ExtendedTitleRow, 'cast_top_5' | 'director' | 'rt_score' | 'imdb_rating'>;

/** Pipeline surface context */
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

/** Full pipeline input */
export interface PipelineInput {
  tasteVector: number[];
  filterSets: FilterSets;
  sliders: SliderState;
  surface: Surface;
  /** Override candidate limit (default 500) */
  candidateLimit?: number;
  /**
   * ENG-1: interest centroids for multi-interest retrieval. Non-empty →
   * one RPC per centroid (PER_CENTROID_CANDIDATE_LIMIT each), deduped +
   * weight-interleaved. Absent/empty → legacy single-vector retrieval
   * using tasteVector (the fallback ladder for users without centroid
   * rows).
   */
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
  /** 0–23 in the user's local time. Optional; missing → neutral. */
  hourOfDay?: number;
  /** 0=Sunday … 6=Saturday in the user's local time. */
  dayOfWeek?: number;
  /** Capacitor `Device.getInfo().platform`. 'web' for desktop dev. */
  devicePlatform?: 'android' | 'ios' | 'web';
  /** profiles.viewing_context narrowed against the ViewingContext union.
   *  Null for legacy users who completed onboarding before migration 012,
   *  and for any DB value that doesn't match the union (defensive narrowing
   *  in pipelineContext.ts — IN-PX-27). */
  viewingContext?: ViewingContext | null;
}

/** Cached candidate pool from Stage 1 retrieval */
export interface CandidatePool {
  /** Raw matched titles from RPC (sorted by cosine distance ASC on the
   *  single-vector path; weight-interleaved across source pools on the
   *  multi-interest path) */
  matched: MatchedTitle[];
  /** Extended metadata keyed by "media_type-tmdb_id" */
  metadata: Map<string, ExtendedTitleRow>;
  /** Timestamp for cache invalidation */
  fetchedAt: number;
  /** True when the ENG-1 multi-interest path built this pool (eval rig
   *  asserts which path ran). Absent/false = single-vector path. */
  interleaved?: boolean;
}

/** Per-component scores for a single candidate (all normalized 0.0–1.0) */
export interface CandidateScores {
  taste: number;         // cosine similarity (1 - distance/2)
  recency: number;       // surface-dependent decay function
  contextual: number;    // Phase 4: 0.5 placeholder
}

/** A fully scored candidate ready for post-processing */
export interface ScoredCandidate {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  contentKey: string;    // "movie-12345" format
  scores: CandidateScores;
  finalScore: number;    // weighted sum of component scores
  meta: ExtendedTitleRow;
  /** Source interest slot on the multi-interest path (ENG-1) — threads
   *  through to the coverage eval and impression tagging. */
  sourceSlot?: number;
}

/** Stage 2 scoring weights (3 components, sum to 1.0) */
export interface Stage2Weights {
  taste: number;
  recency: number;
  contextual: number;
}

/** Row types for the pipeline */
export type RowType =
  // Home rows
  | 'heroCarousel'
  | 'recentlyAdded'
  | 'trending'
  | 'comingSoon'
  | 'perServiceChart'
  | 'criticallyAcclaimed'
  | 'genreSpotlight'
  // For You rows
  | 'recommendedForYou'
  | 'hiddenGems'
  | 'outsideYourUsual'
  | 'becauseYouWatched'
  | 'moreFromPerson'
  | 'fromYourWatchlist';

/** Per-row configuration passed to row builders */
export interface RowConfig {
  limit?: number;
  /** For becauseYouWatched: the anchor title's tmdb_id */
  anchorTmdbId?: number;
  anchorMediaType?: 'movie' | 'tv';
  /** For moreFromPerson: the person to query */
  personName?: string;
  personType?: 'director' | 'actor';
  /** For perServiceChart: the specific service */
  serviceId?: string;
  /** For genreSpotlight: the genre cluster index */
  clusterIndex?: number;
  /** IDs already shown in other rows (for cross-row dedup) */
  excludeIds?: Set<string>;
  /** Override DEFAULT_MAX_PER_GENRE for this row. Outside Your Usual
      uses a higher value because variety is the row's whole point —
      enforcing strict genre-spread on top of an already-narrow
      bottom-cosine candidate set produces empty rows. */
  maxPerGenre?: number;
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

/** Extended metadata SELECT columns for Supabase queries */
export const EXTENDED_TITLE_SELECT =
  'tmdb_id, media_type, title, poster_path, backdrop_path, overview, ' +
  'release_date, release_year, genre_ids, vote_average, vote_count, ' +
  'popularity, original_language, runtime, ' +
  'cast_top_5, director, rt_score, imdb_rating';

export type { ContentItem };
