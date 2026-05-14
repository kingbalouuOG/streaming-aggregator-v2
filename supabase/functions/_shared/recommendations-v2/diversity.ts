// Mirror of src/lib/recommendations-v2/diversity.ts — IN-466 / ADR-011.
// Pure module; bit-for-bit copy. Drift enforced by shared-tree-drift CI.

import { TASTE_CLUSTERS } from '../taste-v2/tasteClusters.ts';
import type { ScoredCandidate, ExtendedTitleRow } from './types.ts';
import type { EmbeddingMap, CachedEmbedding } from './embeddingCache.ts';
import { MAX_CONSECUTIVE_SAME_SERVICE } from './weights.ts';

const genreToClusterMap = buildGenreToClusterMap();

function buildGenreToClusterMap(): Map<number, string> {
  const map = new Map<number, string>();
  for (const cluster of TASTE_CLUSTERS) {
    for (const genreId of cluster.tmdbGenreIds) {
      if (!map.has(genreId)) {
        map.set(genreId, cluster.id);
      }
    }
  }
  return map;
}

function getTasteCluster(meta: ExtendedTitleRow): string | null {
  const primaryGenre = (meta.genre_ids || [])[0];
  if (!primaryGenre) return null;
  return genreToClusterMap.get(primaryGenre) ?? null;
}

export function applyGenreSpread(
  candidates: ScoredCandidate[],
  genreWindow: number,
  maxPerGenre: number,
  limit: number,
): ScoredCandidate[] {
  const selected: ScoredCandidate[] = [];
  const genreCounts = new Map<number, number>();
  const recentGenres: number[] = [];
  const recentClusters: string[] = [];

  for (const candidate of candidates) {
    if (selected.length >= limit) break;

    const primaryGenre = (candidate.meta.genre_ids || [])[0] ?? -1;
    const cluster = getTasteCluster(candidate.meta);

    if (primaryGenre !== -1 && (genreCounts.get(primaryGenre) ?? 0) >= maxPerGenre) {
      continue;
    }

    const recentGenreSlice = recentGenres.slice(-genreWindow);
    if (primaryGenre !== -1 && recentGenreSlice.includes(primaryGenre)) {
      continue;
    }

    if (cluster) {
      const recentClusterSlice = recentClusters.slice(-genreWindow);
      if (recentClusterSlice.includes(cluster)) {
        const lastSameClusterIdx = recentClusters.lastIndexOf(cluster);
        if (lastSameClusterIdx >= 0 && lastSameClusterIdx >= recentClusters.length - genreWindow) {
          const clusterRunCount = recentClusterSlice.filter((c) => c === cluster).length;
          if (clusterRunCount >= 2) continue;
        }
      }
    }

    selected.push(candidate);
    if (primaryGenre !== -1) {
      genreCounts.set(primaryGenre, (genreCounts.get(primaryGenre) ?? 0) + 1);
    }
    recentGenres.push(primaryGenre);
    recentClusters.push(cluster ?? '');
  }

  return selected;
}

// ── Phase 5: Maximal Marginal Relevance (MMR) ──

// MMR partial-coverage bail thresholds (IN-PX-23) — mirror of
// src/lib/recommendations-v2/diversity.ts.
const MMR_NULL_RATIO_BAIL = 0.5;
const MMR_MIN_SAMPLE = 4;

function cosineSimilarity(a: CachedEmbedding, b: CachedEmbedding): number {
  const denom = a.norm * b.norm;
  if (denom === 0) return 0;
  let dot = 0;
  const n = Math.min(a.vec.length, b.vec.length);
  for (let i = 0; i < n; i++) {
    dot += a.vec[i] * b.vec[i];
  }
  return dot / denom;
}

export interface MMRResult {
  selected: ScoredCandidate[];
  bailedOut: boolean;
}

