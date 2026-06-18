import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContentRow } from '@/components/ContentRow';
import { ForYouSkeleton } from '@/components/ForYouSkeleton';
import { MagazineHero } from '@/components/MagazineHero';
import { MoodRooms } from '@/components/MoodRooms';
import { Reveal } from '@/components/Reveal';
import { SectionHead } from '@/components/SectionHead';
import { TasteFingerprint } from '@/components/TasteFingerprint';
import { WatchlistListRow } from '@/components/WatchlistListRow';
import { WideCard } from '@/components/WideCard';
import { useForYou } from '@/hooks/useForYou';
import { DEFAULT_SLIDERS } from '@/lib/taste-v2/types';
import type { ContentItem } from '@/lib/types/content';
import { useAuth } from '@/providers/auth';

// For You — editorial composition (web ForYouPage), rendered entirely from
// the videx-api Worker payload (useForYou → WorkerRenderPayload):
// greeting → top pick → taste fingerprint → in-your-mood → continue
// exploring → because-you-watched → from-your-watchlist → outside-your-usual.
// Mood rooms (anchorRooms) render between the fingerprint and the rows.

function greetingLabel(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Late night';
}

export default function ForYouScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { data, isLoading, refetch } = useForYou();
  const [refreshing, setRefreshing] = useState(false);

  const name =
    ((session?.user?.user_metadata?.username as string | undefined) ?? '') ||
    session?.user?.email?.split('@')[0] ||
    'you';

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
    return <ForYouSkeleton />;
  }

  if (!data) {
    return <NotReady onRetry={onRefresh} />;
  }

  // Defensive defaults — a fresh Worker payload carries all of these; guard
  // against a partial shape so a missing field can't crash a section.
  const {
    recommendedForYou = [],
    sliders = DEFAULT_SLIDERS,
    anchorRooms = [],
    hiddenGems = [],
    becauseYouWatched = [],
    fromYourWatchlist = [],
    outsideYourUsual = [],
  } = data;
  const recommended = [...recommendedForYou];
  const hero = recommended.shift() ?? null;
  let idx = 0;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e85d25" />
        }
        contentContainerClassName="pb-10">
        {/* Greeting */}
        <SafeAreaView edges={['top']}>
          <View className="px-5 pb-1 pt-2">
            <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">
              For {name} · {greetingLabel()}
            </Text>
            <Text className="mt-1 font-display text-headline text-foreground">Edited for you.</Text>
          </View>
        </SafeAreaView>

        {hero ? (
          <Reveal index={idx++}>
            <MagazineHero
              item={hero}
              kicker="Tonight's pick"
              standfirst={hero.overview}
              onSelect={openDetail}
              onMoreInfo={openDetail}
            />
          </Reveal>
        ) : null}

        <Reveal index={idx++}>
          <TasteFingerprint sliders={sliders} />
        </Reveal>

        {recommended.length > 0 ? (
          <Reveal index={idx++}>
            <ContentRow
              kicker="In your mood"
              title="Picked for you tonight."
              items={recommended}
              onItemPress={openDetail}
              surface="for_you"
            />
          </Reveal>
        ) : null}

        {hiddenGems.length > 0 ? (
          <Reveal index={idx++}>
            <ContentRow
              kicker="Keep going"
              title="Continue exploring."
              items={hiddenGems}
              onItemPress={openDetail}
              surface="for_you"
            />
          </Reveal>
        ) : null}

        {anchorRooms.length > 0 ? (
          <Reveal index={idx++}>
            <MoodRooms rooms={anchorRooms} onItemPress={openDetail} />
          </Reveal>
        ) : null}

        {becauseYouWatched.map((row) => (
          <Reveal key={row.anchor.id} index={idx++}>
            <ContentRow
              kicker={`Because you watched ${row.anchor.title}`}
              title="More like this."
              items={row.items}
              onItemPress={openDetail}
              surface="for_you"
            />
          </Reveal>
        ))}

        {fromYourWatchlist.length > 0 ? (
          <Reveal index={idx++}>
            <View>
              <View className="mt-7 px-5">
                <SectionHead kicker="Your shelf" title="From your watchlist." />
              </View>
              {fromYourWatchlist.slice(0, 8).map((item) => (
                <WatchlistListRow key={item.id} item={item} onPress={openDetail} />
              ))}
            </View>
          </Reveal>
        ) : null}

        {outsideYourUsual.length > 0 ? (
          <Reveal index={idx++}>
            <View className="mt-7">
              <View className="px-5">
                <SectionHead kicker="Outside your usual" title="A little further afield." />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, gap: 12 }}>
                {outsideYourUsual.map((item) => (
                  <WideCard key={item.id} item={item} onPress={openDetail} />
                ))}
              </ScrollView>
            </View>
          </Reveal>
        ) : null}
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
        Once your taste profile is set up, personalised picks land here.
      </Text>
      <Pressable onPress={onRetry} className="mt-5 rounded-card bg-primary px-5 py-3 active:opacity-90">
        <Text className="font-sans-bold text-body text-white">Try again</Text>
      </Pressable>
    </SafeAreaView>
  );
}
