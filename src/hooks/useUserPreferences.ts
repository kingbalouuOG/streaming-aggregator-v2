import { useState, useEffect, useCallback } from 'react';
import {
  getUserProfile,
  saveUserProfile,
  getUserPreferences,
  saveUserPreferences,
  hasCompletedOnboarding,
  clearAllData,
  getStoredAuthUserId,
  setStoredAuthUserId,
  type UserProfile,
  type UserPreferences,
} from '@/lib/storage/userPreferences';
import { serviceIdToProviderId, providerIdToServiceId } from '@/lib/adapters/platformAdapter';
import { UK_PROVIDERS_ARRAY } from '@/lib/constants/platforms';
import type { ServiceId } from '@/components/platformLogos';
import { TASTE_CLUSTERS } from '@/lib/taste-v2/tasteClusters';
import { bootstrapTasteVector, bootstrapInterestCentroids } from '@/lib/taste-v2/bootstrap';
import { saveV2TasteVector, saveSliderState, saveInterestCentroids } from '@/lib/taste-v2/tasteProfileV2';
import { DEFAULT_SLIDERS } from '@/lib/taste-v2/types';
import type { BootstrapSource, SliderState } from '@/lib/taste-v2/types';
import { debug } from '@/lib/debugLogger';

export interface OnboardingPayload {
  name: string;
  email: string;
  services: string[];             // ServiceId strings
  clusters: string[];             // taste cluster IDs
  watchedTitles?: { tmdbId: number; mediaType: 'movie' | 'tv' }[];
  sliders?: SliderState;
  onboardingStartTime?: number;
}

