import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Bookmark } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useWatchlist, watchlistItemToContentItem } from '@/hooks/useWatchlist';
import type { ContentItem } from '@/lib/types/content';

type Tab = 'want_to_watch' | 'watched';

export default function WatchlistScreen() {
  const router = useRouter();
  const { data: items, isLoading } = useWatchlist();
  const [tab, setTab] = useState<Tab>('want_to_watch');

  const visible = useMemo(() => {
    const filtered = (items ?? []).filter((i) => i.status === tab);
    return filtered.map(watchlistItemToContentItem);
  }, [items, tab]);

  const openDetail = (item: ContentItem) =>
    router.push({
      pathname: '/detail/[id]',
      params: { id: item.id, title: item.title, image: item.image },
    });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="px-5 pt-2">
        <Text className="font-display-black text-headline text-foreground">Watchlist</Text>
        {/* Status segment */}
        <View className="mt-4 flex-row gap-2">
          <SegmentButton
            label="Want to watch"
            active={tab === 'want_to_watch'}
            onPress={() => setTab('want_to_watch')}
          />
          <SegmentButton
            label="Watched"
            active={tab === 'watched'}
            onPress={() => setTab('watched')}
          />
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#e85d25" />
        </View>
      ) : visible.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <FlashList
          data={visible}
          numColumns={2}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <GridPoster item={item} onPress={openDetail} />}
          contentContainerStyle={{ padding: 14 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={
        active
          ? 'rounded-pill bg-foreground px-4 py-2'
          : 'rounded-pill border border-border bg-card px-4 py-2 active:bg-secondary'
      }>
      <Text
        className={
          active
            ? 'font-sans-bold text-body text-background'
            : 'font-sans-medium text-body text-muted-foreground'
        }>
        {label}
      </Text>
    </Pressable>
  );
}

function GridPoster({ item, onPress }: { item: ContentItem; onPress: (item: ContentItem) => void }) {
  return (
    <Pressable onPress={() => onPress(item)} className="flex-1 p-1.5 active:opacity-80">
      <View className="overflow-hidden rounded-card bg-card">
        <Image
          source={item.image ? { uri: item.image } : undefined}
          style={{ width: '100%', aspectRatio: 2 / 3 }}
          contentFit="cover"
          transition={200}
          recyclingKey={item.id}
        />
      </View>
      <Text numberOfLines={1} className="mt-2 font-sans-bold text-body text-foreground">
        {item.title}
      </Text>
      <Text numberOfLines={1} className="mt-0.5 font-sans text-meta text-muted-foreground">
        {[item.year, item.type === 'tv' ? 'TV' : 'Film'].filter(Boolean).join(' · ')}
      </Text>
    </Pressable>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <View className="flex-1 items-center justify-center px-10">
      <View className="h-16 w-16 items-center justify-center rounded-2xl bg-card">
        <Bookmark size={28} color="rgba(245,241,232,0.4)" />
      </View>
      <Text className="mt-4 text-center font-display text-section text-foreground">
        {tab === 'want_to_watch' ? 'Nothing saved yet' : 'Nothing watched yet'}
      </Text>
      <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
        {tab === 'want_to_watch'
          ? 'Tap the bookmark on any title to save it here.'
          : 'Mark titles as watched from their detail page.'}
      </Text>
    </View>
  );
}
