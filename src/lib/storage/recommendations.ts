import storage from '../storage';
import { isSupabaseActive, getAuthUserId } from '../storage';
import { supabase } from '../supabase';

const DEBUG = __DEV__;

const STORAGE_KEYS = {
  RECOMMENDATIONS: '@app_recommendations',
};

const RECOMMENDATION_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

interface RecommendationCache {
  recommendations: any[];
  generatedAt: number;
  expiresAt: number;
  basedOn: { genreAffinities: Record<string, number>; likedItemIds: number[] };
  schemaVersion: number;
}

const DEFAULT_RECOMMENDATIONS: RecommendationCache = {
  recommendations: [], generatedAt: 0, expiresAt: 0,
  basedOn: { genreAffinities: {}, likedItemIds: [] }, schemaVersion: 1,
};

export const getCachedRecommendations = async (): Promise<RecommendationCache> => {
  try {
    const data = await storage.getItem(STORAGE_KEYS.RECOMMENDATIONS);
    if (!data) return { ...DEFAULT_RECOMMENDATIONS };
    return JSON.parse(data);
  } catch {
    return { ...DEFAULT_RECOMMENDATIONS };
  }
};

const CURRENT_SCHEMA_VERSION = 2;

export const isRecommendationCacheValid = async (cache?: RecommendationCache | null): Promise<boolean> => {
  try {
    const cached = cache || (await getCachedRecommendations());
    if (!cached?.recommendations?.length) return false;
    if (cached.schemaVersion !== CURRENT_SCHEMA_VERSION) return false;
    return Date.now() < cached.expiresAt;
  } catch {
    return false;
  }
};

export const setCachedRecommendations = async (recommendations: any[], basedOn: any = {}) => {
  const now = Date.now();
  const data: RecommendationCache = {
    recommendations, generatedAt: now, expiresAt: now + RECOMMENDATION_CACHE_TTL,
    basedOn: { genreAffinities: basedOn.genreAffinities || {}, likedItemIds: basedOn.likedItemIds || [] },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
  await storage.setItem(STORAGE_KEYS.RECOMMENDATIONS, JSON.stringify(data));
  if (DEBUG) console.log('[Recommendations] Cached:', recommendations.length, 'items');
};

export const clearRecommendationCache = async () => {
  await storage.removeItem(STORAGE_KEYS.RECOMMENDATIONS);
};

export const invalidateRecommendationCache = async () => {
  try {
    const cached = await getCachedRecommendations();
    if (cached.recommendations.length > 0) {
      cached.expiresAt = 0;
      await storage.setItem(STORAGE_KEYS.RECOMMENDATIONS, JSON.stringify(cached));
    }
  } catch (error) {
    console.error('[Recommendations] Error invalidating cache:', error);
  }
};

// — Dismissed IDs (IN-008) ——————————————————————————————————————————
//
// Reads dismissed titles from user_interactions (event_type = 'not_interested').
// Replaces the v1 localStorage-backed dismissal list so the v1 recommendation
// engine keeps working while v2 is built on top. Signature is preserved:
// returns Promise<Set<string>> with keys in `{media_type}-{content_id}` format.
//
// Cached at module scope for the lifetime of a session; invalidate via
// invalidateDismissedIdsCache() when a new not_interested event is written.
// Fail-safe: on Supabase error, returns an empty Set (degraded, not broken).

let dismissedIdsSessionCache: Set<string> | null = null;

export const getDismissedIds = async (): Promise<Set<string>> => {
  if (dismissedIdsSessionCache) return dismissedIdsSessionCache;

  if (!isSupabaseActive()) {
    dismissedIdsSessionCache = new Set();
    return dismissedIdsSessionCache;
  }

  try {
    const userId = getAuthUserId();
    if (!userId) {
      dismissedIdsSessionCache = new Set();
      return dismissedIdsSessionCache;
    }

    const { data, error } = await supabase
      .from('user_interactions')
      .select('content_id, media_type')
      .eq('user_id', userId)
      .eq('event_type', 'not_interested');

    if (error) {
      console.error('[Recommendations] getDismissedIds query failed:', error.message);
      return new Set();
    }

    dismissedIdsSessionCache = new Set(
      (data ?? [])
        .filter((row) => row.content_id != null && row.media_type != null)
        .map((row) => `${row.media_type}-${row.content_id}`)
    );
    return dismissedIdsSessionCache;
  } catch (err) {
    console.error('[Recommendations] getDismissedIds unexpected error:', err);
    return new Set();
  }
};

export const invalidateDismissedIdsCache = (): void => {
  dismissedIdsSessionCache = null;
};

export { STORAGE_KEYS, RECOMMENDATION_CACHE_TTL };
