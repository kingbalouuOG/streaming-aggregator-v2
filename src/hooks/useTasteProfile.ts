/**
 * useTasteProfile Hook
 *
 * Wraps taste profile storage with React state management.
 * Provides `recordInteraction()` for continuous learning
 * and auto-recomputes the vector if stale (>24h).
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getTasteProfile,
  recordInteraction,
  recomputeVector,
  needsRecomputation,
  type TasteProfile,
  type Interaction,
} from '@/lib/storage/tasteProfile';
import type { ContentMetadata } from '@/lib/taste/contentVectorMapping';
import { invalidateRecommendationCache } from '@/lib/storage/recommendations';
import storage from '@/lib/storage';

const HIDDEN_GEMS_CACHE_KEY = '@app_hidden_gems';

export function useTasteProfile() {
  const [profile, setProfile] = useState<TasteProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load profile and check for stale recomputation
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        let p = await getTasteProfile();
        if (p && needsRecomputation(p)) {
          const recomputed = await recomputeVector();
          if (recomputed) p = recomputed;
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
    contentMeta: ContentMetadata & { contentId: number; contentType: 'movie' | 'tv' },
    action: Interaction['action']
  ) => {
    try {
      const updated = await recordInteraction(contentMeta, action);
      if (updated) {
        setProfile(updated);
        // Invalidate recommendation caches so next load uses new vector
        await Promise.all([
          invalidateRecommendationCache(),
          storage.removeItem(HIDDEN_GEMS_CACHE_KEY),
        ]).catch(() => {});
      }
    } catch (err) {
      console.error('[useTasteProfile] Error recording interaction:', err);
    }
  }, []);

  const reload = useCallback(async () => {
    const p = await getTasteProfile();
    setProfile(p);
  }, []);

  return {
    profile,
    loading,
    trackInteraction,
    reload,
  };
}
