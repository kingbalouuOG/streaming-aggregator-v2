/**
 * ENG-1 Workstream A — unit tests for the pure interest-seed grouping
 * functions in bootstrap.ts (groupSeedsIntoInterests, computeInterestWeights).
 *
 * Vectors are small (2–3D) for readability — the functions are
 * dimension-agnostic; cosine geometry is what matters.
 */

import { describe, it, expect } from 'vitest';
import {
  groupSeedsIntoInterests,
  computeInterestWeights,
  INTEREST_MERGE_TAU,
} from '../bootstrap';
import { INTEREST_WEIGHT_FLOOR, MAX_INTEREST_CENTROIDS } from '../types';

// Orthogonal unit vectors: cosine 0 — far below any sane τ
const X = [1, 0, 0];
const Y = [0, 1, 0];
const Z = [0, 0, 1];

describe('groupSeedsIntoInterests', () => {
  it('keeps distant seeds as separate interests', () => {
    const groups = groupSeedsIntoInterests([
      { clusterId: 'comedy', vector: X },
      { clusterId: 'thriller', vector: Y },
    ]);
    expect(groups).toHaveLength(2);
    const members = groups.map(g => g.memberClusterIds.join(',')).sort();
    expect(members).toEqual(['comedy', 'thriller']);
  });

  it('merges near-identical seeds into one interest', () => {
    // cosine(X, nearX) ≈ 0.995 — well above τ
    const nearX = [1, 0.1, 0];
    const groups = groupSeedsIntoInterests([
      { clusterId: 'a', vector: X },
      { clusterId: 'b', vector: nearX },
      { clusterId: 'c', vector: Y },
    ]);
    expect(groups).toHaveLength(2);
    const merged = groups.find(g => g.memberClusterIds.length === 2);
    expect(merged).toBeDefined();
    expect([...merged!.memberClusterIds].sort()).toEqual(['a', 'b']);
  });

  it('enforces the K cap even when all seeds are distant', () => {
    // 4 mutually-distant-ish seeds in 4D — must still collapse to 3
    const seeds = [
      { clusterId: 'a', vector: [1, 0, 0, 0] },
      { clusterId: 'b', vector: [0, 1, 0, 0] },
      { clusterId: 'c', vector: [0, 0, 1, 0] },
      { clusterId: 'd', vector: [0, 0, 0, 1] },
    ];
    const groups = groupSeedsIntoInterests(seeds);
    expect(groups.length).toBeLessThanOrEqual(MAX_INTEREST_CENTROIDS);
    expect(groups.length).toBe(3);
    // All 4 clusters accounted for exactly once
    const all = groups.flatMap(g => g.memberClusterIds).sort();
    expect(all).toEqual(['a', 'b', 'c', 'd']);
  });

  it('merges the closest pair first and computes member-weighted means', () => {
    const nearX1 = [1, 0.05, 0];
    const nearX2 = [1, -0.05, 0];
    // 5 seeds: three X-ish, one Y, one Z → expect {3 X-ish}, {Y}, {Z}
    const groups = groupSeedsIntoInterests([
      { clusterId: 'x1', vector: X },
      { clusterId: 'x2', vector: nearX1 },
      { clusterId: 'x3', vector: nearX2 },
      { clusterId: 'y', vector: Y },
      { clusterId: 'z', vector: Z },
    ]);
    expect(groups).toHaveLength(3);
    const big = groups.find(g => g.memberClusterIds.length === 3);
    expect(big).toBeDefined();
    expect([...big!.memberClusterIds].sort()).toEqual(['x1', 'x2', 'x3']);
    // Member-weighted mean of the three X-ish vectors: x-component 1,
    // y-component (0 + 0.05 − 0.05)/3 = 0
    expect(big!.vector[0]).toBeCloseTo(1, 6);
    expect(big!.vector[1]).toBeCloseTo(0, 6);
  });

  it('respects a custom tau', () => {
    // cosine(X, mid) ≈ 0.707 — merges at τ=0.6, stays separate at τ=0.8
    const mid = [1, 1, 0];
    const seeds = [
      { clusterId: 'a', vector: X },
      { clusterId: 'b', vector: mid },
    ];
    expect(groupSeedsIntoInterests(seeds, 0.6)).toHaveLength(1);
    expect(groupSeedsIntoInterests(seeds, 0.8)).toHaveLength(2);
    expect(INTEREST_MERGE_TAU).toBeGreaterThan(0.707);
  });
});

describe('computeInterestWeights', () => {
  it('returns [1] for a single interest', () => {
    expect(computeInterestWeights([4])).toEqual([1]);
  });

  it('is proportional when no floor binds', () => {
    const w = computeInterestWeights([2, 2]);
    expect(w[0]).toBeCloseTo(0.5, 9);
    expect(w[1]).toBeCloseTo(0.5, 9);
  });

  it('floors minority interests and keeps the sum at 1', () => {
    // Proportional would be [0.8, 0.1, 0.1] — both minorities below floor
    const w = computeInterestWeights([8, 1, 1]);
    expect(w[1]).toBeCloseTo(INTEREST_WEIGHT_FLOOR, 9);
    expect(w[2]).toBeCloseTo(INTEREST_WEIGHT_FLOOR, 9);
    expect(w[0]).toBeCloseTo(1 - 2 * INTEREST_WEIGHT_FLOOR, 9);
    expect(w.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9);
  });

  it('handles the single-minority case without dragging others below floor', () => {
    // Proportional [0.6, 0.3, 0.1]: only the last is floored; the other
    // two share the remaining 0.85 proportionally (0.5667, 0.2833)
    const w = computeInterestWeights([6, 3, 1]);
    expect(w[2]).toBeCloseTo(INTEREST_WEIGHT_FLOOR, 9);
    expect(w[0]).toBeCloseTo(0.85 * (6 / 9), 6);
    expect(w[1]).toBeCloseTo(0.85 * (3 / 9), 6);
    expect(w[0]).toBeGreaterThan(INTEREST_WEIGHT_FLOOR);
    expect(w[1]).toBeGreaterThan(INTEREST_WEIGHT_FLOOR);
    expect(w.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9);
  });
});
