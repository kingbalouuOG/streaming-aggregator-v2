/**
 * Recommendations V2 — Weights & Configuration
 *
 * Single source of truth for all ranking weights, slider mapping functions,
 * and feature flags. Every ranker call site imports from this file.
 * Tuning the pipeline is a one-file change.
 *
 * ── Interim Weight Note ──
 * The base weights (taste 62.5%, recency 25%, contextual 12.5%) are normalized
 * from the Phase 4 brief's 50/20/10 allocation. These proportions are INTERIM:
 * the contextual component returns a neutral 0.5 for all candidates in Phase 4,
 * meaning it has zero ranking influence despite carrying 12.5% of the weight.
 *
 * When Phase 5 replaces the contextual placeholder with a real scorer (device,
 * time-of-day, viewing context), the relative balance between taste and recency
 * will shift — the contextual signal will absorb effective weight from both.
 * At that point, the base weights should be re-evaluated to ensure the three
 * components produce the desired ranking behavior.
 */

import type { Stage2Weights } from './types';

// ── Stage 2 Base Weights ──
// Normalized from brief's 50/20/10 (taste/recency/contextual).
// Diversity (10%) and cross-service spread (10%) are post-processing stages,
// not scoring components — see diversity.ts.

export const BASE_WEIGHTS: Stage2Weights = {
  taste: 0.625,       // 50/80
  recency: 0.250,     // 20/80
  contextual: 0.125,  // 10/80
};

// ── Slider Mapping Functions ──
// All mappings are linear interpolations per brief §5.
// Slider values are 0.0–1.0 (stored on taste_profiles).

/**
 * Catalogue-age slider → recency weight (before re-normalization).
 * At 0.0 ("New releases"): raw weight = 0.30 (boosted recency)
 * At 1.0 ("Best match regardless of age"): raw weight = 0.10 (suppressed recency)
 * Default 0.5: raw weight = 0.20 (matches brief's base allocation)
 */
export function getCatalogueAgeRecencyWeight(slider: number): number {
  return 0.30 - slider * 0.20;
}

/**
 * Compute Stage 2 weights with Catalogue-age slider modulation.
 * Re-normalizes taste and contextual proportionally so all 3 sum to 1.0.
 */
export function getModulatedWeights(catalogueAgeSlider: number): Stage2Weights {
  // Raw recency weight from slider
  const rawRecency = getCatalogueAgeRecencyWeight(catalogueAgeSlider);

  // Brief §3.2: "Other weights re-normalise proportionally to maintain sum = 1.0"
  // The unmodulated taste:contextual ratio is 50:10 = 5:1. Preserve this ratio.
  const nonRecencyBudget = 1.0 - rawRecency;
  const tasteToContextualRatio = 50 / 10; // 5:1
  const contextual = nonRecencyBudget / (1 + tasteToContextualRatio);
  const taste = nonRecencyBudget - contextual;

  return { taste, recency: rawRecency, contextual };
}

/**
 * Comfort-zone slider → Outside Your Usual row count.
 * At 0.0 ("Stick with what I like"): 5 titles
 * At 1.0 ("Surprise me"): 15 titles
 */
export function getComfortZoneRowCount(slider: number): number {
  return 5 + Math.round(slider * 10);
}

/**
 * Content-mix slider → movie ratio for Stage 1 resampling.
 * At 0.0 ("Focus on films"): 80% movies / 20% TV
 * At 0.5: 50/50 (no filter)
 * At 1.0 ("Focus on TV"): 20% movies / 80% TV
 */
export function getContentMixMovieRatio(slider: number): number {
  return 0.80 - slider * 0.60;
}

/**
 * Variety (Focused–Varied) slider → genre repeat window for diversity.
 * At 0.0 ("Go deeper"): window = 1 (allow tighter genre clustering)
 * At 1.0 ("See more variety"): window = 5 (require more genre spread)
 */
export function getVarietyGenreWindow(slider: number): number {
  return Math.round(1 + slider * 4);
}

/**
 * Variety slider → MMR λ parameter (reserved for Phase 5).
 * At 0.0: λ = 0.85 (strong relevance preference)
 * At 1.0: λ = 0.55 (strong diversity preference)
 */
export function getMMRLambda(slider: number): number {
  return 0.85 - slider * 0.30;
}

// ── Feature Flags ──

/** Critically Acclaimed row: disabled until OMDB coverage ≥ 80% of recent titles */
export const CRITICALLY_ACCLAIMED_ROW_ENABLED = false;

// ── Scoring Utilities ──

/**
 * Parse Rotten Tomatoes score string to 0.0–1.0.
 * Input: "93%", "N/A", null, undefined, ""
 * Returns 0.5 (neutral) for missing/unparseable values.
 */
export function parseRtScore(rtScore: string | null | undefined): number {
  if (!rtScore) return 0.5;
  const match = rtScore.match(/^(\d+)%?$/);
  if (!match) return 0.5;
  return Math.min(1.0, Math.max(0.0, parseInt(match[1], 10) / 100));
}

/**
 * Normalize a raw popularity value to 0.0–1.0.
 * Uses logarithmic scaling since TMDb popularity is heavily right-skewed.
 * Floor at 0.1 (very obscure), ceiling at 500 (blockbuster level).
 */
export function normalizePopularity(popularity: number | null): number {
  if (popularity == null || popularity <= 0) return 0;
  const MIN_POP = 0.1;
  const MAX_POP = 500;
  const clamped = Math.max(MIN_POP, Math.min(MAX_POP, popularity));
  return Math.log(clamped / MIN_POP) / Math.log(MAX_POP / MIN_POP);
}

/**
 * Normalize IMDb rating (0–10) to 0.0–1.0.
 */
export function normalizeImdbRating(rating: number | null): number {
  if (rating == null) return 0.5; // neutral for missing
  return Math.min(1.0, Math.max(0.0, rating / 10));
}

/**
 * Convert cosine distance (0 = identical, 2 = opposite) to similarity score (0–1).
 * pgvector <=> returns cosine distance for normalized vectors.
 */
export function distanceToSimilarity(distance: number): number {
  return Math.max(0, Math.min(1, 1 - distance / 2));
}

/**
 * Convert a final score (0.0–1.0) to a match percentage (30–99) for UI display.
 */
export function scoreToMatchPercentage(score: number): number {
  return Math.round(Math.max(30, Math.min(99, score * 100)));
}

// ── Pipeline Constants ──

/** Default candidate retrieval limit for shared pool */
export const DEFAULT_CANDIDATE_LIMIT = 500;

/** Max genre occurrences per row (default, modulated by variety slider) */
export const DEFAULT_MAX_PER_GENRE = 4;

/** Max consecutive same-service titles before de-clustering */
export const MAX_CONSECUTIVE_SAME_SERVICE = 2;

/** Hidden Gems thresholds (re-exported from types for convenience) */
export { HIDDEN_GEMS_FILTERS } from './types';
