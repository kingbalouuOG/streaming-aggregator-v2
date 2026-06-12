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
import { withUserScope } from './userScope';
import {
  recomputeFromInteractionsScoped,
  recomputeInterestCentroidsScoped,
} from '../taste-v2/interactionUpdate';
import {
  updateV2TasteVectorScoped,
  saveInterestCentroidsScoped,
} from '../taste-v2/tasteProfileV2';
import type { TasteVectorV2 } from '../taste-v2/types';

const STALE_HOURS = 24;
/** Per-run cap — at prototype scale (2 users) this is academic; at
 *  launch scale it bounds one cron invocation's work and the remainder
 *  picks up next night (or the schedule tightens). */
const MAX_PROFILES_PER_RUN = 200;

interface StaleProfileRow {
  user_id: string;
  taste_vector_v2: string | number[] | null;
  taste_vector_interaction_count: number | null;
}

export interface StaleRecomputeReport {
  scanned: number;
  vectorsRecomputed: number;
  centroidsRefreshed: number;
  errors: { userId: string; message: string }[];
}

export async function recomputeStaleProfiles(
  client: SupabaseClient,
): Promise<StaleRecomputeReport> {
  const report: StaleRecomputeReport = {
    scanned: 0,
    vectorsRecomputed: 0,
    centroidsRefreshed: 0,
    errors: [],
  };

  const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

  // Cross-user listing is inherently a service-role read — the one
  // place the sweep touches taste_profiles outside a UserScope. Rows
  // without a vector are skipped (nothing to recompute: the vector
  // appears at onboarding bootstrap, not here).
  const { data, error } = await client
    .from('taste_profiles')
    .select('user_id, taste_vector_v2, taste_vector_interaction_count')
    .not('taste_vector_v2', 'is', null)
    .lt('taste_vector_updated_at', cutoff)
    .order('taste_vector_updated_at', { ascending: true })
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
    } catch (err) {
      report.errors.push({
        userId: row.user_id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return report;
}
