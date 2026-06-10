/**
 * Tests for the shared centroidMath module.
 *
 * Run via: npm test (vitest)
 */

import { describe, it, expect } from 'vitest';
import { computeCentroid, computeWeightedCentroid, cosineSimilarity, l2Norm } from '../../../supabase/functions/_shared/centroidMath.ts';

describe('computeCentroid', () => {
  it('centroid of a single vector returns that vector', () => {
    const v = [1, 2, 3];
    const result = computeCentroid([v]);
    expect(result).toEqual([1, 2, 3]);
  });

  it('centroid of two vectors returns element-wise mean', () => {
    const result = computeCentroid([[0, 0, 4], [0, 0, 8]]);
    expect(result).toEqual([0, 0, 6]);
  });

  it('centroid of identical vectors returns that vector', () => {
    const v = [0.5, -0.3, 1.2];
    const result = computeCentroid([v, v, v]);
    for (let i = 0; i < v.length; i++) {
      expect(Math.abs(result[i] - v[i]) < 1e-10, `dim ${i}: ${result[i]} !== ${v[i]}`).toBe(true);
    }
  });

  it('centroid of opposing vectors returns midpoint (zero)', () => {
    const result = computeCentroid([[1, 0, 0], [-1, 0, 0]]);
    expect(result).toEqual([0, 0, 0]);
  });

  it('centroid throws on empty input', () => {
    expect(() => computeCentroid([])).toThrow(/zero vectors/);
  });
});

describe('computeWeightedCentroid', () => {
  it('weighted centroid with equal weights matches unweighted', () => {
    const vecs = [[1, 2, 3], [4, 5, 6]];
    const unweighted = computeCentroid(vecs);
    const weighted = computeWeightedCentroid(vecs, [1, 1]);
    for (let i = 0; i < unweighted.length; i++) {
      expect(Math.abs(weighted[i] - unweighted[i]) < 1e-10, `dim ${i}`).toBe(true);
    }
  });

  it('weighted centroid of single vector returns that vector regardless of weight', () => {
    const v = [3, 7, -2];
    const result = computeWeightedCentroid([v], [5]);
    expect(result).toEqual([3, 7, -2]);
  });

  it('weighted centroid with weight [1, 0] returns first vector', () => {
    const result = computeWeightedCentroid([[10, 20], [30, 40]], [1, 0]);
    expect(result).toEqual([10, 20]);
  });

  it('weighted centroid applies weights correctly', () => {
    // weight 3:1 → centroid should be 3/4 of v1 + 1/4 of v2
    const result = computeWeightedCentroid([[0, 0], [4, 8]], [3, 1]);
    expect(result).toEqual([1, 2]); // (3*0 + 1*4)/4, (3*0 + 1*8)/4
  });

  it('weighted centroid throws on mismatched lengths', () => {
    expect(() => computeWeightedCentroid([[1, 2]], [1, 2])).toThrow(/same length/);
  });

  it('weighted centroid throws on empty input', () => {
    expect(() => computeWeightedCentroid([], [])).toThrow(/zero vectors/);
  });

  it('weighted centroid throws on zero total weight', () => {
    expect(() => computeWeightedCentroid([[1, 2]], [0])).toThrow(/total weight is zero/);
  });
});

describe('cosineSimilarity', () => {
  it('cosine similarity of identical vectors is 1.0', () => {
    const v = [1, 2, 3, 4, 5];
    expect(Math.abs(cosineSimilarity(v, v) - 1.0) < 1e-10).toBe(true);
  });

  it('cosine similarity of orthogonal vectors is 0.0', () => {
    expect(Math.abs(cosineSimilarity([1, 0, 0], [0, 1, 0])) < 1e-10).toBe(true);
  });

  it('cosine similarity of opposite vectors is -1.0', () => {
    expect(Math.abs(cosineSimilarity([1, 0], [-1, 0]) - (-1.0)) < 1e-10).toBe(true);
  });

  it('cosine similarity with zero vector returns 0', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });

  it('cosine similarity is scale-invariant', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    const scaled = [2, 4, 6]; // 2x of a
    expect(Math.abs(cosineSimilarity(a, b) - cosineSimilarity(scaled, b)) < 1e-10).toBe(true);
  });
});

describe('l2Norm', () => {
  it('l2Norm of unit vector is 1.0', () => {
    expect(Math.abs(l2Norm([1, 0, 0]) - 1.0) < 1e-10).toBe(true);
  });

  it('l2Norm of [3,4] is 5.0', () => {
    expect(Math.abs(l2Norm([3, 4]) - 5.0) < 1e-10).toBe(true);
  });

  it('l2Norm of zero vector is 0', () => {
    expect(l2Norm([0, 0, 0])).toBe(0);
  });
});
