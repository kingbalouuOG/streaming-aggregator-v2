import { useRouter } from 'expo-router';
import { Check, Plus, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { useHousehold } from '@/hooks/useHousehold';
import { useSharedList, useSharedListMutations } from '@/hooks/useHouseholdList';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import { householdErrorCode, householdErrorCopy } from '@/lib/household/errors';
import type { Household } from '@/lib/household/households';
import { tmdbPathFromImageUrl } from '@/lib/household/items';
import type { ContentItem } from '@/lib/types/content';

// "Add to {household}" on the detail page (Growth G2, H2), under the personal
// Watchlist buttons. One household: a single button. Several: "Add to a
// shared list" opens a small picker, one row per household. A title already
// on a list shows as on it; tapping then opens that list. Rendered only for
// someone in at least one household (so never signed out); `guard` is the
// same initialising / signed-out check the personal add uses.

export function AddToHousehold({ item, guard }: { item: ContentItem; guard: () => boolean }) {
  const { data: households } = useHousehold();
  const [open, setOpen] = useState(false);
  const withList = (households ?? []).filter((h) => h.watchlistId);

  if (withList.length === 0) return null;
  if (withList.length === 1) {
    return (
      <View className="mt-2.5">
        <HouseholdAddButton item={item} household={withList[0]} guard={guard} label={withList[0].name} />
      </View>
    );
  }

  return (
    <View className="mt-2.5 gap-2">
      <Pressable
        onPress={() => {
          if (!guard()) return;
          setOpen((v) => !v);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center justify-center gap-2 rounded-card border border-border bg-card py-3 active:bg-secondary">
        <Users size={16} color="#f5f1e8" />
        <Text className="font-sans-medium text-body text-foreground">Add to a shared list</Text>
      </Pressable>
      {open
        ? withList.map((h) => <HouseholdAddButton key={h.id} item={item} household={h} guard={guard} label={h.name} />)
        : null}
    </View>
  );
}

function HouseholdAddButton({
  item,
  household,
  guard,
  label,
}: {
  item: ContentItem;
  household: Household;
  guard: () => boolean;
  label: string;
}) {
  const router = useRouter();
  const listId = household.watchlistId ?? '';
  const { data } = useSharedList(listId);
  const { add } = useSharedListMutations();
  const { tmdbId, mediaType } = parseContentItemId(item.id);
  const onList = (data ?? []).some((i) => i.tmdbId === tmdbId && i.mediaType === mediaType);

  const onPress = () => {
    if (!guard()) return;
    if (onList) {
      router.push({ pathname: '/list/[id]', params: { id: listId } });
      return;
    }
    add.mutate(
      {
        watchlistId: listId,
        tmdbId,
        mediaType,
        title: item.title,
        posterPath: tmdbPathFromImageUrl(item.image),
      },
      { onError: (e) => Alert.alert("Couldn't add it", householdErrorCopy(householdErrorCode(e))) },
    );
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={add.isPending}
      accessibilityRole="button"
      style={{ opacity: add.isPending ? 0.6 : 1 }}
      className={
        onList
          ? 'flex-row items-center justify-center gap-2 rounded-card border border-primary-edge bg-primary-soft py-3 active:opacity-80'
          : 'flex-row items-center justify-center gap-2 rounded-card border border-border bg-card py-3 active:bg-secondary'
      }>
      {onList ? <Check size={16} color="#e85d25" /> : <Plus size={16} color="#f5f1e8" />}
      <Text
        numberOfLines={1}
        className={onList ? 'font-sans-bold text-body text-primary' : 'font-sans-medium text-body text-foreground'}>
        {onList ? `On ${label}` : `Add to ${label}`}
      </Text>
    </Pressable>
  );
}
