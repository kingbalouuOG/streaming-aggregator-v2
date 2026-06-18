import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { createMMKV } from 'react-native-mmkv';

// Query-cache persistence to MMKV (NATIVE-POLISH W3). Lets Home/For You
// paint from the last cached payload on cold start instead of a spinner
// — the UX-1 instant-For-You lesson, native edition. A dedicated MMKV
// instance keeps the (large) serialized cache out of the session store.

const cache = createMMKV({ id: 'videx-query-cache' });

export const queryPersister = createSyncStoragePersister({
  storage: {
    getItem: (key) => cache.getString(key) ?? null,
    setItem: (key, value) => cache.set(key, value),
    removeItem: (key) => cache.remove(key),
  },
  throttleTime: 1000,
});

/** Bump when the cache shape changes incompatibly (discards old cache).
 *  v2: Track-2 Home/For You payloads gained fields (popular, upcoming, the
 *  richer For You composition) — old persisted payloads lack them.
 *  v3: FB2 build — new query families (semantic flag/search, item-services,
 *  filter discover); start everyone clean on the feature-heavy build. */
export const QUERY_CACHE_BUSTER = 'v3';

/** Wipe the persisted cache — called on sign-out so a different user on
 *  the same device never sees the previous user's cached feeds. */
export function clearQueryCache(): void {
  try {
    cache.clearAll();
  } catch {
    // non-fatal
  }
}
