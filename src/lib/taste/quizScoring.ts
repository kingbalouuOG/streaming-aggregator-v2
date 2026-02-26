/**
 * Quiz Scoring Engine
 *
 * Processes quiz answers into taste vector adjustments.
 * Phase 1 (fixed) pairs apply full-weight deltas.
 * Phase 2 (adaptive) pairs apply 70% weight deltas.
 *
 * Answer types:
 * - A / B: Winner-loser delta with negative damping on tested dimensions
 * - both:  Two independent winner passes (A then B), no loser subtraction or damping
 * - neither: Reduces affinity for both options' primary genres by 0.15
 * - skip: Zero delta (no signal)
 */

import {
  type TasteVector,
  type ConfidenceVector,
  type GenreDimension,
  createEmptyVector,
  createEmptyConfidence,
  clampVector,
  getTopGenres,
  genreKeyToName,
  GENRE_DIMENSIONS,
  META_DIMENSIONS,
  ALL_DIMENSIONS,
} from './tasteVector';
import type { QuizPair } from './quizConfig';
import type { QuizAnswer } from '../storage/tasteProfile';
import { debug } from '../debugLogger';

// ── Phase weights ───────────────────────────────────────────────

const PHASE_WEIGHTS: Record<'fixed' | 'adaptive' | 'genre-responsive', number> = {
  'fixed': 1.0,
  'adaptive': 0.7,
  'genre-responsive': 1.0, // backward compat: old stored answers retain full weight
};

// Negative deltas on tested dimensions are softened — choosing Dark Knight
// doesn't mean you HATE comedy, just that you preferred Dark Knight.
// Positive deltas stay at full weight so explicit choices are respected.
const NEGATIVE_DAMPING = 0.6;

/**
 * Headroom threshold for cap-aware meta scaling.
 * When a meta dimension is within this distance of its ±1.0 boundary,
 * deltas are scaled down proportionally to the remaining headroom.
 * E.g. at 0.5 threshold: a value of 0.8 has 0.2 headroom → scale = 0.2/0.5 = 0.4
 */
const CAP_AWARE_THRESHOLD = 0.5;

const META_DIM_SET = new Set<string>(META_DIMENSIONS);

/**
 * Genre cap-aware scaling threshold.
 * Genre dimensions use a tighter threshold (0.25) because their 0-1 range
 * is half the width of meta dimensions' -1 to +1 range.
 */
const GENRE_CAP_AWARE_THRESHOLD = 0.25;

const GENRE_DIM_SET = new Set<string>(GENRE_DIMENSIONS);

// ── Compute delta for a single answer ───────────────────────────

