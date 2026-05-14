/**
 * Embedding Cache (IN-PX-22 / Phase 5.5 C5).
 *
 * Caches per-title 1536D OpenAI embeddings client-side in localStorage
 * with a 24h TTL. The dominant Phase 5 latency cost on the For You
 * surface was the per-load embedding fetch (~600-1500ms client / ~200-
 * 600ms Edge) — embeddings are immutable per tmdb_id, so a cache
 * eliminates the cost entirely on warm sessions.
 *
 * ─── Cache key (simplified per Phase 5.5 plan v3 review) ─────────────
 *
 * `videx_emb_${userId}:${tasteProfilesUpdatedAt}`
 *
 * Two components only. Reasoning:
 *
 *   - Embeddings are immutable per title. The cache stores them keyed by
 *     contentKey ("media_type-tmdb_id"); the candidate pool determines
 *     which keys we ask for. Watchlist / dismissed / thumbs-down
 *     changes shift which titles enter the top-200 but never invalidate
 *     a cached embedding (misses get fetched transparently).
 *
 *   - `taste_profiles.updated_at` ticks on every taste-vector recompute
 *     and on slider persistence. Including it gives a soft 24h freshness
 *     floor: stale-but-correct cache entries naturally roll over.
 *
 *   - Hash-derivation bugs are the main correctness risk with cached
 *     ranking. By keeping the key dirt-simple, that surface goes away.
 *
 *   - Worst case if the timestamp doesn't tick on a change we care
 *     about: the cache returns stale embeddings for titles already
 *     fetched (still correct — embeddings are immutable per tmdb_id);
 *     new titles in the top-200 trigger fresh fetches. No stale ranking.
 *
 * ─── Storage shape ───────────────────────────────────────────────────
 *
 * Float32Array doesn't JSON-serialise natively; we encode as
 * Array<number> and reconstruct on read. 200 candidates × 1536 dims ×
 * 4 bytes ≈ 1.2MB raw / ~4-5MB JSON. localStorage quota is typically
 * 5-10MB; on quota errors we silently fall through to network fetch.
 *
 * On signOut, callers MUST invoke `clearEmbeddingCache()` to prevent
 * cross-user contamination on shared devices (the userId namespace
 * means a stale cache from a previous user is invisible to a new
 * session, but accumulated keys waste localStorage).
 */

export interface CachedEmbedding {
  vec: Float32Array;
  norm: number;
}

export type EmbeddingMap = Map<string, CachedEmbedding>;

const CACHE_PREFIX = 'videx_emb_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface CacheEnvelope {
  /** Epoch ms when the cache was last written. */
  stored: number;
  /** Array of [contentKey, encoded f32 array]. Storage-friendly. */
  data: Array<[string, number[]]>;
}

/**
 * Build the per-user cache key. tasteProfilesUpdatedAt may be an ISO
 * string, a Date, or null; null collapses to `0` so cold-start users
 * still get a stable key.
 */
export function buildEmbeddingCacheKey(
  userId: string,
  tasteProfilesUpdatedAt: string | Date | null,
): string {
  const ts = tasteProfilesUpdatedAt
    ? new Date(tasteProfilesUpdatedAt).getTime()
    : 0;
  return `${CACHE_PREFIX}${userId}:${ts}`;
}

/**
 * Read the embedding map for a key. Returns null on miss, parse error,
 * or stale-beyond-TTL entry.
 */
export function getCachedEmbeddings(key: string): EmbeddingMap | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope;
    if (typeof env.stored !== 'number' || Date.now() - env.stored > CACHE_TTL_MS) {
      // TTL expired — clean up and miss.
      try { localStorage.removeItem(key); } catch { /* noop */ }
      return null;
    }
    if (!Array.isArray(env.data)) return null;

    const out: EmbeddingMap = new Map();
    for (const [contentKey, arr] of env.data) {
      if (typeof contentKey !== 'string' || !Array.isArray(arr)) continue;
      const vec = new Float32Array(arr);
      out.set(contentKey, { vec, norm: computeNorm(vec) });
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Write the embedding map for a key. Best-effort; quota errors are
 * swallowed (next load just refetches over the network).
 */
export function setCachedEmbeddings(key: string, map: EmbeddingMap): void {
  try {
    const env: CacheEnvelope = {
      stored: Date.now(),
      data: Array.from(map.entries(), ([contentKey, { vec }]) => [
        contentKey,
        Array.from(vec),
      ]),
    };
    localStorage.setItem(key, JSON.stringify(env));
  } catch {
    // Quota / serialise error — drop the write.
  }
}

/**
 * Drop every `videx_emb_*` entry from localStorage. Call from every
 * signOut path (manual signOut, account deletion, JWT expiry) to
 * prevent cross-user contamination on shared devices.
 */
export function clearEmbeddingCache(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keysToRemove.push(k);
    }
    for (const k of keysToRemove) localStorage.removeItem(k);
  } catch {
    // localStorage unavailable (SSR / private mode) — nothing to do.
  }
}

/** L2 norm of a Float32Array. Used at cache read + write so MMR can
 *  skip the recomputation in its inner loop (IN-PX-24). */
export function computeNorm(vec: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i];
  }
  return Math.sqrt(sum);
}
