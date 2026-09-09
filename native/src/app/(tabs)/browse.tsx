import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown, Search, Sparkles, SlidersHorizontal, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrowsePresearch } from '@/components/BrowsePresearch';
import {
  applyBrowseFilters,
  countActiveFilters,
  DEFAULT_FILTERS,
  type ContentType,
  SORT_LABELS,
  sortItems,
  type BrowseFilters,
  type SortMode,
} from '@/components/browseFilters';
import { FilterSheet } from '@/components/FilterSheet';
import { PosterGridCard } from '@/components/PosterGridCard';
import { PosterGridSkeleton } from '@/components/Skeleton';
import { TitleHitCard } from '@/components/TitleHitCard';
import { useBrowseDiscover } from '@/hooks/useBrowseDiscover';
import { useSearch, type SearchCategory } from '@/hooks/useSearch';
import {
  useSearchIntentLog,
  useTypedSearchLog,
  type SearchIntent,
} from '@/hooks/useSearchLogging';
import { useSemanticFlag, useSemanticSearch } from '@/hooks/useSemanticSearch';
import { useUserServices } from '@/hooks/useUserServices';
import { useWatchlist } from '@/hooks/useWatchlist';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import {
  PRESET_SENTENCES,
  presetByKey,
  selectPresets,
  weekBucketFor,
  type SelectedPreset,
} from '@/lib/content/presets';
import { selectTitleHit } from '@/lib/search/titleHit';
import { getV2TasteProfile } from '@/lib/taste-v2/tasteProfileV2';
import type { ContentItem } from '@/lib/types/content';
import { useQuery } from '@tanstack/react-query';

// Browse — one intent, refined in place (recommendation 2026-09-08-002 §9).
//
// This screen used to hold three MUTUALLY EXCLUSIVE modes: typed search, a
// semantic mood, and filter-only discover. Tapping a mood cleared the filters
// and the query; typing cleared the mood. So the one sentence the whole brief
// is about — "a new film I don't have to pay for that isn't cheesy crap" —
// could not be expressed, because its halves lived in different modes.
//
// Now there is ONE state, `intent`, and nothing clears anything else:
//
//   text     what is in the box
//   phrase   what goes to vector search — a preset's phrase, or the typed
//            text when it does not read as a title
//   moodKey  which preset is lit
//   filters  the accumulated constraints
//
// A preset tap MERGES its filters and sets its phrase. A typed query sets
// text and routes by shape. "Clear all" resets the lot. The refine chip row
// that makes the composition tappable is Session 4; the composition itself is
// here, and already works through the FilterSheet.

const CATEGORIES: SearchCategory[] = ['All', 'Movies', 'TV', 'Docs'];
const SORT_MODES: SortMode[] = ['best', 'popularity', 'rating', 'a_z', 'z_a'];

interface Intent {
  text: string;
  /** Sent to vector search when the flag is on. Null = nothing to embed. */
  phrase: string | null;
  /** The lit preset, or null. Drives the banner and the log metadata. */
  moodKey: string | null;
  filters: BrowseFilters;
}

const EMPTY_INTENT: Intent = {
  text: '',
  phrase: null,
  moodKey: null,
  filters: DEFAULT_FILTERS,
};

