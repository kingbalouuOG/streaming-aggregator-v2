// Mirror of src/lib/recommendations-v2/weights.ts — IN-466 / ADR-011.
// Drift enforced by shared-tree-drift CI check.

import type { Stage2Weights } from './types.ts';

export const BASE_WEIGHTS: Stage2Weights = {
  taste: 0.625,
  recency: 0.250,
  contextual: 0.125,
};

export function getCatalogueAgeRecencyWeight(slider: number): number {
  return 0.30 - slider * 0.20;
}

export function getModulatedWeights(catalogueAgeSlider: number): Stage2Weights {
  const rawRecency = getCatalogueAgeRecencyWeight(catalogueAgeSlider);
  const nonRecencyBudget = 1.0 - rawRecency;
  const tasteToContextualRatio = 50 / 10;
  const contextual = nonRecencyBudget / (1 + tasteToContextualRatio);
  const taste = nonRecencyBudget - contextual;
  return { taste, recency: rawRecency, contextual };
}

export function getComfortZoneRowCount(slider: number): number {
  return 5 + Math.round(slider * 10);
}

export function getContentMixMovieRatio(slider: number): number {
  return 0.80 - slider * 0.60;
}

export function getVarietyGenreWindow(slider: number): number {
  return Math.round(1 + slider * 4);
}

export function getMMRLambda(slider: number): number {
  return 0.85 - slider * 0.30;
}

export const CRITICALLY_ACCLAIMED_ROW_ENABLED = false;

export function parseRtScore(rtScore: string | null | undefined): number {
  if (!rtScore) return 0.5;
  const match = rtScore.match(/^(\d+)%?$/);
  if (!match) return 0.5;
  return Math.min(1.0, Math.max(0.0, parseInt(match[1], 10) / 100));
}

export function normalizePopularity(popularity: number | null): number {
  if (popularity == null || popularity <= 0) return 0;
  const MIN_POP = 0.1;
  const MAX_POP = 500;
  const clamped = Math.max(MIN_POP, Math.min(MAX_POP, popularity));
  return Math.log(clamped / MIN_POP) / Math.log(MAX_POP / MIN_POP);
}

export function normalizeImdbRating(rating: number | null): number {
  if (rating == null) return 0.5;
  return Math.min(1.0, Math.max(0.0, rating / 10));
}

export function distanceToSimilarity(distance: number): number {
  return Math.max(0, Math.min(1, 1 - distance / 2));
}

export function scoreToMatchPercentage(score: number): number {
  return Math.round(Math.max(30, Math.min(99, score * 100)));
}

export const DEFAULT_CANDIDATE_LIMIT = 500;
export const DEFAULT_MAX_PER_GENRE = 4;
export const MAX_CONSECUTIVE_SAME_SERVICE = 2;

export { HIDDEN_GEMS_FILTERS } from './types.ts';

export const MOOD_ROOM_WEEKLY_POOL_SIZE = 5;
export const MOOD_ROOM_VARIETY_PENALTY = 0.05;

export type MoodRoomTimeBucket =
  | 'evening_weekday'
  | 'weekend_night'
  | 'sunday_afternoon'
  | 'default';

export const MOOD_ROOM_BUCKET_GENRE_AFFINITY: Record<MoodRoomTimeBucket, number[]> = {
  evening_weekday: [18, 9648, 99, 10752],
  weekend_night: [28, 53, 27, 35, 80],
  sunday_afternoon: [10751, 16, 10749, 35],
  default: [],
};

export function getCurrentTimeBucket(now: Date = new Date()): MoodRoomTimeBucket {
  const dayOfWeek = now.getDay();
  const hour = now.getHours();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
  if (dayOfWeek === 0 && hour >= 12 && hour < 17) return 'sunday_afternoon';
  if (isWeekend && hour >= 18 && hour < 24) return 'weekend_night';
  if (!isWeekend && hour >= 18 && hour < 23) return 'evening_weekday';
  return 'default';
}
