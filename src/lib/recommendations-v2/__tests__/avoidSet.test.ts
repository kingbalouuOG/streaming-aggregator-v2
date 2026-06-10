/**
 * ENG-1 Workstream B — unit tests for the pure avoid-set penalty
 * (applyAvoidPenalty). Fetch paths are I/O and covered by the eval gate.
 */

import { describe, it, expect } from 'vitest';
import { applyAvoidPenalty } from '../avoidSet';
import { computeNorm } from '../embeddingCache';
import type { CachedEmbedding, EmbeddingMap } from '../embeddingCache';
import type { ScoredCandidate, ExtendedTitleRow } from '../types';

function emb(vec: number[]): CachedEmbedding {
  const f = new Float32Array(vec);
  return { vec: f, norm: computeNorm(f) };
}

function candidate(tmdbId: number, finalScore: number): ScoredCandidate {
  return {
    tmdbId,
    mediaType: 'movie',
    contentKey: `movie-${tmdbId}`,
    scores: { taste: finalScore, recency: 0.5, contextual: 0.5 },
    finalScore,
    meta: { tmdb_id: tmdbId, media_type: 'movie', title: `t${tmdbId}` } as ExtendedTitleRow,
  };
}

const GAMMA = 0.15;

describe('applyAvoidPenalty', () => {
  it('penalises a candidate similar to an avoided title and re-sorts', () => {
    // Candidate 1 is identical to the avoided embedding (cos = 1);
    // candidate 2 is orthogonal (cos = 0). Initial order: 1 above 2.
    const map: EmbeddingMap = new Map([
      ['movie-1', emb([1, 0, 0])],
      ['movie-2', emb([0, 1, 0])],
    ]);
    const out = applyAvoidPenalty(
      [candidate(1, 0.80), candidate(2, 0.70)],
      [emb([1, 0, 0])],
      map,
      GAMMA,
    );
    // 0.80 − 0.15·1 = 0.65 < 0.70 → order flips
    expect(out.map(c => c.tmdbId)).toEqual([2, 1]);
    expect(out[1].finalScore).toBeCloseTo(0.65, 6);
    expect(out[0].finalScore).toBeCloseTo(0.70, 6);
  });

  it('does not penalise dissimilar (negative-cosine) candidates', () => {
    const map: EmbeddingMap = new Map([['movie-1', emb([-1, 0])]]);
    const out = applyAvoidPenalty([candidate(1, 0.5)], [emb([1, 0])], map, GAMMA);
    expect(out[0].finalScore).toBeCloseTo(0.5, 9);
  });

  it('uses the MAX cosine over the avoid set', () => {
    const map: EmbeddingMap = new Map([['movie-1', emb([1, 0])]]);
    const avoid = [emb([0, 1]), emb([1, 1])]; // cos 0 and cos ≈0.7071
    const out = applyAvoidPenalty([candidate(1, 0.5)], avoid, map, GAMMA);
    expect(out[0].finalScore).toBeCloseTo(0.5 - GAMMA * Math.SQRT1_2, 4);
  });

  it('passes through candidates with no embedding in the map', () => {
    const map: EmbeddingMap = new Map([['movie-1', emb([1, 0])]]);
    const out = applyAvoidPenalty(
      [candidate(1, 0.8), candidate(99, 0.7)], // 99 not in map (outside top-200)
      [emb([1, 0])],
      map,
      GAMMA,
    );
    expect(out.find(c => c.tmdbId === 99)!.finalScore).toBeCloseTo(0.7, 9);
  });

  it('no-ops on empty avoid set, zero gamma, or empty map', () => {
    const cands = [candidate(1, 0.8)];
    const map: EmbeddingMap = new Map([['movie-1', emb([1, 0])]]);
    expect(applyAvoidPenalty(cands, [], map, GAMMA)).toBe(cands);
    expect(applyAvoidPenalty(cands, [emb([1, 0])], map, 0)).toBe(cands);
    expect(applyAvoidPenalty(cands, [emb([1, 0])], new Map(), GAMMA)).toBe(cands);
  });

  it('does not mutate the input candidates', () => {
    const input = [candidate(1, 0.8)];
    const map: EmbeddingMap = new Map([['movie-1', emb([1, 0])]]);
    applyAvoidPenalty(input, [emb([1, 0])], map, GAMMA);
    expect(input[0].finalScore).toBeCloseTo(0.8, 9);
  });
});
