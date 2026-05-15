// Phase 5.5 C6b / IN-PX-25 — regression tests for applyMMR and the cached-
// norm cosineSimilarity (IN-PX-24). Pure functions; deterministic results.

import { describe, expect, it } from 'vitest';
import { applyMMR, cosineSimilarity } from '../diversity';
import type { EmbeddingMap } from '../embeddingCache';
import { computeNorm } from '../embeddingCache';
import type { ExtendedTitleRow, ScoredCandidate } from '../types';

function buildMeta(tmdbId: number, mediaType: 'movie' | 'tv' = 'movie'): ExtendedTitleRow {
  return {
    tmdb_id: tmdbId,
    media_type: mediaType,
    title: `Title ${tmdbId}`,
    poster_path: null,
    backdrop_path: null,
    overview: null,
    release_date: null,
    release_year: null,
    genre_ids: null,
    vote_average: null,
    vote_count: null,
    popularity: null,
    original_language: null,
    runtime: null,
    cast_top_5: null,
    director: null,
    rt_score: null,
    imdb_rating: null,
  };
}

function buildCandidate(tmdbId: number, finalScore: number): ScoredCandidate {
  return {
    tmdbId,
    mediaType: 'movie',
    contentKey: `movie-${tmdbId}`,
    scores: { taste: 0, recency: 0, contextual: 0 },
    finalScore,
    meta: buildMeta(tmdbId),
  };
}

function cachedEmbedding(vec: number[]) {
  const f32 = new Float32Array(vec);
  return { vec: f32, norm: computeNorm(f32) };
}

describe('applyMMR', () => {
  it('Test 6: lambda=1 returns finalScore-sorted output (no diversification)', () => {
    // Two candidates with the same embedding. At λ=1 the redundancy term
    // is zero-weighted, so output order is pure finalScore DESC.
    const embedding = cachedEmbedding([1, 0, 0]);
    const candidates = [
      buildCandidate(1, 0.4),
      buildCandidate(2, 0.9),
      buildCandidate(3, 0.7),
    ];
    const embeddingMap: EmbeddingMap = new Map([
      ['movie-1', embedding],
      ['movie-2', embedding],
      ['movie-3', embedding],
    ]);

    const result = applyMMR(candidates, embeddingMap, { lambda: 1, k: 3 });

    expect(result.bailedOut).toBe(false);
    expect(result.selected.map((c) => c.tmdbId)).toEqual([2, 3, 1]);
  });

  it('Test 7: empty embeddingMap returns finalScore-sorted output without crashing', () => {
    const candidates = [
      buildCandidate(1, 0.4),
      buildCandidate(2, 0.9),
      buildCandidate(3, 0.7),
    ];
    const result = applyMMR(candidates, new Map(), { lambda: 0.7, k: 3 });

    // All embeddings null → redundancy is 0 for every candidate → MMR
    // degenerates to pure finalScore order. (Below the bail threshold
    // for k=3 since MMR_MIN_SAMPLE is 4.)
    expect(result.selected.map((c) => c.tmdbId)).toEqual([2, 3, 1]);
  });

  it('Test 8: all-redundant candidates collapse the picked set to the top-finalScore item dominating', () => {
    // Three candidates with the same embedding. At λ=0.5 redundancy
    // penalty equals 0.5*1.0 = 0.5; relevance term is 0.5*finalScore.
    // For candidates 2 and 3 after pick 1, mmrScore = 0.5*finalScore - 0.5.
    // Candidate 2 is still picked second because its finalScore (0.8)
    // dominates 3 (0.7); the test asserts the top-finalScore item ranks
    // first under perfect redundancy (it always does — MMR seeds with it).
    const embedding = cachedEmbedding([1, 0, 0]);
    const candidates = [
      buildCandidate(1, 0.5),
      buildCandidate(2, 0.8),
      buildCandidate(3, 0.7),
    ];
    const embeddingMap: EmbeddingMap = new Map([
      ['movie-1', embedding],
      ['movie-2', embedding],
      ['movie-3', embedding],
    ]);

    const result = applyMMR(candidates, embeddingMap, { lambda: 0.5, k: 3 });

    expect(result.selected[0].tmdbId).toBe(2);
  });

  it('Test 9: partial-coverage fallback — 60% null embeddings → bailedOut=true', () => {
    // 10 candidates, only 2 have embeddings. After 4 picks (the
    // MMR_MIN_SAMPLE floor) the null ratio exceeds 0.5 and the
    // function bails with bailedOut=true.
    const embedding = cachedEmbedding([1, 0, 0]);
    const candidates = Array.from({ length: 10 }, (_, i) =>
      buildCandidate(i + 1, 1 - i * 0.05),
    );
    const embeddingMap: EmbeddingMap = new Map([
      ['movie-1', embedding],
      ['movie-2', embedding],
    ]);

    const result = applyMMR(candidates, embeddingMap, { lambda: 0.7, k: 10 });

    expect(result.bailedOut).toBe(true);
    // Bailout exits the loop early — fewer than k picks make it out.
    expect(result.selected.length).toBeLessThan(10);
    expect(result.selected.length).toBeGreaterThanOrEqual(4);
  });
});

describe('cosineSimilarity (cached-norm equivalence)', () => {
  it('Test 10: cached-norm result matches an inline-norm reference within 1e-9', () => {
    // Guards against IN-PX-24 introducing precision drift. Two
    // hand-picked vectors with a non-trivial cosine (~0.832) — neither
    // unit-normalised, so the norms must be applied for the result to
    // be correct.
    const aRaw = [1, 2, 3, 4];
    const bRaw = [2, 3, 4, 5];

    const a = cachedEmbedding(aRaw);
    const b = cachedEmbedding(bRaw);
    const cached = cosineSimilarity(a, b);

    // Inline reference (Float32 arithmetic, same as the production path
    // uses): compute dot + both norms from scratch.
    let dot = 0, normA = 0, normB = 0;
    const aF = new Float32Array(aRaw);
    const bF = new Float32Array(bRaw);
    for (let i = 0; i < aF.length; i++) {
      dot += aF[i] * bF[i];
      normA += aF[i] * aF[i];
      normB += bF[i] * bF[i];
    }
    const reference = dot / Math.sqrt(normA * normB);

    expect(cached).toBeCloseTo(reference, 9);
  });
});
