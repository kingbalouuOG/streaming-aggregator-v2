/**
 * Taste Vector V2 — Weighted k-means (ENG-1 Workstream A)
 *
 * Tiny deterministic weighted k-means over unit-normalised embedding
 * vectors. The 24h batch recompute uses it to refresh interest centroids
 * from decay-weighted positively-interacted titles. Pure, no I/O.
 *
 * Determinism contract: seeding derives from a hash of the (sorted) point
 * keys, so the same interaction log always replays to the same centroids —
 * the replayability property the batch path already guarantees for the
 * summary vector. No Math.random anywhere.
 *
 * Scale: ≤ a few hundred points × 1536D × ≤10 iterations — milliseconds.
 * A dependency would be heavier than the ~80 lines it saves.
 */

import { l2Normalise } from './vectorOps';

export interface WeightedPoint {
  /** Stable identity (contentKey) — drives deterministic seeding */
  key: string;
  vec: number[];
  weight: number;
}

export interface KMeansResult {
  /** L2-normalised cluster centroids; empty clusters dropped */
  centroids: number[][];
  /** Per-cluster total sample mass, aligned with centroids */
  masses: number[];
}

/** FNV-1a 32-bit string hash */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — deterministic, good enough for seeding roulette */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dot(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}

/** Roulette-wheel pick over non-negative scores. Returns -1 if all zero. */
function roulette(rng: () => number, scores: number[]): number {
  let total = 0;
  for (const s of scores) total += s;
  if (total <= 0) return -1;
  let r = rng() * total;
  for (let i = 0; i < scores.length; i++) {
    r -= scores[i];
    if (r <= 0) return i;
  }
  return scores.length - 1;
}

/**
 * Weighted k-means with k-means++ seeding on cosine distance.
 * Input vectors are re-normalised defensively; assignment is by max dot
 * (== cosine on unit vectors); cluster update is the weighted mean,
 * renormalised. Converges or stops after maxIterations. Clusters that end
 * with no assigned points are dropped, so the returned K can be < k.
 */
export function weightedKMeans(
  points: WeightedPoint[],
  k: number,
  maxIterations = 10,
): KMeansResult {
  if (points.length === 0 || k <= 0) return { centroids: [], masses: [] };

  // Sort by key: identical input sets produce identical output regardless
  // of arrival order.
  const pts = [...points]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(p => ({ ...p, vec: l2Normalise(p.vec) }));

  const rng = mulberry32(fnv1a(pts.map(p => p.key).join('|')));
  const targetK = Math.min(k, pts.length);

  // ── k-means++ seeding ──
  const seedIdx: number[] = [];
  const first = roulette(rng, pts.map(p => p.weight));
  seedIdx.push(first === -1 ? 0 : first);

  while (seedIdx.length < targetK) {
    const scores = pts.map((p, i) => {
      if (seedIdx.includes(i)) return 0;
      let maxCos = -Infinity;
      for (const si of seedIdx) {
        const c = dot(p.vec, pts[si].vec);
        if (c > maxCos) maxCos = c;
      }
      // cosine distance to nearest chosen seed
      return p.weight * Math.max(1 - maxCos, 0);
    });
    const pick = roulette(rng, scores);
    if (pick === -1) break; // degenerate: every remaining point coincides with a seed
    seedIdx.push(pick);
  }

  let centroids = seedIdx.map(i => pts[i].vec.slice());

  // ── Lloyd iterations ──
  const assignments = new Array<number>(pts.length).fill(-1);
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    for (let p = 0; p < pts.length; p++) {
      let best = 0;
      let bestCos = -Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const cos = dot(pts[p].vec, centroids[c]);
        if (cos > bestCos) {
          bestCos = cos;
          best = c;
        }
      }
      if (assignments[p] !== best) {
        assignments[p] = best;
        changed = true;
      }
    }

    if (!changed) break;

    const dim = pts[0].vec.length;
    const sums = centroids.map(() => new Array<number>(dim).fill(0));
    const mass = centroids.map(() => 0);
    for (let p = 0; p < pts.length; p++) {
      const c = assignments[p];
      const w = pts[p].weight;
      mass[c] += w;
      const v = pts[p].vec;
      const s = sums[c];
      for (let i = 0; i < dim; i++) s[i] += w * v[i];
    }
    centroids = centroids.map((prev, c) => (mass[c] > 0 ? l2Normalise(sums[c]) : prev));
  }

  // ── Final masses + empty-cluster drop ──
  const finalMass = centroids.map(() => 0);
  for (let p = 0; p < pts.length; p++) finalMass[assignments[p]] += pts[p].weight;

  const centroidsOut: number[][] = [];
  const massesOut: number[] = [];
  for (let c = 0; c < centroids.length; c++) {
    if (finalMass[c] > 0) {
      centroidsOut.push(centroids[c]);
      massesOut.push(finalMass[c]);
    }
  }

  return { centroids: centroidsOut, masses: massesOut };
}
