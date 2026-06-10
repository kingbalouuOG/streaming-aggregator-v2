/**
 * Recommendations V2 — Weights & Configuration
 *
 * Single source of truth for all ranking weights, slider mapping functions,
 * and feature flags. Every ranker call site imports from this file.
 * Tuning the pipeline is a one-file change.
 *
 * Phase 5: contextual scoring is now real (see contextual.ts). BASE_WEIGHTS
 * still 62.5/25/12.5; the weight-split re-evaluation is deferred until
 * prototype vectors rebase post-marked_watched fix. See phase-5-summary §7
 * for the rank-eval-driven decision path.
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
 * Variety slider → MMR λ parameter (Phase 5; consumed by applyMMR in diversity.ts).
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

// ── Phase 5 Contextual Scoring ──

/** Sub-component weights inside the contextual score (must sum to 1.0). */
export const CONTEXTUAL_TIME_WEIGHT = 0.4;
export const CONTEXTUAL_VIEWING_WEIGHT = 0.4;
export const CONTEXTUAL_DEVICE_WEIGHT = 0.2;

/** Time-of-day buckets for contextual adaptation. Distinct from the
 *  mood-room buckets above — those rotate global rooms; these score
 *  individual candidates. */
export type ContextualTimeBucket =
  | 'late_night'        // 22:00–01:59
  | 'weekday_morning'   // 06:00–08:59 Mon-Fri
  | 'neutral';          // every other hour/day

export function getContextualTimeBucket(
  hourOfDay: number,
  dayOfWeek: number,
): ContextualTimeBucket {
  // Late night wraps midnight: 22..23 || 0..1
  if (hourOfDay >= 22 || hourOfDay < 2) return 'late_night';
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  if (isWeekday && hourOfDay >= 6 && hourOfDay < 9) return 'weekday_morning';
  return 'neutral';
}

/** Per-bucket genre boosts. Values are deltas added to the bucket's
 *  baseline 0.5 score, clamped to [0, 1]. Genre IDs from
 *  src/lib/constants/genres.ts (TMDb canonical). Negative deltas allowed. */
export const CONTEXTUAL_TIME_GENRE_BOOSTS: Record<
  ContextualTimeBucket,
  Record<number, number>
> = {
  late_night: {
    35: 0.30,        // Comedy
    16: 0.30,        // Animation (movie)
    27: 0.20,        // Horror — late-night classic
    10762: 0.20,     // Kids (TV) — animation TV
  },
  weekday_morning: {
    99: 0.40,        // Documentary
    10763: 0.40,     // News (TV)
    10764: 0.20,     // Reality (TV) — quick-watch
    35: 0.15,        // Comedy — light
  },
  neutral: {},
};

/** Late-night also boosts short-runtime movies (≤90 min). */
export const CONTEXTUAL_LATE_NIGHT_RUNTIME_THRESHOLD = 90;
export const CONTEXTUAL_LATE_NIGHT_RUNTIME_BOOST = 0.20;

// ViewingContext moved to types.ts (IN-PX-27); re-exported for existing
// import paths that read it from weights.ts.
export type { ViewingContext } from './types';
import type { ViewingContext } from './types';

/** Per-context genre boosts. Same shape and clamping as the time table.
 *  `solo` and `background` are intentionally absent — neutral baseline.
 *  `background` would benefit from cosine-aware boosting (high-taste
 *  candidates should rise) which can't be expressed as a static genre
 *  table; deferred to a follow-up. */
export const CONTEXTUAL_VIEWING_GENRE_BOOSTS: Partial<
  Record<ViewingContext, Record<number, number>>
> = {
  with_partner: {
    10749: 0.30,     // Romance
    35: 0.20,        // Comedy
    18: 0.10,        // Drama (light)
  },
  with_family: {
    10751: 0.50,     // Family — strong boost
    16: 0.30,        // Animation
    27: -0.70,       // Horror — strong suppress
    53: -0.40,       // Thriller — moderate suppress
  },
  with_friends: {
    35: 0.40,        // Comedy
    28: 0.30,        // Action
    27: 0.20,        // Horror — group horror is fun
    53: 0.10,        // Thriller
  },
  wind_down: {
    35: 0.40,        // Comedy
    18: 0.20,        // Drama (light)
    10749: 0.20,     // Romance
    53: -0.50,       // Thriller — suppress
    27: -0.60,       // Horror — strong suppress
    80: -0.30,       // Crime — moderate suppress
  },
  focused: {
    18: 0.40,        // Drama (prestige)
    99: 0.40,        // Documentary
    36: 0.30,        // History
    10752: 0.20,     // War
  },
};

/** Mobile-only suppression for long-runtime movies (>120 min). Brief
 *  §3.3 specifies 0.10–0.15 magnitude; midpoint 0.12. */
export const CONTEXTUAL_MOBILE_LONG_RUNTIME_THRESHOLD = 120;
export const CONTEXTUAL_MOBILE_LONG_RUNTIME_PENALTY = 0.12;

