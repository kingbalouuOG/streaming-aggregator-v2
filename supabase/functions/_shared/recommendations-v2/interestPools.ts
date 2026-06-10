// Mirror of src/lib/recommendations-v2/interestPools.ts — ADR-011 (final
// mirror generation per E&P D1; PLAT-3 dissolves this).
//
// Pure functions, no I/O: dedupe candidates that appear in multiple
// per-centroid retrieval pools (the closest source keeps them), then
// interleave the pools proportionally to interest weight via smooth
// weighted round-robin.

import type { MatchedTitle } from './types.ts';

export interface InterestPool {
  slot: number;
  weight: number;
  matched: MatchedTitle[];
}

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

export function mergeInterestPools(pools: InterestPool[]): MatchedTitle[] {
  return interleavePools(dedupeAcrossPools(pools));
}
