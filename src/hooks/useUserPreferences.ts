import { useState, useEffect, useCallback } from 'react';
import {
  getUserProfile,
  saveUserProfile,
  getUserPreferences,
  saveUserPreferences,
  hasCompletedOnboarding,
  clearAllData,
  type UserProfile,
  type UserPreferences,
} from '@/lib/storage/userPreferences';
import { serviceIdToProviderId } from '@/lib/adapters/platformAdapter';
import { GENRE_NAME_TO_ID } from '@/lib/constants/genres';
import { UK_PROVIDERS_ARRAY } from '@/lib/constants/platforms';
import type { ServiceId } from '@/components/platformLogos';
import { initializeFromGenres, saveQuizResults, getTasteProfile, saveTasteProfile } from '@/lib/storage/tasteProfile';
import type { QuizAnswer } from '@/lib/storage/tasteProfile';
import type { TasteVector } from '@/lib/taste/tasteVector';
import { genreNameToKey, clampVector, GENRE_DIMENSIONS } from '@/lib/taste/tasteVector';

export interface OnboardingPayload {
  name: string;
  email: string;
  services: string[];   // ServiceId strings
  genres: string[];      // display names like "Action"
  quizAnswers?: QuizAnswer[];
  tasteVector?: TasteVector;
}

export function useUserPreferences() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, prefs, onboarded] = await Promise.all([
      getUserProfile(),
      getUserPreferences(),
      hasCompletedOnboarding(),
    ]);
    setProfile(p);
    setPreferences(prefs);
    setOnboardingComplete(onboarded);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const completeOnboarding = useCallback(async (data: OnboardingPayload) => {
    const userId = `user_${Date.now()}`;

    await saveUserProfile({ userId, name: data.name, email: data.email });

    // Map ServiceId strings → TMDb provider IDs for storage
    const platforms = data.services.map((serviceId) => {
      const providerId = serviceIdToProviderId(serviceId as ServiceId);
      const provider = UK_PROVIDERS_ARRAY.find((p) => p.id === providerId);
      return { id: providerId, name: provider?.name || serviceId, selected: true };
    });

    // Map genre display names → TMDb genre IDs
    const homeGenres = data.genres
      .map((name) => GENRE_NAME_TO_ID[name])
      .filter((id): id is number => id !== undefined);

    await saveUserPreferences({ region: 'GB', platforms, homeGenres });

    // Save taste profile: quiz results if completed, otherwise seed from genres
    if (data.quizAnswers && data.tasteVector) {
      await saveQuizResults(data.quizAnswers, data.tasteVector).catch(() => {});
    } else {
      await initializeFromGenres(data.genres).catch(() => {});
    }

    setProfile({ userId, name: data.name, email: data.email, createdAt: Date.now() });
    setPreferences({ region: 'GB', platforms, homeGenres });
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

  const updateGenres = useCallback(async (genreNames: string[]) => {
    const homeGenres = genreNames
      .map((name) => GENRE_NAME_TO_ID[name])
      .filter((id): id is number => id !== undefined);
    const updated = { ...(preferences || { region: 'GB', platforms: [] }), homeGenres } as UserPreferences;
    await saveUserPreferences(updated);
    setPreferences(updated);

    // Update taste vector: boost added genres, reduce removed genres
    const profile = await getTasteProfile();
    if (profile) {
      const selectedKeys = new Set(genreNames.map(genreNameToKey));
      const newVector = { ...profile.vector };
      for (const dim of GENRE_DIMENSIONS) {
        if (selectedKeys.has(dim)) {
          // Selected genre: nudge toward 0.5 (preference baseline)
          newVector[dim] = Math.max(newVector[dim], 0.4);
        } else {
          // Unselected: nudge down toward 0.2 (unselected baseline)
          newVector[dim] = Math.min(newVector[dim], 0.3);
        }
      }
      profile.vector = clampVector(newVector);
      profile.lastUpdated = new Date().toISOString();
      await saveTasteProfile(profile);
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
    updateGenres,
    signOut,
    reload: load,
  };
}
