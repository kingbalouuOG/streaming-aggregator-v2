/**
 * Taste Vector V2 — Bootstrap
 *
 * Computes the initial taste vector from onboarding signals:
 * - Service fingerprints (centroid of selected services)
 * - Watched-grid selections (centroid of selected title embeddings)
 * - Genre/cluster seed titles (centroid of representative title embeddings)
 *
 * Weights are dynamic based on how many watched-grid titles the user selected.
 */

import { supabase } from '../supabase';
import { centroid, weightedSum, l2Normalise, isZeroVector, rawCosineSimilarity } from './vectorOps';
import type { TasteVectorV2 } from './types';
import { MAX_INTEREST_CENTROIDS, INTEREST_WEIGHT_FLOOR } from './types';

/** Fetch service fingerprint centroids for the given service IDs */
export async function fetchServiceCentroids(
  serviceIds: string[],
): Promise<number[][]> {
  if (serviceIds.length === 0) return [];

  const { data, error } = await supabase
    .from('service_fingerprints')
    .select('centroid')
    .in('service_id', serviceIds)
    .eq('variant', 'v1_popularity')
    .eq('region', 'GB');

  if (error || !data) {
    console.error('[Bootstrap] Failed to fetch service fingerprints:', (error as any)?.message);
    return [];
  }

  return data
    .map(row => {
      if (!row.centroid) return null;
      return typeof row.centroid === 'string'
        ? JSON.parse(row.centroid) as number[]
        : row.centroid as number[];
    })
    .filter((v): v is number[] => v != null);
}

/** Fetch title embeddings for the given tmdb IDs */
export async function fetchTitleEmbeddings(
  titles: { tmdbId: number; mediaType: 'movie' | 'tv' }[],
): Promise<number[][]> {
  if (titles.length === 0) return [];

  const tmdbIds = titles.map(t => t.tmdbId);

  const { data, error } = await supabase
    .from('titles')
    .select('tmdb_id, embedding')
    .in('tmdb_id', tmdbIds)
    .not('embedding', 'is', null);

  if (error || !data) {
    console.error('[Bootstrap] Failed to fetch title embeddings:', (error as any)?.message);
    return [];
  }

  return data
    .map(row => {
      if (!row.embedding) return null;
      return typeof row.embedding === 'string'
        ? JSON.parse(row.embedding) as number[]
        : row.embedding as number[];
    })
    .filter((v): v is number[] => v != null);
}

/**
 * Get bootstrap weights based on watched-grid selection count.
 * More selections = more weight on the personal signal.
 */
export function getBootstrapWeights(
  watchedCount: number,
  hasGenres: boolean,
): { service: number; watched: number; genre: number } {
  let service: number;
  let watched: number;
  let genre: number;

  // Cluster-dominant weighting (validated against 2,280-trial simulation sweep,
  // 2026-05-08; see scripts/simulate-profile-sweep.ts). Declared cluster signal
  // carries 75% weight across tap counts — makes profile align reliably with
  // what the user said they want, instead of drifting toward whichever
  // canonical anchors got tapped. CAF lifts from 1.06 → 1.22,
  // persona-distinctness from 0.022 → 0.190.
  // Invariant: service + watched + genre === 1.0 in every branch below.
  if (watchedCount === 0) {
    service = 0.25; watched = 0.00; genre = 0.75;
  } else if (watchedCount <= 4) {
    service = 0.13; watched = 0.12; genre = 0.75;
  } else if (watchedCount <= 12) {
    service = 0.09; watched = 0.16; genre = 0.75;
  } else {
    service = 0.05; watched = 0.20; genre = 0.75;
  }

  // If no genre selections, redistribute genre weight to service
  if (!hasGenres) {
    service += genre;
    genre = 0;
  }

  return { service, watched, genre };
}

/**
 * Bootstrap the taste vector from onboarding signals.
 *
 * Returns L2-normalised 1536D vector, or null if no signal is available.
 */
