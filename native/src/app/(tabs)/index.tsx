import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
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
import { HiddenRailsNote, QuickFilterEmptyState } from '@/components/QuickFilterNotices';
import { Reveal } from '@/components/Reveal';
import { TrendingRibbon } from '@/components/TrendingRibbon';
import { useDocumentariesBackfill } from '@/hooks/useDocumentariesBackfill';
import { useHomeFeed, type HomeFeed } from '@/hooks/useHomeFeed';
import { useQuickFilterLog } from '@/hooks/useQuickFilterLog';
import { useUserServices } from '@/hooks/useUserServices';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import { recordImpression } from '@/lib/instrumentation/impressionBatcher';
import type { ContentItem } from '@/lib/types/content';
import {
  applyQuickFilter,
  categoryToContentType,
  isThinRail,
  matchesCategory,
  useQuickFilter,
  visibleCategories,
  type QuickFilterCategory,
} from '@/state/quickFilter';

// Quick filters (recommendation 2026-09-08-002 §1). The chip strip used to
// be decorative — every pill pushed to /browse. It now filters this page IN
// PLACE: rails apply the predicate, rails that go thin hide, the hero is
// re-picked if it no longer qualifies, and nothing refetches. That last part
// is the point: the page stays a pure view over the already-cached /v1/home
// payload, so a chip tap costs no round trip and the KV key is untouched
// (§0.3). The one exception is the Documentaries backfill, which fires on
// tap only and never on open (§1.3).

/** How the hero kicker names the active filter, per the prototype. */
const HERO_KICKER: Record<Exclude<QuickFilterCategory, 'All'>, string> = {
  Movies: 'Film',
  TV: 'TV',
  Documentaries: 'Documentary',
};

const EMPTY_FEED: HomeFeed = {
  hero: null,
  recentlyAdded: [],
  popular: [],
  freeTonight: [],
  paid: [],
  upcoming: [],
  rows: [],
  spotlights: [],
};

interface FilteredRail {
  name: string;
  items: ContentItem[];
  /** False when too few survivors are left to be worth a row (§1.2). */
  visible: boolean;
  /** True only when the FILTER is what emptied it — see buildRail. */
  hiddenByFilter: boolean;
}

function buildRail(name: string, items: ContentItem[], category: QuickFilterCategory): FilteredRail {
  const filtered = applyQuickFilter(items, category);
  const visible = filtered.length > 0 && !isThinRail(filtered);
  return {
    name,
    items: filtered,
    visible,
    // A rail already too short before filtering is not "hidden" — saying so
    // would blame the filter for a row the payload never had.
    hiddenByFilter: !visible && !isThinRail(items),
  };
}

