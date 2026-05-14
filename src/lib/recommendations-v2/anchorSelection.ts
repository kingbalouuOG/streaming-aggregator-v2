/**
 * Anchor selection for title-anchored mood rooms.
 *
 * Phase 4 §1.2–1.3 of the Title-Anchored Mood Rooms kick-off. Picks up
 * to 5 anchor titles per user per weekly refresh, drawn from a tiered
 * ladder:
 *
 *   Tier 1 — behavioural-positive intersection: thumbs_up ∩ (watched ∪
 *            watchlist_add) in the last 60 days, with three guards:
 *
 *              (G1) combined-signal: bare thumbs_up alone is not Tier 1
 *              (G2) similarity gate: cos_sim(taste, anchor) ≥ 0.55
 *              (G3) cluster-coherence (cold-start only): when the user's
 *                   taste_vector_interaction_count ≤ 5, the anchor's
 *                   embedding must sit within cosine_distance ≤ 0.40 of
 *                   at least one of the user's selected cluster
 *                   centroids. Above 5 interactions, behavioural signal
 *                   has earned precedence — the guard is bypassed.
 *
 *   Tier 2 — cluster representative titles ranked by similarity to the
 *            user's taste vector. At most one per cluster. Skips clusters
 *            already occupied by a Tier 1 anchor (cross-tier collision
 *            rule §1.3).
 *
 *   Tier 3 — top finalScore from the existing pipeline, gated by
 *            finalScore > 0.65. Only fires if Tier 1+2 yield < 5 anchors.
 *            Below the threshold, accept fewer than 5 anchors rather
 *            than ship low-confidence rooms.
 *
 * The output of this module is consumed by `useAnchorMoodRooms`, which
 * generates one anchored room per anchor via `buildAnchoredRoom`.
 *
 * Constants live at the top of this file so the strategist can adjust
 * thresholds in one place during the §7 mid-flight tuning window.
 */

import { supabase } from '../supabase';
import { TASTE_CLUSTERS, type TasteCluster } from '../taste-v2/tasteClusters';
import { buildRowFromPool, scoreCandidates } from './ranker';
import type { CandidatePool } from './types';
import type { SliderState } from '../taste-v2/types';


// ── Tunable thresholds ─────────────────────────────────────────────

/** Days back to scan user_interactions for Tier 1 candidates. */
export const TIER_1_LOOKBACK_DAYS = 60;

/**
 * Tier 1 similarity gate. A thumbs_up ∩ (watched ∪ watchlist_add) anchor
 * must score ≥ this against the user's L2-normalised taste vector to
 * promote. Catches hate-watched outliers and off-pattern recommendations.
 */
export const TIER_1_SIMILARITY_GATE = 0.55;

/**
 * Cosine-distance threshold for cluster proximity. Used by:
 *   - Tier 1 cluster-coherence guard (G3)
 *   - cross-tier collision detection (Tier 1 anchor "occupies" a cluster
 *     when it sits within this distance of the cluster's representative
 *     centroid)
 */
export const CLUSTER_PROXIMITY_DISTANCE = 0.40;

/**
 * Cold-start window for the cluster-coherence guard. Active when
 * `taste_vector_interaction_count <= COLD_START_INTERACTION_THRESHOLD`.
 * Above the threshold, behavioural signal has earned precedence over
 * stated cluster picks; the guard is bypassed.
 */
export const COLD_START_INTERACTION_THRESHOLD = 5;

/** Tier 3 confidence floor on finalScore. Below this, drop the anchor. */
export const TIER_3_CONFIDENCE_THRESHOLD = 0.65;

/** Target anchor count per user per week. */
export const ANCHORS_PER_USER = 5;


// ── Types ──────────────────────────────────────────────────────────

export type AnchorTier = 1 | 2 | 3;

export interface SelectedAnchor {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  tier: AnchorTier;
  /** Tier 2 only: the cluster id whose representative this is. */
  sourceClusterId: string | null;
  /**
   * Tier 1 only: did this anchor's embedding sit within
   * CLUSTER_PROXIMITY_DISTANCE of any user-selected cluster centroid?
   * Null for Tier 2/3 (the question doesn't apply).
   */
  insideStatedCluster: boolean | null;
  /** Cosine similarity to user vector — useful for ordering and probes. */
  similarityToUser: number;
}

export interface AnchorSelectionInput {
  userId: string;
  tasteVector: number[];
  selectedClusterIds: string[];
  interactionCount: number;
  /** Already-loaded pool from the existing pipeline. Reused for Tier 3. */
  pool: CandidatePool | null;
  sliders: SliderState;
}

