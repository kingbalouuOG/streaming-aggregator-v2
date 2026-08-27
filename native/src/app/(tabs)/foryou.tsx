import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
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
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import { recordImpression } from '@/lib/instrumentation/impressionBatcher';
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
  const { data, isLoading, isError, isBootstrapping, refetch } = useForYou();
  const [refreshing, setRefreshing] = useState(false);

  // The hero renders as MagazineHero, not PosterCard — and PosterCard is the
  // ONLY caller of recordImpression. So until this existed the most prominent
  // card on the page logged nothing at all, with two consequences:
  //
  //   1. C1 fatigue is computed entirely from card_impressions, so the hero
  //      accrued zero views and was structurally immune to the mechanism
  //      built to stop repetition. Everything below it demoted; the hero
  //      could not. That is why one title held the slot for months.
  //   2. The novelty eval reads the same table, so its numbers silently
  //      excluded the one card the user actually looks at.
  //
  // `role: 'hero'` separates these from the row impression at position 0 and
  // starts giving card_impressions the row identity it has always lacked.
  //
  // Placed ABOVE the loading/error early returns below: hooks must run on
  // every render, so it reads defensively from a possibly-undefined payload
  // rather than from the destructured `hero`.
  const heroId = data?.recommendedForYou?.[0]?.id ?? null;
  useEffect(() => {
    if (!heroId) return;
    const { tmdbId } = parseContentItemId(heroId);
    recordImpression({
      contentId: tmdbId,
      sourceSurface: 'for_you',
      position: 0,
      metadata: { role: 'hero' },
    });
  }, [heroId]);

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

  // B6: order matters. While the MMKV cache is restoring (or services
  // have not resolved) the query is paused — not loading, not errored,
  // just empty — so without this branch the `!data` case below rendered
  // the failure state for a frame on every cold start.
  if (isBootstrapping && !data) {
    return <ForYouSkeleton />;
  }

  if (isLoading) {
    return <ForYouSkeleton />;
  }

  if (!data) {
    // Distinct states now that Worker failures THROW (PR #75): a query
    // error is a connection problem, not a young taste profile — saying
    // "warming up" for a network failure sends users waiting on the
    // wrong thing.
    return <NotReady onRetry={onRefresh} failed={isError} />;
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
    paidTitles = [],
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

        {paidTitles.length > 0 ? (
          <Reveal index={idx++}>
            <ContentRow
              kicker="New releases"
              title="New to rent or buy."
              items={paidTitles}
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

function NotReady({ onRetry, failed = false }: { onRetry: () => void; failed?: boolean }) {
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-background px-10">
      <View className="h-16 w-16 items-center justify-center rounded-2xl bg-card">
        <Sparkles size={28} color="rgba(245,241,232,0.4)" />
      </View>
      <Text className="mt-4 text-center font-display text-section text-foreground">
        {failed ? "Couldn't load your feed" : 'Your For You feed is warming up'}
      </Text>
      <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
        {failed
          ? 'Check your connection and try again.'
          : 'Once your taste profile is set up, personalised picks land here.'}
      </Text>
      <Pressable onPress={onRetry} className="mt-5 rounded-card bg-primary px-5 py-3 active:opacity-90">
        <Text className="font-sans-bold text-body text-white">Try again</Text>
      </Pressable>
    </SafeAreaView>
  );
}
