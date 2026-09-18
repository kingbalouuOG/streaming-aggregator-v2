import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

import {
  addSharedItem,
  fetchSharedList,
  nextReaction,
  removeSharedItem,
  setReaction,
  type Reaction,
  type SharedItem,
  type SharedItemInput,
} from '@/lib/household/items';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';
import { HOUSEHOLD_KEY, SHARED_LIST_KEY } from './useHousehold';

// One shared list: its items with reactions (Growth G2, H2). No Realtime in
// v1, so the list refetches whenever its screen regains focus, and every
// write invalidates it. Reactions are optimistic (a tap must feel instant);
// adds and removes wait for the server. Signed out: disabled, no network.

export function sharedListKey(listId: string) {
  return [...SHARED_LIST_KEY, listId] as const;
}

export function useSharedList(listId: string | null | undefined) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const query = useQuery({
    queryKey: sharedListKey(listId ?? ''),
    queryFn: () => fetchSharedList(supabase, listId ?? '', userId),
    enabled: !!userId && !!listId,
    staleTime: 30 * 1000,
  });

  // Refetch on focus, but not on the first focus (the mount already fetched).
  const focused = useRef(false);
  const { refetch } = query;
  const enabled = !!userId && !!listId;
  useFocusEffect(
    useCallback(() => {
      if (focused.current && enabled) void refetch();
      focused.current = true;
    }, [refetch, enabled]),
  );

  return query;
}

export function useSharedListMutations() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const invalidate = useCallback(
    (listId: string) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: sharedListKey(listId) }),
        qc.invalidateQueries({ queryKey: HOUSEHOLD_KEY }),
      ]),
    [qc],
  );

  const add = useMutation({
    mutationFn: (input: Omit<SharedItemInput, 'addedBy'>) => {
      if (!userId) throw new Error('not signed in');
      return addSharedItem(supabase, { ...input, addedBy: userId });
    },
    onSettled: (_d, _e, input) => invalidate(input.watchlistId),
  });

  const remove = useMutation({
    mutationFn: ({ itemId }: { itemId: string; listId: string }) => removeSharedItem(supabase, itemId),
    onSettled: (_d, _e, vars) => invalidate(vars.listId),
  });

  const react = useMutation({
    mutationFn: ({ item, tapped }: { item: SharedItem; tapped: Reaction }) => {
      if (!userId) throw new Error('not signed in');
      return setReaction(supabase, item.id, userId, nextReaction(item.reactions.mine, tapped));
    },
    onMutate: async ({ item, tapped }) => {
      const key = sharedListKey(item.watchlistId);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SharedItem[]>(key);
      const next = nextReaction(item.reactions.mine, tapped);
      qc.setQueryData<SharedItem[]>(key, (old) =>
        (old ?? []).map((i) => {
          if (i.id !== item.id) return i;
          const counts = { ...i.reactions.counts };
          if (i.reactions.mine) counts[i.reactions.mine] -= 1;
          if (next) counts[next] += 1;
          return { ...i, reactions: { counts, mine: next } };
        }),
      );
      return { prev, key };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
    },
    onSettled: (_d, _e, vars) => qc.invalidateQueries({ queryKey: sharedListKey(vars.item.watchlistId) }),
  });

  return { add, remove, react };
}