export interface AnchorSelectionResult {
  anchors: SelectedAnchor[];
  /** Stats for instrumentation / debugging. Cheap to compute. */
  stats: {
    tier1Candidates: number;
    tier1Rejected: { combinedSignal: number; similarity: number; coherence: number };
    tier2PoolSize: number;
    tier3Used: number;
    coldStartGuardActive: boolean;
  };
}


// ── Public entry point ─────────────────────────────────────────────

/**
 * Top-level anchor selection.
 *
 * Side-effect free apart from the database reads needed to materialise
 * candidate embeddings. Returns a deterministic ordering for a given
 * input: Tier 1 first (most-recent-first), Tier 2 (similarity-desc),
 * Tier 3 (finalScore-desc).
 */
export async function selectAnchors(
  input: AnchorSelectionInput,
): Promise<AnchorSelectionResult> {
  const tasteUnit = l2Normalise(input.tasteVector);
  const coldStartGuardActive =
    input.interactionCount <= COLD_START_INTERACTION_THRESHOLD;

  const stats: AnchorSelectionResult['stats'] = {
    tier1Candidates: 0,
    tier1Rejected: { combinedSignal: 0, similarity: 0, coherence: 0 },
    tier2PoolSize: 0,
    tier3Used: 0,
    coldStartGuardActive,
  };

  // ── Cluster centroids (used by Tier 1 G3 + cross-tier collision) ─
  const userClusters = input.selectedClusterIds
    .map((id) => TASTE_CLUSTERS.find((c) => c.id === id))
    .filter((c): c is TasteCluster => c != null);

  const clusterRepEmbeds = await fetchRepresentativeEmbeddings(userClusters);
  const clusterCentroids = computeClusterCentroids(userClusters, clusterRepEmbeds);

  // ── Tier 1 ────────────────────────────────────────────────────────
  // Returns the accepted anchors plus the embedding map used to apply
  // the guards. Reusing that map for cross-tier collision detection
  // avoids N sequential round-trips for the same titles we just fetched.
  const { anchors: tier1, embedMap: tier1EmbedMap } = await selectTier1({
    userId: input.userId,
    tasteUnit,
    clusterCentroids,
    coldStartGuardActive,
    stats,
  });

  // Track which clusters Tier 1 occupies, for cross-tier collision.
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

  // ── Tier 2 ────────────────────────────────────────────────────────
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

  // ── Tier 3 ────────────────────────────────────────────────────────
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


// ── Tier 1 ─────────────────────────────────────────────────────────

interface Tier1Context {
  userId: string;
  tasteUnit: number[];
  clusterCentroids: Map<string, number[]>;
  coldStartGuardActive: boolean;
  stats: AnchorSelectionResult['stats'];
}

interface Tier1Result {
  anchors: SelectedAnchor[];
  /** Embedding map for the accepted anchors, reused upstream for
      cross-tier collision detection without a second round-trip. */
  embedMap: Map<string, number[]>;
}

async function selectTier1(ctx: Tier1Context): Promise<Tier1Result> {
  const cutoff = new Date(
    Date.now() - TIER_1_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Two parallel reads: thumbs_up events + (watched ∪ watchlist_add) events.
  const [thumbsRes, engageRes] = await Promise.all([
    supabase
      .from('user_interactions')
      .select('content_id, media_type, created_at')
      .eq('user_id', ctx.userId)
      .eq('event_type', 'thumbs_up')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_interactions')
      .select('content_id, media_type, created_at')
      .eq('user_id', ctx.userId)
      .in('event_type', ['watched', 'watchlist_add'])
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false }),
  ]);

  if (!thumbsRes.data || !engageRes.data) return { anchors: [], embedMap: new Map() };

  // user_interactions.content_id / media_type are nullable in the schema for
  // non-content events (slider tweaks, etc.); skip those rows.
  const thumbsByKey = new Map<string, { tmdbId: number; mediaType: 'movie' | 'tv'; createdAt: string }>();
  for (const r of thumbsRes.data) {
    if (r.content_id == null || (r.media_type !== 'movie' && r.media_type !== 'tv') || r.created_at == null) continue;
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
    engageRes.data
      .filter((r) => r.content_id != null && r.media_type != null)
      .map((r) => `${r.media_type}-${r.content_id}`),
  );

  // (G1) Combined-signal: keep only thumbs_up that ALSO have watched/watchlist_add.
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

  // Sort by recency desc. Run guards on ALL combined candidates before
  // slicing — slicing pre-guard could cull a valid candidate behind a
  // rejected one. Lookback is 60 days so the pool is small.
  combined.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // (G2) + (G3) require embeddings. Fetch all in one batch.
  const fullEmbedMap = await fetchTitleEmbeddingsBatch(
    combined.map((c) => ({ tmdbId: c.tmdbId, mediaType: c.mediaType })),
  );

  const accepted: SelectedAnchor[] = [];
  const acceptedEmbeds = new Map<string, number[]>();
  for (const cand of combined) {
    if (accepted.length >= ANCHORS_PER_USER) break;
    const embed = fullEmbedMap.get(cand.key);
    if (!embed) continue;
    const candUnit = l2Normalise(embed);

    // (G2) Similarity gate.
    const similarity = cosineSimilarity(ctx.tasteUnit, candUnit);
    if (similarity < TIER_1_SIMILARITY_GATE) {
      ctx.stats.tier1Rejected.similarity += 1;
      continue;
    }

    // (G3) Cluster-coherence — only when cold-start.
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


// ── Tier 2 ─────────────────────────────────────────────────────────

interface Tier2Context {
  userClusters: TasteCluster[];
  clusterRepEmbeds: Map<string, number[]>; // key = "movie-12345"
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
  // For each cluster, find its highest-similarity representative.
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

  // Rank all per-cluster bests by similarity desc, take up to `limit`.
  const ranked = [...perClusterBest.values()].sort(
    (a, b) => b.similarity - a.similarity,
  );

  return ranked.slice(0, ctx.limit).map<SelectedAnchor>((c) => ({
    tmdbId: c.tmdbId,
    mediaType: c.mediaType,
    tier: 2,
    sourceClusterId: c.clusterId,
    insideStatedCluster: null,
    similarityToUser: c.similarity,
  }));
}


// ── Tier 3 ─────────────────────────────────────────────────────────

interface Tier3Context {
  pool: CandidatePool;
  sliders: SliderState;
  excludeAnchorKeys: Set<string>;
  limit: number;
  stats: AnchorSelectionResult['stats'];
}

function selectTier3(ctx: Tier3Context): SelectedAnchor[] {
  const scored = scoreCandidates(ctx.pool, ctx.sliders, 'foryou');
  // Run the standard row-build to apply diversity (so Tier 3 anchors
  // don't all collapse onto a single genre at the bottom of a thin row).
  const built = buildRowFromPool(scored, ctx.sliders, {
    limit: ctx.limit * 5, // overfetch headroom; we still apply our own filter below
  });

  // We need finalScore to apply the confidence threshold; scored has it.
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


// ── Embedding fetches ──────────────────────────────────────────────

async function fetchRepresentativeEmbeddings(
  clusters: TasteCluster[],
): Promise<Map<string, number[]>> {
  const all = clusters.flatMap((c) => c.representativeTmdbIds);
  return fetchTitleEmbeddingsBatch(all);
}

async function fetchTitleEmbeddingsBatch(
  refs: { tmdbId: number; mediaType: 'movie' | 'tv' }[],
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (refs.length === 0) return out;

  // Filter results to the (tmdbId, mediaType) pairs we asked for. The
  // `.in('tmdb_id', …)` query can pull both movie and tv rows for a
  // shared TMDb id; we don't want the unrequested side leaking into
  // the map even though their keys won't collide.
  const wanted = new Set(refs.map((r) => `${r.mediaType}-${r.tmdbId}`));
  const ids = [...new Set(refs.map((r) => r.tmdbId))];
  const { data, error } = await supabase
    .from('titles')
    .select('tmdb_id, media_type, embedding')
    .in('tmdb_id', ids);
  if (error || !data) return out;

  for (const row of data) {
    const key = `${row.media_type}-${row.tmdb_id}`;
    if (!wanted.has(key)) continue;
    const embed = parseEmbedding(row.embedding);
    if (embed) out.set(key, embed);
  }
  return out;
}


// ── Maths ──────────────────────────────────────────────────────────

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
  // Caller has already L2-normalised; cosine sim collapses to dot product.
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
  // Cluster centroid = L2-normalised mean of L2-normalised representatives.
  // Same recipe as the probe; gives a unit vector usable directly with
  // cosineSimilarity / cosineDistance.
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


// ── Helpers ────────────────────────────────────────────────────────

function anchorKey(a: SelectedAnchor | { tmdbId: number; mediaType: 'movie' | 'tv' }): string {
  return `${a.mediaType}-${a.tmdbId}`;
}


export const __testables = {
  cosineDistance,
  cosineSimilarity,
  l2Normalise,
  meanVector,
  computeClusterCentroids,
};
