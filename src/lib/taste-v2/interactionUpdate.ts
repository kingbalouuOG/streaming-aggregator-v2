/**
 * Taste Vector V2 — Interaction Updates
 *
 * Incremental update (on each interaction) and full recompute (on stale launch).
 * The user_interactions event log is the source of truth.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { getAuthUserId } from '../storage';
import { withUserScope, type UserScope } from '../server/userScope';
import { l2Normalise, addScaled, isZeroVector, rawCosineSimilarity } from './vectorOps';
import {
  INTERACTION_WEIGHTS,
  NEGATIVE_EVENTS,
  TASTE_RELEVANT_EVENTS,
  CONFIDENCE_FLOOR_THRESHOLD,
  CONFIDENCE_FLOOR_MULTIPLIER,
  EXPLICIT_HALF_LIFE_DAYS,
  BEHAVIOURAL_HALF_LIFE_DAYS,
  BEHAVIOURAL_EVENTS,
  SEARCH_ATTRIBUTION_BOOST,
  SEARCH_ATTRIBUTION_BOOSTED_EVENTS,
  MAX_INTEREST_CENTROIDS,
} from './types';
import {
  getMostRecentSearchAt,
  isWithinAttributionWindow,
} from './searchAttribution';
import { weightedKMeans } from './kmeans';
import type { WeightedPoint } from './kmeans';
import { computeInterestWeights } from './bootstrap';
import type { TasteVectorV2, InterestCentroid } from './types';

const LEARNING_RATE = 0.05;

/**
 * Fetch a title's 1536D embedding from the content cache. Returns null when
 * the title isn't cached or has no embedding yet — callers decide whether to
 * warn. Exported so a single interaction can fetch the embedding once and
 * share it across the summary-vector and centroid update paths.
 */
