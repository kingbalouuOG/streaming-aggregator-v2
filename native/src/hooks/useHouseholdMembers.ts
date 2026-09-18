import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { householdErrorCode } from '@/lib/household/errors';
import { householdMembersView } from '@/lib/household/rpc';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { HOUSEHOLD_MEMBERS_KEY } from './useHousehold';

// Co-members of one household (household_members_view: usernames only, D7).
// Also the source of "added by {username}" on the shared list. Signed out or
// no household: disabled. not_member is final (removed, or left elsewhere),
// so it is not retried.
export function useHouseholdMembers(householdId: string | null | undefined) {
  const { session } = useAuth();
  const enabled = !!session && !!householdId;
  return useQuery({
    queryKey: [...HOUSEHOLD_MEMBERS_KEY, householdId ?? ''],
    queryFn: () => householdMembersView(supabase, householdId ?? ''),
    enabled,
    staleTime: 60 * 1000,
    retry: (count, error) => householdErrorCode(error) !== 'not_member' && count < 2,
  });
}

/** user id → username for one household; empty until loaded. */
export function useMemberNames(householdId: string | null | undefined): Map<string, string> {
  const { data } = useHouseholdMembers(householdId);
  return useMemo(() => new Map((data ?? []).map((m) => [m.userId, m.username])), [data]);
}
