/**
 * ENG-1 Workstream A — unit tests for the deterministic weighted k-means
 * used by the 24h interest-centroid batch refresh.
 */

import { describe, it, expect } from 'vitest';
import { weightedKMeans } from '../kmeans';
import type { WeightedPoint } from '../kmeans';
import { rawCosineSimilarity } from '../vectorOps';

function p(key: string, vec: number[], weight = 1): WeightedPoint {
  return { key, vec, weight };
}

/** Two well-separated blobs in 3D: 4 points near +X, 4 near +Y */
function twoBlobs(): WeightedPoint[] {
  return [
    p('movie-1', [1, 0.05, 0]),
    p('movie-2', [1, -0.05, 0]),
    p('movie-3', [0.95, 0.1, 0]),
    p('movie-4', [1, 0, 0.05]),
    p('tv-11', [0.05, 1, 0]),
    p('tv-12', [-0.05, 1, 0]),
    p('tv-13', [0.1, 0.95, 0]),
    p('tv-14', [0, 1, 0.05]),
  ];
}

describe('weightedKMeans', () => {
  it('recovers two well-separated blobs at k=2', () => {
    const { centroids, masses } = weightedKMeans(twoBlobs(), 2);
    expect(centroids).toHaveLength(2);
    expect(masses.reduce((s, m) => s + m, 0)).toBeCloseTo(8, 6);

    // One centroid points X-ish, the other Y-ish
    const xish = centroids.find(c => c[0] > 0.9);
    const yish = centroids.find(c => c[1] > 0.9);
    expect(xish).toBeDefined();
    expect(yish).toBeDefined();
    expect(masses[0]).toBeCloseTo(4, 6);
    expect(masses[1]).toBeCloseTo(4, 6);
  });

  it('is deterministic and order-independent', () => {
    const a = weightedKMeans(twoBlobs(), 2);
    const b = weightedKMeans([...twoBlobs()].reverse(), 2);
    expect(a.centroids).toEqual(b.centroids);
    expect(a.masses).toEqual(b.masses);
  });

  it('clamps k to the number of points', () => {
    const { centroids } = weightedKMeans([p('a', [1, 0]), p('b', [0, 1])], 5);
    expect(centroids.length).toBeLessThanOrEqual(2);
  });

  it('collapses duplicate points instead of returning empty clusters', () => {
    const same = [p('a', [1, 0, 0]), p('b', [1, 0, 0]), p('c', [1, 0, 0])];
    const { centroids, masses } = weightedKMeans(same, 3);
    expect(centroids).toHaveLength(1);
    expect(masses[0]).toBeCloseTo(3, 6);
    expect(centroids[0][0]).toBeCloseTo(1, 6);
  });

  it('lets sample weight pull the centroid', () => {
    // One heavy point off-axis vs two light on-axis points, k=1
    const pts = [
      p('light-1', [1, 0], 0.1),
      p('light-2', [1, 0], 0.1),
      p('heavy', [0, 1], 10),
    ];
    const { centroids } = weightedKMeans(pts, 1);
    expect(centroids).toHaveLength(1);
    // Centroid should be much closer to the heavy point
    const cosToHeavy = rawCosineSimilarity(centroids[0], [0, 1]);
    const cosToLight = rawCosineSimilarity(centroids[0], [1, 0]);
    expect(cosToHeavy).toBeGreaterThan(cosToLight);
  });

  it('returns empty for empty input', () => {
    expect(weightedKMeans([], 3)).toEqual({ centroids: [], masses: [] });
  });

  it('returns unit-length centroids', () => {
    const { centroids } = weightedKMeans(twoBlobs(), 2);
    for (const c of centroids) {
      const norm = Math.sqrt(c.reduce((s, x) => s + x * x, 0));
      expect(norm).toBeCloseTo(1, 6);
    }
  });
});
