/**
 * Recommendations V2 — Multi-interest pool merging (ENG-1 Workstream A)
 *
 * Pure functions, no I/O: dedupe candidates that appear in multiple
 * per-centroid retrieval pools (the closest source keeps them), then
 * interleave the pools proportionally to interest weight via smooth
 * weighted round-robin. ranker.ts composes these into fetchCandidatePool's
 * multi-interest path; the eval rig and unit tests import them directly.
 */

import type { MatchedTitle } from './types';

export interface InterestPool {
  slot: number;
  weight: number;
  /** RPC results for this centroid, in cosine-distance order (closest first) */
  matched: MatchedTitle[];
}

/**
 * Dedupe across pools on (tmdb_id, media_type): the pool whose centroid is
 * closest (smallest distance) keeps the candidate, tagged with sourceSlot.
 * Within-pool cosine order is preserved. Ties go to the lower slot
 * (pools are processed in input order; strict < keeps the first claim).
 */
export function dedupeAcrossPools(pools: InterestPool[]): InterestPool[] {
  const best = new Map<string, { slot: number; distance: number }>();
  for (const pool of pools) {
    for (const m of pool.matched) {
      const key = `${m.media_type}-${m.tmdb_id}`;
      const existing = best.get(key);
      if (!existing || m.distance < existing.distance) {
        best.set(key, { slot: pool.slot, distance: m.distance });
      }
    }
  }

  return pools.map(pool => ({
    ...pool,
    matched: pool.matched
      .filter(m => best.get(`${m.media_type}-${m.tmdb_id}`)!.slot === pool.slot)
      .map(m => ({ ...m, sourceSlot: pool.slot })),
  }));
}

/**
 * Smooth weighted round-robin interleave (the nginx algorithm), preserving
 * within-pool order. Every emission: each non-exhausted pool gains its
 * weight as credit; the highest-credit pool emits its next candidate and
 * pays back the total active weight. Deterministic — ties break to the
 * earliest pool in input order. Proportionality holds over every prefix,
 * which is what makes the top-100 metadata slice and the row builders see
 * a weight-faithful blend.
 */
export function interleavePools(pools: InterestPool[]): MatchedTitle[] {
  const result: MatchedTitle[] = [];
  const idx = pools.map(() => 0);
  const credit = pools.map(() => 0);

  for (;;) {
    let totalActiveWeight = 0;
    for (let i = 0; i < pools.length; i++) {
      if (idx[i] < pools[i].matched.length) {
        credit[i] += pools[i].weight;
        totalActiveWeight += pools[i].weight;
      }
    }
    if (totalActiveWeight === 0) break;

    let pick = -1;
    for (let i = 0; i < pools.length; i++) {
      if (idx[i] >= pools[i].matched.length) continue;
      if (pick === -1 || credit[i] > credit[pick]) pick = i;
    }

    result.push(pools[pick].matched[idx[pick]++]);
    credit[pick] -= totalActiveWeight;
  }

  return result;
}

/** Dedupe then interleave — the multi-interest Stage 1 merge. */
export function mergeInterestPools(pools: InterestPool[]): MatchedTitle[] {
  return interleavePools(dedupeAcrossPools(pools));
}
