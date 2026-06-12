/**
 * Recommendations V2 — Contextual Scoring (Phase 5)
 *
 * Returns a 0–1 contextual-fit score per candidate. The 12.5% Stage 2
 * weight (BASE_WEIGHTS.contextual) becomes a real ranking signal here,
 * replacing the Phase 4 placeholder that returned 0.5 for all candidates.
 *
 * The score is composed of three sub-components, each weighted internally
 * (CONTEXTUAL_TIME_WEIGHT, CONTEXTUAL_VIEWING_WEIGHT, CONTEXTUAL_DEVICE_WEIGHT
 * in weights.ts):
 *
 *   1. Time-of-day (40%): late-night boosts comedy/animation/horror and
 *      short runtimes; weekday morning boosts documentary/news. Other
 *      hours stay neutral.
 *   2. Viewing context (40%): with_family boosts family-rated content
 *      and suppresses horror/thriller; wind_down boosts comedy/light
 *      drama and suppresses dark genres; focused boosts prestige drama
 *      and documentary. solo and background stay neutral (background's
 *      cosine-aware boost is deferred — see weights.ts comment).
 *   3. Device (20%): android phones suppress long-runtime movies (>120
 *      min). Tablets and TVs (when added) leave runtimes unchanged.
 *
 * Each sub-score defaults to 0.5 when its context field is missing,
 * matching the Phase 4 neutral baseline. So a request with no ctx at
 * all (legacy clients, missing viewing_context, etc.) reproduces the
 * Phase 4 0.5 placeholder behaviour by construction.
 *
 * Single-sourced here since PLAT-3 (the ADR-011 mirror is gone).
 */

import type { PipelineContext, ScoredCandidate } from './types';
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
} from './weights';

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

  // Pick the strongest boost matching any of the candidate's genres.
  // Multiple matching boosts don't compound — one strong genre signal
  // shouldn't be amplified twice for a multi-genre title.
  let genreDelta = 0;
  for (const g of genres) {
    const delta = boosts[g];
    if (delta != null && delta > genreDelta) genreDelta = delta;
  }

  let score = NEUTRAL + genreDelta;

  // Late-night also boosts short-runtime movies — orthogonal to genre,
  // applied additively.
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
  if (!boosts) return NEUTRAL; // solo, background, or unknown value

  const genres = candidate.meta.genre_ids ?? [];

  // Pick the strongest positive AND strongest negative delta separately,
  // then combine. This way a movie tagged Family (+0.50) AND Thriller
  // (−0.40) under with_family lands at NEUTRAL + 0.50 − 0.40 = 0.60,
  // not at 0.50 + 0.50 (positives only) or somewhere noisy depending
  // on iteration order. Strongest signals dominate; weaker matches
  // don't compound.
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
  // Only mobile phones (android today, ios later) carry the long-runtime
  // penalty. Tablets and TVs would need the same plugin to pass platform
  // here; until then 'web' / desktop falls through to neutral.
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

/**
 * Compute contextual fit score for a candidate. Pure function: same
 * (candidate, ctx) returns same score. ctx is normally constructed
 * once per render and passed to every candidate scoring call.
 *
 * Returns 0.5 (Phase 4 placeholder behaviour) when ctx is empty or
 * has only missing fields.
 */
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