function computeAnswerDelta(pair: QuizPair, choice: QuizAnswer['chosenOption']): TasteVector {
  const delta = createEmptyVector();

  debug.info('QuizScoring', `Answer: ${choice}`, {
    pairId: pair.id,
    optionA: pair.optionA.title,
    optionB: pair.optionB.title,
    choice,
    dimensionsTested: pair.dimensionsTested,
  });

  if (choice === 'skip') {
    // No signal — skip the question entirely
    debug.info('QuizScoring', 'Skip — zero delta');
    return delta;
  }

  const testedDims = new Set(pair.dimensionsTested);

  if (choice === 'both') {
    // Run winner-side delta for option A (no unchosen subtraction, no damping)
    for (const dim of ALL_DIMENSIONS) {
      if (!testedDims.has(dim)) continue;
      const aVal = pair.optionA.vectorPosition[dim] ?? 0;
      delta[dim] += aVal * 0.3;
    }
    // Run winner-side delta for option B (no unchosen subtraction, no damping)
    for (const dim of ALL_DIMENSIONS) {
      if (!testedDims.has(dim)) continue;
      const bVal = pair.optionB.vectorPosition[dim] ?? 0;
      delta[dim] += bVal * 0.3;
    }
    const bothNonZero = Object.entries(delta).filter(([, v]) => v !== 0).map(([k, v]) => `${k}:${(v as number).toFixed(3)}`);
    debug.info('QuizScoring', 'Both delta (A+B winner passes)', { nonZeroDeltas: bothNonZero });
    return delta;
  }

  if (choice === 'neither') {
    // Active negative: reduce affinity for both options' primary genres
    // Don't adjust meta dimensions (insufficient directional data)
    for (const dim of GENRE_DIMENSIONS) {
      const aVal = pair.optionA.vectorPosition[dim] ?? 0;
      const bVal = pair.optionB.vectorPosition[dim] ?? 0;
      if (!testedDims.has(dim)) continue;
      if (aVal > 0) delta[dim] -= 0.15;
      if (bVal > 0) delta[dim] -= 0.15;
    }
    const neitherNonZero = Object.entries(delta).filter(([, v]) => v !== 0).map(([k, v]) => `${k}:${(v as number).toFixed(3)}`);
    debug.info('QuizScoring', 'Neither delta', { nonZeroDeltas: neitherNonZero });
    return delta;
  }

  const chosen = choice === 'A' ? pair.optionA : pair.optionB;
  const unchosen = choice === 'A' ? pair.optionB : pair.optionA;

  // Move toward chosen option's vector position
  for (const dim of ALL_DIMENSIONS) {
    const chosenVal = chosen.vectorPosition[dim] ?? 0;
    const unchosenVal = unchosen.vectorPosition[dim] ?? 0;

    // The delta is the difference between chosen and unchosen
    let rawDelta = (chosenVal - unchosenVal) * 0.3;

    // Untested dimensions get zero delta — prevents collateral damage
    if (!testedDims.has(dim)) {
      continue;
    }
    // Soften negative deltas on tested dimensions —
    // choosing away from a genre is weaker than choosing toward it
    if (rawDelta < 0) {
      rawDelta *= NEGATIVE_DAMPING;
    }

    delta[dim] = rawDelta;
  }

  const winnerNonZero = Object.entries(delta).filter(([, v]) => v !== 0).map(([k, v]) => `${k}:${(v as number).toFixed(3)}`);
  debug.info('QuizScoring', `Winner delta (chose ${choice})`, { nonZeroDeltas: winnerNonZero });
  return delta;
}

// ── Process all quiz answers → final vector ─────────────────────

/**
 * Compute the quiz-generated taste vector from a base vector + quiz answers.
 *
 * @param baseVector - Initial vector from genre selections (selected=0.5, unselected=0.2)
 * @param answers - The 10 quiz answers
 * @param pairs - Quiz pairs (matched to answers by pairId)
 * @returns The adjusted taste vector
 */
export function computeQuizVector(
  baseVector: TasteVector,
  answers: QuizAnswer[],
  pairs: QuizPair[]
): TasteVector {
  let vector = { ...baseVector };
  const pairMap = new Map(pairs.map(p => [p.id, p]));

  for (const answer of answers) {
    const pair = pairMap.get(answer.pairId);
    if (!pair) continue;
    const delta = computeAnswerDelta(pair, answer.chosenOption);
    const phaseWeight = PHASE_WEIGHTS[answer.phase] ?? 1.0;

    // Accumulate with cap-aware scaling
    for (const d of ALL_DIMENSIONS) {
      let weightedDelta = delta[d] * phaseWeight;

      if (GENRE_DIM_SET.has(d) && weightedDelta !== 0) {
        // Genre dims: 0-1 range → headroom toward ceiling or floor
        const currentValue = vector[d];
        const headroom = weightedDelta > 0
          ? (1.0 - currentValue)   // toward ceiling
          : currentValue;          // toward floor (0.0)
        const scale = Math.max(0, Math.min(
          1.0,
          headroom / GENRE_CAP_AWARE_THRESHOLD,
          headroom / Math.abs(weightedDelta),
        ));

        if (scale < 1.0) {
          debug.info('QuizScoring', `Genre cap-aware scaling on ${d}`, {
            current: currentValue,
            rawDelta: weightedDelta,
            scale: scale,
            effective: weightedDelta * scale,
          });
        }

        weightedDelta *= scale;
      } else if (META_DIM_SET.has(d) && weightedDelta !== 0) {
        // Meta dims: -1 to +1 range → headroom toward ±1.0 boundary
        const currentValue = vector[d];
        const headroom = weightedDelta > 0
          ? (1.0 - currentValue)
          : (currentValue + 1.0);
        const scale = Math.max(0, Math.min(
          1.0,
          headroom / CAP_AWARE_THRESHOLD,
          headroom / Math.abs(weightedDelta),
        ));

        if (scale < 1.0) {
          debug.info('QuizScoring', `Meta cap-aware scaling on ${d}`, {
            current: currentValue,
            rawDelta: weightedDelta,
            scale: scale,
            effective: weightedDelta * scale,
          });
        }

        weightedDelta *= scale;
      }

      vector[d] += weightedDelta;
    }
  }

  // Single clamp after all questions processed
  const final = clampVector(vector);
  const topDims = Object.entries(final)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 8)
    .map(([k, v]) => `${k}:${(v as number).toFixed(3)}`);
  debug.info('QuizScoring', `Final vector (${answers.length} answers)`, { topDimensions: topDims });
  return final;
}

