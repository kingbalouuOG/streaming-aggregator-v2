/**
 * Content Vector Mapping
 *
 * Cached wrapper around the pure `contentToVector` function from
 * computeContentVector.ts. The cache is browser/Node-local (in-memory Map).
 *
 * Import this module in React/client code to get the cached version.
 * For batch server-side processing, import directly from computeContentVector.ts.
 */

import {
  type ContentMetadata,
  contentToVector as _contentToVector,
} from './computeContentVector';

// Re-export types and constants that other modules depend on
export type { ContentMetadata };
export { TMDB_GENRE_TO_DIM } from './computeContentVector';

// ── In-memory cache ─────────────────────────────────────────────

const vectorCache = new Map<string, ReturnType<typeof _contentToVector>>();
const MAX_CACHE_SIZE = 500;
const CACHE_VERSION = 2; // v2: positional weighting (was binary)

function getCacheKey(meta: ContentMetadata): string {
  // Don't sort genreIds — ordering carries relevance information
  return `cv${CACHE_VERSION}_${meta.genreIds.join(',')}_${meta.popularity ?? ''}_${meta.voteCount ?? ''}_${meta.releaseYear ?? ''}_${meta.originalLanguage ?? ''}_${meta.runtime ?? ''}`;
}

export function clearContentVectorCache() {
  vectorCache.clear();
}

// ── Cached mapping function ─────────────────────────────────────

/**
 * Map TMDb content metadata to a TasteVector, with in-memory caching.
 * Identical output to the pure function in computeContentVector.ts —
 * cache is a performance optimisation only.
 */
export function contentToVector(meta: ContentMetadata) {
  const key = getCacheKey(meta);
  const cached = vectorCache.get(key);
  if (cached) return cached;

  const result = _contentToVector(meta);

  // Cache with eviction
  if (vectorCache.size >= MAX_CACHE_SIZE) {
    const firstKey = vectorCache.keys().next().value;
    if (firstKey !== undefined) vectorCache.delete(firstKey);
  }
  vectorCache.set(key, result);

  return result;
}
