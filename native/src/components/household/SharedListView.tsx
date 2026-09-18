import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Users } from 'lucide-react-native';
import { useMemo, type ReactElement } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { useSharedList, useSharedListMutations } from '@/hooks/useHouseholdList';
import { useMemberNames } from '@/hooks/useHouseholdMembers';
import { buildPosterUrl } from '@/lib/api/imageUrls';
import { householdErrorCode, householdErrorCopy } from '@/lib/household/errors';
import type { Household } from '@/lib/household/households';
import { arrangeSharedList, canRemoveItem, type Reaction, type SharedItem } from '@/lib/household/items';
import { useAuth } from '@/providers/auth';
import { addedByLabel, SharedListItemRow } from './SharedListItemRow';

// A household's shared list (Growth G2, H2): a "Tonight?" strip of anything
// someone has marked for tonight, then every item newest first. Rendered by
// the list screen (with its own header) and inline by the Watchlist tab.

type Row = { kind: 'tonight'; items: SharedItem[] } | { kind: 'label'; text: string } | { kind: 'item'; item: SharedItem };

export function SharedListView({
  household,
  header,
  contentTopPadding = 0,
}: {
  household: Household;
  header?: ReactElement;
  contentTopPadding?: number;
}) {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const listId = household.watchlistId;
  const { data, isLoading, isError, refetch } = useSharedList(listId);
  const names = useMemberNames(household.id);
  const { react, remove } = useSharedListMutations();

  const rows = useMemo<Row[]>(() => {
    const { tonight, rest } = arrangeSharedList(data ?? []);
    const out: Row[] = [];
    if (tonight.length > 0) {
      out.push({ kind: 'tonight', items: tonight });
      out.push({ kind: 'label', text: 'All titles' });
    }
    // Every item, newest first; tonight's are in the strip and here too, so
    // they can still be reacted to.
    const all = [...tonight, ...rest].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    for (const item of all) out.push({ kind: 'item', item });
    return out;
  }, [data]);

  const openDetail = (item: SharedItem) =>
    router.push({
      pathname: '/detail/[id]',
      params: { id: item.contentId, title: item.title, image: buildPosterUrl(item.posterPath) ?? '' },
    });

  const onReact = (item: SharedItem, reaction: Reaction) => {
    react.mutate(
      { item, tapped: reaction },
      { onError: (e) => Alert.alert("Couldn't save that", householdErrorCopy(householdErrorCode(e))) },
    );
  };

  const confirmRemove = (item: SharedItem) => {
    Alert.alert(`Remove ${item.title}?`, `It comes off the list for everyone in ${household.name}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          remove.mutate(
            { itemId: item.id, listId: item.watchlistId },
            { onError: (e) => Alert.alert("Couldn't remove it", householdErrorCopy(householdErrorCode(e))) },
          ),
      },
    ]);
  };

  const body = isLoading ? (
    <View className="items-center py-16">
      <ActivityIndicator color="#e85d25" />
    </View>
  ) : isError ? (
    <View className="items-center px-10 py-16">
      <Text className="text-center font-sans text-body text-muted-foreground">
        Couldn't load this list. Check your connection and try again.
      </Text>
      <Pressable onPress={() => refetch()} className="mt-3">
        <Text className="font-sans-bold text-body text-primary">Try again</Text>
      </Pressable>
    </View>
  ) : rows.length === 0 ? (
    <View className="items-center px-10 py-16">
      <View className="h-16 w-16 items-center justify-center rounded-2xl bg-card">
        <Users size={28} color="rgba(245,241,232,0.4)" />
      </View>
      <Text className="mt-4 text-center font-sans text-body text-muted-foreground">
        Nothing here yet. Add a title from any detail page.
      </Text>
    </View>
  ) : null;

  return (
    <FlashList
      data={body ? [] : rows}
      keyExtractor={(row, index) => (row.kind === 'item' ? row.item.id : `${row.kind}-${index}`)}
      getItemType={(row) => row.kind}
      renderItem={({ item: row }) => {
        if (row.kind === 'tonight') return <TonightStrip items={row.items} onPress={openDetail} />;
        if (row.kind === 'label') {
          return (
            <Text className="px-5 pb-1 pt-4 font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
              {row.text}
            </Text>
          );
        }
        const item = row.item;
        return (
          <SharedListItemRow
            item={item}
            addedBy={addedByLabel(item.addedBy, userId, names)}
            onPress={openDetail}
            onReact={onReact}
            onLongPress={canRemoveItem(item, userId, household.isOwner) ? confirmRemove : undefined}
          />
        );
      }}
      ListHeaderComponent={
        <View style={{ paddingTop: contentTopPadding }}>
          {header}
          {body}
        </View>
      }
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    />
  );
}

function TonightStrip({ items, onPress }: { items: SharedItem[]; onPress: (item: SharedItem) => void }) {
  return (
    <View className="pb-2 pt-3">
      <Text className="px-5 font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">Tonight?</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2.5 px-5 pt-2">
        {items.map((item) => {
          const poster = buildPosterUrl(item.posterPath) ?? '';
          return (
            <Pressable key={item.id} onPress={() => onPress(item)} className="active:opacity-80" style={{ width: 92 }}>
              <View className="overflow-hidden rounded-md bg-card">
                <Image
                  source={poster ? { uri: poster } : undefined}
                  style={{ width: 92, aspectRatio: 2 / 3 }}
                  contentFit="cover"
                  transition={150}
                  recyclingKey={`tonight-${item.id}`}
                />
              </View>
              <Text numberOfLines={1} className="mt-1 font-sans-medium text-meta text-foreground">
                {item.title}
              </Text>
              <Text className="font-sans text-kicker text-muted-foreground">
                {item.reactions.counts.tonight === 1 ? '1 says tonight' : `${item.reactions.counts.tonight} say tonight`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
