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

/**
 * Per-tier service split for a title. `free` aggregates TMDb's
 * `flatrate`, `free`, and `ads` arrays — all no-marginal-cost tiers.
 * `rent` and `buy` are the two paid tiers.
 *
 * Used by useSearch to decide whether a title is on a user service in
 * a no-cost tier (state 1) versus paid-only (state 1.5). The union of
 * all three is what `getCachedServices` returns for backward compat.
 */
export interface ServiceProviders {
  free: ServiceId[];
  rent: ServiceId[];
  buy: ServiceId[];
}

interface CacheEntry {
  providers: ServiceProviders;
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────
// Cache Configuration
// ─────────────────────────────────────────────────────────────

const CACHE_TTL = 1000 * 60 * 30; // 30 minutes
const MAX_CACHE_SIZE = 500;
const CACHE_VERSION = 7; // v7 cache shape: per-tier ServiceProviders (was flat ServiceId[])

// In-memory cache
const serviceCache = new Map<string, CacheEntry>();

// Pending requests to prevent duplicate API calls
const pendingRequests = new Map<string, Promise<ServiceProviders>>();

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
 * Get the full per-tier service split for a content item with
 * caching. Use this when you need to distinguish "title is free on
 * Prime for me" from "title is rent-only on Prime for me" — the
 * union you get from `getCachedServices` can't make that call.
 */
export const getServiceProviders = async (
  itemId: string,
  mediaType: string,
): Promise<ServiceProviders> => {
  const cacheKey = getCacheKey(itemId, mediaType);

  // Check cache first
  const cached = serviceCache.get(cacheKey);
  if (cached && isEntryValid(cached)) {
    return cached.providers;
  }

  // Check if request is already pending (prevent duplicate API calls)
  const pending = pendingRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  // Create new request
  const requestPromise = fetchProvidersFromAPI(itemId, mediaType);
  pendingRequests.set(cacheKey, requestPromise);

  try {
    const providers = await requestPromise;

    serviceCache.set(cacheKey, {
      providers,
      timestamp: Date.now(),
    });

    cleanupCache();

    return providers;
  } finally {
    pendingRequests.delete(cacheKey);
  }
};

/**
 * Backward-compatible flat union accessor. Returns every service the
 * title is available on across all tiers. Use this for renderers
 * that just want "which services have this title" (ContentCard's
 * lazy-load fallback, ServiceStack badges, etc).
 */
export const getCachedServices = async (
  itemId: string,
  mediaType: string,
  maxServices: number = 10,
): Promise<ServiceId[]> => {
  const providers = await getServiceProviders(itemId, mediaType);
  const seen = new Set<ServiceId>();
  const out: ServiceId[] = [];
  for (const s of [...providers.free, ...providers.rent, ...providers.buy]) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out.slice(0, maxServices);
};

/**
 * Fetch + structure services from TMDb watch/providers API.
 * Flatrate, free, and ads are folded into `free` (all no-marginal-
 * cost tiers). Rent and buy stay separate.
 */
const fetchProvidersFromAPI = async (
  itemId: string,
  mediaType: string,
): Promise<ServiceProviders> => {
  const empty: ServiceProviders = { free: [], rent: [], buy: [] };
  try {
    const response = await getContentWatchProviders(Number(itemId), mediaType, 'GB');
    if (!response.success || !response.data) return empty;

    const collect = (raw: any[] | undefined): ServiceId[] => {
      if (!raw) return [];
      const seen = new Set<ServiceId>();
      const out: ServiceId[] = [];
      for (const p of raw) {
        const id = providerIdToServiceId(p.provider_id);
        if (id !== null && VALID_SERVICES.has(id) && !seen.has(id)) {
          seen.add(id);
          out.push(id);
        }
      }
      return out;
    };

    return {
      free: collect([
        ...(response.data.flatrate || []),
        ...(response.data.free || []),
        ...(response.data.ads || []),
      ]),
      rent: collect(response.data.rent),
      buy: collect(response.data.buy),
    };
  } catch (err) {
    console.error('[ServiceCache] getServiceProviders failed:', err);
    return empty;
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
