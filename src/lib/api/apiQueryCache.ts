/**
 * API cache shim over the TanStack QueryClient (PLAT-1, plan §1 commit 7).
 *
 * Replaces src/lib/api/cache.ts. The four API clients all used the same
 * get-or-fetch-then-set pattern against a bespoke localStorage TTL store;
 * this module keeps their EXACT call shape (getCachedData / setCachedData
 * / key creators) but backs it with the QueryClient cache instead:
 *
 * - Entries live under ['tmdb'|'omdb'|'sa', 'raw', <legacy key>], which
 *   puts them inside the persistence filter (localStorage via the
 *   queryClient persister) and under the per-namespace gcTime defaults.
 * - TTL-on-read preserved (the old contract): an entry older than its
 *   namespace TTL reads as a miss. TTL values identical to the retired
 *   CACHE_TTL table.
 * - Failures were never cached before and still aren't (only successful
 *   fetches call setCachedData — unchanged in the clients).
 *
 * The quota-recovery / maintenance machinery (clearExpired,
 * maintainCache, oldest-percentage eviction) is gone: the persister's
 * maxAge + Query's gc own lifecycle now. A one-time sweep below removes
 * the orphaned legacy tmdb_/omdb_/sa_ localStorage entries so they don't
 * squat on quota under the new persister.
 */

import md5 from 'crypto-js/md5';
import { queryClient } from '../queryClient';

export const CACHE_PREFIXES = {
  TMDB: 'tmdb_',
  OMDB: 'omdb_',
  SA: 'sa_',
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const CACHE_TTL = {
  TMDB: DAY,
  OMDB: 7 * DAY,
  SA: DAY,
};

type Namespace = 'tmdb' | 'omdb' | 'sa';

function namespaceFor(key: string): Namespace {
  if (key.startsWith(CACHE_PREFIXES.OMDB)) return 'omdb';
  if (key.startsWith(CACHE_PREFIXES.SA)) return 'sa';
  return 'tmdb';
}

function ttlFor(ns: Namespace): number {
  if (ns === 'omdb') return CACHE_TTL.OMDB;
  if (ns === 'sa') return CACHE_TTL.SA;
  return CACHE_TTL.TMDB;
}

const hashParams = (params: Record<string, unknown>): string => {
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc: Record<string, unknown>, key) => {
      acc[key] = params[key];
      return acc;
    }, {});
  return md5(JSON.stringify(sortedParams)).toString();
};

/** Same async signature as the old cache.ts — callers are unchanged. */
export const getCachedData = async (key: string, ttl: number | null = null): Promise<unknown | null> => {
  const ns = namespaceFor(key);
  const state = queryClient.getQueryState([ns, 'raw', key]);
  if (!state || state.data === undefined) return null;
  const effectiveTTL = ttl ?? ttlFor(ns);
  if (Date.now() - state.dataUpdatedAt >= effectiveTTL) return null;
  return state.data;
};

export const setCachedData = async (key: string, data: unknown): Promise<void> => {
  queryClient.setQueryData([namespaceFor(key), 'raw', key], data);
};

export const createTMDbCacheKey = (endpoint: string, params: Record<string, unknown> = {}): string => {
  return `${CACHE_PREFIXES.TMDB}${endpoint}_${hashParams(params)}`;
};

export const createOMDbCacheKey = (imdbId: string): string => {
  return `${CACHE_PREFIXES.OMDB}${imdbId}`;
};

// ── One-time legacy sweep ───────────────────────────────────────────
// The old store wrote raw tmdb_/omdb_/sa_ keys into localStorage; nothing
// reads them any more. Sweep once per device so they don't squat on the
// quota the query persister now uses. (Same prefix set the main.tsx v1
// purge used — these are the v2-era entries written since.)
const SWEEP_FLAG = '@videx_api_cache_migrated';
try {
  if (typeof localStorage !== 'undefined' && localStorage.getItem(SWEEP_FLAG) !== '1') {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k !== null &&
        (k.startsWith(CACHE_PREFIXES.TMDB) || k.startsWith(CACHE_PREFIXES.OMDB) || k.startsWith(CACHE_PREFIXES.SA))
      ) {
        doomed.push(k);
      }
    }
    for (const k of doomed) localStorage.removeItem(k);
    localStorage.setItem(SWEEP_FLAG, '1');
  }
} catch {
  // localStorage unavailable — nothing to sweep.
}
