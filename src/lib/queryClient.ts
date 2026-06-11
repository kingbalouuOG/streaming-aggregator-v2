/**
 * TanStack Query scaffold (PLAT-1, Workstream A)
 *
 * Single server-state layer replacing the bespoke localStorage TTL cache
 * (src/lib/api/cache.ts) and the sessionStorage section caches. Request
 * dedup, stale-while-revalidate, and offline persistence come from the
 * library; this module owns the three decisions that keep semantics
 * identical to the old layer:
 *
 * 1. Query-key namespaces: ['tmdb', …] / ['omdb', …] / ['sa', …] for
 *    third-party content reads. Per-source staleTime mirrors the old
 *    CACHE_TTL table EXACTLY (TMDb 24h, OMDB 7d, SA 24h) — the cache
 *    semantics the app has shipped with since B1.
 *
 * 2. Persistence: localStorage persister (plan Q2), maxAge 24h, and a
 *    dehydrate filter that persists ONLY the three content namespaces.
 *    Pipeline/For You state is never persisted — it has its own
 *    embedding/avoid caches and PLAT-3 moves it server-side.
 *
 * 3. BUSTER replaces the old _wpN / CACHE_VERSION cache-busting gotcha:
 *    bump it when a persisted payload shape changes and every client
 *    drops its hydrated cache on next boot.
 */

import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Bump on persisted-shape changes (the cache.ts _wpN successor). */
export const QUERY_CACHE_BUSTER = 'plat1-v1';

/** Namespaces that persist across sessions (content reads only). */
const PERSISTED_SOURCES = new Set(['tmdb', 'omdb', 'sa']);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Mobile WebView: focus events fire on every app foreground;
      // content TTLs are hours/days, so focus refetching is pure waste.
      refetchOnWindowFocus: false,
    },
  },
});

// Per-source defaults — identical TTL semantics to the retired cache.ts.
// gcTime === staleTime: a stale entry is also an evictable entry; the
// persister's maxAge provides the cross-session ceiling.
queryClient.setQueryDefaults(['tmdb'], { staleTime: DAY, gcTime: DAY });
queryClient.setQueryDefaults(['omdb'], { staleTime: 7 * DAY, gcTime: 7 * DAY });
queryClient.setQueryDefaults(['sa'], { staleTime: DAY, gcTime: DAY });

const persister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'videx_rq_cache',
  // Batch writes — card-grid mounts fire many queries in a burst.
  throttleTime: 2000,
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: DAY,
  buster: QUERY_CACHE_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      query.state.status === 'success' &&
      PERSISTED_SOURCES.has(query.queryKey[0] as string),
  },
};
