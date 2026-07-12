import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { supabase } from '@/lib/supabase';

// Whether the signed-in user has finished onboarding (NATIVE-3 W1).
// Drives the (tabs) route guard. Keyed on userId so a sign-in/out
// re-evaluates.
//
// Pre-launch review 2026-07-12, two traps fixed here:
//  - The shared hasCompletedOnboarding() swallows backend failures into
//    a local-storage fallback that reads `false` on native — so being
//    OFFLINE looked identical to "never onboarded" and the guard dumped
//    real users back into onboarding (redoing it overwrites their taste
//    profile). The queryFn now asks profiles directly and THROWS on
//    failure; the guard shows a retry state on error instead.
//  - staleTime Infinity meant a persisted `false` (e.g. signed in on
//    this device, onboarded on another) was trusted forever.
//    refetchOnMount 'always' revalidates: a cached `true` still passes
//    the guard instantly (background refetch), a cached `false` holds
//    the guard's spinner while the server is consulted.
const KEY = (userId: string | undefined) => ['native', 'onboardingStatus', userId ?? 'anon'];

export function useOnboardingStatus(userId: string | undefined) {
  return useQuery({
    queryKey: KEY(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      return !!data?.onboarding_completed;
    },
    enabled: !!userId,
    staleTime: Infinity,
    refetchOnMount: 'always',
  });
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
