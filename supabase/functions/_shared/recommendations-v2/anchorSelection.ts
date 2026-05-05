// Mirror of src/lib/recommendations-v2/anchorSelection.ts — IN-466 / ADR-011.
// Edge-side: takes SupabaseClient + UserScope as parameters; otherwise
// bit-for-bit identical so drift can be enforced by the CI check.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { UserScope } from '../userScope.ts';
import { TASTE_CLUSTERS, type TasteCluster } from '../taste-v2/tasteClusters.ts';
import { buildRowFromPool, scoreCandidates } from './ranker.ts';
import type { CandidatePool } from './types.ts';
import type { SliderState } from '../taste-v2/types.ts';

export const TIER_1_LOOKBACK_DAYS = 60;
export const TIER_1_SIMILARITY_GATE = 0.55;
export const CLUSTER_PROXIMITY_DISTANCE = 0.40;
export const COLD_START_INTERACTION_THRESHOLD = 5;
export const TIER_3_CONFIDENCE_THRESHOLD = 0.65;
export const ANCHORS_PER_USER = 5;

export type AnchorTier = 1 | 2 | 3;

export interface SelectedAnchor {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  tier: AnchorTier;
  sourceClusterId: string | null;
  insideStatedCluster: boolean | null;
  similarityToUser: number;
}

export interface AnchorSelectionInput {
  scope: UserScope;
  client: SupabaseClient;
  tasteVector: number[];
  selectedClusterIds: string[];
  interactionCount: number;
  pool: CandidatePool | null;
  sliders: SliderState;
}

export interface AnchorSelectionResult {
  anchors: SelectedAnchor[];
  stats: {
    tier1Candidates: number;
    tier1Rejected: { combinedSignal: number; similarity: number; coherence: number };
    tier2PoolSize: number;
    tier3Used: number;
    coldStartGuardActive: boolean;
  };
}

export async function selectAnchors(input: AnchorSelectionInput): Promise<AnchorSelectionResult> {
  const tasteUnit = l2Normalise(input.tasteVector);
  const coldStartGuardActive = input.interactionCount <= COLD_START_INTERACTION_THRESHOLD;

  const stats: AnchorSelectionResult['stats'] = {
    tier1Candidates: 0,
    tier1Rejected: { combinedSignal: 0, similarity: 0, coherence: 0 },
    tier2PoolSize: 0,
    tier3Used: 0,
    coldStartGuardActive,
  };

  const userClusters = input.selectedClusterIds
    .map((id) => TASTE_CLUSTERS.find((c) => c.id === id))
    .filter((c): c is TasteCluster => c != null);

  const clusterRepEmbeds = await fetchRepresentativeEmbeddings(input.client, userClusters);
  const clusterCentroids = computeClusterCentroids(userClusters, clusterRepEmbeds);

  const { anchors: tier1, embedMap: tier1EmbedMap } = await selectTier1({
    scope: input.scope,
    client: input.client,
    tasteUnit,
    clusterCentroids,
    coldStartGuardActive,
    stats,
  });

  const tier1ClusterCollisions = new Set<string>();
  for (const anchor of tier1) {
    const embed = tier1EmbedMap.get(anchorKey(anchor));
    if (!embed) continue;
    const anchorUnit = l2Normalise(embed);
    for (const [clusterId, centroid] of clusterCentroids) {
      if (cosineDistance(anchorUnit, centroid) <= CLUSTER_PROXIMITY_DISTANCE) {
        tier1ClusterCollisions.add(clusterId);
      }
    }
  }

  const remainingForTier2 = ANCHORS_PER_USER - tier1.length;
  const tier2 = remainingForTier2 > 0
    ? selectTier2({
        userClusters,
        clusterRepEmbeds,
        tasteUnit,
        excludeClusterIds: tier1ClusterCollisions,
        excludeAnchorKeys: new Set(tier1.map(anchorKey)),
        limit: remainingForTier2,
        stats,
      })
    : [];

  const haveSoFar = tier1.length + tier2.length;
  const remainingForTier3 = ANCHORS_PER_USER - haveSoFar;
  const tier3 = remainingForTier3 > 0 && input.pool != null
    ? selectTier3({
        pool: input.pool,
        sliders: input.sliders,
        excludeAnchorKeys: new Set([...tier1, ...tier2].map(anchorKey)),
        limit: remainingForTier3,
        stats,
      })
    : [];

  return {
    anchors: [...tier1, ...tier2, ...tier3],
    stats,
  };
}

interface Tier1Context {
  scope: UserScope;
  client: SupabaseClient;
  tasteUnit: number[];
  clusterCentroids: Map<string, number[]>;
  coldStartGuardActive: boolean;
  stats: AnchorSelectionResult['stats'];
}

