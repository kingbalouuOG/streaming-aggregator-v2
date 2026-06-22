/**
 * useTasteProfile Hook (V2)
 *
 * Wraps v2 taste profile with React state management.
 * Provides `trackInteraction()` for continuous learning
 * and auto-recomputes the vector if stale (>24h).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getV2TasteProfile,
  updateV2TasteVector,
  getInterestCentroids,
  updateInterestCentroidVector,
} from '@/lib/taste-v2/tasteProfileV2';
import {
  applyInteractionIncremental,
  applyInteractionToCentroids,
  eventUsesEmbedding,
  fetchTitleEmbedding,
} from '@/lib/taste-v2/interactionUpdate';
import type { TasteProfileV2 } from '@/lib/taste-v2/types';
import { invalidateRecommendationCache } from '@/lib/storage/recommendations';
import { emitContentInteraction } from '@/lib/storage/interactions';
import { getCurrentSessionId } from '@/lib/instrumentation/sessionId';
import storage from '@/lib/storage';

const HIDDEN_GEMS_CACHE_KEY = '@app_hidden_gems';

export function useTasteProfile() {
  const [profile, setProfile] = useState<TasteProfileV2 | null>(null);
  const [loading, setLoading] = useState(true);

  // Load profile. The >24h stale recompute that used to run here
  // (awaited, on the launch hot path) moved to the videx-api Worker's
  // nightly cron in PLAT-3 W5 (src/lib/server/staleRecompute.ts) —
  // worst-case staleness is now ~28h instead of "until next launch",
  // and the launch path never replays the event log again.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const p = await getV2TasteProfile();
        if (!cancelled) setProfile(p);
      } catch (err) {
        console.error('[useTasteProfile] Error loading:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Record a user interaction and update the vector
  const trackInteraction = useCallback(async (
    contentMeta: { contentId: number; contentType: 'movie' | 'tv'; title?: string; genreIds?: number[] },
    action: 'thumbs_up' | 'thumbs_down' | 'watchlist_add' | 'watched' | 'removed',
  ) => {
    try {
      // Emit to user_interactions event log (fire-and-forget, Phase 0 infrastructure)
      emitContentInteraction(action, contentMeta.contentId, contentMeta.contentType, {
        title: contentMeta.title,
        genre_ids: contentMeta.genreIds || [],
      });

      // Fetch the title embedding once and share it across both taste paths
      // (summary vector + nearest centroid) — one `titles` query, and at most
      // one "no embedding" warning per interaction.
      const needsEmbedding = eventUsesEmbedding(action);
      const embedding = needsEmbedding
        ? await fetchTitleEmbedding(contentMeta.contentId, contentMeta.contentType)
        : null;
      if (needsEmbedding && !embedding) {
        console.warn('[InteractionUpdate] No embedding found for', contentMeta.contentType, contentMeta.contentId);
      }

      // Update v2 taste vector incrementally
      if (profile?.tasteVector) {
        const result = await applyInteractionIncremental(
          profile.tasteVector,
          contentMeta.contentId,
          contentMeta.contentType,
          action,
          profile.interactionCount,
          getCurrentSessionId(),
          embedding,
        );

        if (result) {
          await updateV2TasteVector(result.vector, result.newCount);
          setProfile(prev => prev ? {
            ...prev,
            tasteVector: result.vector,
            interactionCount: result.newCount,
            updatedAt: new Date().toISOString(),
          } : prev);

          // Invalidate recommendation caches so next load uses new vector
          await Promise.all([
            invalidateRecommendationCache(),
            storage.removeItem(HIDDEN_GEMS_CACHE_KEY),
          ]).catch(() => {});
        }
      }

      // ENG-1: nearest-centroid EMA alongside the summary vector.
      // Positive events only (negatives are a Workstream B no-op here);
      // single-row write to the assigned slot. getInterestCentroids hits
      // the 5-min profile cache, so this adds no read on the hot path.
      const centroids = await getInterestCentroids();
      if (centroids.length > 0) {
        const centroidUpdate = await applyInteractionToCentroids(
          centroids,
          contentMeta.contentId,
          contentMeta.contentType,
          action,
          profile?.interactionCount ?? 0,
          getCurrentSessionId(),
          embedding,
        );
        if (centroidUpdate) {
          await updateInterestCentroidVector(centroidUpdate.slot, centroidUpdate.vector);
        }
      }
    } catch (err) {
      console.error('[useTasteProfile] Error recording interaction:', err);
    }
  }, [profile?.tasteVector, profile?.interactionCount]);

  const reload = useCallback(async () => {
    const p = await getV2TasteProfile();
    setProfile(p);
  }, []);

  return {
    profile,
    loading,
    trackInteraction,
    reload,
  };
}
