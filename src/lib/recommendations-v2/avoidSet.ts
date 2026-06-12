/**
 * Avoid Set (ENG-1 Workstream B)
 *
 * Replaces negative-weight vector updates: in embedding space, moving the
 * taste vector away from a point is not the same as avoiding a region, and
 * it corrupts what the positive vector encodes. Instead, the most recent
 * AVOID_SET_SIZE thumbs_down + not_interested titles form a per-user avoid
 * set, and scoring applies
 *
 *     finalScore −= γ · max(0, max_cosine(candidate, avoidSet))
 *
 * after the top-200 embedding fetch and before row building.
 *
 * Derivation: entirely from the user_interactions event log at fetch time —
 * fully replayable, no backfill. The light id query (≤50 tiny rows, indexed
 * on user_id) runs every load; only the EMBEDDINGS are cached, via the
 * embeddingCache machinery (24h TTL). The cache key embeds the latest
 * negative-event timestamp, so a new thumbs-down busts it naturally. The
 * `videx_emb_avoid_` prefix sits under `videx_emb_`, so the existing
 * clearEmbeddingCache() sign-out wipe covers it with zero extra wiring.
 *
 * Documented trade-off (plan §3 B3): the penalty reaches candidates present
 * in the embedding map (top-200 by pre-penalty score) — where rows are
 * actually drawn from. Penalising all 500 would re-introduce the ~3MB
 * full-pool embedding fetch Phase 5 deliberately avoided. Escalation lever
 * if the eval shows insufficient top-20 suppression: penalise inside the
 * retrieval RPC.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { getAuthUserId, isSupabaseActive } from '../storage';
import type { UserScope } from '../server/userScope';
import { AVOID_SET_EVENTS, AVOID_SET_SIZE } from '@/lib/taste-v2/types';
import { getCachedEmbeddings, setCachedEmbeddings, computeNorm } from './embeddingCache';
import type { CachedEmbedding, EmbeddingMap } from './embeddingCache';
import type { ScoredCandidate } from './types';

const AVOID_CACHE_PREFIX = 'videx_emb_avoid_';

/**
 * Fetch the user's avoid-set embeddings. Returns [] when the user has no
 * negative events (or storage is inactive) — applyAvoidPenalty then
 * no-ops.
 */
export async function fetchAvoidSet(): Promise<CachedEmbedding[]> {
  if (!isSupabaseActive()) return [];

  const userId = getAuthUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('user_interactions')
    .select('content_id, media_type, created_at')
    .eq('user_id', userId)
    .in('event_type', [...AVOID_SET_EVENTS])
    .not('content_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(AVOID_SET_SIZE);

  if (error) {
    console.error('[AvoidSet] negatives query failed:', error.message);
    return [];
  }
  if (!data || data.length === 0) return [];

  const latestTs = data[0].created_at ? new Date(data[0].created_at).getTime() : 0;
  const cacheKey = `${AVOID_CACHE_PREFIX}${userId}:${latestTs}:${data.length}`;

  const cached = getCachedEmbeddings(cacheKey);
  if (cached && cached.size > 0) return [...cached.values()];

  const wanted = new Set(data.map(r => `${r.media_type}-${r.content_id}`));
  const tmdbIds = [...new Set(data.map(r => r.content_id as number))];

  const { data: rows, error: embError } = await supabase
    .from('titles')
    .select('tmdb_id, media_type, embedding')
    .in('tmdb_id', tmdbIds)
    .not('embedding', 'is', null);

  if (embError || !rows) {
    console.error('[AvoidSet] embedding fetch failed:', embError?.message);
    return [];
  }

  const map: EmbeddingMap = new Map();
  for (const row of rows) {
    const key = `${row.media_type}-${row.tmdb_id}`;
    if (!wanted.has(key)) continue; // movie/tv id collision guard
    if (row.embedding == null) continue;
    const emb = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
    if (Array.isArray(emb) && emb.length > 0) {
      const vec = new Float32Array(emb);
      map.set(key, { vec, norm: computeNorm(vec) });
    }
  }

  if (map.size > 0) setCachedEmbeddings(cacheKey, map);
  return [...map.values()];
}

// ─── Scoped (server) variant — PLAT-3, absorbed from the ADR-011
// mirror. user_interactions goes through UserScope (user-owned table,
// service-role contract); titles uses the raw client. Cache is a
// module-scope Map instead of localStorage — instance lifetime is the
// eviction, identical to the Edge original's behaviour. The Map is
// dead weight in the client bundle until the D4 window closes and the
// client variant above is deleted.

const instanceCache = new Map<string, CachedEmbedding[]>();

export async function fetchAvoidSetScoped(
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

/**
 * Score-time avoid penalty. Pure — unit-tested directly. Candidates
 * without an embedding in the map pass through unpenalised (by design:
 * the map covers the top-200 where rows are drawn from). Returns a new
 * re-sorted array; input is not mutated.
 */
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

    let maxCos = 0; // negative cosine = dissimilar = no penalty
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