export default function BrowseScreen() {
  const router = useRouter();
  const [intent, setIntent] = useState<Intent>(EMPTY_INTENT);
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState<SearchCategory>('All');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('best');
  const [sortOpen, setSortOpen] = useState(false);
  // Set by "Search titles instead" — the user has told us this text is a
  // title, so stop reading it as a feeling until they type something else.
  const [forceTitles, setForceTitles] = useState(false);
  // Which of the eight sentences the placeholder is showing. Advances on
  // blur, never per keystroke: a placeholder that changes while you are
  // reading it is a distraction, and it is invisible while you type anyway.
  const [placeholderIndex, setPlaceholderIndex] = useState(() =>
    Math.floor(Math.random() * PRESET_SENTENCES.length),
  );
  // Search-term logging (§5). Typed queries log themselves once settled; the
  // two discrete intents — a preset tap and a FilterSheet apply — each stage a
  // SearchIntent that fires as soon as its result count is known.
  const [semanticIntent, setSemanticIntent] = useState<SearchIntent | null>(null);
  const [filterIntent, setFilterIntent] = useState<SearchIntent | null>(null);

  // Applied from the route so the quick-filter empty state's "Browse all
  // documentaries" button lands on documentaries rather than dropping the
  // user into an unfiltered grid (recommendation 2026-09-08-002 §1.2). This
  // is the ONLY thing a quick-filter chip may navigate to, and only as an
  // explicit second tap.
  //
  // An effect, NOT a useState initializer: Browse is a tab, so the screen is
  // already mounted by the time anything navigates here and an initializer
  // would never run again — the param would be silently ignored.
  //
  // `seed` is what makes it apply once per navigation rather than once per
  // param value: tapping the same button twice sends the same contentType,
  // and without a fresh token the second tap would do nothing. The ref then
  // stops the effect re-applying on unrelated re-renders, so this can never
  // yank filters out from under someone mid-browse.
  const { contentType: contentTypeParam, seed: filterSeed } = useLocalSearchParams<{
    contentType?: string;
    seed?: string;
  }>();
  const appliedSeedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!filterSeed || appliedSeedRef.current === filterSeed) return;
    if (!isContentType(contentTypeParam) || contentTypeParam === 'all') return;
    appliedSeedRef.current = filterSeed;
    setIntent((prev) => ({
      ...prev,
      filters: { ...prev.filters, contentType: contentTypeParam },
    }));
  }, [contentTypeParam, filterSeed]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(intent.text), 300);
    return () => clearTimeout(t);
  }, [intent.text]);

  const { data: results, isFetching } = useSearch(debounced, category);
  const { data: watchlist } = useWatchlist();
  const { data: userServices } = useUserServices();
  const { data: semanticOn } = useSemanticFlag();

  const filters = intent.filters;
  const searching = debounced.trim().length >= 2;
  const activeCount = countActiveFilters(filters);

  // — Routing (§9.2) ————————————————————————————————————————————————
  // 1. Mode A always runs on a settled query — retrieval must never wait on
  //    an embedding round trip.
  // 2. A confident title hit is a lookup: the card, and no refine affordance.
  // 3. Otherwise, with the flag on, the text IS the phrase.
  // 4. Flag off: today's Mode A grid, honestly thin.
  const titleHit = useMemo(
    () => (searching ? selectTitleHit(results, debounced) : null),
    [searching, results, debounced],
  );
  const describedRoute = searching && !titleHit && !!semanticOn && !forceTitles;

  // The phrase actually sent to vector search: the typed text when it reads
  // as a description, otherwise the active preset's phrase. A preset whose
  // phrase is null ("Free to watch" — a fact, not a feeling) contributes only
  // its filters and leaves whatever phrase is already running (§2.3).
  const semanticQuery = describedRoute ? debounced.trim() : searching ? null : intent.phrase;
  const semanticMode = !!semanticOn && !!semanticQuery;
  const semantic = useSemanticSearch(
    semanticQuery,
    semanticMode,
    filters,
    userServices ?? [],
  );

  // Filter-only browse — constraints with no text and nothing to embed.
  const filterOnlyMode = !searching && !semanticMode && activeCount > 0;
  const presearch = !searching && !semanticMode && activeCount === 0;
  // Hidden on a confident title hit: there is nothing to refine about a title
  // the user has already named, and the prototype's state 2 shows the card with
  // no controls above it. This is "refine only where it helps" (§9.2) in
  // today's vocabulary; Session 4 applies the same rule to the refine row.
  const showControls = (searching && !titleHit) || filterOnlyMode || semanticMode;
  // The category pills filter MODE A's result list, so they only belong on a
  // Mode A grid. On the described route the grid comes from the engine, which
  // never sees `category` — device testing 2026-09-09 caught them rendering
  // there, where tapping Movies changed nothing on screen while quietly
  // re-running Mode A and writing a log row. A control that looks like it
  // works and does not is worse than no control. Media type on the described
  // route is `filters.contentType`, which IS applied server-side. Session 4
  // removes the pills outright.
  const showCategories = searching && !titleHit && !describedRoute;

  const browse = useBrowseDiscover(filters, sortMode, filterOnlyMode, userServices ?? []);

  // Which four cards the empty state offers. Recomputed on mount and
  // whenever the profile lands; the hour is read once per render of the
  // empty state, which is as often as the answer can change.
  const { data: tasteProfile } = useQuery({
    queryKey: ['native', 'tasteProfile', 'clusters'],
    queryFn: () => getV2TasteProfile().catch(() => null),
    staleTime: 30 * 60 * 1000,
  });
  // Browse is a tab, so the screen stays mounted for the life of the process
  // and reading the clock once would freeze the cards at whatever hour the
  // app was opened. Re-read it each time the user comes back to the empty
  // state — the only moment the answer is about to be looked at.
  const [presetClock, setPresetClock] = useState(() => Date.now());
  useEffect(() => {
    if (presearch) setPresetClock(Date.now());
  }, [presearch]);
  const presets = useMemo(() => {
    const now = new Date(presetClock);
    return selectPresets({
      hour: now.getHours(),
      dow: now.getDay(),
      selectedClusters: tasteProfile?.selectedClusters ?? [],
      weekBucket: weekBucketFor(presetClock),
    });
  }, [tasteProfile, presetClock]);

  const watchedIds = useMemo(() => {
    const set = new Set<string>();
    for (const w of watchlist ?? []) if (w.status === 'watched') set.add(`${w.type}-${w.id}`);
    return set;
  }, [watchlist]);

  const isWatched = useCallback(
    (id: string) => {
      const { tmdbId, mediaType } = parseContentItemId(id);
      return watchedIds.has(`${mediaType}-${tmdbId}`);
    },
    [watchedIds],
  );

  // Preset tap: compose, don't replace (§2.3). The preset's filters merge
  // onto what is already there and its phrase becomes the query — so a vibe
  // card and a constraint card stack, which is the single change that turns
  // the motivating sentence into two taps.
  const handlePreset = useCallback(
    (preset: SelectedPreset) => {
      // One row per tap, so the nonce is the tap time — tapping A, then B,
      // then A again is three intents. `mood_key` rather than the phrase
      // keeps rows small and lets the copy be reworded without breaking
      // history (§5.2). `slot` and `selection_reason` are what let §6 judge
      // whether the four-slot selection earns its keep.
      const nonce = Date.now();
      const meta = {
        mood_key: preset.key,
        slot: preset.slot,
        selection_reason: preset.selectionReason,
      };
      setForceTitles(false);
      setIntent((prev) => ({
        ...prev,
        // A tap is not a typed query; leaving stale text in the box would
        // route straight back to Mode A on the next render.
        text: '',
        phrase: preset.phrase ?? prev.phrase,
        moodKey: preset.key,
        filters: { ...prev.filters, ...preset.filters },
      }));
      setDebounced('');

      if (semanticOn && (preset.phrase ?? intent.phrase)) {
        setFilterIntent(null);
        setSemanticIntent({
          nonce,
          mode: 'semantic',
          query: preset.phrase ?? intent.phrase,
          metadata: { ...meta, semantic: true },
        });
      } else {
        setSemanticIntent(null);
        // Flag off (or a phrase-less card with nothing running): the tap
        // resolves to a deterministic filter preset, so it logs as `filter`
        // with no free text.
        setFilterIntent({
          nonce,
          mode: 'filter',
          query: null,
          metadata: { ...meta, semantic: false },
        });
      }
    },
    [semanticOn, intent.phrase],
  );

  // FilterSheet apply. Clearing every filter is not a search, so it stages
  // nothing.
  const handleApplyFilters = useCallback((next: BrowseFilters) => {
    setIntent((prev) => ({ ...prev, filters: next }));
    setFilterIntent(
      countActiveFilters(next) > 0
        ? { nonce: Date.now(), mode: 'filter', query: null, metadata: { filters: next } }
        : null,
    );
  }, []);

  /** The one control that resets everything — text excepted, which has its own ×. */
  const clearAll = useCallback(() => {
    setIntent((prev) => ({ ...prev, phrase: null, moodKey: null, filters: DEFAULT_FILTERS }));
    setSemanticIntent(null);
    setFilterIntent(null);
  }, []);

  const shown = useMemo(() => {
    if (semanticMode) {
      // Everything except `showWatched` was applied server-side, so the grid
      // is the real result set rather than a thinned one. The watchlist is
      // local, so that one axis stays here.
      const base = semantic.data ?? [];
      const watchApplied =
        filters.showWatched === 'all'
          ? base
          : base.filter((it) => (filters.showWatched === 'hide' ? !isWatched(it.id) : isWatched(it.id)));
      // Sorted like every other grid. The control is visible in this mode now
      // that filters reach the engine, and a visible Sort that does nothing is
      // the same defect as the category pills above. 'best' is identity, which
      // is exactly right here — the engine already returned relevance order.
      return sortItems(watchApplied, sortMode);
    }
    if (searching) {
      if (!results) return [];
      // The hit is rendered as its own card, so the grid below it is
      // "other matches" (prototype state 2).
      const rest = titleHit ? results.slice(1) : results;
      return sortItems(applyBrowseFilters(rest, filters, isWatched), sortMode);
    }
    if (filterOnlyMode) {
      // /discover already applied service/genre/rating/runtime/type/released/
      // cost. Only the watched filter is client-side (it needs the local
      // watchlist).
      const base = browse.data ?? [];
      const watchApplied =
        filters.showWatched === 'all'
          ? base
          : base.filter((it) => (filters.showWatched === 'hide' ? !isWatched(it.id) : isWatched(it.id)));
      return sortItems(watchApplied, sortMode);
    }
    return [];
  }, [
    semanticMode,
    semantic.data,
    searching,
    titleHit,
    filterOnlyMode,
    results,
    browse.data,
    filters,
    sortMode,
    isWatched,
  ]);

  const loading = semanticMode
    ? semantic.isFetching && !semantic.data
    : searching
      ? isFetching && !results
      : filterOnlyMode && browse.isFetching && !browse.data;

  const activePreset = intent.moodKey ? presetByKey(intent.moodKey) : undefined;

  // — Search-term logging (§5) —————————————————————————————————————
  // Typed queries: settled only, once each. `markSettled` is the
  // short-circuit for the keyboard's search key and the first result tap.
  // `result_count` must describe what the user SAW, which on the described
  // route is the engine's grid, not Mode A's. Device testing 2026-09-09 caught
  // this: "epic fantasy" logged result_count 0 three times while the semantic
  // grid was on screen, because Mode A legitimately finds no title called that
  // — which is why the query routed to the engine in the first place. Left
  // alone, every described query would have been recorded as a failed search,
  // poisoning the zero-result rate §8.2 makes a first-class metric.
  //
  // `shown` is what is rendered and `loading` covers the semantic fetch, so
  // the settle can no longer fire against a list the user never saw. Staleness
  // is still guarded by `resultsFor`, which stays the Mode A key both queries
  // are keyed on.
  const markQuerySettled = useTypedSearchLog({
    query: intent.text,
    resultsFor: debounced,
    category,
    results: describedRoute ? shown : results,
    isFetching: describedRoute ? loading : isFetching,
    metadata: { route: titleHit ? 'title' : describedRoute ? 'described' : 'lookup' },
  });
  // Preset taps on the semantic path log against the semantic result set.
  useSearchIntentLog(semanticMode ? semanticIntent : null, semantic.data, semantic.isFetching);
  // Preset taps (flag off) and FilterSheet applies log against what is
  // actually on screen, whichever list that came from.
  useSearchIntentLog(semanticMode ? null : filterIntent, shown, loading);

  const openDetail = (item: ContentItem) => {
    // First result tap settles the query immediately — the strongest signal
    // that the user stopped on this text.
    markQuerySettled();
    return router.push({
      pathname: '/detail/[id]',
      params: { id: item.id, title: item.title, image: item.image },
    });
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="px-5 pt-2">
        <View className="flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3">
          <Search size={18} color="rgba(245,241,232,0.62)" />
          <TextInput
            value={intent.text}
            onChangeText={(t) => {
              // Typing no longer clears the preset: its filters stay merged
              // and only the phrase is taken over by the text. That is the
              // whole point of one intent.
              setIntent((prev) => ({ ...prev, text: t }));
              setForceTitles(false);
              setSemanticIntent(null);
              setFilterIntent(null);
            }}
            onBlur={() => setPlaceholderIndex((i) => (i + 1) % PRESET_SENTENCES.length)}
            placeholder={`Try: “${PRESET_SENTENCES[placeholderIndex]}”`}
            placeholderTextColor="rgba(245,241,232,0.4)"
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={markQuerySettled}
            className="flex-1 font-sans text-body text-foreground"
          />
          {intent.text.length > 0 ? (
            <Pressable
              onPress={() => setIntent((prev) => ({ ...prev, text: '' }))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search text">
              <X size={18} color="rgba(245,241,232,0.62)" />
            </Pressable>
          ) : null}
        </View>

        {presearch ? (
          <Text className="ml-1 mt-1.5 font-sans-medium text-kicker text-faint-foreground">
            Type a title, or describe what you feel like.
          </Text>
        ) : null}

        {showCategories ? (
          <View className="mt-3 flex-row gap-2">
            {CATEGORIES.map((cat) => {
              const active = cat === category;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCategory(cat)}
                  className={
                    active
                      ? 'rounded-pill border border-primary-edge bg-primary-soft px-3.5 py-1.5'
                      : 'rounded-pill border border-border bg-card px-3.5 py-1.5 active:bg-secondary'
                  }>
                  <Text className={active ? 'font-sans-bold text-meta text-primary' : 'font-sans-medium text-meta text-muted-foreground'}>
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* Described-text banner — says what we did with the text, and offers
            the way back. Shown only for typed text routed to the engine; a
            preset tap gets the mood banner below instead. */}
        {describedRoute ? (
          <View className="mt-3 flex-row items-center gap-2.5">
            <Sparkles size={14} color="#e85d25" />
            <Text
              numberOfLines={1}
              className="flex-1 font-body-serif italic text-body text-foreground">
              Reading that as a feeling, not a title.
            </Text>
            <Pressable
              onPress={() => setForceTitles(true)}
              hitSlop={8}
              accessibilityRole="button"
              className="rounded-pill px-2 py-1.5 active:opacity-70">
              <Text className="font-sans-medium text-meta text-faint-foreground">
                Search titles instead
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Preset banner — italic "feels like" + Clear */}
        {semanticMode && !describedRoute && activePreset ? (
          <View className="mt-3 flex-row items-center justify-between gap-3">
            <View className="flex-1 flex-row items-center gap-2">
              <Sparkles size={14} color="#e85d25" />
              <Text numberOfLines={1} className="flex-1 font-body-serif italic text-body text-foreground">
                Titles that feel like “{activePreset.label}”
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setIntent((prev) => ({ ...prev, phrase: null, moodKey: null }));
                setSemanticIntent(null);
              }}
              hitSlop={8}
              accessibilityRole="button"
              className="flex-row items-center gap-1 rounded-pill px-2 py-1.5 active:opacity-70">
              <X size={12} color="rgba(245,241,232,0.5)" />
              <Text className="font-sans-medium text-meta text-faint-foreground">Clear</Text>
            </Pressable>
          </View>
        ) : null}

        {showControls ? (
          <View className="mt-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => setSheetOpen(true)}
                className={
                  activeCount > 0
                    ? 'flex-row items-center gap-1.5 rounded-pill border border-primary-edge bg-primary-soft px-3 py-1.5'
                    : 'flex-row items-center gap-1.5 rounded-pill border border-border bg-card px-3 py-1.5 active:bg-secondary'
                }>
                <SlidersHorizontal size={14} color={activeCount > 0 ? '#e85d25' : 'rgba(245,241,232,0.62)'} />
                <Text className={activeCount > 0 ? 'font-sans-bold text-meta text-primary' : 'font-sans-medium text-meta text-muted-foreground'}>
                  {activeCount > 0 ? `Filters · ${activeCount}` : 'Filters'}
                </Text>
              </Pressable>
              {activeCount > 0 || intent.moodKey ? (
                <Pressable
                  onPress={clearAll}
                  hitSlop={6}
                  accessibilityRole="button"
                  className="flex-row items-center gap-1 rounded-pill px-2 py-1.5 active:opacity-70">
                  <X size={12} color="rgba(245,241,232,0.5)" />
                  <Text className="font-sans-medium text-meta text-faint-foreground">Clear all</Text>
                </Pressable>
              ) : null}
            </View>

            <View>
              <Pressable
                onPress={() => setSortOpen((v) => !v)}
                className="flex-row items-center gap-1 rounded-pill border border-border bg-card px-3 py-1.5 active:bg-secondary">
                <Text className="font-sans-medium text-meta text-muted-foreground">{SORT_LABELS[sortMode]}</Text>
                <ChevronDown size={13} color="rgba(245,241,232,0.62)" />
              </Pressable>
              {sortOpen ? (
                <View
                  className="absolute right-0 top-9 z-10 w-36 rounded-card border border-border bg-card py-1"
                  style={{ elevation: 8 }}>
                  {SORT_MODES.map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => {
                        setSortMode(m);
                        setSortOpen(false);
                      }}
                      className="px-3 py-2 active:bg-secondary">
                      <Text className={m === sortMode ? 'font-sans-bold text-meta text-primary' : 'font-sans-medium text-meta text-muted-foreground'}>
                        {SORT_LABELS[m]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      {titleHit ? (
        <TitleHitCard
          item={titleHit.item}
          userServices={userServices ?? []}
          onOpenDetail={openDetail}
        />
      ) : null}

      {presearch ? (
        <BrowsePresearch
          presets={presets}
          onBuild={() => setSheetOpen(true)}
          onPreset={handlePreset}
        />
      ) : loading ? (
        <PosterGridSkeleton />
      ) : shown.length > 0 ? (
        <FlashList
          data={shown}
          numColumns={2}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PosterGridCard item={item} onPress={openDetail} />}
          contentContainerStyle={{ padding: 14 }}
          ListHeaderComponent={
            titleHit ? (
              <Text className="mb-2 ml-1 font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
                Other matches
              </Text>
            ) : null
          }
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        />
      ) : titleHit ? null : (
        <NoResults
          query={debounced}
          filterOnly={filterOnlyMode}
          semantic={semanticMode}
          described={describedRoute}
          moodLabel={activePreset?.label}
          tightened={Boolean(activeCount > 0 && searching && (results?.length ?? 0) > 0)}
        />
      )}

      <FilterSheet
        visible={sheetOpen}
        filters={filters}
        onApply={handleApplyFilters}
        onClose={() => setSheetOpen(false)}
      />
    </SafeAreaView>
  );
}

function NoResults({
  query,
  filterOnly,
  semantic,
  described,
  moodLabel,
  tightened,
}: {
  query: string;
  filterOnly: boolean;
  semantic: boolean;
  described: boolean;
  moodLabel?: string;
  tightened: boolean;
}) {
  if (described) {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <Text className="text-center font-standfirst text-section text-foreground">
          Nothing quite like that
        </Text>
        <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
          We read “{query.trim()}” as a description and found nothing matching it and your
          filters. Try loosening the filters, or search for a title instead.
        </Text>
      </View>
    );
  }
  if (semantic) {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <Text className="text-center font-standfirst text-section text-foreground">Nothing in that mood</Text>
        <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
          We couldn’t find titles that feel like “{moodLabel}” right now. Try another feeling.
        </Text>
      </View>
    );
  }
  const title = filterOnly || tightened ? 'Nothing matches' : 'No matches';
  const body =
    filterOnly || tightened
      ? 'Nothing matches this filter combination. Try loosening the filters.'
      : `Nothing found for “${query.trim()}”. Try a different title.`;
  return (
    <View className="flex-1 items-center justify-center px-10">
      <Text className="text-center font-standfirst text-section text-foreground">{title}</Text>
      <Text className="mt-2 text-center font-sans text-body text-muted-foreground">{body}</Text>
    </View>
  );
}

/** Narrows an untrusted route param to the filter vocabulary. */
function isContentType(value: string | undefined): value is ContentType {
  return value === 'all' || value === 'movie' || value === 'tv' || value === 'doc';
}
