import storage from '../storage';
import { clearTasteProfile } from './tasteProfile';

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
  const profileData = { ...profile, createdAt: profile.createdAt || Date.now() };
  await storage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profileData));
  if (DEBUG) console.log('[Storage] User profile saved:', profileData.userId);
};

export const getUserProfile = async (): Promise<UserProfile | null> => {
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
  await storage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(preferences));
  if (DEBUG) console.log('[Storage] User preferences saved:', preferences.region, `${preferences.platforms.length} platforms`);
};

export const getUserPreferences = async (): Promise<UserPreferences | null> => {
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
  try {
    const preferences = await getUserPreferences();
    if (!preferences?.homeGenres?.length) return DEFAULT_HOME_GENRES;
    return preferences.homeGenres;
  } catch {
    return DEFAULT_HOME_GENRES;
  }
};

export const setHomeGenres = async (genreIds: number[]) => {
  const preferences = await getUserPreferences();
  await saveUserPreferences({ ...preferences!, homeGenres: genreIds });
};

export const hasCompletedOnboarding = async (): Promise<boolean> => {
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