interface Tier1Result {
  anchors: SelectedAnchor[];
  embedMap: Map<string, number[]>;
}

async function selectTier1(ctx: Tier1Context): Promise<Tier1Result> {
  const cutoff = new Date(
    Date.now() - TIER_1_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [thumbsRes, engageRes] = await Promise.all([
    ctx.scope
      .select('user_interactions', 'content_id, media_type, created_at')
      .eq('event_type', 'thumbs_up')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false }),
    ctx.scope
      .select('user_interactions', 'content_id, media_type, created_at')
      .in('event_type', ['watched', 'watchlist_add'])
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false }),
  ]);

  if (!thumbsRes.data || !engageRes.data) return { anchors: [], embedMap: new Map() };

  const thumbsByKey = new Map<string, { tmdbId: number; mediaType: 'movie' | 'tv'; createdAt: string }>();
  for (const r of thumbsRes.data as any[]) {
    const key = `${r.media_type}-${r.content_id}`;
    if (!thumbsByKey.has(key)) {
      thumbsByKey.set(key, {
        tmdbId: r.content_id,
        mediaType: r.media_type,
        createdAt: r.created_at,
      });
    }
  }

  const engagedKeys = new Set(
    (engageRes.data as any[]).map((r) => `${r.media_type}-${r.content_id}`),
  );

  const combined: { key: string; tmdbId: number; mediaType: 'movie' | 'tv'; createdAt: string }[] = [];
  for (const [key, info] of thumbsByKey) {
    if (engagedKeys.has(key)) {
      combined.push({ key, ...info });
    } else {
      ctx.stats.tier1Rejected.combinedSignal += 1;
    }
  }
  ctx.stats.tier1Candidates = combined.length;

  if (combined.length === 0) return { anchors: [], embedMap: new Map() };

  combined.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const fullEmbedMap = await fetchTitleEmbeddingsBatch(
    ctx.client,
    combined.map((c) => ({ tmdbId: c.tmdbId, mediaType: c.mediaType })),
  );

  const accepted: SelectedAnchor[] = [];
  const acceptedEmbeds = new Map<string, number[]>();
  for (const cand of combined) {
    if (accepted.length >= ANCHORS_PER_USER) break;
    const embed = fullEmbedMap.get(cand.key);
    if (!embed) continue;
    const candUnit = l2Normalise(embed);

    const similarity = cosineSimilarity(ctx.tasteUnit, candUnit);
    if (similarity < TIER_1_SIMILARITY_GATE) {
      ctx.stats.tier1Rejected.similarity += 1;
      continue;
    }

    let insideStatedCluster: boolean | null = null;
    if (ctx.clusterCentroids.size > 0) {
      insideStatedCluster = false;
      for (const centroid of ctx.clusterCentroids.values()) {
        if (cosineDistance(candUnit, centroid) <= CLUSTER_PROXIMITY_DISTANCE) {
          insideStatedCluster = true;
          break;
        }
      }
    }
    if (ctx.coldStartGuardActive && insideStatedCluster === false) {
      ctx.stats.tier1Rejected.coherence += 1;
      continue;
    }

    accepted.push({
      tmdbId: cand.tmdbId,
      mediaType: cand.mediaType,
      tier: 1,
      sourceClusterId: null,
      insideStatedCluster,
      similarityToUser: similarity,
    });
    acceptedEmbeds.set(cand.key, embed);
  }

  return { anchors: accepted, embedMap: acceptedEmbeds };
}

interface Tier2Context {
  userClusters: TasteCluster[];
  clusterRepEmbeds: Map<string, number[]>;
  tasteUnit: number[];
  excludeClusterIds: Set<string>;
  excludeAnchorKeys: Set<string>;
  limit: number;
  stats: AnchorSelectionResult['stats'];
}

interface ClusterCandidate {
  clusterId: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  similarity: number;
}

