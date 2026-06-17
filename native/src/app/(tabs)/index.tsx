import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// NATIVE-2 W3 — Home composition parity with the web app:
// MagazineHero (Today's Pick) → editor's note → browse chips →
// per-service rows. Data and copy flow through the same shared lib
// modules as the web Home.
import {
  EDITOR_NOTE_CACHE_TTL_MS,
  FALLBACK_NOTE,
  fetchEditorNote,
} from '@/lib/api/editorNote';
import { BrowseChips } from '@/components/BrowseChips';
import { CalendarStrip } from '@/components/CalendarStrip';
import { ContentRow } from '@/components/ContentRow';
import { EditorialSpotlight } from '@/components/EditorialSpotlight';
import { EditorNoteCard } from '@/components/EditorNoteCard';
import { FreeTonight } from '@/components/FreeTonight';
import { MagazineHero } from '@/components/MagazineHero';
import { Reveal } from '@/components/Reveal';
import { TrendingRibbon } from '@/components/TrendingRibbon';
import { useHomeFeed } from '@/hooks/useHomeFeed';
import type { ContentItem } from '@/lib/types/content';

export default function HomeScreen() {
  const router = useRouter();
  const feed = useHomeFeed();
  const [refreshing, setRefreshing] = useState(false);

  const editorNote = useQuery({
    queryKey: ['native', 'home', 'editorNote'],
    queryFn: fetchEditorNote,
    staleTime: EDITOR_NOTE_CACHE_TTL_MS,
  });
  const note = editorNote.data ?? FALLBACK_NOTE;

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
        <Text className="text-center font-standfirst text-section text-foreground">
          Couldn&apos;t load tonight&apos;s shelf
        </Text>
        <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
          {feed.error instanceof Error ? feed.error.message : 'Pull down to try again.'}
        </Text>
      </SafeAreaView>
    );
  }

  const { hero, rows, recentlyAdded, spotlights, popular = [], upcoming = [] } = feed.data;
  // Editorial spotlight: a popular title with a backdrop, distinct from the
  // hero and (where possible) the trending top-5.
  const spotlightPick =
    popular.slice(5).find((p) => (p.backdrop || p.image) && p.id !== hero?.id) ??
    popular.find((p) => (p.backdrop || p.image) && p.id !== hero?.id) ??
    null;
  // Reveal index counter so cascade stays ordered across variable rows.
  let revealIdx = 2;

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
              standfirst={hero.overview}
              onSelect={openDetail}
              onMoreInfo={openDetail}
            />
          </Reveal>
        ) : null}

        <Reveal index={1}>
          <EditorNoteCard note={note} />
        </Reveal>

        <Reveal index={2}>
          <BrowseChips onSelect={() => router.push('/browse')} />
        </Reveal>

        {recentlyAdded.length > 0 ? (
          <Reveal index={(revealIdx += 1)}>
            <ContentRow
              kicker="Just in"
              title="Recently added."
              items={recentlyAdded}
              onItemPress={openDetail}
              surface="home"
            />
          </Reveal>
        ) : null}

        {popular.length > 0 ? (
          <Reveal index={(revealIdx += 1)}>
            <FreeTonight items={popular} onItemPress={openDetail} />
          </Reveal>
        ) : null}

        {popular.length > 0 ? (
          <Reveal index={(revealIdx += 1)}>
            <TrendingRibbon items={popular} onItemPress={openDetail} />
          </Reveal>
        ) : null}

        {spotlightPick ? (
          <Reveal index={(revealIdx += 1)}>
            <EditorialSpotlight item={spotlightPick} onPress={openDetail} />
          </Reveal>
        ) : null}

        {rows.map((row) => (
          <Reveal key={row.serviceId} index={(revealIdx += 1)}>
            <ContentRow
              kicker="Top on"
              title={row.serviceName}
              items={row.items}
              onItemPress={openDetail}
              surface="home"
            />
          </Reveal>
        ))}

        {upcoming.length > 0 ? (
          <Reveal index={(revealIdx += 1)}>
            <CalendarStrip items={upcoming} onItemPress={openDetail} />
          </Reveal>
        ) : null}

        {spotlights.map((sp) => (
          <Reveal key={sp.clusterName} index={(revealIdx += 1)}>
            <ContentRow
              kicker="Spotlight"
              title={`${sp.clusterName}.`}
              items={sp.items}
              onItemPress={openDetail}
              surface="home"
            />
          </Reveal>
        ))}

        {rows.length === 0 ? (
          <View className="mt-16 items-center px-8">
            <Text className="text-center font-sans text-body text-muted-foreground">
              No rows came back — check EXPO_PUBLIC_SUPABASE_URL/.env wiring.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