export default function HomeScreen() {
  const router = useRouter();
  const feed = useHomeFeed();
  const { data: services } = useUserServices();
  const [refreshing, setRefreshing] = useState(false);
  const { category, nonce, setCategory } = useQuickFilter('new');

  // Documentaries is a genre — thin nearly everywhere — so it gets one extra
  // rail, fetched only once the chip is tapped (§1.3).
  const docsBackfill = useDocumentariesBackfill(services ?? [], category === 'Documentaries');

  const data = feed.data ?? EMPTY_FEED;

  // Everything from here to the early returns must run on EVERY render:
  // hooks cannot sit behind the loading/error branches below. So the
  // derivation reads `data`, which is the empty feed until a payload lands,
  // rather than `feed.data`.
  const view = useMemo(() => {
    const rails: FilteredRail[] = [
      buildRail('Just in', data.recentlyAdded, category),
      buildRail('Free tonight', data.freeTonight, category),
      buildRail('Trending', data.popular, category),
      buildRail('New releases', data.paid, category),
      ...data.spotlights.map((sp) => buildRail(sp.clusterName, sp.items, category)),
      ...data.rows.map((row) => buildRail(row.serviceName, row.items, category)),
    ];

    // Upcoming wraps its items, so it filters on the inner ContentItem.
    // Filtered to Documentaries it will usually empty and hide, which §1.2
    // takes as the honest answer rather than leaving one rail unfiltered.
    const upcomingFiltered =
      category === 'All'
        ? data.upcoming
        : data.upcoming.filter((u) => matchesCategory(u.item, category));
    const upcomingVisible = upcomingFiltered.length > 0 && !isThinRail(upcomingFiltered);
    const upcomingHidden = !upcomingVisible && !isThinRail(data.upcoming);

    // Hero re-pick (§1.2): if the day's pick fails the predicate, promote the
    // first passing item from the first per-service row, then fall back to
    // whatever is still on the page. Leaving a documentary in the largest
    // card while the strip says "Movies" would read as a bug.
    const heroPasses = data.hero ? matchesCategory(data.hero, category) : false;
    const hero = heroPasses
      ? data.hero
      : applyQuickFilter(data.rows[0]?.items ?? [], category)[0] ??
        rails.find((r) => r.visible)?.items[0] ??
        null;

    // The editorial spotlight is one card, not a rail — it cannot be thin,
    // it either qualifies or it goes.
    const spotlightPool = applyQuickFilter(data.popular, category);
    const spotlightPick =
      spotlightPool.slice(5).find((p) => (p.backdrop || p.image) && p.id !== hero?.id) ??
      spotlightPool.find((p) => (p.backdrop || p.image) && p.id !== hero?.id) ??
      null;

    const hiddenNames = [
      ...rails.filter((r) => r.hiddenByFilter).map((r) => r.name),
      ...(upcomingHidden ? ['Upcoming'] : []),
    ];

    const visibleRails = rails.filter((r) => r.visible);
    const railsVisible = visibleRails.length + (upcomingVisible ? 1 : 0);
    const itemsVisible =
      visibleRails.reduce((n, r) => n + r.items.length, 0) +
      (upcomingVisible ? upcomingFiltered.length : 0);

    // Chip visibility is judged against the WHOLE payload rather than per
    // rail: the question is "is there enough of this here to be worth
    // filtering to", not "does any single row have enough" (§1.5).
    const allItems = [
      ...data.recentlyAdded,
      ...data.popular,
      ...data.freeTonight,
      ...data.paid,
      ...data.spotlights.flatMap((sp) => sp.items),
      ...data.rows.flatMap((row) => row.items),
      ...data.upcoming.map((u) => u.item),
    ];

    return {
      byName: new Map(rails.map((r) => [r.name, r])),
      upcoming: upcomingFiltered,
      upcomingVisible,
      hero,
      spotlightPick,
      hiddenNames,
      railsVisible,
      itemsVisible,
      chips: visibleCategories(allItems),
    };
  }, [data, category]);

  const backfill = category === 'Documentaries' ? docsBackfill.data ?? [] : [];

  // Empty only if the backfill did not save it either.
  const isEmpty = category !== 'All' && view.railsVisible === 0 && backfill.length === 0;

  useQuickFilterLog(nonce, {
    surface: 'new',
    category,
    railsVisible: view.railsVisible,
    itemsVisible: view.itemsVisible,
  });

  // Separates a filtered view's impressions from an unfiltered one's, so the
  // novelty eval can segment on it instead of silently mixing the two
  // populations (§6).
  const impressionMetadata = useMemo(
    () => (category === 'All' ? undefined : { filter: category }),
    [category],
  );

  // Same blind spot For You had (R-030): the hero renders as MagazineHero,
  // and PosterCard is the only caller of recordImpression — so the largest
  // card on Home logged nothing at all. It was therefore invisible to the
  // novelty eval, and to any future mechanism reading card_impressions.
  //
  // Home's hero is not "stuck" the way For You's was: dailyPick already
  // rotates it daily among the top 5 of the first service chart. But that
  // pick has no memory, so it can repeat by chance — and nothing could see
  // that it had, because nothing was recorded.
  //
  // Reads the RE-PICKED hero, not the payload's: what is logged has to be
  // what is on screen, or a filtered session teaches fatigue about a card
  // nobody saw.
  const homeHeroId = view.hero?.id ?? null;
  useEffect(() => {
    if (!homeHeroId) return;
    const { tmdbId } = parseContentItemId(homeHeroId);
    recordImpression({
      contentId: tmdbId,
      sourceSurface: 'home',
      position: 0,
      metadata: { role: 'hero', ...(impressionMetadata ?? {}) },
    });
  }, [homeHeroId, impressionMetadata]);

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

  // The ONLY navigation a chip may cause, and only as an explicit second tap
  // from the empty state (§1.2). Browse seeds its initial filters from this.
  const browseAll = useCallback(() => {
    router.push({
      pathname: '/browse',
      // `seed` makes Browse apply this once per tap — see browse.tsx.
      params: { contentType: categoryToContentType(category), seed: String(Date.now()) },
    });
  }, [router, category]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await feed.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [feed.refetch]);

  // first_home_view now fires from the post-onboarding Curating interstitial
  // (src/app/curating.tsx), not here: after the beta-feedback nav change the
  // landing surface is For You, so the funnel's first-paint capture moved
  // there. The event NAME is unchanged for funnel continuity. This screen
  // (the "New" tab, formerly Home) no longer consumes the just-onboarded bit.

  // B6: order matters. While the MMKV cache is restoring (or services have
  // not resolved) the query is paused — not loading, not errored, just
  // empty — so without this branch the "couldn't load" screen below
  // rendered for a frame on every cold start, before the cached feed had
  // a chance to paint.
  if ((feed.isBootstrapping && !feed.data) || feed.isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#e85d25" />
      </SafeAreaView>
    );
  }

  if (feed.isError || !feed.data) {
    // Must offer a real retry: retries are exhausted by the time this
    // renders, refetchOnWindowFocus is off, and no reconnect refetch fires
    // on RN — without the button this screen was a dead end until app
    // restart (pre-launch review 2026-07-12).
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background px-8">
        <Text className="text-center font-standfirst text-section text-foreground">
          Couldn&apos;t load tonight&apos;s shelf
        </Text>
        <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
          Check your connection and try again.
        </Text>
        <Pressable
          onPress={onRefresh}
          disabled={refreshing}
          className="mt-6 h-12 flex-row items-center justify-center rounded-card bg-primary px-8 active:opacity-90">
          {refreshing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="font-sans-bold text-body text-white">Try again</Text>
          )}
        </Pressable>
      </SafeAreaView>
    );
  }

  const { hero, spotlightPick } = view;
  const rail = (name: string) => view.byName.get(name);
  const heroKicker = category === 'All' ? undefined : `Today's pick · ${HERO_KICKER[category]}`;
  // Reveal index counter so cascade stays ordered across variable rows.
  let revealIdx = 2;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e85d25" />
        }
        contentContainerClassName="pb-8">
        {/* §1.2 asks for ONE card when everything hides — a surviving hero
            above "Not many films this week" would contradict it. */}
        {hero && !isEmpty ? (
          <Reveal index={0}>
            <MagazineHero
              item={hero}
              kicker={heroKicker}
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
          <BrowseChips active={category} visible={view.chips} onSelect={setCategory} />
        </Reveal>

        {isEmpty ? <QuickFilterEmptyState category={category} onBrowse={browseAll} /> : null}

        {rail('Just in')?.visible ? (
          <Reveal index={(revealIdx += 1)}>
            <ContentRow
              kicker="Just in"
              title="Recently added."
              items={rail('Just in')!.items}
              onItemPress={openDetail}
              surface="home"
              impressionMetadata={impressionMetadata}
            />
          </Reveal>
        ) : null}

        {rail('Free tonight')?.visible ? (
          <Reveal index={(revealIdx += 1)}>
            <FreeTonight
              items={rail('Free tonight')!.items}
              onItemPress={openDetail}
              impressionMetadata={impressionMetadata}
            />
          </Reveal>
        ) : null}

        {rail('Trending')?.visible ? (
          <Reveal index={(revealIdx += 1)}>
            <TrendingRibbon items={rail('Trending')!.items} onItemPress={openDetail} />
          </Reveal>
        ) : null}

        {spotlightPick ? (
          <Reveal index={(revealIdx += 1)}>
            <EditorialSpotlight item={spotlightPick} onPress={openDetail} />
          </Reveal>
        ) : null}

        {rail('New releases')?.visible ? (
          <Reveal index={(revealIdx += 1)}>
            <ContentRow
              kicker="New releases"
              title="New to rent or buy."
              items={rail('New releases')!.items}
              onItemPress={openDetail}
              surface="home"
              impressionMetadata={impressionMetadata}
            />
          </Reveal>
        ) : null}

        {data.spotlights.map((sp) => {
          const r = rail(sp.clusterName);
          if (!r?.visible) return null;
          return (
            <Reveal key={sp.clusterName} index={(revealIdx += 1)}>
              <ContentRow
                kicker="Spotlight"
                title={`${sp.clusterName}.`}
                items={r.items}
                onItemPress={openDetail}
                surface="home"
                impressionMetadata={impressionMetadata}
              />
            </Reveal>
          );
        })}

        {view.upcomingVisible ? (
          <Reveal index={(revealIdx += 1)}>
            <CalendarStrip items={view.upcoming} onItemPress={openDetail} />
          </Reveal>
        ) : null}

        {data.rows.map((row) => {
          const r = rail(row.serviceName);
          if (!r?.visible) return null;
          return (
            <Reveal key={row.serviceId} index={(revealIdx += 1)}>
              <ContentRow
                kicker="Top on"
                title={row.serviceName}
                items={r.items}
                onItemPress={openDetail}
                surface="home"
                impressionMetadata={impressionMetadata}
              />
            </Reveal>
          );
        })}

        {/* The one targeted backfill (§1.3): Documentaries only, after the
            first tap, cached for the session. */}
        {backfill.length > 0 ? (
          <Reveal index={(revealIdx += 1)}>
            <ContentRow
              kicker="More"
              title="Documentaries on your services."
              items={backfill}
              onItemPress={openDetail}
              surface="home"
              impressionMetadata={impressionMetadata}
            />
          </Reveal>
        ) : null}

        <HiddenRailsNote names={view.hiddenNames} category={category} />

        {data.rows.length === 0 ? (
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
