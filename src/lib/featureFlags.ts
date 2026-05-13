// Feature flags — per-user, backed by the `user_feature_flags` table
// (migration 041). Phase Search V2 Cluster B uses this to gate
// semantic search behind `search_semantic`. The pattern is generic so
// any future per-user gated feature reuses the same accessor without
// schema work.
//
// Reading semantics: one round-trip per (userId, flagName) pair, then
// memoised in module-scope for the lifetime of the page. The caller
// pattern is "read once on mount" — flags don't change mid-session,
// and a stale value across a sign-out / sign-in is handled by
// resetFlagCache() in clearAllData.

import { supabase } from './supabase';

const KNOWN_FLAGS = ['search_semantic'] as const;
export type FlagName = (typeof KNOWN_FLAGS)[number];

// Module-scope cache. Key = `${userId}:${flagName}`. Promise valued so
// concurrent callers during the initial fetch share the round-trip
// instead of racing it.
const cache = new Map<string, Promise<boolean>>();

/**
 * Look up a feature flag for the current user. Falls back to
 * `fallback` when the user is logged out, when the flag isn't set
 * for the user, or when the query fails. Errors are silent — flags
 * are non-load-bearing; a missed read should never break the host
 * feature, just leave it in its default state.
 */
export async function getFlag(
  flagName: FlagName,
  fallback: boolean = false,
): Promise<boolean> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData?.user?.id;
  if (!userId) return fallback;

  const key = `${userId}:${flagName}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    try {
      // Cast through `any` — database.types.ts hasn't been
      // regenerated since migration 041 landed. Drop the cast on the
      // next types refresh.
      const { data, error } = await (supabase as any)
        .from('user_feature_flags')
        .select('enabled')
        .eq('user_id', userId)
        .eq('flag_name', flagName)
        .maybeSingle();
      if (error || !data) return fallback;
      return (data as { enabled: boolean }).enabled === true;
    } catch {
      return fallback;
    }
  })();

  cache.set(key, promise);
  return promise;
}

/**
 * Drop the in-process cache. Called from clearAllData on sign-out
 * so the next user doesn't see the previous user's flag values
 * cached for them.
 */
export function resetFlagCache(): void {
  cache.clear();
}
