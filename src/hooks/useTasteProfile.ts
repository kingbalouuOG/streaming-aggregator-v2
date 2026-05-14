/**
 * useTasteProfile Hook (V2)
 *
 * Wraps v2 taste profile with React state management.
 * Provides `trackInteraction()` for continuous learning
 * and auto-recomputes the vector if stale (>24h).
 */

import { useState, useEffect, useCallback } from 'react';
import { getV2TasteProfile, updateV2TasteVector } from '@/lib/taste-v2/tasteProfileV2';
import { applyInteractionIncremental, recomputeFromInteractions, needsRecomputation } from '@/lib/taste-v2/interactionUpdate';
import type { TasteProfileV2 } from '@/lib/taste-v2/types';
import { invalidateRecommendationCache } from '@/lib/storage/recommendations';
import { emitContentInteraction } from '@/lib/storage/interactions';
import { getCurrentSessionId } from '@/lib/instrumentation/sessionId';
import storage from '@/lib/storage';

const HIDDEN_GEMS_CACHE_KEY = '@app_hidden_gems';

export function useTasteProfile() {
  const [profile, setProfile] = useState<TasteProfileV2 | null>(null);
  const [loading, setLoading] = useState(true);

  // Load profile and check for stale recomputation
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const p = await getV2TasteProfile();
        if (cancelled) return;

        if (p?.tasteVector && needsRecomputation(p.updatedAt)) {
          // Full recompute from user_interactions event log
          const recomputed = await recomputeFromInteractions(p.tasteVector);
          if (recomputed && !cancelled) {
            await updateV2TasteVector(recomputed, p.interactionCount);
            setProfile({ ...p, tasteVector: recomputed, updatedAt: new Date().toISOString() });
            return;
          }
        }

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

      // Update v2 taste vector incrementally
      if (profile?.tasteVector) {
        const result = await applyInteractionIncremental(
          profile.tasteVector,
          contentMeta.contentId,
          contentMeta.contentType,
          action,
          profile.interactionCount,
          getCurrentSessionId(),
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
