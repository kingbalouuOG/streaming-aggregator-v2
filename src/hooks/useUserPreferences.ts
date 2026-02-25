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
import { serviceIdToProviderId } from '@/lib/adapters/platformAdapter';
import { UK_PROVIDERS_ARRAY } from '@/lib/constants/platforms';
import type { ServiceId } from '@/components/platformLogos';
import { initializeFromClusters, saveQuizResults, getTasteProfile, saveTasteProfile } from '@/lib/storage/tasteProfile';
import type { QuizAnswer } from '@/lib/storage/tasteProfile';
import type { TasteVector } from '@/lib/taste/tasteVector';
import { clampVector, ALL_DIMENSIONS } from '@/lib/taste/tasteVector';
import { computeClusterSeedVector, deriveHomeGenres } from '@/lib/taste/tasteClusters';
import { debug } from '@/lib/debugLogger';

export interface OnboardingPayload {
  name: string;
  email: string;
  services: string[];   // ServiceId strings
  clusters: string[];   // taste cluster IDs
  quizAnswers?: QuizAnswer[];
  tasteVector?: TasteVector;
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
        // Different Supabase user — discard stale localStorage data
        await clearAllData();
        setProfile(null);
        setPreferences(null);
        setOnboardingComplete(false);
        setLoading(false);
        return;
      }
      // Remember this auth user for future mismatch detection
      await setStoredAuthUserId(userId);
    }

    setProfile(p);
    setPreferences(prefs);
    setOnboardingComplete(onboarded);
    setLoading(false);
  }, []);

  // Load when userId becomes available or changes
  useEffect(() => {
    if (currentUserId) load(currentUserId);
  }, [currentUserId, load]);

  const completeOnboarding = useCallback(async (data: OnboardingPayload) => {
    const userId = `user_${Date.now()}`;

    debug.info('Onboarding', 'Completing onboarding', {
      clusters: data.clusters,
      services: data.services,
      hasQuizAnswers: !!(data.quizAnswers && data.tasteVector),
      quizAnswerCount: data.quizAnswers?.length ?? 0,
    });

    await saveUserProfile({ userId, name: data.name, email: data.email });

    // Map ServiceId strings → TMDb provider IDs for storage
    const platforms = data.services.map((serviceId) => {
      const providerId = serviceIdToProviderId(serviceId as ServiceId);
      const provider = UK_PROVIDERS_ARRAY.find((p) => p.id === providerId);
      return { id: providerId, name: provider?.name || serviceId, selected: true };
    });

    // Derive homeGenres from cluster seed vector
    const homeGenres = deriveHomeGenres(data.clusters);

    await saveUserPreferences({
      region: 'GB', platforms, homeGenres,
      selectedClusters: data.clusters,
    });

    // Always initialise from clusters first (sets seed_vector in Supabase).
    // Then overlay quiz results if the user completed the quiz.
    await initializeFromClusters(data.clusters)
      .catch((e) => console.error('[Onboarding] initializeFromClusters failed:', e));
    if (data.quizAnswers && data.tasteVector) {
      await saveQuizResults(data.quizAnswers, data.tasteVector)
        .catch((e) => console.error('[Onboarding] saveQuizResults failed:', e));
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
    debug.info('Clusters', 'Updating clusters', {
      newClusters: clusterIds,
      previousClusters: preferences?.selectedClusters ?? [],
    });

    const newSeed = computeClusterSeedVector(clusterIds);
    const homeGenres = deriveHomeGenres(clusterIds);

    // Persist to preferences
    const updated = {
      ...(preferences || { region: 'GB', platforms: [] }),
      homeGenres,
      selectedClusters: clusterIds,
    } as UserPreferences;
    await saveUserPreferences(updated);
    setPreferences(updated);

    // Update taste vector via seed delta shift
    const tasteProfile = await getTasteProfile();
    if (tasteProfile) {
      const oldClusters = preferences?.selectedClusters;
      if (oldClusters && oldClusters.length > 0) {
        // Shift current vector by seed difference (preserves quiz + interaction deltas).
        // Math: newVector = currentVector + (newSeed - oldSeed)
        //                 = newSeed + quizDelta + interactionDrift
        const oldSeed = computeClusterSeedVector(oldClusters);
        const newVector = { ...tasteProfile.vector };
        for (const d of ALL_DIMENSIONS) {
          newVector[d] += newSeed[d] - oldSeed[d];
        }
        tasteProfile.vector = clampVector(newVector);
      } else {
        // Legacy user choosing clusters for the first time — one-time lossy re-seed.
        // Their old quiz was calibrated against createDefaultVector (genre-based),
        // which is fundamentally different from a cluster seed. Preserving those
        // deltas would produce incoherent results.
        tasteProfile.vector = newSeed;
      }
      tasteProfile.lastUpdated = new Date().toISOString();
      await saveTasteProfile(tasteProfile);
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
