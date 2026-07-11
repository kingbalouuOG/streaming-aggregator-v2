import { useState } from 'react';

import { serviceIdToProviderId } from '@/lib/adapters/platformAdapter';
import { bootstrapInterestCentroids, bootstrapTasteVector } from '@/lib/taste-v2/bootstrap';
import { TASTE_CLUSTERS } from '@/lib/taste-v2/tasteClusters';
import {
  saveInterestCentroids,
  saveSliderState,
  saveV2TasteVector,
} from '@/lib/taste-v2/tasteProfileV2';
import type { SliderState } from '@/lib/taste-v2/types';
import { saveUserPreferences, saveUserProfile } from '@/lib/storage/userPreferences';
import { supabase } from '@/lib/supabase';
import { SERVICE_DISPLAY_NAMES, type ServiceId } from '@/lib/types/content';

// Completion orchestration (NATIVE-3 W6) — mirrors the web
// useUserPreferences.completeOnboarding + the App.tsx onboarding_completed
// write, so a native-built profile is identical to a web-built one.
// Reuses the shared bootstrap/save lib wholesale.

export interface CompleteOnboardingData {
  services: ServiceId[];
  clusters: string[];
  watchedTitles: { tmdbId: number; mediaType: 'movie' | 'tv' }[];
  sliders: SliderState;
  ageRange: string | null;
  viewingContext: string | null;
}

export function useCompleteOnboarding() {
  const [submitting, setSubmitting] = useState(false);

  const complete = async (data: CompleteOnboardingData): Promise<boolean> => {
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error('No authenticated user');
      const email = user.email ?? '';
      const name = ((user.user_metadata?.username as string | undefined) ?? '') || email.split('@')[0] || 'User';

      await saveUserProfile({ userId: user.id, name, email });

      // Services → TMDb provider IDs for storage.
      const platforms = data.services.map((sid) => ({
        id: serviceIdToProviderId(sid),
        name: SERVICE_DISPLAY_NAMES[sid],
        selected: true,
      }));

      // homeGenres = deduped union of selected clusters' tmdbGenreIds.
      const seen = new Set<number>();
      const homeGenres: number[] = [];
      for (const clusterId of data.clusters) {
        const cluster = TASTE_CLUSTERS.find((c) => c.id === clusterId);
        for (const g of cluster?.tmdbGenreIds ?? []) {
          if (!seen.has(g)) {
            seen.add(g);
            homeGenres.push(g);
          }
        }
      }

      await saveUserPreferences({
        region: 'GB',
        platforms,
        homeGenres,
        selectedClusters: data.clusters,
      });

      // Bootstrap the v2 taste vector + interest centroids from the signals.
      try {
        const clusterRepresentativeTmdbIds = data.clusters.flatMap(
          (clusterId) => TASTE_CLUSTERS.find((c) => c.id === clusterId)?.representativeTmdbIds ?? [],
        );
        const vector = await bootstrapTasteVector({
          serviceIds: data.services,
          watchedTitles: data.watchedTitles,
          clusterRepresentativeTmdbIds,
        });
        if (vector) await saveV2TasteVector(vector, 0, 'onboarding_v2');

        const clusterSeeds = data.clusters
          .map((clusterId) => ({
            clusterId,
            tmdbIds: TASTE_CLUSTERS.find((c) => c.id === clusterId)?.representativeTmdbIds ?? [],
          }))
          .filter((s) => s.tmdbIds.length > 0);
        const interests = await bootstrapInterestCentroids({
          serviceIds: data.services,
          watchedTitles: data.watchedTitles,
          clusterSeeds,
        });
        if (interests) await saveInterestCentroids(interests);
      } catch (e) {
        console.error('[Onboarding] bootstrap failed:', e);
      }

      try {
        await saveSliderState(data.sliders);
      } catch (e) {
        console.error('[Onboarding] saveSliderState failed:', e);
      }

      // Flag onboarding complete (+ optional demographics) on profiles —
      // this is what hasCompletedOnboarding() and the (tabs) guard read.
      const updates: {
        onboarding_completed: boolean;
        updated_at: string;
        age_range?: string;
        viewing_context?: string;
      } = {
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      };
      if (data.ageRange) updates.age_range = data.ageRange;
      if (data.viewingContext) updates.viewing_context = data.viewingContext;
      // MUST fail loudly: callers write completion into the guard's query
      // cache on success, and an unnoticed failure here would leave the
      // cache saying "complete" while the server says otherwise — the user
      // would bounce back into onboarding on their next cold start.
      const { error: flagError } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (flagError) throw flagError;

      return true;
    } catch (e) {
      console.error('[Onboarding] completion failed:', e);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return { complete, submitting };
}
