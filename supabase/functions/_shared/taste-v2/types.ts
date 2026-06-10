// Mirror of src/lib/taste-v2/types.ts — IN-466 / ADR-011.
// Drift between this file and src/lib/taste-v2/types.ts is enforced
// by the shared-tree-drift CI check.

export type TasteVectorV2 = number[];

export interface SliderState {
  catalogueAge: number;
  comfortZone: number;
  contentMix: number;
  variety: number;
}

export const DEFAULT_SLIDERS: SliderState = {
  catalogueAge: 0.5,
  comfortZone: 0.25,
  contentMix: 0.5,
  variety: 0.5,
};

export type BootstrapSource =
  | 'onboarding_v2'
  | 'manual_retake'
  | 'services_only';

export interface TasteProfileV2 {
  tasteVector: TasteVectorV2 | null;
  updatedAt: string | null;
  interactionCount: number;
  bootstrappedFrom: BootstrapSource | null;
  sliders: SliderState;
  selectedClusters: string[];
}

export const MAX_INTEREST_CENTROIDS = 3;

export const INTEREST_WEIGHT_FLOOR = 0.15;

export interface InterestCentroid {
  slot: number;
  centroid: TasteVectorV2;
  weight: number;
  updatedAt: string;
}

// ENG-1 Workstream B: positive-only — negatives feed the avoid set
// (recommendations-v2/avoidSet.ts); watchlist_remove is taste-neutral.
export const INTERACTION_WEIGHTS: Record<string, number> = {
  thumbs_up: 1.0,
  watched: 0.5,
  watchlist_add: 0.3,
  deep_link_click: 0.8,
};

export const NEGATIVE_EVENTS = new Set(['thumbs_down', 'watchlist_remove']);

export const TASTE_RELEVANT_EVENTS = [
  'thumbs_up', 'watched', 'watchlist_add', 'deep_link_click',
] as const;

export const AVOID_SET_EVENTS = new Set(['thumbs_down', 'not_interested']);

export const AVOID_SET_SIZE = 50;

export const CONFIDENCE_FLOOR_THRESHOLD = 20;
export const CONFIDENCE_FLOOR_MULTIPLIER = 1.5;

export const EXPLICIT_HALF_LIFE_DAYS = 180;
export const BEHAVIOURAL_HALF_LIFE_DAYS = 90;

export const BEHAVIOURAL_EVENTS = new Set(['deep_link_click']);

export const SEARCH_ATTRIBUTION_WINDOW_SECONDS = 60;
export const SEARCH_ATTRIBUTION_BOOST = 1.3;
export const SEARCH_ATTRIBUTION_BOOSTED_EVENTS = new Set([
  'watched',
  'watchlist_add',
  'deep_link_click',
  'thumbs_up',
]);
