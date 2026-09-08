import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrowseChips } from '@/components/BrowseChips';
import { ContentRow } from '@/components/ContentRow';
import { ForYouSkeleton } from '@/components/ForYouSkeleton';
import { MagazineHero } from '@/components/MagazineHero';
import { MoodRooms } from '@/components/MoodRooms';
import { HiddenRailsNote, QuickFilterEmptyState } from '@/components/QuickFilterNotices';
import { Reveal } from '@/components/Reveal';
import { SectionHead } from '@/components/SectionHead';
import { TasteFingerprint } from '@/components/TasteFingerprint';
import { WatchlistListRow } from '@/components/WatchlistListRow';
import { WideCard } from '@/components/WideCard';
import { useForYou } from '@/hooks/useForYou';
import { useQuickFilterLog } from '@/hooks/useQuickFilterLog';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import { recordImpression } from '@/lib/instrumentation/impressionBatcher';
import { DEFAULT_SLIDERS } from '@/lib/taste-v2/types';
import type { ContentItem } from '@/lib/types/content';
import { useAuth } from '@/providers/auth';
import {
  applyQuickFilter,
  categoryToContentType,
  isThinRail,
  useQuickFilter,
  visibleCategories,
  type QuickFilterCategory,
} from '@/state/quickFilter';

// For You — editorial composition (web ForYouPage), rendered entirely from
// the videx-api Worker payload (useForYou → WorkerRenderPayload):
// greeting → top pick → taste fingerprint → in-your-mood → continue
// exploring → because-you-watched → from-your-watchlist → outside-your-usual.
// Mood rooms (anchorRooms) render between the fingerprint and the rows.
//
// Quick filters (recommendation 2026-09-08-002 §1.4) filter the RENDERED
// rows client-side. Deliberately not a Worker parameter: the KV key is
// `user:taste_updated_at:sliders:services`, and adding four chip states
// would multiply entries four-fold AND force B2's pre-warm cron to write
// four per user — or the chip would guarantee a cold render, which is the
// one thing it exists to avoid. Nor does it backfill from `payload.pool`:
// that pool is the RAW retrieval, before the fatigue penalty and the avoid
// set have run, so drawing from it would resurrect fatigued and parked
// titles inside the filter. The filtered view instead draws on a LONGER
// rendered row (36 items, see foryouRender.ts) that has already been
// scored, fatigue-adjusted, MMR'd and rotated.

/**
 * Unfiltered row lengths — exactly what these rows showed before the longer
 * server render, so an unfiltered For You is unchanged (the extra items are
 * a reserve for the filtered view, not a longer page).
 */
const RECOMMENDED_UNFILTERED = 20;
const HIDDEN_GEMS_UNFILTERED = 15;

/** Cap on a filtered row, drawn from the full 36. */
const FILTERED_ROW_MAX = 20;

function greetingLabel(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Late night';
}

/** Trim a long server row to what the surface shows, filtered or not. */
function sliceRow(
  items: ContentItem[],
  category: QuickFilterCategory,
  unfilteredLength: number,
): ContentItem[] {
  if (category === 'All') return items.slice(0, unfilteredLength);
  return applyQuickFilter(items, category).slice(0, FILTERED_ROW_MAX);
}

