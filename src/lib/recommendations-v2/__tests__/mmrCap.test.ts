import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MMR_MAX_K } from '../weights';
import { DEFAULT_SLIDERS } from '../../taste-v2/types';
import type { EmbeddingMap } from '../embeddingCache';
import type { ExtendedTitleRow, ScoredCandidate } from '../types';

/**
 * Review 2026-09-09-001 finding 7.
 *
 * MMR is quadratic in k over 1536-d vectors. The 36-item render ran it to
 * the full length on both long rows, which measured 3.4x the cold-render
 * diversity cost (scripts/evaluation/mmr-cost-bench.ts). It now runs to
 * MMR_MAX_K, and the reserve tail beyond that is filled by score with the
 * genre spread applied.
 */

const DIM = 8;
const POOL = 90;
const GENRES = [28, 12, 35, 18, 27, 878];

/** Every k applyMMR was asked for, in call order. */
const mmrCalls: number[] = [];

vi.mock('../diversity', async () => {
  const actual = await vi.importActual<typeof import('../diversity')>('../diversity');
  return {
    ...actual,
    applyMMR: (
      candidates: ScoredCandidate[],
      map: EmbeddingMap,
      opts: { lambda: number; k: number },
    ) => {
      mmrCalls.push(opts.k);
      return actual.applyMMR(candidates, map, opts);
    },
  };
});

function meta(i: number): ExtendedTitleRow {
  return {
    tmdb_id: i, media_type: 'movie', title: `T${i}`, poster_path: null,
    backdrop_path: null, overview: null, release_date: '2020-01-01',
    release_year: 2020, genre_ids: [GENRES[i % GENRES.length]],
    vote_average: 7, vote_count: 500, popularity: 40, original_language: 'en',
    runtime: 100, cast_top_5: null, director: null, rt_score: null,
    imdb_rating: 7.5,
  };
}

function fixture(): { candidates: ScoredCandidate[]; map: EmbeddingMap } {
  const candidates: ScoredCandidate[] = [];
  const map: EmbeddingMap = new Map();
  for (let i = 0; i < POOL; i++) {
    const key = `movie-${i}`;
    candidates.push({
      tmdbId: i, mediaType: 'movie', contentKey: key,
      scores: { taste: 1 - i / POOL, recency: 0.5, contextual: 0.5 },
      finalScore: 1 - i / POOL, meta: meta(i),
    });
    // Every candidate embedded, so MMR never takes the coverage bail.
    const vec = new Float32Array(DIM);
    let sum = 0;
    for (let d = 0; d < DIM; d++) {
      vec[d] = Math.sin(i * (d + 1));
      sum += vec[d] * vec[d];
    }
    map.set(key, { vec, norm: Math.sqrt(sum) });
  }
  return { candidates, map };
}

async function buildRow(limit: number) {
  const { buildRowFromPool } = await import('../ranker');
  const { candidates, map } = fixture();
  return buildRowFromPool(candidates, DEFAULT_SLIDERS, {
    config: { limit },
    embeddingMap: map,
  });
}

describe('buildRowFromPool: MMR is capped at MMR_MAX_K (finding 7)', () => {
  beforeEach(() => {
    mmrCalls.length = 0;
  });

  it('asks MMR for at most MMR_MAX_K however long the row is', async () => {
    await buildRow(36);
    expect(mmrCalls).toEqual([MMR_MAX_K]);
  });

  it('leaves a row shorter than the cap alone', async () => {
    await buildRow(8);
    expect(mmrCalls).toEqual([8]);
  });

  it('still returns the full reserve length, with no duplicates', async () => {
    const row = await buildRow(36);
    expect(row).toHaveLength(36);
    expect(new Set(row.map((i) => i.id)).size).toBe(36);
  });

  it('builds the visible head exactly as a 20-item row would have', async () => {
    const long = await buildRow(36);
    const short = await buildRow(MMR_MAX_K);
    expect(long.slice(0, MMR_MAX_K).map((i) => i.id)).toEqual(short.map((i) => i.id));
  });

  it('orders the reserve tail by score, not by MMR', async () => {
    const row = await buildRow(36);
    const tail = row.slice(MMR_MAX_K);

    expect(tail).toHaveLength(16);
    // applyGenreSpread filters but never reorders, so a score-filled tail
    // is non-increasing in match percentage. An MMR-selected tail is not.
    const scores = tail.map((i) => i.matchPercentage ?? 0);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('spreads genres across the reserve tail', async () => {
    const row = await buildRow(36);
    const tail = row.slice(MMR_MAX_K);

    // Score order alone would take 16 consecutive candidates, and the
    // fixture cycles six genres, so consecutive repeats are the signal
    // that the spread ran.
    for (let i = 1; i < tail.length; i++) {
      expect(tail[i].genre).not.toBe(tail[i - 1].genre);
    }
  });
});
