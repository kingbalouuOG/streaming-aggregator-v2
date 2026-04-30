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

/** Interaction weight table — maps event_type to taste vector weight */
export const INTERACTION_WEIGHTS: Record<string, number> = {
  thumbs_up: 1.0,
  marked_watched: 0.5,
  watchlist_add: 0.3,
  deep_link_click: 0.8,     // high confidence default; low confidence handled separately
  watchlist_remove: -0.4,
  thumbs_down: -0.6,
};

/** Event types that carry a negative signal */
export const NEGATIVE_EVENTS = new Set(['thumbs_down', 'watchlist_remove']);

/** Event types relevant to taste vector updates */
export const TASTE_RELEVANT_EVENTS = [
  'thumbs_up', 'thumbs_down', 'marked_watched',
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
