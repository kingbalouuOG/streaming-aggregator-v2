import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { hasCompletedOnboarding } from '@/lib/storage/userPreferences';

// Whether the signed-in user has finished onboarding (NATIVE-3 W1).
// Drives the (tabs) route guard. Keyed on userId so a sign-in/out
// re-evaluates; `hasCompletedOnboarding` reads from Supabase when the
// session is active (storage auth-state routing). Invalidated by
// useCompleteOnboarding when Step 5 finishes.
const KEY = (userId: string | undefined) => ['native', 'onboardingStatus', userId ?? 'anon'];

export function useOnboardingStatus(userId: string | undefined) {
  return useQuery({
    queryKey: KEY(userId),
    queryFn: hasCompletedOnboarding,
    enabled: !!userId,
    staleTime: Infinity,
  });
}

export function useInvalidateOnboardingStatus() {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ queryKey: ['native', 'onboardingStatus'] }),
    [qc],
  );
}

/** Write completion straight into the cache. Invalidation alone LOSES THE
 *  RACE at the end of onboarding: the guard remounts with the cached (and
 *  disk-persisted) `false` and redirects back to /onboarding before the
 *  refetch resolves — found in the 2026-07-11 v2.1.2 device test. The
 *  server write has already been awaited by the time this is called, so
 *  the cache write is truth, not optimism. */
export function useMarkOnboardingComplete() {
  const qc = useQueryClient();
  return useCallback(
    (userId: string) => qc.setQueryData(KEY(userId), true),
    [qc],
  );
}
