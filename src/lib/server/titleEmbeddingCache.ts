/**
 * Per-title embedding cache for the server For You render (pre-launch
 * perf batch, finding 1 — highest leverage).
 *
 * The MMR re-rank needs the 1536D embedding of the top-200 candidates.
 * Fetching them from `titles` is the dominant per-render Supabase cost.
 *
 * The previous cache (foryouRender.ts EMBEDDING_CACHE) keyed the whole
 * map on `userId:taste_profiles.updated_at`, mirroring the CLIENT
 * localStorage cache. That was wrong for the server: title embeddings are
 * IMMUTABLE and USER-INDEPENDENT, but a per-user-per-updatedAt key threw
 * the entire cache away on every taste interaction (updated_at ticks) and
 * never shared a title's embedding across users. So the expensive part —
 * the embedding load — was discarded exactly when the feed had to be
 * recomputed.
 *
 * This re-keys by CONTENT KEY (`media_type-tmdb_id`) in one module-scoped
 * LRU, shared across all users served by the same warm isolate. A hot
 * title's embedding is loaded once and reused for every user whose feed
 * surfaces it. The map is LRU-bounded so a long-lived isolate can't grow
 * without limit; an isolate recycle zeroes it (no correctness risk —
 * embeddings are immutable, misses just refetch).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScoredCandidate } from '../recommendations-v2/types';
import { computeNorm, type CachedEmbedding, type EmbeddingMap } from '../recommendations-v2/embeddingCache';

/**
 * Insertion-order LRU over a plain Map. get() promotes the key to
 * most-recently-used; set() evicts the least-recently-used once size
 * exceeds `max`. Values are immutable title embeddings, so eviction only
 * ever costs a refetch, never correctness.
 */
export class LruEmbeddingCache {
  private readonly map = new Map<string, CachedEmbedding>();

  constructor(private readonly max: number) {
    if (max <= 0) throw new Error('LruEmbeddingCache: max must be > 0');
  }

  get(key: string): CachedEmbedding | undefined {
    const hit = this.map.get(key);
    if (hit === undefined) return undefined;
    // Promote to MRU: delete + re-insert moves it to the end.
    this.map.delete(key);
    this.map.set(key, hit);
    return hit;
  }

  set(key: string, value: CachedEmbedding): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      // Map iteration order is insertion order → first key is LRU.
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}

// ~2000 titles × 1536 × 4B ≈ 12MB per isolate — comfortably under the
// Worker 128MB ceiling while holding far more than a single render's
// top-200, so cross-user and cross-render reuse both land.
const MAX_CACHED_TITLES = 2000;
const TITLE_EMBEDDING_CACHE = new LruEmbeddingCache(MAX_CACHED_TITLES);

/**
 * Resolve embeddings for `candidates`, serving cache hits from the
 * module-scoped per-title LRU and fetching only the misses. Returns a
 * fresh EmbeddingMap for THIS render (subset of the global cache), so
 * callers keep the existing `EmbeddingMap` contract.
 */
export async function fetchEmbeddingsForCandidates(
  client: SupabaseClient,
  candidates: ScoredCandidate[],
): Promise<EmbeddingMap> {
  const out: EmbeddingMap = new Map();
  if (candidates.length === 0) return out;

  const missingTmdbIds: number[] = [];
  const seenTmdb = new Set<number>();
  for (const c of candidates) {
    const cached = TITLE_EMBEDDING_CACHE.get(c.contentKey);
    if (cached) {
      out.set(c.contentKey, cached);
    } else if (!seenTmdb.has(c.tmdbId)) {
      seenTmdb.add(c.tmdbId);
      missingTmdbIds.push(c.tmdbId);
    }
  }

  if (missingTmdbIds.length === 0) return out;

  try {
    const { data, error } = await client
      .from('titles')
      .select('tmdb_id, media_type, embedding')
      .in('tmdb_id', missingTmdbIds);
    if (error || !data) return out;

    for (const row of data as Array<{ tmdb_id: number; media_type: string; embedding: string | number[] | null }>) {
      if (row.embedding == null) continue;
      const emb = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
      if (Array.isArray(emb) && emb.length > 0) {
        const vec = new Float32Array(emb);
        const contentKey = `${row.media_type}-${row.tmdb_id}`;
        const entry: CachedEmbedding = { vec, norm: computeNorm(vec) };
        TITLE_EMBEDDING_CACHE.set(contentKey, entry);
        out.set(contentKey, entry);
      }
    }
  } catch {
    // Network or parse error → return whatever we resolved from cache.
  }
  return out;
}

/** Test-only: the module singleton's current entry count. */
export function __titleEmbeddingCacheSize(): number {
  return TITLE_EMBEDDING_CACHE.size;
}
