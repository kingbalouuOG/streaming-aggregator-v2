// Mirror of src/lib/recommendations-v2/diversity.ts — IN-466 / ADR-011.
// Pure module; bit-for-bit copy. Drift enforced by shared-tree-drift CI.

import { TASTE_CLUSTERS } from '../taste-v2/tasteClusters.ts';
import type { ScoredCandidate, ExtendedTitleRow } from './types.ts';
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
