/**
 * Quiz Scoring Engine
 *
 * Processes quiz answers into taste vector adjustments.
 * Phase 1-2 (fixed + genre-responsive) pairs apply full-weight deltas.
 * Phase 3 (adaptive) pairs apply 70% weight deltas.
 *
 * Answer types:
 * - A / B: Winner-loser delta with negative damping on tested dimensions
 * - both:  Two independent winner passes (A then B), no loser subtraction or damping
 * - neither: Reduces affinity for both options' primary genres by 0.15
 * - skip: Zero delta (no signal)
 */

import {
  type TasteVector,
  type GenreDimension,
  createEmptyVector,
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

const PHASE_WEIGHTS: Record<QuizAnswer['phase'], number> = {
  'fixed': 1.0,
  'genre-responsive': 1.0,
  'adaptive': 0.7,
};

// Negative deltas on tested dimensions are softened — choosing Dark Knight
// doesn't mean you HATE comedy, just that you preferred Dark Knight.
// Positive deltas stay at full weight so explicit choices are respected.
const NEGATIVE_DAMPING = 0.6;

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
 * @param pairs - The 10 quiz pairs (in order matching answers)
 * @returns The adjusted taste vector
 */
export function computeQuizVector(
  baseVector: TasteVector,
  answers: QuizAnswer[],
  pairs: QuizPair[]
): TasteVector {
  let vector = { ...baseVector };

  for (let i = 0; i < answers.length && i < pairs.length; i++) {
    const answer = answers[i];
    const pair = pairs[i];
    const delta = computeAnswerDelta(pair, answer.chosenOption);
    const phaseWeight = PHASE_WEIGHTS[answer.phase] ?? 1.0;

    // Accumulate without clamping — defer to end so question order doesn't matter
    for (const d of ALL_DIMENSIONS) {
      vector[d] += delta[d] * phaseWeight;
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
