// Mirror of src/lib/recommendations-v2/embeddingCache.ts — IN-466 / ADR-011.
// The Edge variant omits localStorage (Deno-runtime irrelevant) and exports
// only the type + key + norm helpers that diversity.ts and the orchestrator
// in render-foryou-rows/index.ts consume.

export interface CachedEmbedding {
  vec: Float32Array;
  norm: number;
}

export type EmbeddingMap = Map<string, CachedEmbedding>;

const CACHE_PREFIX = 'videx_emb_';

export function buildEmbeddingCacheKey(
  userId: string,
  tasteProfilesUpdatedAt: string | Date | null,
): string {
  const ts = tasteProfilesUpdatedAt
    ? new Date(tasteProfilesUpdatedAt).getTime()
    : 0;
  return `${CACHE_PREFIX}${userId}:${ts}`;
}

export function computeNorm(vec: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i];
  }
  return Math.sqrt(sum);
}
