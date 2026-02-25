/**
 * Service Cache Utility
 *
 * Caches streaming service providers for content items.
 * Ported from V1 — reduces API calls with in-memory cache (30min TTL)
 * backed by localStorage cache (24h TTL via getContentWatchProviders).
 */

import { getContentWatchProviders } from '@/lib/api/tmdb';
import { providerIdToServiceId } from '@/lib/adapters/platformAdapter';
import type { ServiceId } from '@/components/platformLogos';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface CacheEntry {
  services: ServiceId[];
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────
// Cache Configuration
// ─────────────────────────────────────────────────────────────

const CACHE_TTL = 1000 * 60 * 30; // 30 minutes
const MAX_CACHE_SIZE = 500;
const CACHE_VERSION = 4; // Bump when provider data format changes

// In-memory cache
const serviceCache = new Map<string, CacheEntry>();

// Pending requests to prevent duplicate API calls
const pendingRequests = new Map<string, Promise<ServiceId[]>>();

// Invalidate stale in-memory cache from pre-fix code (survives HMR)
const SC_VERSION_KEY = '__sc_version';
if ((globalThis as any)[SC_VERSION_KEY] !== CACHE_VERSION) {
  serviceCache.clear();
  pendingRequests.clear();
  (globalThis as any)[SC_VERSION_KEY] = CACHE_VERSION;
}

// Valid service types for UK market
const VALID_SERVICES = new Set<ServiceId>([
  'netflix', 'prime', 'disney', 'apple', 'now',
  'skygo', 'paramount', 'bbc', 'itvx', 'channel4',
]);

// ─────────────────────────────────────────────────────────────
// Cache Functions
// ─────────────────────────────────────────────────────────────

const getCacheKey = (itemId: string, mediaType: string): string => {
  return `${mediaType}-${itemId}`;
};

const isEntryValid = (entry: CacheEntry): boolean => {
  return Date.now() - entry.timestamp < CACHE_TTL;
};

const cleanupCache = (): void => {
  if (serviceCache.size <= MAX_CACHE_SIZE) return;
  const entriesToRemove = Math.floor(serviceCache.size * 0.2);
  const keys = Array.from(serviceCache.keys()).slice(0, entriesToRemove);
  keys.forEach((key) => serviceCache.delete(key));
};

/**
 * Get services for a content item with caching.
 * @param itemId - Numeric TMDb ID as string (e.g., "12345")
 * @param mediaType - "movie" or "tv"
 * @param maxServices - Max number of services to return
 */
export const getCachedServices = async (
  itemId: string,
  mediaType: string,
  maxServices: number = 10,
): Promise<ServiceId[]> => {
  const cacheKey = getCacheKey(itemId, mediaType);

  // Check cache first
  const cached = serviceCache.get(cacheKey);
  if (cached && isEntryValid(cached)) {
    return cached.services.slice(0, maxServices);
  }

  // Check if request is already pending (prevent duplicate API calls)
  const pending = pendingRequests.get(cacheKey);
  if (pending) {
    const services = await pending;
    return services.slice(0, maxServices);
  }

  // Create new request
  const requestPromise = fetchServicesFromAPI(itemId, mediaType);
  pendingRequests.set(cacheKey, requestPromise);

  try {
    const services = await requestPromise;

    serviceCache.set(cacheKey, {
      services,
      timestamp: Date.now(),
    });

    cleanupCache();

    return services.slice(0, maxServices);
  } finally {
    pendingRequests.delete(cacheKey);
  }
};

/**
 * Fetch services from TMDb watch/providers API.
 */
const fetchServicesFromAPI = async (
  itemId: string,
  mediaType: string,
): Promise<ServiceId[]> => {
  try {
    const response = await getContentWatchProviders(Number(itemId), mediaType, 'GB');

    if (response.success && response.data) {
      const allProviders: any[] = [
        ...(response.data.flatrate || []),
        ...(response.data.free || []),
        ...(response.data.ads || []),
        ...(response.data.rent || []),
        ...(response.data.buy || []),
      ];
      const seen = new Set<ServiceId>();
      const services: ServiceId[] = [];
      for (const p of allProviders) {
        const id = providerIdToServiceId(p.provider_id);
        if (id !== null && VALID_SERVICES.has(id) && !seen.has(id)) {
          seen.add(id);
          services.push(id);
        }
      }
      return services;
    }

    return [];
  } catch (err) {
    console.error('[ServiceCache] getCachedServices failed:', err);
    return [];
  }
};

/**
 * Prefetch services for multiple items at once.
 */
export const prefetchServices = async (
  items: Array<{ id: string; type?: string }>,
): Promise<void> => {
  const promises = items.map((item) =>
    getCachedServices(item.id, item.type || 'movie').catch((err) => {
      console.error('[ServiceCache] prefetch failed for', item.id, err);
      return [];
    }),
  );
  await Promise.allSettled(promises);
};

/**
 * Clear the service cache.
 */
export const clearServiceCache = (): void => {
  serviceCache.clear();
  pendingRequests.clear();
};
