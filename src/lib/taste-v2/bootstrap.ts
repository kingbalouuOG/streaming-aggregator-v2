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
import { centroid, weightedSum, l2Normalise, isZeroVector } from './vectorOps';
import type { TasteVectorV2 } from './types';

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

  if (watchedCount === 0) {
    service = 0.55; watched = 0.00; genre = 0.45;
  } else if (watchedCount <= 4) {
    service = 0.40; watched = 0.40; genre = 0.20;
  } else if (watchedCount <= 12) {
    service = 0.30; watched = 0.55; genre = 0.15;
  } else {
    service = 0.20; watched = 0.70; genre = 0.10;
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