export async function fetchTitleEmbedding(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<number[] | null> {
  const { data, error } = await supabase
    .from('titles')
    .select('embedding')
    .eq('tmdb_id', tmdbId)
    .eq('media_type', mediaType)
    .not('embedding', 'is', null)
    .maybeSingle();

  if (error || !data?.embedding) return null;
  return typeof data.embedding === 'string' ? JSON.parse(data.embedding) : data.embedding;
}

/**
 * Whether an event type drives a taste-vector update (and therefore needs the
 * title embedding). Mirrors the guards inside the apply* functions so callers
 * can skip the embedding fetch — and its warning — for negative / non-scoring
 * events.
 */
export function eventUsesEmbedding(eventType: string): boolean {
  return !NEGATIVE_EVENTS.has(eventType) && INTERACTION_WEIGHTS[eventType] !== undefined;
}

/**
 * Apply a single interaction to the taste vector (incremental update).
 *
 * Fetches the title's 1536D embedding, blends it into the current vector
 * weighted by the interaction signal, and L2-normalises.
 */
export async function applyInteractionIncremental(
  currentVector: TasteVectorV2,
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  eventType: string,
  interactionCount: number,
  sessionId?: string | null,
  prefetchedEmbedding?: number[] | null,
): Promise<{ vector: TasteVectorV2; newCount: number } | null> {
  // ENG-1 Workstream B: negatives never touch the vector — they feed the
  // score-time avoid set instead. Explicit guard on top of the weights
  // table no longer carrying negative entries.
  if (NEGATIVE_EVENTS.has(eventType)) return null;

  const weight = INTERACTION_WEIGHTS[eventType];
  if (weight === undefined) return null;

  // Embedding — reuse the one the caller prefetched so a single interaction
  // queries `titles` once and logs at most one "no embedding" warning. Falls
  // back to fetching (and warning) when no caller supplies one.
  const embedding = prefetchedEmbedding !== undefined
    ? prefetchedEmbedding
    : await fetchTitleEmbedding(tmdbId, mediaType);

  if (!embedding) {
    if (prefetchedEmbedding === undefined) {
      console.warn('[InteractionUpdate] No embedding found for', mediaType, tmdbId);
    }
    return null;
  }

  // Apply confidence floor boost for early interactions
  const newCount = interactionCount + 1;
  const confidenceMultiplier = newCount <= CONFIDENCE_FLOOR_THRESHOLD
    ? CONFIDENCE_FLOOR_MULTIPLIER
    : 1.0;

  // Search-attribution boost — if this engagement followed a search
  // emitted in the same session within the attribution window, treat
  // it as higher-intent than passive scroll. Negative events are not
  // boosted (Level 2 of the search-as-signal roadmap will address them).
  const searchBoost =
    SEARCH_ATTRIBUTION_BOOSTED_EVENTS.has(eventType) &&
    isWithinAttributionWindow(Date.now(), getMostRecentSearchAt(sessionId))
      ? SEARCH_ATTRIBUTION_BOOST
      : 1.0;

  const effectiveWeight = weight * LEARNING_RATE * confidenceMultiplier * searchBoost;

  return {
    vector: l2Normalise(addScaled(currentVector, embedding, effectiveWeight)),
    newCount,
  };
}

/** Compute exponential decay weight for a timestamp */
function decayWeight(timestampIso: string, halfLifeDays: number): number {
  const ageMs = Date.now() - new Date(timestampIso).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

/**
 * Full recompute of the taste vector from the user_interactions event log.
 *
 * Deterministic and replayable: reads all taste-relevant interactions,
 * fetches their embeddings, applies weights + decay, sums, normalises.
 *
 * @param bootstrapVector The original bootstrap vector (anchor point).
 *   If null, starts from zero vector.
 */
export async function recomputeFromInteractions(
  bootstrapVector: TasteVectorV2 | null,
): Promise<TasteVectorV2 | null> {
  const userId = getAuthUserId();
  if (!userId) return null;
  // The scoped impl applies the same .eq('user_id', userId) this
  // function always carried; on the client RLS double-guards it.
  return recomputeFromInteractionsScoped(supabase, withUserScope(supabase, userId), bootstrapVector);
}

interface ReplayInteractionRow {
  content_id: number | null;
  media_type: string | null;
  event_type: string;
  metadata: unknown;
  created_at: string | null;
  session_id: string | null;
}

interface ReplaySearchRow {
  created_at: string | null;
  session_id: string | null;
}

interface EmbeddingTitleRow {
  tmdb_id: number;
  media_type: string;
  embedding: string | number[] | null;
}

/**
 * Dedup interaction rows to one per (content_id, media_type, event_type)
 * identity, keeping the most recent occurrence (latest created_at).
 *
 * Integrity fix (roadmap 0.5). Neither taste path deduped, so a tester's
 * four repeated mark-watched taps applied `watched` 4× and skewed his
 * vector — the UI double-tap was fixed in PR #35, this closes the data
 * layer, and it stops a future history importer from mass-replaying
 * duplicates into the same hole. The event log stays immutable: every
 * tap is still a row; the taste replay just collapses repeats.
 *
 * Rule — apply once per identity, keep latest:
 *  - "once per identity" so repeats don't multiply a title's weight;
 *  - "keep latest" so decay measures recency from the most recent signal
 *    (a rewatch refreshes the title). This is the SAME rule the
 *    incremental path enforces via hasPriorInteraction(), so a vector
 *    built tap-by-tap matches one the recompute rebuilds.
 *  - Distinct event_types on one title stay distinct (thumbs_up + watched
 *    still sum to the combined 1.5 signal).
 *  - Rows missing content_id/media_type pass through untouched (callers
 *    already filter these, so this is belt-and-braces).
 *
 * Order is not preserved; callers that care (the summary-vector replay's
 * confidence floor) re-sort by created_at.
 */
export function dedupeInteractionsByIdentity<
  T extends {
    content_id: number | null;
    media_type: string | null;
    event_type: string;
    created_at: string | null;
  },
>(rows: T[]): T[] {
  const latestByIdentity = new Map<string, T>();
  const passthrough: T[] = [];
  for (const row of rows) {
    if (row.content_id == null || row.media_type == null) {
      passthrough.push(row);
      continue;
    }
    const key = `${row.media_type}-${row.content_id}-${row.event_type}`;
    const existing = latestByIdentity.get(key);
    if (!existing) {
      latestByIdentity.set(key, row);
      continue;
    }
    const existingAt = existing.created_at ? new Date(existing.created_at).getTime() : -Infinity;
    const rowAt = row.created_at ? new Date(row.created_at).getTime() : -Infinity;
    if (rowAt >= existingAt) latestByIdentity.set(key, row);
  }
  return [...passthrough, ...latestByIdentity.values()];
}

/**
 * Scoped (server) implementation — PLAT-3 W5. The single body both
 * runtimes share: the client entry above delegates with the singleton;
 * the nightly Worker cron calls it per stale user with the
 * service-role client.
 */
export async function recomputeFromInteractionsScoped(
  client: SupabaseClient,
  scope: UserScope,
  bootstrapVector: TasteVectorV2 | null,
): Promise<TasteVectorV2 | null> {
  // Fetch all taste-relevant interactions + the search rows we need for
  // attribution boosting. Two queries because the taste set filters on
  // `content_id IS NOT NULL` and search rows have content_id NULL.
  const [interactionsResult, searchesResult] = await Promise.all([
    scope
      .select('user_interactions', 'content_id, media_type, event_type, metadata, created_at, session_id')
      .in('event_type', [...TASTE_RELEVANT_EVENTS])
      .not('content_id', 'is', null)
      .order('created_at', { ascending: true }),
    scope
      .select('user_interactions', 'created_at, session_id')
      .eq('event_type', 'search')
      .not('session_id', 'is', null)
      .order('created_at', { ascending: true }),
  ]);

  const interactions = interactionsResult.data as ReplayInteractionRow[] | null;
  const error = interactionsResult.error;
  if (error) {
    console.error('[InteractionUpdate] Failed to fetch interactions:', error.message);
    return null;
  }

  if (!interactions || interactions.length === 0) {
    return bootstrapVector;
  }

  // Build a per-session ordered list of search timestamps (ms). When
  // we hit a taste-relevant event during the replay, we pick the most
  // recent search timestamp in the same session and test the window.
  const searchesBySession = new Map<string, number[]>();
  for (const row of (searchesResult.data ?? []) as ReplaySearchRow[]) {
    if (!row.session_id || !row.created_at) continue;
    const ts = new Date(row.created_at).getTime();
    const arr = searchesBySession.get(row.session_id) ?? [];
    arr.push(ts);
    searchesBySession.set(row.session_id, arr);
  }

  // Collect unique content IDs for batch embedding fetch
  const contentKeys = new Set<string>();
  for (const i of interactions) {
    if (i.content_id && i.media_type) {
      contentKeys.add(`${i.media_type}-${i.content_id}`);
    }
  }

  const tmdbIds = [...contentKeys].map(k => {
    const [, id] = k.split('-');
    return parseInt(id, 10);
  });

  // Batch fetch embeddings
  const { data: titleRows, error: embedError } = await client
    .from('titles')
    .select('tmdb_id, media_type, embedding')
    .in('tmdb_id', tmdbIds)
    .not('embedding', 'is', null);

  if (embedError) {
    console.error('[InteractionUpdate] Failed to fetch embeddings:', embedError.message);
    return bootstrapVector;
  }

  // Build embedding lookup
  const embeddingMap = new Map<string, number[]>();
  for (const row of ((titleRows || []) as EmbeddingTitleRow[])) {
    if (row.embedding == null) continue;
    const key = `${row.media_type}-${row.tmdb_id}`;
    const emb: number[] = typeof row.embedding === 'string'
      ? JSON.parse(row.embedding)
      : row.embedding;
    embeddingMap.set(key, emb);
  }

  // Start from bootstrap vector or zero
  const dim = 1536;
  let vector = bootstrapVector ? [...bootstrapVector] : new Array(dim).fill(0);

  // A4 (roadmap 0.5): collapse repeated events to one per identity BEFORE
  // replay so duplicate taps don't multiply a title's weight. Re-sort
  // ascending by created_at so the confidence-floor boost still favours
  // the genuinely-earliest interactions (dedup returns Map order).
  const dedupedInteractions = dedupeInteractionsByIdentity(interactions).sort((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
    return at - bt;
  });

  // Replay all interactions with decay
  let count = 0;
  for (const interaction of dedupedInteractions) {
    const key = `${interaction.media_type}-${interaction.content_id}`;
    const embedding = embeddingMap.get(key);
    if (!embedding) continue;

    const baseWeight = INTERACTION_WEIGHTS[interaction.event_type];
    if (baseWeight === undefined) continue;

    // Handle deep_link_click confidence level. Metadata is JSON; cast
    // to a record shape for the field access — the runtime value comes
    // from emitInteraction which writes a plain object.
    let weight = baseWeight;
    if (interaction.event_type === 'deep_link_click') {
      const confidence = (interaction.metadata as { confidence?: string } | null)?.confidence;
      weight = confidence === 'low' ? 0.4 : 0.8;
    }

    // Handle combined watched + thumbs_up (1.5 replaces individual)
    // This is handled implicitly: the event log contains separate events,
    // and their weights sum naturally (0.5 + 1.0 = 1.5)

    // Apply decay. created_at is nullable in the schema but always set
    // by emitInteraction (column defaults to now() if absent). Skip
    // rows with null created_at — unreachable in practice.
    if (!interaction.created_at) continue;
    const halfLife = BEHAVIOURAL_EVENTS.has(interaction.event_type)
      ? BEHAVIOURAL_HALF_LIFE_DAYS
      : EXPLICIT_HALF_LIFE_DAYS;
    const decay = decayWeight(interaction.created_at, halfLife);

    count++;
    const confidenceMultiplier = count <= CONFIDENCE_FLOOR_THRESHOLD
      ? CONFIDENCE_FLOOR_MULTIPLIER
      : 1.0;

    // Search-attribution boost — replay-side. For every event in the
    // search-attribution allow-list, look up the most recent prior
    // search in the same session and apply the boost if it landed
    // within the window. Linear scan of a session's small search list
    // is cheap; per-session arrays are already sorted ascending.
    let searchBoost = 1.0;
    if (
      SEARCH_ATTRIBUTION_BOOSTED_EVENTS.has(interaction.event_type) &&
      interaction.session_id
    ) {
      const eventAtMs = new Date(interaction.created_at).getTime();
      const sessionSearches = searchesBySession.get(interaction.session_id);
      if (sessionSearches && sessionSearches.length > 0) {
        // Pick the latest search at or before the event timestamp.
        let lastSearchAt: number | null = null;
        for (const ts of sessionSearches) {
          if (ts > eventAtMs) break;
          lastSearchAt = ts;
        }
        if (isWithinAttributionWindow(eventAtMs, lastSearchAt)) {
          searchBoost = SEARCH_ATTRIBUTION_BOOST;
        }
      }
    }

    // ENG-1 Workstream B: TASTE_RELEVANT_EVENTS is positive-only now, so
    // the replay never sees negative rows; historical vectors heal on
    // their next 24h recompute with no migration.
    const effectiveWeight = weight * decay * LEARNING_RATE * confidenceMultiplier * searchBoost;

    vector = addScaled(vector, embedding, effectiveWeight);
  }

  if (isZeroVector(vector)) return bootstrapVector;

  return l2Normalise(vector);
}

// ── Interest centroids (ENG-1, Workstream A) ──

/**
 * Below this many distinct positively-interacted titles, k-means has too
 * little signal to refresh centroids — the batch path keeps whatever the
 * bootstrap seeded.
 */
const MIN_POSITIVES_FOR_KMEANS = 8;

/**
 * ENG-1: incremental EMA against the NEAREST interest centroid only
 * (assignment by cosine to the title embedding). Learning rate,
 * confidence floor and search-attribution boost are identical to the
 * summary-vector path. Positive events only — negative signals never
 * touch centroids (Workstream B owns negatives via the avoid set).
 *
 * Returns the updated slot + vector for a single-row write, or null
 * when no update applies.
 */
export async function applyInteractionToCentroids(
  centroids: InterestCentroid[],
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  eventType: string,
  interactionCount: number,
  sessionId?: string | null,
  prefetchedEmbedding?: number[] | null,
): Promise<{ slot: number; vector: TasteVectorV2 } | null> {
  if (centroids.length === 0) return null;
  if (NEGATIVE_EVENTS.has(eventType)) return null;

  const weight = INTERACTION_WEIGHTS[eventType];
  if (weight === undefined || weight <= 0) return null;

  // Embedding — reuse the caller's prefetched vector (shared with the
  // summary-vector update) so we don't re-query `titles` or re-warn.
  const embedding = prefetchedEmbedding !== undefined
    ? prefetchedEmbedding
    : await fetchTitleEmbedding(tmdbId, mediaType);

  if (!embedding) {
    if (prefetchedEmbedding === undefined) {
      console.warn('[InteractionUpdate] No embedding found for', mediaType, tmdbId);
    }
    return null;
  }

  // Nearest centroid by raw cosine
  let best = centroids[0];
  let bestCos = -Infinity;
  for (const c of centroids) {
    const cos = rawCosineSimilarity(c.centroid, embedding);
    if (cos > bestCos) {
      bestCos = cos;
      best = c;
    }
  }

  const newCount = interactionCount + 1;
  const confidenceMultiplier = newCount <= CONFIDENCE_FLOOR_THRESHOLD
    ? CONFIDENCE_FLOOR_MULTIPLIER
    : 1.0;
  const searchBoost =
    SEARCH_ATTRIBUTION_BOOSTED_EVENTS.has(eventType) &&
    isWithinAttributionWindow(Date.now(), getMostRecentSearchAt(sessionId))
      ? SEARCH_ATTRIBUTION_BOOST
      : 1.0;

  const effectiveWeight = Math.abs(weight) * LEARNING_RATE * confidenceMultiplier * searchBoost;

  return {
    slot: best.slot,
    vector: l2Normalise(addScaled(best.centroid, embedding, effectiveWeight)),
  };
}

/**
 * ENG-1: batch refresh of interest centroids during the 24h-stale
 * recompute. Aggregates decay-weighted mass per positively-interacted
 * title from the event log, then runs deterministic weighted k-means
 * (k = 3 cap). Fully replayable — derived from user_interactions alone.
 *
 * Returns interests sorted by weight DESC (slot 0 = dominant), or null
 * when there's too little signal (< 8 distinct positives) — caller keeps
 * the existing centroids.
 */
export async function recomputeInterestCentroids(): Promise<
  { centroid: TasteVectorV2; weight: number }[] | null
> {
  const userId = getAuthUserId();
  if (!userId) return null;
  return recomputeInterestCentroidsScoped(supabase, withUserScope(supabase, userId));
}

/** Scoped (server) implementation — PLAT-3 W5; see
 *  recomputeFromInteractionsScoped for the delegation rationale. */
export async function recomputeInterestCentroidsScoped(
  client: SupabaseClient,
  scope: UserScope,
): Promise<{ centroid: TasteVectorV2; weight: number }[] | null> {
  const positiveEvents = [...TASTE_RELEVANT_EVENTS].filter(e => !NEGATIVE_EVENTS.has(e));

  const { data, error } = await scope
    .select('user_interactions', 'content_id, media_type, event_type, metadata, created_at')
    .in('event_type', positiveEvents)
    .not('content_id', 'is', null)
    .order('created_at', { ascending: true });

  const interactions = data as ReplayInteractionRow[] | null;
  if (error || !interactions) {
    console.error('[InteractionUpdate] recomputeInterestCentroids fetch failed:', error?.message);
    return null;
  }

  // A4 (roadmap 0.5): same per-identity dedup as the summary-vector
  // recompute — a title contributes its mass once per event_type, not
  // once per repeated tap.
  const deduped = dedupeInteractionsByIdentity(interactions);

  // Decay-weighted mass per unique title ("share of recent positive
  // interactions" — recency is the decay, not a hard window)
  const massByKey = new Map<string, number>();
  for (const i of deduped) {
    if (!i.created_at || !i.content_id || !i.media_type) continue;

    let weight = INTERACTION_WEIGHTS[i.event_type];
    if (weight === undefined || weight <= 0) continue;
    if (i.event_type === 'deep_link_click') {
      const confidence = (i.metadata as { confidence?: string } | null)?.confidence;
      weight = confidence === 'low' ? 0.4 : 0.8;
    }

    const halfLife = BEHAVIOURAL_EVENTS.has(i.event_type)
      ? BEHAVIOURAL_HALF_LIFE_DAYS
      : EXPLICIT_HALF_LIFE_DAYS;
    const decay = decayWeight(i.created_at, halfLife);

    const key = `${i.media_type}-${i.content_id}`;
    massByKey.set(key, (massByKey.get(key) ?? 0) + weight * decay);
  }

  if (massByKey.size < MIN_POSITIVES_FOR_KMEANS) return null;

  // Batch fetch embeddings for the unique titles
  const tmdbIds = [...new Set([...massByKey.keys()].map(k => parseInt(k.split('-')[1], 10)))];
  const { data: titleRows, error: embedError } = await client
    .from('titles')
    .select('tmdb_id, media_type, embedding')
    .in('tmdb_id', tmdbIds)
    .not('embedding', 'is', null);

  if (embedError || !titleRows) {
    console.error('[InteractionUpdate] recomputeInterestCentroids embeddings failed:', embedError?.message);
    return null;
  }

  const embeddingMap = new Map<string, number[]>();
  for (const row of titleRows as EmbeddingTitleRow[]) {
    if (row.embedding == null) continue;
    const emb: number[] = typeof row.embedding === 'string'
      ? JSON.parse(row.embedding)
      : row.embedding;
    embeddingMap.set(`${row.media_type}-${row.tmdb_id}`, emb);
  }

  const points: WeightedPoint[] = [];
  for (const [key, mass] of massByKey) {
    const emb = embeddingMap.get(key);
    if (!emb) continue;
    points.push({ key, vec: emb, weight: mass });
  }

  if (points.length < MIN_POSITIVES_FOR_KMEANS) return null;

  const { centroids, masses } = weightedKMeans(points, MAX_INTEREST_CENTROIDS);
  if (centroids.length === 0) return null;

  const weights = computeInterestWeights(masses);

  return centroids
    .map((c, i) => ({ centroid: c, weight: weights[i] }))
    .sort((a, b) => b.weight - a.weight);
}

/** Check if the taste vector needs recomputation (stale > 24h) */
export function needsRecomputation(updatedAt: string | null): boolean {
  if (!updatedAt) return false; // no vector yet = nothing to recompute
  const lastUpdate = new Date(updatedAt).getTime();
  const hours24 = 24 * 60 * 60 * 1000;
  return Date.now() - lastUpdate > hours24;
}
