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
import { ContentRow } from '@/components/ContentRow';
import { EditorNoteCard } from '@/components/EditorNoteCard';
import { MagazineHero } from '@/components/MagazineHero';
import { Reveal } from '@/components/Reveal';
import { useHomeFeed } from '@/hooks/useHomeFeed';

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
        <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
          {feed.error instanceof Error ? feed.error.message : 'Pull down to try again.'}
        </Text>
      </SafeAreaView>
    );
  }

  const { hero, rows } = feed.data;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e85d25" />
        }
        contentContainerClassName="pb-8">
        {hero ? (
          <Reveal index={0}>
            <MagazineHero item={hero} standfirst={hero.overview} />
          </Reveal>
        ) : null}

        <Reveal index={1}>
          <EditorNoteCard note={note} />
        </Reveal>

        <Reveal index={2}>
          <BrowseChips onSelect={() => router.push('/browse')} />
        </Reveal>

        {rows.map((row, i) => (
          <Reveal key={row.serviceId} index={i + 3}>
            <ContentRow kicker="Top on" title={row.serviceName} items={row.items} />
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
