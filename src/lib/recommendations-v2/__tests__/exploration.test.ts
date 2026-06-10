/**
 * ENG-1 Workstream C — unit tests for the pure exploration-slot selection
 * and row splice. Seen-set fetch is I/O, covered by the eval gate.
 */

import { describe, it, expect } from 'vitest';
import {
  selectExplorationCandidates,
  spliceAtPositions,
  explorationDayStamp,
} from '../exploration';
import type { ScoredCandidate, ExtendedTitleRow } from '../types';

/** 20 candidates with taste descending 0.99 → 0.80 (rank = index) */
function makeScored(n = 20, popularity = 10): ScoredCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    tmdbId: 1000 + i,
    mediaType: 'movie' as const,
    contentKey: `movie-${1000 + i}`,
    scores: { taste: 0.99 - i * 0.01, recency: 0.5, contextual: 0.5 },
    finalScore: 0.99 - i * 0.01,
    meta: {
      tmdb_id: 1000 + i,
      media_type: 'movie',
      title: `t${i}`,
      popularity,
    } as ExtendedTitleRow,
  }));
}

const BAND: [number, number] = [0.40, 0.70];

describe('selectExplorationCandidates', () => {
  it('picks only from the taste-percentile band', () => {
    const scored = makeScored(20);
    const picks = selectExplorationCandidates(scored, {
      seenContentIds: new Set(),
      excludeKeys: new Set(),
      count: 2,
      band: BAND,
      seed: 'user:2026-06-10',
    });
    expect(picks).toHaveLength(2);
    // Band of 20 by taste rank = indices 8..13 → tmdbIds 1008..1013
    for (const p of picks) {
      expect(p.tmdbId).toBeGreaterThanOrEqual(1008);
      expect(p.tmdbId).toBeLessThanOrEqual(1013);
    }
  });

  it('excludes seen titles and already-used keys', () => {
    const scored = makeScored(20);
    const seen = new Set([1008, 1009, 1010]);
    const used = new Set(['movie-1011', 'movie-1012']);
    const picks = selectExplorationCandidates(scored, {
      seenContentIds: seen,
      excludeKeys: used,
      count: 2,
      band: BAND,
      seed: 'user:2026-06-10',
    });
    // Only 1013 remains in the band
    expect(picks).toHaveLength(1);
    expect(picks[0].tmdbId).toBe(1013);
  });

  it('is deterministic for the same seed and varies across seeds', () => {
    const scored = makeScored(40);
    const opts = {
      seenContentIds: new Set<number>(),
      excludeKeys: new Set<string>(),
      count: 2,
      band: BAND,
    };
    const a1 = selectExplorationCandidates(scored, { ...opts, seed: 'u:2026-06-10' });
    const a2 = selectExplorationCandidates(scored, { ...opts, seed: 'u:2026-06-10' });
    expect(a1.map(c => c.tmdbId)).toEqual(a2.map(c => c.tmdbId));

    // Different days should not always produce the identical pair
    const days = ['2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14'];
    const outcomes = new Set(days.map(d =>
      selectExplorationCandidates(scored, { ...opts, seed: `u:${d}` })
        .map(c => c.tmdbId).join(','),
    ));
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it('weights sampling by popularity', () => {
    // One overwhelming-popularity candidate in the band vs near-zero rest
    const scored = makeScored(20, 0.001);
    scored[10].meta.popularity = 100000; // inside the 8..13 band
    let hits = 0;
    for (let s = 0; s < 50; s++) {
      const picks = selectExplorationCandidates(scored, {
        seenContentIds: new Set(),
        excludeKeys: new Set(),
        count: 1,
        band: BAND,
        seed: `u:${s}`,
      });
      if (picks[0]?.tmdbId === 1010) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(48);
  });

  it('returns empty for empty pools or zero count', () => {
    expect(selectExplorationCandidates([], {
      seenContentIds: new Set(), excludeKeys: new Set(), count: 2, band: BAND, seed: 's',
    })).toEqual([]);
    expect(selectExplorationCandidates(makeScored(20), {
      seenContentIds: new Set(), excludeKeys: new Set(), count: 0, band: BAND, seed: 's',
    })).toEqual([]);
  });
});

describe('spliceAtPositions', () => {
  it('inserts picks at the configured positions', () => {
    const row = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const out = spliceAtPositions(row, ['X', 'Y'], [2, 5]);
    expect(out).toEqual(['a', 'b', 'X', 'c', 'd', 'Y', 'e', 'f', 'g']);
    expect(out).toHaveLength(9);
    expect(row).toHaveLength(7); // input untouched
  });

  it('clamps positions beyond the row length', () => {
    const out = spliceAtPositions(['a', 'b'], ['X', 'Y'], [5, 13]);
    expect(out).toEqual(['a', 'b', 'X', 'Y']);
  });

  it('handles zero picks', () => {
    expect(spliceAtPositions(['a'], [], [5, 13])).toEqual(['a']);
  });
});

describe('explorationDayStamp', () => {
  it('is the UTC date slice', () => {
    expect(explorationDayStamp(new Date('2026-06-10T23:59:59Z'))).toBe('2026-06-10');
    expect(explorationDayStamp(new Date('2026-06-11T00:00:01Z'))).toBe('2026-06-11');
  });
});
