import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { supabase } from '@/lib/supabase';

// Whether the signed-in user has picked a username (Growth S3, migration
// 089). A provider sign-up starts with a `user_…` placeholder and
// username_chosen = false; the (tabs) guard and the end of onboarding send
// that user to /choose-username.
//
// Fails OPEN, unlike useOnboardingStatus: the prompt is cosmetic (the app
// displays user_metadata.username, never profiles.username, so the
// placeholder is not shown either way), and a failed read must not lock
// anyone out of the tabs — including every user in the window before 089
// is applied, when the column does not exist yet.
const KEY = (userId: string | undefined) => ['native', 'usernameChosen', userId ?? 'anon'];

export async function fetchUsernameChosen(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('username_chosen')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('[UsernameChosen] read failed (treating as chosen):', error.message);
    return true;
  }
  return data?.username_chosen !== false;
}

export function useUsernameChosen(userId: string | undefined) {
  return useQuery({
    queryKey: KEY(userId),
    queryFn: () => fetchUsernameChosen(userId!),
    enabled: !!userId,
    staleTime: Infinity,
    refetchOnMount: 'always',
  });
}

/** Write "chosen" into the cache after the prompt saves, so the guard does
 *  not bounce back to the prompt on a stale `false` (same race as
 *  useMarkOnboardingComplete). */
export function useMarkUsernameChosen() {
  const qc = useQueryClient();
  return useCallback(
    (userId: string) => qc.setQueryData(KEY(userId), true),
    [qc],
  );
}
