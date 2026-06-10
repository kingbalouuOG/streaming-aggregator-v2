/**
 * Taste Vector V2 — Interest-seed grouping (ENG-1 Workstream A)
 *
 * Pure functions, no I/O — split from bootstrap.ts so the eval harness
 * (scripts/evaluation/eng1-eval.ts, which runs under tsx where
 * src/lib/supabase.ts cannot be imported) evaluates the REAL grouping
 * logic rather than a duplicate. bootstrap.ts composes these with the
 * embedding fetches and re-exports them for existing import sites.
 */

import { rawCosineSimilarity } from './vectorOps';
import { MAX_INTEREST_CENTROIDS, INTEREST_WEIGHT_FLOOR } from './types';

/**
 * Merge threshold: cluster-seed pairs with raw cosine ≥ τ collapse into one
 * interest. 0.80 is the starting value — the ENG-1 eval gate prints the
 * pairwise cosine matrix over all onboarding clusters and tunes τ from
 * data (plan §6).
 */
export const INTEREST_MERGE_TAU = 0.80;

export interface InterestGroup {
  /** Member-count-weighted mean of the merged cluster seed vectors (not normalised) */
  vector: number[];
  memberClusterIds: string[];
}

/**
 * Greedy agglomerative grouping of per-cluster seed vectors into ≤ maxK
 * interests. Merges the closest pair while over the cap, or while the
 * closest pair is more similar than tau.
 */
export function groupSeedsIntoInterests(
  seeds: { clusterId: string; vector: number[] }[],
  tau: number = INTEREST_MERGE_TAU,
  maxK: number = MAX_INTEREST_CENTROIDS,
): InterestGroup[] {
  let groups: { vector: number[]; count: number; memberClusterIds: string[] }[] =
    seeds.map(s => ({ vector: s.vector.slice(), count: 1, memberClusterIds: [s.clusterId] }));

  while (groups.length > 1) {
    // Find the closest pair by raw cosine of group means
    let bestI = 0;
    let bestJ = 1;
    let bestCos = -Infinity;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const cos = rawCosineSimilarity(groups[i].vector, groups[j].vector);
        if (cos > bestCos) {
          bestCos = cos;
          bestI = i;
          bestJ = j;
        }
      }
    }

    const mustMerge = groups.length > maxK;
    if (!mustMerge && bestCos < tau) break;

    // Merge j into i: member-count-weighted mean
    const a = groups[bestI];
    const b = groups[bestJ];
    const total = a.count + b.count;
    const merged = a.vector.map((v, idx) => (v * a.count + b.vector[idx] * b.count) / total);
    const next = groups.filter((_, idx) => idx !== bestI && idx !== bestJ);
    next.push({ vector: merged, count: total, memberClusterIds: [...a.memberClusterIds, ...b.memberClusterIds] });
    groups = next;
  }

  return groups.map(g => ({ vector: g.vector, memberClusterIds: g.memberClusterIds }));
}

/**
 * Interest retrieval weights: proportional to member count (or mass),
 * floored at INTEREST_WEIGHT_FLOOR, renormalised to sum 1. Iterative
 * floor-clamp — minorities are pinned at the floor and the remainder is
 * redistributed proportionally among the rest (≤ 2 iterations at K ≤ 3).
 */
export function computeInterestWeights(
  memberCounts: number[],
  floor: number = INTEREST_WEIGHT_FLOOR,
): number[] {
  const n = memberCounts.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  const total = memberCounts.reduce((s, c) => s + c, 0);
  let weights = memberCounts.map(c => c / total);

  for (let iter = 0; iter < n; iter++) {
    const floored = weights.map(w => w < floor);
    if (!floored.some(Boolean)) break;

    const flooredMass = floor * floored.filter(Boolean).length;
    const freeMass = 1 - flooredMass;
    const freeTotal = weights.reduce((s, w, i) => (floored[i] ? s : s + w), 0);

    weights = weights.map((w, i) =>
      floored[i] ? floor : (freeTotal > 0 ? (w / freeTotal) * freeMass : freeMass / (n - floored.filter(Boolean).length)),
    );
  }

  // Exact renormalise against floating-point drift
  const sum = weights.reduce((s, w) => s + w, 0);
  return weights.map(w => w / sum);
}
