import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { fetchHouseholds } from '@/lib/household/households';
import {
  createHousehold,
  createInvite,
  joinHousehold,
  leaveHousehold,
  removeMember,
  revokeInvite,
} from '@/lib/household/rpc';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

// Households the signed-in person belongs to (Growth G2, H2), with each one's
// shared list and member count, read under the membership RLS. Signed out:
// disabled, no network. Every household write invalidates the whole
// ['native','household'] prefix so the Watchlist picker, the detail-page
// "Add to …" and Profile → Household move together. Sign-out clears the
// whole query cache (providers/auth.tsx), so nothing leaks between accounts;
// the user id in the key is belt and braces.

export const HOUSEHOLD_KEY = ['native', 'household'] as const;
export const HOUSEHOLD_MEMBERS_KEY = ['native', 'householdMembers'] as const;
export const SHARED_LIST_KEY = ['native', 'sharedList'] as const;

export function useHousehold() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  return useQuery({
    queryKey: [...HOUSEHOLD_KEY, userId ?? ''],
    queryFn: () => fetchHouseholds(supabase, userId ?? ''),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}

/** Refresh everything household-shaped after a membership change. */
export function useInvalidateHousehold() {
  const qc = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: HOUSEHOLD_KEY }),
      qc.invalidateQueries({ queryKey: HOUSEHOLD_MEMBERS_KEY }),
      qc.invalidateQueries({ queryKey: SHARED_LIST_KEY }),
    ]);
  }, [qc]);
}

export function useHouseholdActions() {
  const invalidate = useInvalidateHousehold();

  const create = useMutation({
    mutationFn: (name: string) => createHousehold(supabase, name),
    onSuccess: invalidate,
  });
  const join = useMutation({
    mutationFn: (token: string) => joinHousehold(supabase, token),
    onSuccess: invalidate,
  });
  const leave = useMutation({
    mutationFn: (householdId: string) => leaveHousehold(supabase, householdId),
    onSuccess: invalidate,
  });
  const invite = useMutation({
    mutationFn: (householdId: string) => createInvite(supabase, householdId),
  });
  const revoke = useMutation({
    mutationFn: (householdId: string) => revokeInvite(supabase, householdId),
  });
  const remove = useMutation({
    mutationFn: ({ householdId, userId }: { householdId: string; userId: string }) =>
      removeMember(supabase, householdId, userId),
    onSuccess: invalidate,
  });

  return { create, join, leave, invite, revoke, remove };
}
