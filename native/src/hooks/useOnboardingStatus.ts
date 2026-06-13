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
