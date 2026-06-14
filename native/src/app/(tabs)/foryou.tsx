import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContentRow } from '@/components/ContentRow';
import { MagazineHero } from '@/components/MagazineHero';
import { Reveal } from '@/components/Reveal';
import { useForYou } from '@/hooks/useForYou';
import type { ContentItem } from '@/lib/types/content';

// NATIVE-2 W5c — For You. Leads with a MagazineHero of the top pick,
// then the simple ContentItem[] rows from the Worker payload. The
// anchor-room / because-you-watched / person rows are deferred (richer
// card types); v1 ships the four flat rows.

export default function ForYouScreen() {
  const router = useRouter();
  const { data, isLoading, refetch } = useForYou();
  const [refreshing, setRefreshing] = useState(false);

  const openDetail = useCallback(
    (item: ContentItem) =>
      router.push({
        pathname: '/detail/[id]',
        params: { id: item.id, title: item.title, image: item.image },
      }),
    [router],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#e85d25" />
      </View>
    );
  }

  if (!data) {
    return <NotReady onRetry={onRefresh} />;
  }

  // Lead with the top recommended pick; the rest stays in the row.
  const recommended = [...data.recommendedForYou];
  const hero = recommended.shift() ?? null;

  const rows: { key: string; title: string; items: ContentItem[] }[] = [
    { key: 'recommended', title: 'Recommended for you', items: recommended },
    { key: 'hidden', title: 'Hidden gems', items: data.hiddenGems },
    { key: 'outside', title: 'Outside your usual', items: data.outsideYourUsual },
    { key: 'watchlist', title: 'From your watchlist', items: data.fromYourWatchlist },
  ].filter((r) => r.items.length > 0);

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e85d25" />
        }
        contentContainerClassName="pb-8">
        {hero ? (
          <Reveal index={0}>
            <MagazineHero
              item={hero}
              kicker="FOR YOU"
              standfirst={hero.overview}
              onSelect={openDetail}
              onMoreInfo={openDetail}
            />
          </Reveal>
        ) : null}

        {rows.map((row, i) => (
          <Reveal key={row.key} index={i + 1}>
            <ContentRow title={row.title} items={row.items} onItemPress={openDetail} surface="for_you" />
          </Reveal>
        ))}
      </ScrollView>
    </View>
  );
}

function NotReady({ onRetry }: { onRetry: () => void }) {
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-background px-10">
      <View className="h-16 w-16 items-center justify-center rounded-2xl bg-card">
        <Sparkles size={28} color="rgba(245,241,232,0.4)" />
      </View>
      <Text className="mt-4 text-center font-display text-section text-foreground">
        Your For You feed is warming up
      </Text>
      <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
        Once your taste profile is set up, personalised picks land here. Onboarding arrives in a
        later build.
      </Text>
      <Pressable
        onPress={onRetry}
        className="mt-5 rounded-card bg-primary px-5 py-3 active:opacity-90">
        <Text className="font-sans-bold text-body text-white">Try again</Text>
      </Pressable>
    </SafeAreaView>
  );
}
