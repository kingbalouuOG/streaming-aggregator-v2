/**
 * MMR cost at k=20 vs k=36 (review 2026-09-09-001 finding 7).
 *
 * Shape matched to the real render: a candidate list of ~800 post-filter
 * rows, of which the top 200 hold embeddings (foryouRender fetches
 * embeddings for scored.slice(0, 200)), 1536-d Float32Array with a
 * precomputed norm, lambda 0.7 (variety slider midpoint).
 */
import { applyMMR } from '../../src/lib/recommendations-v2/diversity';
import type { EmbeddingMap } from '../../src/lib/recommendations-v2/embeddingCache';
import type { ScoredCandidate, ExtendedTitleRow } from '../../src/lib/recommendations-v2/types';

const DIM = 1536;
const POOL = Number(process.env.POOL ?? 800);
const EMBEDDED = Number(process.env.EMBEDDED ?? 200);
const LAMBDA = 0.7;
const REPS = Number(process.env.REPS ?? 40);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function meta(i: number): ExtendedTitleRow {
  return {
    tmdb_id: i, media_type: 'movie', title: `T${i}`, poster_path: null,
    backdrop_path: null, overview: null, release_date: '2020-01-01',
    release_year: 2020, genre_ids: [28, 12], vote_average: 7, vote_count: 500,
    popularity: 40, original_language: 'en', runtime: 100, cast_top_5: null,
    director: null, rt_score: null, imdb_rating: 7.5,
  };
}

function build(): { candidates: ScoredCandidate[]; map: EmbeddingMap } {
  const r = rng(42);
  const candidates: ScoredCandidate[] = [];
  const map: EmbeddingMap = new Map();
  for (let i = 0; i < POOL; i++) {
    const key = `movie-${i}`;
    candidates.push({
      tmdbId: i, mediaType: 'movie', contentKey: key,
      scores: { taste: 1 - i / POOL, recency: 0.5, contextual: 0.5 },
      finalScore: 1 - i / POOL, meta: meta(i),
    });
    if (i < EMBEDDED) {
      const vec = new Float32Array(DIM);
      let sum = 0;
      for (let d = 0; d < DIM; d++) {
        const v = r() * 2 - 1;
        vec[d] = v;
        sum += v * v;
      }
      map.set(key, { vec, norm: Math.sqrt(sum) });
    }
  }
  return { candidates, map };
}

function bench(k: number, candidates: ScoredCandidate[], map: EmbeddingMap): number[] {
  const samples: number[] = [];
  for (let i = 0; i < REPS; i++) {
    const t = performance.now();
    applyMMR(candidates, map, { lambda: LAMBDA, k });
    samples.push(performance.now() - t);
  }
  return samples.sort((a, b) => a - b);
}

function q(s: number[], p: number): number {
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}

const { candidates, map } = build();

// Warm the JIT so the first measured rep is not the outlier.
bench(20, candidates, map);

console.log(`pool=${POOL} embedded=${EMBEDDED} dim=${DIM} lambda=${LAMBDA} reps=${REPS}\n`);
const rows: string[] = [];
for (const k of [15, 20, 36]) {
  const s = bench(k, candidates, map);
  rows.push(`k=${String(k).padEnd(3)} p50=${q(s, 0.5).toFixed(1).padStart(7)}ms  p95=${q(s, 0.95).toFixed(1).padStart(7)}ms  min=${s[0].toFixed(1).padStart(7)}ms`);
}
console.log(rows.join('\n'));

// A cold For You render runs MMR three times: Recommended For You,
// Hidden Gems, Outside Your Usual (k = comfort-zone row count, ~8).
const per = (k: number) => q(bench(k, candidates, map), 0.5);
const beforeLen = per(20) + per(15) + per(8);
const uncapped = per(36) + per(36) + per(8);
const capped = per(20) + per(20) + per(8);
console.log('');
console.log('cold render, all three MMR calls:');
console.log(`  before the 36-row change (20 + 15 + 8): ${beforeLen.toFixed(1)}ms`);
console.log(`  36-row render, MMR uncapped (36+36+8):  ${uncapped.toFixed(1)}ms  (${(uncapped / beforeLen).toFixed(2)}x)`);
console.log(`  36-row render, MMR capped at 20:        ${capped.toFixed(1)}ms  (${(capped / beforeLen).toFixed(2)}x)`);
console.log('');
console.log(`  the cap saves ${(uncapped - capped).toFixed(1)}ms of CPU per cold render.`);
