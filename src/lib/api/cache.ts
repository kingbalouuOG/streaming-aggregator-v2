import storage from '../storage';
import md5 from 'crypto-js/md5';
import { handleCacheError, logError } from '../utils/errorHandler';

const DEBUG = __DEV__;

const CACHE_PREFIXES = {
  TMDB: 'tmdb_',
  OMDB: 'omdb_',
  WATCHMODE: 'watchmode_',
};

const CACHE_TTL = {
  TMDB: 24 * 60 * 60 * 1000,       // 24 hours
  OMDB: 7 * 24 * 60 * 60 * 1000,   // 7 days
  WATCHMODE: 24 * 60 * 60 * 1000,  // 24 hours
};

const inferTTLFromKey = (key: string): number => {
  if (key.startsWith(CACHE_PREFIXES.OMDB)) return CACHE_TTL.OMDB;
  if (key.startsWith(CACHE_PREFIXES.WATCHMODE)) return CACHE_TTL.WATCHMODE;
  return CACHE_TTL.TMDB;
};

const hashParams = (params: Record<string, unknown>): string => {
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc: Record<string, unknown>, key) => {
      acc[key] = params[key];
      return acc;
    }, {});
  return md5(JSON.stringify(sortedParams)).toString();
};

const isStorageFullError = (error: Error): boolean => {
  const message = error.message?.toLowerCase() || '';
  return message.includes('quota') || message.includes('quota_exceeded');
};

export const getCachedData = async (key: string, ttl: number | null = null) => {
  try {
    const cached = await storage.getItem(key);
    if (!cached) {
      if (DEBUG) console.log('[Cache] Miss:', key);
      return null;
    }

    const { data, timestamp } = JSON.parse(cached);
    const effectiveTTL = ttl || inferTTLFromKey(key);
    const age = Date.now() - timestamp;

    if (age < effectiveTTL) {
      if (DEBUG) console.log('[Cache] Hit:', key, `(age: ${Math.round(age / 1000 / 60)}min)`);
      return data;
    }

    if (DEBUG) console.log('[Cache] Expired:', key);
    await storage.removeItem(key);
    return null;
  } catch (error) {
    return handleCacheError(error as Error, null);
  }
};

export const setCachedData = async (key: string, data: unknown) => {
  const cacheData = { data, timestamp: Date.now() };

  try {
    await storage.setItem(key, JSON.stringify(cacheData));
    if (DEBUG) console.log('[Cache] Set:', key);
  } catch (error) {
    if (isStorageFullError(error as Error)) {
      console.warn('[Cache] Storage full - clearing cache aggressively');
      await clearExpired();
      try {
        await storage.setItem(key, JSON.stringify(cacheData));
        return;
      } catch (retryError) {
        if (isStorageFullError(retryError as Error)) {
          await clearCache();
          try {
            await storage.setItem(key, JSON.stringify(cacheData));
            return;
          } catch (finalError) {
            console.error('[Cache] Failed to set even after clearing all cache:', (finalError as Error).message);
          }
        }
      }
    } else {
      handleCacheError(error as Error, null);
    }
  }
};

export const clearCache = async (prefix: string | null = null) => {
  try {
    const keys = await storage.getAllKeys();
    if (prefix) {
      const cacheKeys = keys.filter((key) => key.startsWith(prefix));
      await storage.multiRemove(cacheKeys);
    } else {
      const cacheKeys = keys.filter(
        (key) =>
          key.startsWith(CACHE_PREFIXES.TMDB) ||
          key.startsWith(CACHE_PREFIXES.OMDB) ||
          key.startsWith(CACHE_PREFIXES.WATCHMODE)
      );
      await storage.multiRemove(cacheKeys);
    }
  } catch (error) {
    console.error('[Cache] Clear error:', error);
  }
};

export const clearExpired = async (): Promise<number> => {
  try {
    const keys = await storage.getAllKeys();
    const cacheKeys = keys.filter(
      (key) =>
        key.startsWith(CACHE_PREFIXES.TMDB) ||
        key.startsWith(CACHE_PREFIXES.OMDB) ||
        key.startsWith(CACHE_PREFIXES.WATCHMODE)
    );

    const keysToRemove: string[] = [];
    for (const key of cacheKeys) {
      try {
        const cached = await storage.getItem(key);
        if (!cached) continue;
        const { timestamp } = JSON.parse(cached);
        const ttl = inferTTLFromKey(key);
        if (Date.now() - timestamp >= ttl) keysToRemove.push(key);
      } catch {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) await storage.multiRemove(keysToRemove);
    return keysToRemove.length;
  } catch (error) {
    console.error('[Cache] Clear expired error:', error);
    return 0;
  }
};

export const clearOldestPercentage = async (percentage: number): Promise<number> => {
  try {
    const keys = await storage.getAllKeys();
    const cacheKeys = keys.filter(
      (key) =>
        key.startsWith(CACHE_PREFIXES.TMDB) ||
        key.startsWith(CACHE_PREFIXES.OMDB) ||
        key.startsWith(CACHE_PREFIXES.WATCHMODE)
    );

    const entries: { key: string; timestamp: number }[] = [];
    for (const key of cacheKeys) {
      try {
        const cached = await storage.getItem(key);
        if (cached) {
          const { timestamp } = JSON.parse(cached);
          entries.push({ key, timestamp });
        }
      } catch {
        entries.push({ key, timestamp: 0 });
      }
    }

    entries.sort((a, b) => a.timestamp - b.timestamp);
    const numToRemove = Math.ceil(entries.length * (percentage / 100));
    const keysToRemove = entries.slice(0, numToRemove).map((e) => e.key);

    if (keysToRemove.length > 0) await storage.multiRemove(keysToRemove);
    return keysToRemove.length;
  } catch (error) {
    console.error('[Cache] Clear percentage error:', error);
    return 0;
  }
};

export const maintainCache = async (maxEntries = 1000) => {
  try {
    await clearExpired();
    const keys = await storage.getAllKeys();
    const cacheKeys = keys.filter(
      (key) =>
        key.startsWith(CACHE_PREFIXES.TMDB) ||
        key.startsWith(CACHE_PREFIXES.OMDB) ||
        key.startsWith(CACHE_PREFIXES.WATCHMODE)
    );
    if (cacheKeys.length > maxEntries) {
      await clearOldestPercentage(30);
    }
  } catch (error) {
    console.error('[Cache] Maintenance error:', error);
  }
};

export const createTMDbCacheKey = (endpoint: string, params: Record<string, unknown> = {}): string => {
  const paramsHash = hashParams(params);
  return `${CACHE_PREFIXES.TMDB}${endpoint}_${paramsHash}`;
};

export const createOMDbCacheKey = (imdbId: string): string => {
  return `${CACHE_PREFIXES.OMDB}${imdbId}`;
};

export { CACHE_PREFIXES, CACHE_TTL };