export async function bootstrapTasteVector(params: {
  serviceIds: string[];
  watchedTitles: { tmdbId: number; mediaType: 'movie' | 'tv' }[];
  clusterRepresentativeTmdbIds: { tmdbId: number; mediaType: 'movie' | 'tv' }[];
}): Promise<TasteVectorV2 | null> {
  const { serviceIds, watchedTitles, clusterRepresentativeTmdbIds } = params;

  // Fetch all embeddings in parallel
  const [serviceCentroids, watchedEmbeddings, genreEmbeddings] = await Promise.all([
    fetchServiceCentroids(serviceIds),
    fetchTitleEmbeddings(watchedTitles),
    fetchTitleEmbeddings(clusterRepresentativeTmdbIds),
  ]);

  const serviceVector = serviceCentroids.length > 0 ? centroid(serviceCentroids) : null;
  const watchedVector = watchedEmbeddings.length > 0 ? centroid(watchedEmbeddings) : null;
  const genreVector = genreEmbeddings.length > 0 ? centroid(genreEmbeddings) : null;

  // Need at least one signal
  if (!serviceVector && !watchedVector && !genreVector) {
    console.warn('[Bootstrap] No signals available for bootstrapping');
    return null;
  }

  const weights = getBootstrapWeights(
    watchedEmbeddings.length,
    genreEmbeddings.length > 0,
  );

  // Build weighted combination from available components
  const vectors: number[][] = [];
  const componentWeights: number[] = [];

  if (serviceVector && weights.service > 0) {
    vectors.push(serviceVector);
    componentWeights.push(weights.service);
  }
  if (watchedVector && weights.watched > 0) {
    vectors.push(watchedVector);
    componentWeights.push(weights.watched);
  }
  if (genreVector && weights.genre > 0) {
    vectors.push(genreVector);
    componentWeights.push(weights.genre);
  }

  if (vectors.length === 0) return null;

  const combined = weightedSum(vectors, componentWeights);

  if (isZeroVector(combined)) return null;

  return l2Normalise(combined);
}

// ── Interest centroids (ENG-1, Workstream A) ──
//
// Instead of collapsing the 3–5 selected clusters into one averaged vector
// (which points at none of them for a multi-modal user), group them into
// K ≤ 3 interest seeds: clusters whose centroids are close in embedding
// space merge into one interest, distant ones stay separate. Service and
// watched-grid signal blend into each interest at the existing validated
// band weights.

/**
 * Merge threshold: cluster-seed pairs with raw cosine ≥ τ collapse into one
 * interest. 0.80 is the starting value — the ENG-1 eval gate prints the
 * pairwise cosine matrix over all 24 onboarding clusters and tunes τ from
 * data (plan §6).
 */
export const INTEREST_MERGE_TAU = 0.80;

export interface InterestGroup {
  /** Member-count-weighted mean of the merged cluster seed vectors (not normalised) */
  vector: number[];
  memberClusterIds: string[];
}

/**
 * Greedy agglomerative grouping of per-cluster seed vectors into ≤ maxK
 * interests. Merges the closest pair while over the cap, or while the
 * closest pair is more similar than tau. Pure — exported for unit tests.
 */
export function groupSeedsIntoInterests(
  seeds: { clusterId: string; vector: number[] }[],
  tau: number = INTEREST_MERGE_TAU,
  maxK: number = MAX_INTEREST_CENTROIDS,
): InterestGroup[] {
  let groups: { vector: number[]; count: number; memberClusterIds: string[] }[] =
    seeds.map(s => ({ vector: s.vector.slice(), count: 1, memberClusterIds: [s.clusterId] }));

  while (groups.length > 1) {
    // Find the closest pair by raw cosine of group means
    let bestI = 0;
    let bestJ = 1;
    let bestCos = -Infinity;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const cos = rawCosineSimilarity(groups[i].vector, groups[j].vector);
        if (cos > bestCos) {
          bestCos = cos;
          bestI = i;
          bestJ = j;
        }
      }
    }

    const mustMerge = groups.length > maxK;
    if (!mustMerge && bestCos < tau) break;

    // Merge j into i: member-count-weighted mean
    const a = groups[bestI];
    const b = groups[bestJ];
    const total = a.count + b.count;
    const merged = a.vector.map((v, idx) => (v * a.count + b.vector[idx] * b.count) / total);
    const next = groups.filter((_, idx) => idx !== bestI && idx !== bestJ);
    next.push({ vector: merged, count: total, memberClusterIds: [...a.memberClusterIds, ...b.memberClusterIds] });
    groups = next;
  }

  return groups.map(g => ({ vector: g.vector, memberClusterIds: g.memberClusterIds }));
}

/**
 * Interest retrieval weights: proportional to member count, floored at
 * INTEREST_WEIGHT_FLOOR, renormalised to sum 1. Iterative floor-clamp —
 * minorities are pinned at the floor and the remainder is redistributed
 * proportionally among the rest (≤ 2 iterations at K ≤ 3).
 * Pure — exported for unit tests.
 */