export function applyMMR(
  candidates: ScoredCandidate[],
  embeddingMap: EmbeddingMap,
  opts: { lambda: number; k: number },
): MMRResult {
  if (candidates.length === 0) return { selected: [], bailedOut: false };
  const k = Math.min(opts.k, candidates.length);
  if (k === 0) return { selected: [], bailedOut: false };

  const remaining = [...candidates].sort((a, b) => b.finalScore - a.finalScore);
  const selected: ScoredCandidate[] = [remaining.shift()!];
  const selectedEmbeddings: Array<CachedEmbedding | null> = [
    embeddingMap.get(selected[0].contentKey) ?? null,
  ];
  let nullCount = selectedEmbeddings[0] === null ? 1 : 0;

  while (selected.length < k && remaining.length > 0) {
    if (
      selected.length >= MMR_MIN_SAMPLE &&
      nullCount / selected.length > MMR_NULL_RATIO_BAIL
    ) {
      console.debug(
        `[MMR] partial-coverage bail at ${selected.length} picks ` +
        `(${nullCount} null embeddings); caller will fall through to applyGenreSpread.`,
      );
      return { selected, bailedOut: true };
    }

    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      const cEmb = embeddingMap.get(c.contentKey);

      let maxRedundancy = 0;
      if (cEmb) {
        for (const sEmb of selectedEmbeddings) {
          if (!sEmb) continue;
          const sim = cosineSimilarity(cEmb, sEmb);
          if (sim > maxRedundancy) maxRedundancy = sim;
        }
      }

      const mmrScore = opts.lambda * c.finalScore - (1 - opts.lambda) * maxRedundancy;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;
    const picked = remaining.splice(bestIdx, 1)[0];
    selected.push(picked);
    const pickedEmb = embeddingMap.get(picked.contentKey) ?? null;
    selectedEmbeddings.push(pickedEmb);
    if (pickedEmb === null) nullCount++;
  }

  return { selected, bailedOut: false };
}

export function deClusterByService(
  candidates: ScoredCandidate[],
  getServices: (tmdbId: number, mediaType: string) => string[],
): ScoredCandidate[] {
  if (candidates.length <= MAX_CONSECUTIVE_SAME_SERVICE) return [...candidates];

  const result = [...candidates];
  const maxConsecutive = MAX_CONSECUTIVE_SAME_SERVICE;

  for (let i = maxConsecutive; i < result.length; i++) {
    const currentServices = new Set(getServices(result[i].tmdbId, result[i].mediaType));

    let allSameService = true;
    for (let j = 1; j <= maxConsecutive; j++) {
      const prevServices = getServices(result[i - j].tmdbId, result[i - j].mediaType);
      const hasOverlap = prevServices.some((s) => currentServices.has(s));
      if (!hasOverlap) {
        allSameService = false;
        break;
      }
    }

    if (!allSameService) continue;

    for (let k = i + 1; k < result.length; k++) {
      const swapServices = new Set(getServices(result[k].tmdbId, result[k].mediaType));
      let wouldCluster = false;
      for (let j = 1; j <= maxConsecutive && i - j >= 0; j++) {
        const prevServices = getServices(result[i - j].tmdbId, result[i - j].mediaType);
        if (prevServices.some((s) => swapServices.has(s))) {
          wouldCluster = true;
          break;
        }
      }

      if (!wouldCluster) {
        [result[i], result[k]] = [result[k], result[i]];
        break;
      }
    }
  }

  return result;
}

export function applyContentMixRatio(
  candidates: ScoredCandidate[],
  movieRatio: number,
): ScoredCandidate[] {
  if (movieRatio >= 0.45 && movieRatio <= 0.55) return candidates;

  const movies = candidates.filter((c) => c.mediaType === 'movie');
  const tvShows = candidates.filter((c) => c.mediaType === 'tv');

  const totalTarget = candidates.length;
  const movieTarget = Math.round(totalTarget * movieRatio);
  const tvTarget = totalTarget - movieTarget;

  const selectedMovies = movies.slice(0, movieTarget);
  const selectedTV = tvShows.slice(0, tvTarget);

  const result: ScoredCandidate[] = [];
  let mi = 0;
  let ti = 0;
  let movieCount = 0;

  while (mi < selectedMovies.length || ti < selectedTV.length) {
    const currentMovieRatio = result.length === 0 ? 0 : movieCount / result.length;

    if (mi < selectedMovies.length && (ti >= selectedTV.length || currentMovieRatio < movieRatio)) {
      result.push(selectedMovies[mi++]);
      movieCount++;
    } else if (ti < selectedTV.length) {
      result.push(selectedTV[ti++]);
    } else {
      break;
    }
  }

  return result;
}