// ── Pipeline Constants ──

/** Default candidate retrieval limit for shared pool */
export const DEFAULT_CANDIDATE_LIMIT = 500;

/**
 * Per-centroid retrieval limit on the ENG-1 multi-interest path.
 * K ≤ 3 centroids × 200 ≈ the single-vector 500 after dedupe — same
 * pool volume, proportionally interleaved by interest weight.
 */
export const PER_CENTROID_CANDIDATE_LIMIT = 200;

/** Max genre occurrences per row (default, modulated by variety slider) */
export const DEFAULT_MAX_PER_GENRE = 4;

/** Max consecutive same-service titles before de-clustering */
export const MAX_CONSECUTIVE_SAME_SERVICE = 2;

/**
 * ENG-1 Workstream B: avoid-set penalty strength.
 * finalScore −= γ · max(0, max_cosine(candidate, avoidSet)), applied to
 * candidates in the top-200 embedding map after scoring, before row
 * building. Starting value per brief §3.3; swept 0.10/0.15/0.20 in the
 * eval gate.
 */
export const AVOID_PENALTY_GAMMA = 0.15;

// ── ENG-1 Workstream C: exploration slot ──

/** Exploration candidates reserved per Recommended For You render */
export const EXPLORATION_COUNT = 2;

/** 0-indexed splice positions (1-indexed: 6 and 14 — visible without
 *  displacing the head of the row). Per plan Q3, confirmed by Joe. */
export const EXPLORATION_SLOT_POSITIONS = [5, 13];

/** Taste-score percentile band [low, high) the exploration candidates are
 *  sampled from — moderate similarity: novel but not random. */
export const EXPLORATION_BAND: [number, number] = [0.40, 0.70];

/** Hidden Gems thresholds (re-exported from types for convenience) */
export { HIDDEN_GEMS_FILTERS } from './types';

// ── Mood Rooms (Phase 4.5) ──

/**
 * Number of mood rooms shown on the For You "Mood Rooms for Tonight" row
 * per week. The weekly pool is selected once per (user, weekBucket) and
 * cached in localStorage; ordering within the pool rotates by
 * time-of-day affinity on each For You render.
 *
 * At 5 rooms per week and 69 total (April 2026 run #2), rotation through
 * the full room set takes ~14 weeks.
 */
export const MOOD_ROOM_WEEKLY_POOL_SIZE = 5;

/**
 * Penalty applied to the taste-fit score of rooms featured in the
 * previous week's pool, to nudge discovery toward unseen rooms.
 * Absent previous-week key (first visit or cache cleared) => 0 penalty.
 *
 * Scale: taste-fit is a cosine similarity in [−1, 1]; a 0.05 penalty
 * only displaces a previously-featured room if another room scores
 * within 0.05 of it.
 */
export const MOOD_ROOM_VARIETY_PENALTY = 0.05;

/**
 * Time-of-day bucket inferred from the device's current local time.
 * Used to reorder the weekly pool on each For You render: rooms with
 * an affinity for the current bucket float to the top, the rest
 * stable-shuffle beneath.
 */
export type MoodRoomTimeBucket =
  | 'evening_weekday'   // Mon-Thu 18:00-23:00
  | 'weekend_night'     // Fri/Sat/Sun evening
  | 'sunday_afternoon'  // Sun 12:00-17:00
  | 'default';

/**
 * Very small genre-affinity table per time bucket. Intentionally
 * minimal per Brief §5: "keep the time-of-day rule set minimal".
 * TMDb genre ids; see src/lib/constants/genres.ts.
 *
 * Affinity is scored by overlap count between the room's dominant
 * genres (derived from its member titles) and the bucket's preferred
 * genres. Zero overlap is fine — the room still renders, it just
 * doesn't get a time-of-day boost.
 */
export const MOOD_ROOM_BUCKET_GENRE_AFFINITY: Record<MoodRoomTimeBucket, number[]> = {
  evening_weekday: [18, 9648, 99, 10752],      // Drama, Mystery, Documentary, War (cerebral / prestige)
  weekend_night: [28, 53, 27, 35, 80],         // Action, Thriller, Horror, Comedy, Crime (genre / cult)
  sunday_afternoon: [10751, 16, 10749, 35],    // Family, Animation, Romance, Comedy (comfort / feel-good)
  default: [],
};

/**
 * Classify the current local date/time into a time-of-day bucket.
 * Kept deliberately simple; revisit based on engagement data.
 */
export function getCurrentTimeBucket(now: Date = new Date()): MoodRoomTimeBucket {
  const dayOfWeek = now.getDay();   // 0=Sunday, 6=Saturday
  const hour = now.getHours();

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;

  if (dayOfWeek === 0 && hour >= 12 && hour < 17) {
    return 'sunday_afternoon';
  }
  if (isWeekend && hour >= 18 && hour < 24) {
    return 'weekend_night';
  }
  if (!isWeekend && hour >= 18 && hour < 23) {
    return 'evening_weekday';
  }
  return 'default';
}
