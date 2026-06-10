// Mirror of src/lib/recommendations-v2/avoidSet.ts — ADR-011 (final mirror
// generation per E&P D1; PLAT-3 dissolves this).
//
// Edge-side adjustments vs the client copy:
// - user_interactions read goes through UserScope (user-owned table,
//   service-role contract); titles read uses the raw client.
// - Cache is a per-instance module Map (no localStorage in Deno), keyed
//   identically (userId : latestNegativeTs : count) — instance lifecycle
//   is the eviction, same as the index.ts candidate-embedding cache.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { UserScope } from '../userScope.ts';
import { AVOID_SET_EVENTS, AVOID_SET_SIZE } from '../taste-v2/types.ts';
import { computeNorm } from './embeddingCache.ts';
import type { CachedEmbedding, EmbeddingMap } from './embeddingCache.ts';
import type { ScoredCandidate } from './types.ts';

const instanceCache = new Map<string, CachedEmbedding[]>();

export async function fetchAvoidSet(
  scope: UserScope,
  client: SupabaseClient,
): Promise<CachedEmbedding[]> {
  const { data, error } = await scope
    .select('user_interactions', 'content_id, media_type, created_at')
    .in('event_type', [...AVOID_SET_EVENTS])
    .not('content_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(AVOID_SET_SIZE);

  if (error) {
    console.error('[AvoidSet] negatives query failed:', error.message);
    return [];
  }
  const rows = (data ?? []) as { content_id: number; media_type: string; created_at: string | null }[];
  if (rows.length === 0) return [];

  const latestTs = rows[0].created_at ? new Date(rows[0].created_at).getTime() : 0;
  const cacheKey = `${scope.userId}:${latestTs}:${rows.length}`;

  const cached = instanceCache.get(cacheKey);
  if (cached && cached.length > 0) return cached;

  const wanted = new Set(rows.map(r => `${r.media_type}-${r.content_id}`));
  const tmdbIds = [...new Set(rows.map(r => r.content_id))];

  const { data: titleRows, error: embError } = await client
    .from('titles')
    .select('tmdb_id, media_type, embedding')
    .in('tmdb_id', tmdbIds)
    .not('embedding', 'is', null);

  if (embError || !titleRows) {
    console.error('[AvoidSet] embedding fetch failed:', embError?.message);
    return [];
  }

  const map: EmbeddingMap = new Map();
  for (const row of titleRows as { tmdb_id: number; media_type: string; embedding: unknown }[]) {
    const key = `${row.media_type}-${row.tmdb_id}`;
    if (!wanted.has(key)) continue; // movie/tv id collision guard
    if (row.embedding == null) continue;
    const emb = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
    if (Array.isArray(emb) && emb.length > 0) {
      const vec = new Float32Array(emb as number[]);
      map.set(key, { vec, norm: computeNorm(vec) });
    }
  }

  const result = [...map.values()];
  if (result.length > 0) instanceCache.set(cacheKey, result);
  return result;
}

export function applyAvoidPenalty(
  scored: ScoredCandidate[],
  avoidSet: CachedEmbedding[],
  embeddingMap: EmbeddingMap,
  gamma: number,
): ScoredCandidate[] {
  if (scored.length === 0 || avoidSet.length === 0 || gamma <= 0 || embeddingMap.size === 0) {
    return scored;
  }

  const out = scored.map(c => {
    const emb = embeddingMap.get(c.contentKey);
    if (!emb || emb.norm === 0) return c;

    let maxCos = 0;
    for (const a of avoidSet) {
      const denom = emb.norm * a.norm;
      if (denom === 0) continue;
      let dot = 0;
      const v1 = emb.vec;
      const v2 = a.vec;
      for (let i = 0; i < v1.length; i++) dot += v1[i] * v2[i];
      const cos = dot / denom;
      if (cos > maxCos) maxCos = cos;
    }

    if (maxCos === 0) return c;
    return { ...c, finalScore: c.finalScore - gamma * maxCos };
  });

  out.sort((a, b) => b.finalScore - a.finalScore);
  return out;
}
