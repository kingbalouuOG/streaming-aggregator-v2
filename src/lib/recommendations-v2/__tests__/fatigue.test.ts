import { describe, it, expect } from 'vitest';

import {
  applyFatiguePenalty,
  fatiguePenaltyFor,
  type FatigueConfig,
  type FatigueData,
} from '../fatigue';
import type { ScoredCandidate } from '../types';

const CONFIG: FatigueConfig = {
  buryThreshold: 4,
  parkPenaltyPerView: 0.04,
  buryPenalty: 0.5,
  decayDays: 21,
};

const NOW = Date.parse('2026-08-26T12:00:00Z');
const daysAgo = (d: number) => NOW - d * 24 * 60 * 60 * 1000;

function candidate(tmdbId: number, finalScore: number): ScoredCandidate {
  return {
    tmdbId,
    mediaType: 'movie',
    contentKey: `movie-${tmdbId}`,
    // Only tmdbId / finalScore matter to fatigue; the rest is structural.
    scores: {} as ScoredCandidate['scores'],
    finalScore,
    meta: {} as ScoredCandidate['meta'],
  };
}

describe('fatiguePenaltyFor', () => {
  it('does not penalise a title that has never been seen', () => {
    expect(fatiguePenaltyFor(undefined, false, CONFIG, NOW)).toBe(0);
  });

  it('does not penalise a title the user engaged with, however often seen', () => {
    const seenALot = { views: 25, lastSeenMs: NOW };
    expect(fatiguePenaltyFor(seenALot, true, CONFIG, NOW)).toBe(0);
  });

  it('parks proportionally below the bury threshold', () => {
    expect(fatiguePenaltyFor({ views: 1, lastSeenMs: NOW }, false, CONFIG, NOW)).toBeCloseTo(0.04);
    expect(fatiguePenaltyFor({ views: 2, lastSeenMs: NOW }, false, CONFIG, NOW)).toBeCloseTo(0.08);
    expect(fatiguePenaltyFor({ views: 3, lastSeenMs: NOW }, false, CONFIG, NOW)).toBeCloseTo(0.12);
  });

  it('buries at the threshold, as a step rather than a slide', () => {
    const parked = fatiguePenaltyFor({ views: 3, lastSeenMs: NOW }, false, CONFIG, NOW);
    const buried = fatiguePenaltyFor({ views: 4, lastSeenMs: NOW }, false, CONFIG, NOW);
    expect(buried).toBeCloseTo(0.5);
    // The step is the point: 4+ should be decisively different from 3.
    expect(buried).toBeGreaterThan(parked * 3);
  });

  it('does not escalate further beyond the threshold', () => {
    const four = fatiguePenaltyFor({ views: 4, lastSeenMs: NOW }, false, CONFIG, NOW);
    const fifty = fatiguePenaltyFor({ views: 50, lastSeenMs: NOW }, false, CONFIG, NOW);
    expect(fifty).toBeCloseTo(four);
  });

  it('decays linearly and reaches zero at the decay window', () => {
    const fresh = fatiguePenaltyFor({ views: 4, lastSeenMs: NOW }, false, CONFIG, NOW);
    const half = fatiguePenaltyFor({ views: 4, lastSeenMs: daysAgo(10.5) }, false, CONFIG, NOW);
    expect(half).toBeCloseTo(fresh / 2, 2);
    expect(fatiguePenaltyFor({ views: 4, lastSeenMs: daysAgo(21) }, false, CONFIG, NOW)).toBe(0);
  });

  it('treats anything older than the decay window as unseen, so parked titles return', () => {
    expect(fatiguePenaltyFor({ views: 9, lastSeenMs: daysAgo(60) }, false, CONFIG, NOW)).toBe(0);
  });
});

describe('applyFatiguePenalty', () => {
  const data = (fatigue: [number, { views: number; lastSeenMs: number }][], engaged: number[] = []): FatigueData => ({
    fatigue: new Map(fatigue),
    engaged: new Set(engaged),
  });

  it('is a no-op when there is no impression history', () => {
    const scored = [candidate(1, 0.9), candidate(2, 0.8)];
    expect(applyFatiguePenalty(scored, data([]), CONFIG, NOW)).toBe(scored);
  });

  it('reorders so a buried title falls behind an unseen one', () => {
    const scored = [candidate(1, 0.90), candidate(2, 0.60)];
    const out = applyFatiguePenalty(
      scored,
      data([[1, { views: 5, lastSeenMs: NOW }]]),
      CONFIG,
      NOW,
    );
    // 0.90 - 0.5 = 0.40, which is now below the untouched 0.60.
    expect(out.map((c) => c.tmdbId)).toEqual([2, 1]);
    expect(out[1].finalScore).toBeCloseTo(0.4);
  });

  it('leaves a parked title ahead of a much weaker one — parking is a nudge', () => {
    const scored = [candidate(1, 0.90), candidate(2, 0.60)];
    const out = applyFatiguePenalty(
      scored,
      data([[1, { views: 2, lastSeenMs: NOW }]]),
      CONFIG,
      NOW,
    );
    expect(out.map((c) => c.tmdbId)).toEqual([1, 2]);
    expect(out[0].finalScore).toBeCloseTo(0.82);
  });

  it('exempts engaged titles from burial', () => {
    const scored = [candidate(1, 0.90), candidate(2, 0.60)];
    const out = applyFatiguePenalty(
      scored,
      data([[1, { views: 9, lastSeenMs: NOW }]], [1]),
      CONFIG,
      NOW,
    );
    expect(out.map((c) => c.tmdbId)).toEqual([1, 2]);
    expect(out[0].finalScore).toBeCloseTo(0.9);
  });

  it('does not mutate the candidates it was given', () => {
    const scored = [candidate(1, 0.90)];
    applyFatiguePenalty(scored, data([[1, { views: 5, lastSeenMs: NOW }]]), CONFIG, NOW);
    expect(scored[0].finalScore).toBe(0.90);
  });

  it('reproduces the real 4.45-views-per-title case: those titles get buried', () => {
    // The heaviest user saw 29 distinct titles across 9 sessions. Titles at
    // 4+ views should drop; the tail at 1-2 views should barely move.
    const scored = [candidate(1, 0.80), candidate(2, 0.79), candidate(3, 0.78)];
    const out = applyFatiguePenalty(
      scored,
      data([
        [1, { views: 5, lastSeenMs: NOW }],
        [2, { views: 1, lastSeenMs: NOW }],
      ]),
      CONFIG,
      NOW,
    );
    // 3 (unseen, 0.78) and 2 (parked, 0.75) now lead; 1 (buried, 0.30) last.
    expect(out.map((c) => c.tmdbId)).toEqual([3, 2, 1]);
  });
});
