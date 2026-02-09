import storage from '../storage';

const DEBUG = __DEV__;

const STORAGE_KEYS = {
  RECOMMENDATIONS: '@app_recommendations',
  DISMISSED: '@app_dismissed_recommendations',
};

const RECOMMENDATION_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const DISMISSED_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

interface RecommendationCache {
  recommendations: any[];
  generatedAt: number;
  expiresAt: number;
  basedOn: { genreAffinities: Record<string, number>; likedItemIds: number[] };
  schemaVersion: number;
}

interface DismissedData {
  items: Array<{ id: number; type: string; dismissedAt: number }>;
  schemaVersion: number;
}

const DEFAULT_RECOMMENDATIONS: RecommendationCache = {
  recommendations: [], generatedAt: 0, expiresAt: 0,
  basedOn: { genreAffinities: {}, likedItemIds: [] }, schemaVersion: 1,
};

const DEFAULT_DISMISSED: DismissedData = { items: [], schemaVersion: 1 };

export const getCachedRecommendations = async (): Promise<RecommendationCache> => {
  try {
    const data = await storage.getItem(STORAGE_KEYS.RECOMMENDATIONS);
    if (!data) return { ...DEFAULT_RECOMMENDATIONS };
    return JSON.parse(data);
  } catch {
    return { ...DEFAULT_RECOMMENDATIONS };
  }
};

export const isRecommendationCacheValid = async (cache?: RecommendationCache | null): Promise<boolean> => {
  try {
    const cached = cache || (await getCachedRecommendations());
    if (!cached?.recommendations?.length) return false;
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
    schemaVersion: 1,
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

export const getDismissedRecommendations = async (): Promise<DismissedData> => {
  try {
    const data = await storage.getItem(STORAGE_KEYS.DISMISSED);
    if (!data) return { ...DEFAULT_DISMISSED };
    return JSON.parse(data);
  } catch {
    return { ...DEFAULT_DISMISSED };
  }
};

export const dismissRecommendation = async (id: number, type: string) => {
  const dismissed = await getDismissedRecommendations();
  if (dismissed.items.some((item) => item.id === id && item.type === type)) return;
  dismissed.items.push({ id, type, dismissedAt: Date.now() });
  await storage.setItem(STORAGE_KEYS.DISMISSED, JSON.stringify(dismissed));
};

export const isDismissed = async (id: number, type: string): Promise<boolean> => {
  try {
    const dismissed = await getDismissedRecommendations();
    const now = Date.now();
    return dismissed.items.some((item) => item.id === id && item.type === type && now - item.dismissedAt < DISMISSED_TTL);
  } catch {
    return false;
  }
};

export const cleanExpiredDismissals = async (): Promise<number> => {
  try {
    const dismissed = await getDismissedRecommendations();
    const now = Date.now();
    const initialCount = dismissed.items.length;
    dismissed.items = dismissed.items.filter((item) => now - item.dismissedAt < DISMISSED_TTL);
    const removedCount = initialCount - dismissed.items.length;
    if (removedCount > 0) {
      await storage.setItem(STORAGE_KEYS.DISMISSED, JSON.stringify(dismissed));
    }
    return removedCount;
  } catch {
    return 0;
  }
};

export const getDismissedIds = async (): Promise<Set<string>> => {
  try {
    const dismissed = await getDismissedRecommendations();
    const now = Date.now();
    const valid = dismissed.items.filter((item) => now - item.dismissedAt < DISMISSED_TTL);
    return new Set(valid.map((item) => `${item.type}-${item.id}`));
  } catch {
    return new Set();
  }
};

export { STORAGE_KEYS, RECOMMENDATION_CACHE_TTL, DISMISSED_TTL };
