// Mirror of src/lib/recommendations-v2/contextual.ts — IN-466 / ADR-011.
// Pure module; bit-for-bit copy. Drift enforced by shared-tree-drift CI.

import type { PipelineContext, ScoredCandidate } from './types.ts';
import {
  CONTEXTUAL_DEVICE_WEIGHT,
  CONTEXTUAL_LATE_NIGHT_RUNTIME_BOOST,
  CONTEXTUAL_LATE_NIGHT_RUNTIME_THRESHOLD,
  CONTEXTUAL_MOBILE_LONG_RUNTIME_PENALTY,
  CONTEXTUAL_MOBILE_LONG_RUNTIME_THRESHOLD,
  CONTEXTUAL_TIME_GENRE_BOOSTS,
  CONTEXTUAL_TIME_WEIGHT,
  CONTEXTUAL_VIEWING_GENRE_BOOSTS,
  CONTEXTUAL_VIEWING_WEIGHT,
  getContextualTimeBucket,
} from './weights.ts';

const NEUTRAL = 0.5;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function scoreTimeOfDay(
  candidate: Pick<ScoredCandidate, 'meta'>,
  ctx: PipelineContext,
): number {
  if (ctx.hourOfDay == null || ctx.dayOfWeek == null) return NEUTRAL;

  const bucket = getContextualTimeBucket(ctx.hourOfDay, ctx.dayOfWeek);
  if (bucket === 'neutral') return NEUTRAL;

  const boosts = CONTEXTUAL_TIME_GENRE_BOOSTS[bucket];
  const genres = candidate.meta.genre_ids ?? [];

  let genreDelta = 0;
  for (const g of genres) {
    const delta = boosts[g];
    if (delta != null && delta > genreDelta) genreDelta = delta;
  }

  let score = NEUTRAL + genreDelta;

  if (
    bucket === 'late_night' &&
    candidate.meta.media_type === 'movie' &&
    candidate.meta.runtime != null &&
    candidate.meta.runtime <= CONTEXTUAL_LATE_NIGHT_RUNTIME_THRESHOLD
  ) {
    score += CONTEXTUAL_LATE_NIGHT_RUNTIME_BOOST;
  }

  return clamp01(score);
}

function scoreViewingContext(
  candidate: Pick<ScoredCandidate, 'meta'>,
  ctx: PipelineContext,
): number {
  if (!ctx.viewingContext) return NEUTRAL;

  const boosts = CONTEXTUAL_VIEWING_GENRE_BOOSTS[ctx.viewingContext];
  if (!boosts) return NEUTRAL;

  const genres = candidate.meta.genre_ids ?? [];

  let positiveDelta = 0;
  let negativeDelta = 0;
  for (const g of genres) {
    const delta = boosts[g];
    if (delta == null) continue;
    if (delta > positiveDelta) positiveDelta = delta;
    if (delta < negativeDelta) negativeDelta = delta;
  }

  return clamp01(NEUTRAL + positiveDelta + negativeDelta);
}

function scoreDevice(
  candidate: Pick<ScoredCandidate, 'meta'>,
  ctx: PipelineContext,
): number {
  if (ctx.devicePlatform !== 'android') return NEUTRAL;

  if (
    candidate.meta.media_type === 'movie' &&
    candidate.meta.runtime != null &&
    candidate.meta.runtime > CONTEXTUAL_MOBILE_LONG_RUNTIME_THRESHOLD
  ) {
    return clamp01(NEUTRAL - CONTEXTUAL_MOBILE_LONG_RUNTIME_PENALTY);
  }

  return NEUTRAL;
}

export function computeContextualScore(
  candidate: Pick<ScoredCandidate, 'meta'>,
  ctx: PipelineContext = {},
): number {
  const time = scoreTimeOfDay(candidate, ctx);
  const viewing = scoreViewingContext(candidate, ctx);
  const device = scoreDevice(candidate, ctx);

  return clamp01(
    time * CONTEXTUAL_TIME_WEIGHT +
      viewing * CONTEXTUAL_VIEWING_WEIGHT +
      device * CONTEXTUAL_DEVICE_WEIGHT,
  );
}