export function useUserPreferences(currentUserId?: string | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (userId?: string) => {
    setLoading(true);
    const [p, prefs, onboarded] = await Promise.all([
      getUserProfile(),
      getUserPreferences(),
      hasCompletedOnboarding(),
    ]);

    // Detect different-user sign-in via stored auth ID
    if (userId) {
      const storedAuthId = await getStoredAuthUserId();
      if (storedAuthId && storedAuthId !== userId) {
        await clearAllData();
        setProfile(null);
        setPreferences(null);
        setOnboardingComplete(false);
        setLoading(false);
        return;
      }
      await setStoredAuthUserId(userId);
    }

    setProfile(p);
    setPreferences(prefs);
    setOnboardingComplete(onboarded);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (currentUserId) load(currentUserId);
  }, [currentUserId, load]);

  const completeOnboarding = useCallback(async (data: OnboardingPayload) => {
    const userId = `user_${Date.now()}`;

    debug.info('Onboarding', 'Completing onboarding (v2)', {
      clusters: data.clusters,
      services: data.services,
      watchedTitleCount: data.watchedTitles?.length ?? 0,
    });

    await saveUserProfile({ userId, name: data.name, email: data.email });

    // Map ServiceId strings → TMDb provider IDs for storage
    const platforms = data.services.map((serviceId) => {
      const providerId = serviceIdToProviderId(serviceId as ServiceId);
      const provider = UK_PROVIDERS_ARRAY.find((p) => p.id === providerId);
      return { id: providerId, name: provider?.name || serviceId, selected: true };
    });

    // Derive homeGenres from cluster tmdbGenreIds (v2 path)
    const seen = new Set<number>();
    const homeGenres: number[] = [];
    for (const clusterId of data.clusters) {
      const cluster = TASTE_CLUSTERS.find(c => c.id === clusterId);
      if (cluster) {
        for (const gId of cluster.tmdbGenreIds) {
          if (!seen.has(gId)) {
            seen.add(gId);
            homeGenres.push(gId);
          }
        }
      }
    }

    await saveUserPreferences({
      region: 'GB', platforms, homeGenres,
      selectedClusters: data.clusters,
    });

    // Bootstrap v2 taste vector from onboarding signals
    const clusterRepresentativeTmdbIds = data.clusters.flatMap(clusterId => {
      const cluster = TASTE_CLUSTERS.find(c => c.id === clusterId);
      return cluster?.representativeTmdbIds || [];
    });

    const bootstrapSource: BootstrapSource = data.watchedTitles?.length
      ? 'onboarding_v2'
      : data.clusters.length
        ? 'onboarding_v2'
        : 'services_only';

    try {
      const vector = await bootstrapTasteVector({
        serviceIds: data.services,
        watchedTitles: data.watchedTitles || [],
        clusterRepresentativeTmdbIds,
      });

      if (vector) {
        await saveV2TasteVector(vector, 0, bootstrapSource);
      }

      // ENG-1: multi-interest centroids alongside the summary vector.
      // Per-cluster seeds (not the flattened union) — close clusters merge,
      // distant ones become separate retrieval interests.
      const clusterSeeds = data.clusters
        .map(clusterId => {
          const cluster = TASTE_CLUSTERS.find(c => c.id === clusterId);
          return { clusterId, tmdbIds: cluster?.representativeTmdbIds || [] };
        })
        .filter(s => s.tmdbIds.length > 0);

      const interests = await bootstrapInterestCentroids({
        serviceIds: data.services,
        watchedTitles: data.watchedTitles || [],
        clusterSeeds,
      });
      if (interests) {
        await saveInterestCentroids(interests);
      }
    } catch (e) {
      console.error('[Onboarding] bootstrapTasteVector failed:', e);
    }

    // Save slider state (defaults or user-tuned from Step 5)
    try {
      await saveSliderState(data.sliders || DEFAULT_SLIDERS);
    } catch (e) {
      console.error('[Onboarding] saveSliderState failed:', e);
    }

    setProfile({ userId, name: data.name, email: data.email, createdAt: Date.now() });
    setPreferences({ region: 'GB', platforms, homeGenres, selectedClusters: data.clusters });
    setOnboardingComplete(true);
  }, []);

  const updateProfile = useCallback(async (name: string, email: string) => {
    if (!profile) return;
    const updated = { ...profile, name, email };
    await saveUserProfile(updated);
    setProfile(updated);
  }, [profile]);

  const updateServices = useCallback(async (serviceIds: string[]) => {
    const platforms = serviceIds.map((serviceId) => {
      const providerId = serviceIdToProviderId(serviceId as ServiceId);
      const provider = UK_PROVIDERS_ARRAY.find((p) => p.id === providerId);
      return { id: providerId, name: provider?.name || serviceId, selected: true };
    });
    const updated = { ...(preferences || { region: 'GB' }), platforms } as UserPreferences;
    await saveUserPreferences(updated);
    setPreferences(updated);
  }, [preferences]);

  const updateClusters = useCallback(async (clusterIds: string[]) => {
    debug.info('Clusters', 'Updating clusters (v2)', {
      newClusters: clusterIds,
      previousClusters: preferences?.selectedClusters ?? [],
    });

    // Derive homeGenres from cluster tmdbGenreIds
    const seen = new Set<number>();
    const homeGenres: number[] = [];
    for (const clusterId of clusterIds) {
      const cluster = TASTE_CLUSTERS.find(c => c.id === clusterId);
      if (cluster) {
        for (const gId of cluster.tmdbGenreIds) {
          if (!seen.has(gId)) { seen.add(gId); homeGenres.push(gId); }
        }
      }
    }

    const updated = {
      ...(preferences || { region: 'GB', platforms: [] }),
      homeGenres,
      selectedClusters: clusterIds,
    } as UserPreferences;
    await saveUserPreferences(updated);
    setPreferences(updated);

    // Re-bootstrap taste vector with new cluster selections
    const clusterRepresentativeTmdbIds = clusterIds.flatMap(clusterId => {
      const cluster = TASTE_CLUSTERS.find(c => c.id === clusterId);
      return cluster?.representativeTmdbIds || [];
    });

    try {
      const retakeServiceIds = (preferences?.platforms || [])
        .filter(p => p.selected !== false)
        .map(p => {
          const sid = providerIdToServiceId(p.id);
          return sid || '';
        })
        .filter(Boolean);

      const vector = await bootstrapTasteVector({
        serviceIds: retakeServiceIds,
        watchedTitles: [],
        clusterRepresentativeTmdbIds,
      });
      if (vector) {
        await saveV2TasteVector(vector, 0, 'manual_retake');
      }

      // ENG-1: re-derive interest centroids from the new cluster picks
      const clusterSeeds = clusterIds
        .map(clusterId => {
          const cluster = TASTE_CLUSTERS.find(c => c.id === clusterId);
          return { clusterId, tmdbIds: cluster?.representativeTmdbIds || [] };
        })
        .filter(s => s.tmdbIds.length > 0);

      const interests = await bootstrapInterestCentroids({
        serviceIds: retakeServiceIds,
        watchedTitles: [],
        clusterSeeds,
      });
      if (interests) {
        await saveInterestCentroids(interests);
      }
    } catch (e) {
      console.error('[updateClusters] re-bootstrap failed:', e);
    }
  }, [preferences]);

  const signOut = useCallback(async () => {
    await clearAllData();
    setProfile(null);
    setPreferences(null);
    setOnboardingComplete(false);
  }, []);

  return {
    profile,
    preferences,
    onboardingComplete,
    loading,
    completeOnboarding,
    updateProfile,
    updateServices,
    updateClusters,
    signOut,
    reload: load,
  };
}