function selectTier2(ctx: Tier2Context): SelectedAnchor[] {
  const perClusterBest = new Map<string, ClusterCandidate>();

  for (const cluster of ctx.userClusters) {
    if (ctx.excludeClusterIds.has(cluster.id)) continue;

    let best: ClusterCandidate | null = null;
    for (const rep of cluster.representativeTmdbIds) {
      const key = `${rep.mediaType}-${rep.tmdbId}`;
      if (ctx.excludeAnchorKeys.has(key)) continue;
      const embed = ctx.clusterRepEmbeds.get(key);
      if (!embed) continue;
      const sim = cosineSimilarity(ctx.tasteUnit, l2Normalise(embed));
      if (!best || sim > best.similarity) {
        best = {
          clusterId: cluster.id,
          tmdbId: rep.tmdbId,
          mediaType: rep.mediaType,
          similarity: sim,
        };
      }
    }
    if (best) perClusterBest.set(cluster.id, best);
  }

  ctx.stats.tier2PoolSize = perClusterBest.size;

  const ranked = [...perClusterBest.values()].sort((a, b) => b.similarity - a.similarity);

  return ranked.slice(0, ctx.limit).map<SelectedAnchor>((c) => ({
    tmdbId: c.tmdbId,
    mediaType: c.mediaType,
    tier: 2,
    sourceClusterId: c.clusterId,
    insideStatedCluster: null,
    similarityToUser: c.similarity,
  }));
}

interface Tier3Context {
  pool: CandidatePool;
  sliders: SliderState;
  excludeAnchorKeys: Set<string>;
  limit: number;
  stats: AnchorSelectionResult['stats'];
}

function selectTier3(ctx: Tier3Context): SelectedAnchor[] {
  const scored = scoreCandidates(ctx.pool, ctx.sliders, 'foryou');
  const built = buildRowFromPool(scored, ctx.sliders, {
    limit: ctx.limit * 5,
  });

  const builtKeySet = new Set(built.map((b) => b.id));
  const eligible: SelectedAnchor[] = [];
  for (const c of scored) {
    if (eligible.length >= ctx.limit) break;
    if (!builtKeySet.has(c.contentKey)) continue;
    if (ctx.excludeAnchorKeys.has(c.contentKey)) continue;
    if (c.finalScore < TIER_3_CONFIDENCE_THRESHOLD) continue;
    eligible.push({
      tmdbId: c.tmdbId,
      mediaType: c.mediaType,
      tier: 3,
      sourceClusterId: null,
      insideStatedCluster: null,
      similarityToUser: c.scores.taste,
    });
  }

  ctx.stats.tier3Used = eligible.length;
  return eligible;
}

async function fetchRepresentativeEmbeddings(
  client: SupabaseClient,
  clusters: TasteCluster[],
): Promise<Map<string, number[]>> {
  const all = clusters.flatMap((c) => c.representativeTmdbIds);
  return fetchTitleEmbeddingsBatch(client, all);
}

async function fetchTitleEmbeddingsBatch(
  client: SupabaseClient,
  refs: { tmdbId: number; mediaType: 'movie' | 'tv' }[],
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (refs.length === 0) return out;

  const wanted = new Set(refs.map((r) => `${r.mediaType}-${r.tmdbId}`));
  const ids = [...new Set(refs.map((r) => r.tmdbId))];
  const { data, error } = await client
    .from('titles')
    .select('tmdb_id, media_type, embedding')
    .in('tmdb_id', ids);
  if (error || !data) return out;

  for (const row of data as any[]) {
    const key = `${row.media_type}-${row.tmdb_id}`;
    if (!wanted.has(key)) continue;
    const embed = parseEmbedding(row.embedding);
    if (embed) out.set(key, embed);
  }
  return out;
}

function parseEmbedding(raw: unknown): number[] | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return null; }
  }
  if (Array.isArray(raw)) return raw as number[];
  return null;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function norm(v: number[]): number {
  return Math.sqrt(dot(v, v));
}

function l2Normalise(v: number[]): number[] {
  const n = norm(v);
  if (n === 0) return v.slice();
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

function cosineSimilarity(aUnit: number[], bUnit: number[]): number {
  return dot(aUnit, bUnit);
}

function cosineDistance(aUnit: number[], bUnit: number[]): number {
  return 1 - dot(aUnit, bUnit);
}

function meanVector(vs: number[][]): number[] {
  if (vs.length === 0) return [];
  const out = new Array(vs[0].length).fill(0);
  for (const v of vs) for (let i = 0; i < v.length; i++) out[i] += v[i];
  for (let i = 0; i < out.length; i++) out[i] /= vs.length;
  return out;
}

function computeClusterCentroids(
  clusters: TasteCluster[],
  repEmbeds: Map<string, number[]>,
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const cluster of clusters) {
    const reps: number[][] = [];
    for (const rep of cluster.representativeTmdbIds) {
      const e = repEmbeds.get(`${rep.mediaType}-${rep.tmdbId}`);
      if (e) reps.push(l2Normalise(e));
    }
    if (reps.length === 0) continue;
    out.set(cluster.id, l2Normalise(meanVector(reps)));
  }
  return out;
}

function anchorKey(a: SelectedAnchor | { tmdbId: number; mediaType: 'movie' | 'tv' }): string {
  return `${a.mediaType}-${a.tmdbId}`;
}
