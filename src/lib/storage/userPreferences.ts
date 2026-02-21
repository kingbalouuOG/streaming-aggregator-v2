import storage, { isSupabaseActive } from '../storage';
import { clearTasteProfile } from './tasteProfile';
import * as supa from '../supabaseStorage';

const DEBUG = __DEV__;

const STORAGE_KEYS = {
  USER_PROFILE: '@user_profile',
  USER_PREFERENCES: '@user_preferences',
  THEME_PREFERENCE: '@app_theme_preference',
  AUTH_USER_ID: '@auth_user_id',
};

export interface UserProfile {
  userId: string;
  name: string;
  email: string;
  createdAt: number;
}

export interface UserPreferences {
  region: string;
  platforms: Array<{ id: number; name: string; selected?: boolean }>;
  homeGenres?: number[];
  selectedClusters?: string[];
}

export const saveUserProfile = async (profile: Partial<UserProfile> & { userId: string; name: string; email: string }) => {
  if (isSupabaseActive()) {
    try {
      await supa.supaSaveUserProfile(profile);
      if (DEBUG) console.log('[Storage] User profile saved to Supabase:', profile.userId);
      return;
    } catch (error) {
      console.error('[Storage] Supabase saveUserProfile failed, falling back:', error);
    }
  }
  const profileData = { ...profile, createdAt: profile.createdAt || Date.now() };
  await storage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profileData));
  if (DEBUG) console.log('[Storage] User profile saved:', profileData.userId);
};

export const getUserProfile = async (): Promise<UserProfile | null> => {
  if (isSupabaseActive()) {
    try {
      return await supa.supaGetUserProfile();
    } catch (error) {
      console.error('[Storage] Supabase getUserProfile failed, falling back:', error);
    }
  }
  try {
    const profile = await storage.getItem(STORAGE_KEYS.USER_PROFILE);
    if (!profile) return null;
    return JSON.parse(profile);
  } catch (error) {
    console.error('[Storage] Error getting user profile:', error);
    return null;
  }
};

export const saveUserPreferences = async (preferences: UserPreferences) => {
  if (isSupabaseActive()) {
    try {
      await supa.supaSaveUserPreferences(preferences);
      if (DEBUG) console.log('[Storage] User preferences saved to Supabase:', preferences.region, `${preferences.platforms.length} platforms`);
      return;
    } catch (error) {
      console.error('[Storage] Supabase saveUserPreferences failed, falling back:', error);
    }
  }
  await storage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(preferences));
  if (DEBUG) console.log('[Storage] User preferences saved:', preferences.region, `${preferences.platforms.length} platforms`);
};

export const getUserPreferences = async (): Promise<UserPreferences | null> => {
  if (isSupabaseActive()) {
    try {
      return await supa.supaGetUserPreferences();
    } catch (error) {
      console.error('[Storage] Supabase getUserPreferences failed, falling back:', error);
    }
  }
  try {
    const preferences = await storage.getItem(STORAGE_KEYS.USER_PREFERENCES);
    if (!preferences) return null;
    return JSON.parse(preferences);
  } catch (error) {
    console.error('[Storage] Error getting user preferences:', error);
    return null;
  }
};

export const getSelectedPlatforms = async (): Promise<number[]> => {
  if (isSupabaseActive()) {
    try {
      return await supa.supaGetSelectedPlatforms();
    } catch (error) {
      console.error('[Storage] Supabase getSelectedPlatforms failed, falling back:', error);
    }
  }
  try {
    const preferences = await getUserPreferences();
    if (!preferences?.platforms) return [];
    return preferences.platforms.filter((p) => p.selected !== false).map((p) => p.id);
  } catch (error) {
    console.error('[Storage] Error getting selected platforms:', error);
    return [];
  }
};

export const DEFAULT_HOME_GENRES = [28, 35, 18, 53, 878, 27, 10749, 80];

export const getHomeGenres = async (): Promise<number[]> => {
  if (isSupabaseActive()) {
    try {
      return await supa.supaGetHomeGenres();
    } catch (error) {
      console.error('[Storage] Supabase getHomeGenres failed, falling back:', error);
    }
  }
  try {
    const preferences = await getUserPreferences();
    if (!preferences?.homeGenres?.length) return DEFAULT_HOME_GENRES;
    return preferences.homeGenres;
  } catch {
    return DEFAULT_HOME_GENRES;
  }
};

export const setHomeGenres = async (genreIds: number[]) => {
  if (isSupabaseActive()) {
    try {
      await supa.supaSetHomeGenres(genreIds);
      return;
    } catch (error) {
      console.error('[Storage] Supabase setHomeGenres failed, falling back:', error);
    }
  }
  const preferences = await getUserPreferences();
  await saveUserPreferences({ ...preferences!, homeGenres: genreIds });
};

export const hasCompletedOnboarding = async (): Promise<boolean> => {
  if (isSupabaseActive()) {
    try {
      return await supa.supaHasCompletedOnboarding();
    } catch (error) {
      console.error('[Storage] Supabase hasCompletedOnboarding failed, falling back:', error);
    }
  }
  try {
    const profile = await getUserProfile();
    const preferences = await getUserPreferences();
    const hasProfile = !!(profile?.userId && profile?.name && profile?.email);
    const hasPreferences = !!(preferences?.region && Array.isArray(preferences?.platforms));
    const hasPlatforms = (preferences?.platforms?.length ?? 0) > 0;
    return hasProfile && hasPreferences && hasPlatforms;
  } catch {
    return false;
  }
};

export const clearAllData = async () => {
  await storage.multiRemove([STORAGE_KEYS.USER_PROFILE, STORAGE_KEYS.USER_PREFERENCES, STORAGE_KEYS.AUTH_USER_ID]);
  await clearTasteProfile();
  if (DEBUG) console.log('[Storage] All user data cleared');
};

export const getStoredAuthUserId = async (): Promise<string | null> => {
  return storage.getItem(STORAGE_KEYS.AUTH_USER_ID);
};

export const setStoredAuthUserId = async (userId: string): Promise<void> => {
  await storage.setItem(STORAGE_KEYS.AUTH_USER_ID, userId);
};

export { STORAGE_KEYS };
