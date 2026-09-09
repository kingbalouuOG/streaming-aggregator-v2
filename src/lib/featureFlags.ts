// Feature flags — per-user, backed by the `user_feature_flags` table
// (migration 041). Phase Search V2 Cluster B uses this to gate
// semantic search behind `search_semantic`. The pattern is generic so
// any future per-user gated feature reuses the same accessor without
// schema work.
//
// Reading semantics: one round-trip per (userId, flagName) pair, then
// memoised in module-scope for FLAG_TTL_MS. The caller pattern is "read
// once on mount", and a stale value across a sign-out / sign-in is
// handled by resetFlagCache() in clearAllData.
//
// The identity read is `getSession()`, deliberately. It reads the session
// already in storage; `getUser()`, which this used until 2026-09-09, calls
// /auth/v1/user over the network EVERY time and did so before the memo was
// consulted — so `search_logging`, whose whole promise is that a user with
// the flag off costs nothing, made one auth request per settled query. A
// stale local session cannot cause a wrong answer here: the row is fetched
// under RLS, so a session the server would reject returns nothing and the
// caller gets the fallback.

import { supabase } from './supabase';

// Allow-list of known flag names. Extend the union when adding a new
// per-user gated feature; the database column is `flag_name TEXT` and
// accepts anything, but routing through this type keeps callers honest.
export type FlagName =
  | 'search_semantic'
  // Search-term logging on native (2026-09-08). Ships DARK: the privacy
  // policy text describing search capture is live from the same build,
  // but no row is written until this flag is turned on for a user, which
  // Joe does per tester after telling them. Default false everywhere.
  // See IN-SL-003 — §10's in-app change notice does not exist yet, so
  // per-user consent is the interim mechanism.
  | 'search_logging';

/**
 * How long a flag value is trusted before it is read again.
 *
 * The memo had no expiry, which is fine for a flag that only gates a
 * feature's shape and wrong for one that gates data capture: turning
 * `search_logging` off for a user who has withdrawn consent did nothing
 * until they restarted the app, and on a phone that can be days. Ten
 * minutes bounds that without putting a read back on the hot path — the
 * same staleness the native `useSemanticFlag` query already accepts.
 */
export const FLAG_TTL_MS = 10 * 60 * 1000;

// Module-scope cache. Key = `${userId}:${flagName}`. Promise valued so
// concurrent callers during the initial fetch share the round-trip
// instead of racing it; `at` is when the entry was created, not when it
// resolved, so a slow read cannot extend its own lifetime.
const cache = new Map<string, { at: number; value: Promise<boolean> }>();

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
  const { data: authData } = await supabase.auth.getSession();
  const userId = authData?.session?.user?.id;
  if (!userId) return fallback;

  const key = `${userId}:${flagName}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < FLAG_TTL_MS) return cached.value;

  const promise = (async () => {
    try {
      const { data, error } = await supabase
        .from('user_feature_flags')
        .select('enabled')
        .eq('user_id', userId)
        .eq('flag_name', flagName)
        .maybeSingle();
      if (error || !data) return fallback;
      return data.enabled === true;
    } catch {
      return fallback;
    }
  })();

  cache.set(key, { at: Date.now(), value: promise });
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