// ── Quiz confidence computation ──────────────────────────────────

// Confidence gains per answer type:
// A/B = clear directional signal (highest)
// both = user likes the range but less precise
// neither = preferences outside the pair's range — weak signal
// skip = no information
const QUIZ_CONFIDENCE_GAINS: Record<QuizAnswer['chosenOption'], number> = {
  A: 0.20,
  B: 0.20,
  both: 0.10,
  neither: 0.05,
  skip: 0.00,
};

/**
 * Compute per-dimension confidence from quiz answers.
 * Each answered pair contributes confidence to its tested dimensions.
 * Matches answers to pairs by pairId (not array index).
 * Values are additive and clamped to [0.0, 1.0].
 */
export function computeQuizConfidence(
  answers: QuizAnswer[],
  pairs: QuizPair[]
): ConfidenceVector {
  const confidence = createEmptyConfidence();
  const pairMap = new Map(pairs.map(p => [p.id, p]));

  for (const answer of answers) {
    const pair = pairMap.get(answer.pairId);
    if (!pair) continue;
    const gain = QUIZ_CONFIDENCE_GAINS[answer.chosenOption];
    if (gain === 0) continue;

    for (const dim of pair.dimensionsTested) {
      confidence[dim] = Math.min(1.0, confidence[dim] + gain);
    }
  }

  return confidence;
}

// ── Get top genre names from vector ─────────────────────────────

/**
 * Returns the display names of the top N genre dimensions by score.
 * Used for the quiz completion screen ("You love: Thriller, Sci-Fi, Drama")
 */
export function getTopGenreNames(vector: TasteVector, count = 3): string[] {
  return getTopGenres(vector, count).map(genreKeyToName);
}

// ── Find most ambiguous dimensions (for adaptive pair selection) ─

/**
 * Returns dimension keys sorted by ambiguity (most ambiguous first).
 * Genre dims: ambiguity = how close to 0.5 (midpoint of 0-1 range)
 * Meta dims: ambiguity = how close to 0.0 (midpoint of -1 to 1 range)
 */
export function getMostAmbiguousDimensions(
  vector: TasteVector,
  count = 5
): string[] {
  const scored: { dim: string; ambiguity: number }[] = [];

  for (const dim of GENRE_DIMENSIONS) {
    // Distance from 0.5 (midpoint) — closer to 0.5 = more ambiguous
    scored.push({ dim, ambiguity: 1 - Math.abs(vector[dim] - 0.5) * 2 });
  }

  for (const dim of META_DIMENSIONS) {
    // Distance from 0.0 (neutral) — closer to 0 = more ambiguous
    scored.push({ dim, ambiguity: 1 - Math.abs(vector[dim]) });
  }

  return scored
    .sort((a, b) => b.ambiguity - a.ambiguity)
    .slice(0, count)
    .map((s) => s.dim);
}