export default function ForYouScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { data, isLoading, isError, isBootstrapping, refetch } = useForYou();
  const [refreshing, setRefreshing] = useState(false);
  const { category, nonce, setCategory } = useQuickFilter('forYou');

  const sliders = data?.sliders ?? DEFAULT_SLIDERS;
  const anchorRooms = data?.anchorRooms;

  // Depends on `data` itself, not on destructured fields: every
  // `data?.x ?? []` is a fresh array literal, so hoisting the defaults out
  // of here would rebuild the whole derivation on every render.
  //
  // It also has to run BEFORE the loading/error early returns below — hooks
  // cannot sit behind a branch — hence the defensive reads. A fresh Worker
  // payload carries every field; the guards are for a partial shape.
  const view = useMemo(() => {
    const filtered = category !== 'All';

    const recommendedForYou = data?.recommendedForYou ?? [];
    const hiddenGems = data?.hiddenGems ?? [];
    const becauseYouWatched = data?.becauseYouWatched ?? [];
    const fromYourWatchlist = data?.fromYourWatchlist ?? [];
    const outsideYourUsual = data?.outsideYourUsual ?? [];
    const paidTitles = data?.paidTitles ?? [];
    const rooms = data?.anchorRooms ?? [];

    const recommended = sliceRow(recommendedForYou, category, RECOMMENDED_UNFILTERED);
    const gems = sliceRow(hiddenGems, category, HIDDEN_GEMS_UNFILTERED);
    const paid = applyQuickFilter(paidTitles, category);
    const watchlist = applyQuickFilter(fromYourWatchlist, category);
    const outside = applyQuickFilter(outsideYourUsual, category);
    const because = becauseYouWatched
      .map((row) => ({ ...row, items: applyQuickFilter(row.items, category) }))
      .filter((row) => !isThinRail(row.items));

    // The hero is recommended[0], so filtering the row re-picks it for free.
    const rest = [...recommended];
    const hero = rest.shift() ?? null;

    // Mood rooms are navigation cards into UNFILTERED collections — four
    // thumbnails over a `titleCount` for the whole room. There is no honest
    // way to show one under a filter: trimming the thumbnails leaves the
    // count lying about what is behind the card, and leaving them alone puts
    // TV on a page that says Movies. So the section hides while a chip is
    // active, and says so in the note.
    const roomsVisible = !filtered && rooms.length > 0;

    const rails: { name: string; items: ContentItem[]; hadEnough: boolean }[] = [
      { name: 'In your mood', items: rest, hadEnough: !isThinRail(recommendedForYou) },
      { name: 'Continue exploring', items: gems, hadEnough: !isThinRail(hiddenGems) },
      { name: 'New releases', items: paid, hadEnough: !isThinRail(paidTitles) },
      { name: 'From your watchlist', items: watchlist, hadEnough: !isThinRail(fromYourWatchlist) },
      { name: 'Outside your usual', items: outside, hadEnough: !isThinRail(outsideYourUsual) },
    ];

    const visible = new Set(rails.filter((r) => !isThinRail(r.items)).map((r) => r.name));
    const hiddenNames = [
      ...rails.filter((r) => !visible.has(r.name) && r.hadEnough).map((r) => r.name),
      ...(filtered && rooms.length > 0 ? ['Mood rooms'] : []),
      ...becauseYouWatched
        .filter((row) => !because.some((b) => b.anchor.id === row.anchor.id))
        .filter((row) => !isThinRail(row.items))
        .map((row) => `Because you watched ${row.anchor.title}`),
    ];

    const shown = rails.filter((r) => visible.has(r.name));
    const railsVisible = shown.length + because.length + (roomsVisible ? 1 : 0);
    const itemsVisible =
      shown.reduce((n, r) => n + r.items.length, 0) +
      because.reduce((n, r) => n + r.items.length, 0) +
      (hero ? 1 : 0);

    // Chip visibility across everything the payload holds (§1.5). A user
    // whose taste vector never surfaces documentaries gets no Documentaries
    // chip here — while still seeing one on New, where the free rails and
    // the docs backfill exist.
    const allItems = [
      ...recommendedForYou,
      ...hiddenGems,
      ...paidTitles,
      ...fromYourWatchlist,
      ...outsideYourUsual,
      ...becauseYouWatched.flatMap((row) => row.items),
    ];

    return {
      hero,
      recommended: rest,
      gems,
      paid,
      watchlist,
      outside,
      because,
      roomsVisible,
      visible,
      hiddenNames,
      railsVisible,
      itemsVisible,
      chips: visibleCategories(allItems),
    };
  }, [category, data]);

  const isEmpty = category !== 'All' && view.railsVisible === 0 && !view.hero;

  useQuickFilterLog(nonce, {
    surface: 'forYou',
    category,
    railsVisible: view.railsVisible,
    itemsVisible: view.itemsVisible,
  });

  const impressionMetadata = useMemo(
    () => (category === 'All' ? undefined : { filter: category }),
    [category],
  );

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
  // It reads the FILTERED hero, so what is logged is what is on screen.
  const heroId = view.hero?.id ?? null;
  useEffect(() => {
    if (!heroId) return;
    const { tmdbId } = parseContentItemId(heroId);
    recordImpression({
      contentId: tmdbId,
      sourceSurface: 'for_you',
      position: 0,
      metadata: { role: 'hero', ...(impressionMetadata ?? {}) },
    });
  }, [heroId, impressionMetadata]);

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

  const browseAll = useCallback(() => {
    router.push({
      pathname: '/browse',
      params: { contentType: categoryToContentType(category) },
    });
  }, [router, category]);

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

  const { hero } = view;
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

        <Reveal index={idx++}>
          <BrowseChips active={category} visible={view.chips} onSelect={setCategory} />
        </Reveal>

        {isEmpty ? <QuickFilterEmptyState category={category} onBrowse={browseAll} /> : null}

        {view.visible.has('In your mood') ? (
          <Reveal index={idx++}>
            <ContentRow
              kicker="In your mood"
              title="Picked for you tonight."
              items={view.recommended}
              onItemPress={openDetail}
              surface="for_you"
              impressionMetadata={impressionMetadata}
            />
          </Reveal>
        ) : null}

        {view.visible.has('Continue exploring') ? (
          <Reveal index={idx++}>
            <ContentRow
              kicker="Keep going"
              title="Continue exploring."
              items={view.gems}
              onItemPress={openDetail}
              surface="for_you"
              impressionMetadata={impressionMetadata}
            />
          </Reveal>
        ) : null}

        {view.visible.has('New releases') ? (
          <Reveal index={idx++}>
            <ContentRow
              kicker="New releases"
              title="New to rent or buy."
              items={view.paid}
              onItemPress={openDetail}
              surface="for_you"
              impressionMetadata={impressionMetadata}
            />
          </Reveal>
        ) : null}

        {view.roomsVisible ? (
          <Reveal index={idx++}>
            <MoodRooms rooms={anchorRooms ?? []} onItemPress={openDetail} />
          </Reveal>
        ) : null}

        {view.because.map((row) => (
          <Reveal key={row.anchor.id} index={idx++}>
            <ContentRow
              kicker={`Because you watched ${row.anchor.title}`}
              title="More like this."
              items={row.items}
              onItemPress={openDetail}
              surface="for_you"
              impressionMetadata={impressionMetadata}
            />
          </Reveal>
        ))}

        {view.visible.has('From your watchlist') ? (
          <Reveal index={idx++}>
            <View>
              <View className="mt-7 px-5">
                <SectionHead kicker="Your shelf" title="From your watchlist." />
              </View>
              {view.watchlist.slice(0, 8).map((item) => (
                <WatchlistListRow key={item.id} item={item} onPress={openDetail} />
              ))}
            </View>
          </Reveal>
        ) : null}

        {view.visible.has('Outside your usual') ? (
          <Reveal index={idx++}>
            <View className="mt-7">
              <View className="px-5">
                <SectionHead kicker="Outside your usual" title="A little further afield." />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, gap: 12 }}>
                {view.outside.map((item) => (
                  <WideCard key={item.id} item={item} onPress={openDetail} />
                ))}
              </ScrollView>
            </View>
          </Reveal>
        ) : null}

        <HiddenRailsNote names={view.hiddenNames} category={category} />
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
