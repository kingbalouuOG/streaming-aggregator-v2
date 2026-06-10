/**
 * ENG-1 Workstream A — unit tests for the pure multi-interest pool merge
 * (dedupeAcrossPools, interleavePools, mergeInterestPools).
 */

import { describe, it, expect } from 'vitest';
import { dedupeAcrossPools, interleavePools, mergeInterestPools } from '../interestPools';
import type { InterestPool } from '../interestPools';
import type { MatchedTitle } from '../types';

let nextId = 1;
function m(tmdbId: number, distance: number, mediaType: 'movie' | 'tv' = 'movie'): MatchedTitle {
  return { id: nextId++, tmdb_id: tmdbId, title: `t${tmdbId}`, media_type: mediaType, distance };
}

function pool(slot: number, weight: number, matched: MatchedTitle[]): InterestPool {
  return { slot, weight, matched };
}

describe('dedupeAcrossPools', () => {
  it('assigns a duplicate to the closer pool and tags sourceSlot', () => {
    const pools = dedupeAcrossPools([
      pool(0, 0.5, [m(1, 0.30), m(2, 0.40)]),
      pool(1, 0.5, [m(1, 0.20), m(3, 0.35)]),
    ]);
    // tmdb 1 appears in both — slot 1 is closer (0.20 < 0.30)
    expect(pools[0].matched.map(x => x.tmdb_id)).toEqual([2]);
    expect(pools[1].matched.map(x => x.tmdb_id)).toEqual([1, 3]);
    expect(pools[1].matched[0].sourceSlot).toBe(1);
    expect(pools[0].matched[0].sourceSlot).toBe(0);
  });

  it('treats same tmdb_id with different media_type as distinct candidates', () => {
    const pools = dedupeAcrossPools([
      pool(0, 0.5, [m(7, 0.30, 'movie')]),
      pool(1, 0.5, [m(7, 0.10, 'tv')]),
    ]);
    expect(pools[0].matched).toHaveLength(1);
    expect(pools[1].matched).toHaveLength(1);
  });

  it('preserves within-pool cosine order after removals', () => {
    const pools = dedupeAcrossPools([
      pool(0, 0.5, [m(1, 0.10), m(2, 0.20), m(3, 0.30)]),
      pool(1, 0.5, [m(2, 0.15), m(4, 0.25)]),
    ]);
    expect(pools[0].matched.map(x => x.tmdb_id)).toEqual([1, 3]);
    expect(pools[1].matched.map(x => x.tmdb_id)).toEqual([2, 4]);
  });
});

describe('interleavePools', () => {
  it('alternates between two equal-weight pools', () => {
    const out = interleavePools([
      pool(0, 0.5, [m(1, 0.1), m(2, 0.1), m(3, 0.1)]),
      pool(1, 0.5, [m(11, 0.1), m(12, 0.1), m(13, 0.1)]),
    ]);
    expect(out.map(x => x.tmdb_id)).toEqual([1, 11, 2, 12, 3, 13]);
  });

  it('emits proportionally to weight over a prefix', () => {
    const a = Array.from({ length: 40 }, (_, i) => m(100 + i, 0.1));
    const b = Array.from({ length: 40 }, (_, i) => m(200 + i, 0.1));
    const out = interleavePools([pool(0, 0.7, a), pool(1, 0.3, b)]);
    const first20 = out.slice(0, 20);
    const fromA = first20.filter(x => x.tmdb_id < 200).length;
    // Smooth WRR: 0.7 weight → 14 of the first 20 (±1 for rounding)
    expect(fromA).toBeGreaterThanOrEqual(13);
    expect(fromA).toBeLessThanOrEqual(15);
  });

  it('drains remaining pools when one is exhausted', () => {
    const out = interleavePools([
      pool(0, 0.8, [m(1, 0.1)]),
      pool(1, 0.2, [m(11, 0.1), m(12, 0.1), m(13, 0.1)]),
    ]);
    expect(out).toHaveLength(4);
    expect(out.slice(1).map(x => x.tmdb_id)).toEqual([11, 12, 13]);
  });

  it('passes a single pool through in order', () => {
    const items = [m(1, 0.1), m(2, 0.2), m(3, 0.3)];
    const out = interleavePools([pool(0, 1, items)]);
    expect(out.map(x => x.tmdb_id)).toEqual([1, 2, 3]);
  });

  it('handles empty input and empty pools', () => {
    expect(interleavePools([])).toEqual([]);
    expect(interleavePools([pool(0, 1, [])])).toEqual([]);
  });
});

describe('mergeInterestPools', () => {
  it('dedupes then interleaves, tagging every candidate with its source', () => {
    const out = mergeInterestPools([
      pool(0, 0.6, [m(1, 0.10), m(2, 0.20)]),
      pool(1, 0.4, [m(2, 0.15), m(3, 0.25)]),
    ]);
    // tmdb 2 belongs to slot 1 (0.15 < 0.20); no duplicates in output
    const ids = out.map(x => x.tmdb_id);
    expect([...ids].sort()).toEqual([1, 2, 3]);
    const two = out.find(x => x.tmdb_id === 2)!;
    expect(two.sourceSlot).toBe(1);
    expect(out.every(x => x.sourceSlot != null)).toBe(true);
  });
});
