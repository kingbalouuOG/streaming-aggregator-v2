/**
 * Taste Vector V2 — Types
 *
 * Core types for the 1536D embedding-space taste vector system.
 * Replaces the v1 24D named-dimension TasteVector.
 */

/** 1536D embedding-space taste vector (positional array, matching pgvector) */
export type TasteVectorV2 = number[];

/** Slider state for recommendation tuning (Phase 4 consumes these) */
export interface SliderState {
  catalogueAge: number;   // 0.0 = new releases only, 1.0 = best match regardless of age
  comfortZone: number;    // 0.0 = stick with what I like, 1.0 = surprise me
  contentMix: number;     // 0.0 = focus on films, 1.0 = focus on TV series
  variety: number;        // 0.0 = finish what I start, 1.0 = try lots of things
}

export const DEFAULT_SLIDERS: SliderState = {
  catalogueAge: 0.5,
  comfortZone: 0.25,  // biased toward comfort per Strategy §5.2
  contentMix: 0.5,
  variety: 0.5,
};

/** Bootstrap source tag for debugging */
export type BootstrapSource =
  | 'onboarding_v2'
  | 'manual_retake'
  | 'services_only';

/** V2 taste profile as read from / written to Supabase */
export interface TasteProfileV2 {
  tasteVector: TasteVectorV2 | null;
  updatedAt: string | null;              // ISO timestamp
  interactionCount: number;
  bootstrappedFrom: BootstrapSource | null;
  sliders: SliderState;
  /**
   * Onboarding cluster picks (Step 4). Used by anchored mood rooms (Tier 2
   * representative ranking) and by the Profile "Your Taste" summary. Empty
   * array means the user hasn't completed Step 4 of onboarding.
   */
  selectedClusters: string[];
}

/** Maximum interest centroids per user — fixed at 3 for ENG-1 (E&P brief §9 D3) */
export const MAX_INTEREST_CENTROIDS = 3;

/**
 * Floor for an interest's retrieval weight (ENG-1). A minority interest must
 * never starve retrieval — at 0.15 it keeps ~30 of the ~600 pre-dedupe
 * per-centroid retrieval slots. Weights are floored, then renormalised to
 * sum 1 across the user's slots.
 */
export const INTEREST_WEIGHT_FLOOR = 0.15;

/**
 * One interest centroid (user_interest_centroids, migration 044).
 * Zero rows for a user = single-centroid fallback path via
 * taste_profiles.taste_vector_v2 — which continues to be maintained as
 * the summary vector regardless (mood-room affinity, semantic search).
 */
export interface InterestCentroid {
  slot: number;            // 0–2
  centroid: TasteVectorV2;
  weight: number;          // share of recent positive interactions, floored + normalised
  updatedAt: string;       // ISO timestamp
}

/** Interaction weight table — maps event_type to taste vector weight */
export const INTERACTION_WEIGHTS: Record<string, number> = {
  thumbs_up: 1.0,
  watched: 0.5,
  watchlist_add: 0.3,
  deep_link_click: 0.8,     // high confidence default; low confidence handled separately
  watchlist_remove: -0.4,
  thumbs_down: -0.6,
};

/** Event types that carry a negative signal */
export const NEGATIVE_EVENTS = new Set(['thumbs_down', 'watchlist_remove']);

/** Event types relevant to taste vector updates */
export const TASTE_RELEVANT_EVENTS = [
  'thumbs_up', 'thumbs_down', 'watched',
  'watchlist_add', 'watchlist_remove', 'deep_link_click',
] as const;

/** Confidence floor: first N interactions weighted at 1.5x */
export const CONFIDENCE_FLOOR_THRESHOLD = 20;
export const CONFIDENCE_FLOOR_MULTIPLIER = 1.5;

/** Decay half-lives in days */
export const EXPLICIT_HALF_LIFE_DAYS = 180;
export const BEHAVIOURAL_HALF_LIFE_DAYS = 90;

/** Behavioural event types (shorter half-life) */
export const BEHAVIOURAL_EVENTS = new Set(['deep_link_click']);

/**
 * Search-attribution boost — Phase Search V2 follow-up (Level 1).
 *
 * A positive interaction that happens within
 * SEARCH_ATTRIBUTION_WINDOW_SECONDS of a `search` event in the SAME
 * session is treated as higher-intent than a passive-scroll engagement.
 * Its weight is multiplied by SEARCH_ATTRIBUTION_BOOST before decay /
 * confidence floor / learning rate are applied.
 *
 * Only positive boosted events qualify — negative signals (thumbs_down,
 * watchlist_remove) are not boosted because "search → hated everything"
 * is more nuanced and is deferred to Level 2 of the search-as-signal
 * roadmap.
 */
export const SEARCH_ATTRIBUTION_WINDOW_SECONDS = 60;
export const SEARCH_ATTRIBUTION_BOOST = 1.3;
export const SEARCH_ATTRIBUTION_BOOSTED_EVENTS = new Set([
  'watched',
  'watchlist_add',
  'deep_link_click',
  'thumbs_up',
]);