export function computeInterestWeights(
  memberCounts: number[],
  floor: number = INTEREST_WEIGHT_FLOOR,
): number[] {
  const n = memberCounts.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  const total = memberCounts.reduce((s, c) => s + c, 0);
  let weights = memberCounts.map(c => c / total);

  for (let iter = 0; iter < n; iter++) {
    const floored = weights.map(w => w < floor);
    if (!floored.some(Boolean)) break;

    const flooredMass = floor * floored.filter(Boolean).length;
    const freeMass = 1 - flooredMass;
    const freeTotal = weights.reduce((s, w, i) => (floored[i] ? s : s + w), 0);

    weights = weights.map((w, i) =>
      floored[i] ? floor : (freeTotal > 0 ? (w / freeTotal) * freeMass : freeMass / (n - floored.filter(Boolean).length)),
    );
  }

  // Exact renormalise against floating-point drift
  const sum = weights.reduce((s, w) => s + w, 0);
  return weights.map(w => w / sum);
}

/** Fetch title embeddings keyed by tmdb_id (grouping requires the association) */
async function fetchTitleEmbeddingMap(
  titles: { tmdbId: number; mediaType: 'movie' | 'tv' }[],
): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (titles.length === 0) return map;

  const tmdbIds = [...new Set(titles.map(t => t.tmdbId))];

  const { data, error } = await supabase
    .from('titles')
    .select('tmdb_id, embedding')
    .in('tmdb_id', tmdbIds)
    .not('embedding', 'is', null);

  if (error || !data) {
    console.error('[Bootstrap] Failed to fetch title embedding map:', (error as any)?.message);
    return map;
  }

  for (const row of data) {
    if (!row.embedding) continue;
    const emb = typeof row.embedding === 'string'
      ? JSON.parse(row.embedding) as number[]
      : row.embedding as number[];
    map.set(row.tmdb_id, emb);
  }

  return map;
}

/**
 * Bootstrap K ≤ 3 interest centroids from onboarding signals.
 *
 * Returns interests sorted by weight DESC (slot 0 = dominant), or null when
 * no cluster signal is available (services_only path) — caller then skips
 * the centroid save and the user stays on the single-centroid fallback.
 *
 * The single summary vector (bootstrapTasteVector) is still computed and
 * saved by the caller regardless — both run.
 */
export async function bootstrapInterestCentroids(params: {
  serviceIds: string[];
  watchedTitles: { tmdbId: number; mediaType: 'movie' | 'tv' }[];
  clusterSeeds: { clusterId: string; tmdbIds: { tmdbId: number; mediaType: 'movie' | 'tv' }[] }[];
}): Promise<{ centroid: TasteVectorV2; weight: number }[] | null> {
  const { serviceIds, watchedTitles, clusterSeeds } = params;

  if (clusterSeeds.length === 0) return null;

  const allReps = clusterSeeds.flatMap(s => s.tmdbIds);
  const [serviceCentroids, watchedEmbeddings, repMap] = await Promise.all([
    fetchServiceCentroids(serviceIds),
    fetchTitleEmbeddings(watchedTitles),
    fetchTitleEmbeddingMap(allReps),
  ]);

  // Per-cluster seed vectors
  const seeds: { clusterId: string; vector: number[] }[] = [];
  for (const s of clusterSeeds) {
    const embeddings = s.tmdbIds
      .map(t => repMap.get(t.tmdbId))
      .filter((v): v is number[] => v != null);
    if (embeddings.length === 0) continue;
    seeds.push({ clusterId: s.clusterId, vector: l2Normalise(centroid(embeddings)) });
  }

  if (seeds.length === 0) {
    console.warn('[Bootstrap] No cluster seed embeddings available for interest centroids');
    return null;
  }

  const groups = groupSeedsIntoInterests(seeds);

  const serviceVector = serviceCentroids.length > 0 ? centroid(serviceCentroids) : null;
  const watchedVector = watchedEmbeddings.length > 0 ? centroid(watchedEmbeddings) : null;
  const bandWeights = getBootstrapWeights(watchedEmbeddings.length, true);

  const interestVectors: { vector: TasteVectorV2; memberCount: number }[] = [];
  for (const group of groups) {
    const vectors: number[][] = [];
    const componentWeights: number[] = [];

    if (serviceVector && bandWeights.service > 0) {
      vectors.push(serviceVector);
      componentWeights.push(bandWeights.service);
    }
    if (watchedVector && bandWeights.watched > 0) {
      vectors.push(watchedVector);
      componentWeights.push(bandWeights.watched);
    }
    vectors.push(group.vector);
    componentWeights.push(bandWeights.genre);

    const combined = weightedSum(vectors, componentWeights);
    if (isZeroVector(combined)) continue;

    interestVectors.push({
      vector: l2Normalise(combined),
      memberCount: group.memberClusterIds.length,
    });
  }

  if (interestVectors.length === 0) return null;

  const weights = computeInterestWeights(interestVectors.map(iv => iv.memberCount));

  return interestVectors
    .map((iv, i) => ({ centroid: iv.vector, weight: weights[i] }))
    .sort((a, b) => b.weight - a.weight);
}
