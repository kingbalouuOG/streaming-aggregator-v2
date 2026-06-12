import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// NATIVE-1 W4 — the real Home feed. Data flows through the SAME lib
// row-builder as the web Home (fetchPerServiceCharts → Supabase content
// cache → titleAdapter); only the rendering layer is native: expo-image
// posters in horizontal FlashLists, native RefreshControl replacing the
// hand-rolled pull-to-refresh, Reanimated Reveal stagger replacing the
// web's motion variant.
import { ContentRow } from '@/components/ContentRow';
import { HomeHero } from '@/components/HomeHero';
import { Reveal } from '@/components/Reveal';
import { useHomeFeed } from '@/hooks/useHomeFeed';

export default function HomeScreen() {
  const feed = useHomeFeed();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await feed.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [feed]);

  if (feed.isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#e85d25" />
      </SafeAreaView>
    );
  }

  if (feed.isError || !feed.data) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background px-8">
        <Text className="text-center font-display text-section text-foreground">
          Couldn&apos;t load tonight&apos;s shelf
        </Text>
        <Text className="mt-2 text-center text-body text-muted-foreground">
          {feed.error instanceof Error ? feed.error.message : 'Pull down to try again.'}
        </Text>
      </SafeAreaView>
    );
  }

  const { hero, rows } = feed.data;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e85d25" />
        }
        contentContainerClassName="pb-8">
        {hero ? (
          <Reveal index={0}>
            <HomeHero item={hero} />
          </Reveal>
        ) : null}

        {rows.map((row, i) => (
          <Reveal key={row.serviceId} index={i + 1}>
            <ContentRow kicker="Top on" title={row.serviceName} items={row.items} />
          </Reveal>
        ))}

        {rows.length === 0 ? (
          <View className="mt-16 items-center px-8">
            <Text className="text-center text-body text-muted-foreground">
              No rows came back — check EXPO_PUBLIC_SUPABASE_URL/.env wiring.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
