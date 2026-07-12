/**
 * Nightly stale-profile recompute sweep — PLAT-3 W5 (brief §7.2-4).
 *
 * Replaces the client's launch-time recompute in useTasteProfile: the
 * >24h-stale full taste replay + centroid k-means refresh now runs on
 * the videx-api Worker's cron trigger, never again on a For You load's
 * critical path.
 *
 * Per-user work is identical to what the client launch path did:
 *   1. recomputeFromInteractionsScoped (full decay-weighted replay of
 *      the user_interactions event log, current vector as anchor)
 *      → updateV2TasteVectorScoped (bumps taste_vector_updated_at,
 *      which busts the Worker's KV feed cache by key construction).
 *   2. recomputeInterestCentroidsScoped (deterministic weighted
 *      k-means, K ≤ 3) → saveInterestCentroidsScoped. A null result
 *      (< 8 distinct positives) keeps the existing centroids — same
 *      contract as the client path.
 *
 * Failures are isolated per user: one bad profile never stops the
 * sweep. Deterministic + replayable, so a missed night self-heals on
 * the next run.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { withUserScope, type UserScope } from './userScope';
import {
  recomputeFromInteractionsScoped,
  recomputeInterestCentroidsScoped,
} from '../taste-v2/interactionUpdate';
import {
  updateV2TasteVectorScoped,
  saveInterestCentroidsScoped,
  markTasteVectorRecomputedScoped,
} from '../taste-v2/tasteProfileV2';
import { TASTE_RELEVANT_EVENTS, type TasteVectorV2 } from '../taste-v2/types';

const STALE_HOURS = 24;
/** Per-run cap — at prototype scale (2 users) this is academic; at
 *  launch scale it bounds one cron invocation's work and the remainder
 *  picks up next night (or the schedule tightens). */
const MAX_PROFILES_PER_RUN = 200;

interface StaleProfileRow {
  user_id: string;
  taste_vector_v2: string | number[] | null;
  taste_vector_interaction_count: number | null;
  taste_vector_recomputed_at: string | null;
}

export interface StaleRecomputeReport {
  scanned: number;
  vectorsRecomputed: number;
  centroidsRefreshed: number;
  /** Examined but skipped — no taste-relevant interaction since the last
   *  recompute, so a full replay would reproduce the same vector. */
  skipped: number;
  errors: { userId: string; message: string }[];
}

/**
 * Activity gate (pre-launch perf batch, finding 2).
 *
 * The cron used to full-replay every profile whose taste_vector_updated_at
 * was >24h old. But updated_at bumps on BOTH the client's per-interaction
 * EMA write AND the cron's own recompute, so it can't distinguish "the
 * vector changed because the user interacted" from "…because we last
 * replayed it". The upshot: a dormant user (no new interactions) got a
 * full event-log replay + k-means every ~2 nights forever.
 *
 * The fix keys the whole sweep on taste_vector_recomputed_at (migration
 * 065), a marker only this cron writes, and skips the expensive replay
 * for any user with no taste-relevant interaction NEWER than their last
 * recompute — a replay from the same inputs would only re-apply marginal
 * decay drift. A NULL marker (never recomputed, incl. every row at
 * migration time) always recomputes. Decay for a dormant user is applied
 * lazily on their next real interaction, not eagerly every night.
 */
export async function hasNewSignalSinceRecompute(
  scope: UserScope,
  lastRecomputedAt: string | null,
): Promise<boolean> {
  // Never recomputed → always eligible (first pass, or a legacy row).
  if (!lastRecomputedAt) return true;

  const { data, error } = await scope
    .select('user_interactions', 'created_at')
    .in('event_type', [...TASTE_RELEVANT_EVENTS])
    .gt('created_at', lastRecomputedAt)
    .limit(1);

  // On a probe error, fail OPEN (recompute) — never silently drop a
  // user's refresh because the cheap existence check hiccuped.
  if (error) return true;
  return Array.isArray(data) && data.length > 0;
}

export async function recomputeStaleProfiles(
  client: SupabaseClient,
): Promise<StaleRecomputeReport> {
  const report: StaleRecomputeReport = {
    scanned: 0,
    vectorsRecomputed: 0,
    centroidsRefreshed: 0,
    skipped: 0,
    errors: [],
  };

  const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

  // Cross-user listing is inherently a service-role read — the one
  // place the sweep touches taste_profiles outside a UserScope. Rows
  // without a vector are skipped (nothing to recompute: the vector
  // appears at onboarding bootstrap, not here). Selection keys on
  // taste_vector_recomputed_at (finding 2): NULL (never recomputed) OR
  // older than the cutoff. NULLs sort first so migration-time rows drain
  // over the first few runs.
  const { data, error } = await client
    .from('taste_profiles')
    .select('user_id, taste_vector_v2, taste_vector_interaction_count, taste_vector_recomputed_at')
    .not('taste_vector_v2', 'is', null)
    .or(`taste_vector_recomputed_at.is.null,taste_vector_recomputed_at.lt.${cutoff}`)
    .order('taste_vector_recomputed_at', { ascending: true, nullsFirst: true })
    .limit(MAX_PROFILES_PER_RUN);

  if (error) {
    report.errors.push({ userId: '(listing)', message: error.message });
    return report;
  }

  const rows = (data ?? []) as StaleProfileRow[];
  report.scanned = rows.length;

  for (const row of rows) {
    try {
      const scope = withUserScope(client, row.user_id);

      // Activity gate: skip the full replay when nothing new landed
      // since the last recompute. Stamp recomputed_at either way so the
      // row leaves the scan window for ~24h (a skipped dormant user then
      // costs one cheap existence probe every ~2 nights, not a replay).
      const nowIso = new Date().toISOString();
      const hasNewSignal = await hasNewSignalSinceRecompute(scope, row.taste_vector_recomputed_at);

      if (!hasNewSignal) {
        report.skipped += 1;
        await markTasteVectorRecomputedScoped(scope, nowIso);
        continue;
      }

      const currentVector: TasteVectorV2 | null = typeof row.taste_vector_v2 === 'string'
        ? (JSON.parse(row.taste_vector_v2) as TasteVectorV2)
        : row.taste_vector_v2;

      // Same anchor the client launch path used: the current vector.
      const recomputed = await recomputeFromInteractionsScoped(client, scope, currentVector);
      if (recomputed) {
        await updateV2TasteVectorScoped(
          scope,
          recomputed,
          row.taste_vector_interaction_count ?? 0,
        );
        report.vectorsRecomputed += 1;
      }

      const interests = await recomputeInterestCentroidsScoped(client, scope);
      if (interests) {
        await saveInterestCentroidsScoped(scope, interests);
        report.centroidsRefreshed += 1;
      }

      // Mark the recompute AFTER the writes so a mid-user crash leaves
      // recomputed_at stale and the user is retried next run rather than
      // marked done with a half-applied update.
      await markTasteVectorRecomputedScoped(scope, nowIso);
    } catch (err) {
      report.errors.push({
        userId: row.user_id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return report;
}
