import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Search, Sparkles, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { reacted, touched } from "@/components/debug/TouchProbe";
import { BrowsePresearch } from "@/components/BrowsePresearch";
import {
  applyBrowseFilters,
  countActiveFilters,
  DEFAULT_FILTERS,
  type ContentType,
  sortItems,
  type BrowseFilters,
  type SortMode,
} from "@/components/browseFilters";
import { FilterSheet } from "@/components/FilterSheet";
import { PosterGridCard } from "@/components/PosterGridCard";
import { RefineRow } from "@/components/RefineRow";
import { PosterGridSkeleton } from "@/components/Skeleton";
import { TitleHitCard } from "@/components/TitleHitCard";
import { useBrowseDiscover } from "@/hooks/useBrowseDiscover";
import { useSearch } from "@/hooks/useSearch";
import {
  useSearchIntentLog,
  useTypedSearchLog,
  type SearchIntent,
} from "@/hooks/useSearchLogging";
import { useSemanticFlag, useSemanticSearch } from "@/hooks/useSemanticSearch";
import { useUserServices } from "@/hooks/useUserServices";
import { useWatchlist } from "@/hooks/useWatchlist";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
import {
  PRESET_SENTENCES,
  presetByKey,
  selectPresets,
  weekBucketFor,
  type SelectedPreset,
} from "@/lib/content/presets";
import {
  activeRefineFields,
  describeRefineEmptyState,
  refineLogMetadata,
  toggleRefineChip,
  type RefineChip,
  type RefineField,
} from "@/lib/content/refineChips";
import { selectTitleHit } from "@/lib/search/titleHit";
import { getV2TasteProfile } from "@/lib/taste-v2/tasteProfileV2";
import type { ContentItem } from "@/lib/types/content";
import { useQuery } from "@tanstack/react-query";

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
//   text      what is in the box
//   phrase    what goes to vector search — a preset's phrase, or the typed
//             text when it does not read as a title
//   phraseKey which preset that phrase came from
//   moodKey   which preset is lit
//   filters   the accumulated constraints
//
// A preset tap MERGES its filters and sets its phrase. A typed query sets
// text and routes by shape. "Clear all" resets the lot. `RefineRow` is what
// makes the composition tappable: five chips over five existing filter
// fields, plus the sheet and the sort control folded into the same block.
//
// Two control clusters left with it. The category pills (All / Movies / TV /
// Docs) filtered Mode A's list client-side and so did nothing on the
// described route, where the grid comes from the engine — a control that
// looks like it works and does not, caught by device testing 2026-09-09.
// The separate Filters/Sort row is now the second line of the refine block
// rather than a row of its own. Media type is `filters.contentType` on every
// path, which is the one spelling all three retrieval paths honour.

interface Intent {
  text: string;
  /** Sent to vector search when the flag is on. Null = nothing to embed. */
  phrase: string | null;
  /**
   * The preset `phrase` came from, or null.
   *
   * Separate from `moodKey` because a phrase-less card — *Free to watch* is a
   * fact, not a feeling — contributes only its filters and leaves whatever
   * phrase is already running. `moodKey` is then the last card tapped while
   * `phraseKey` is the card whose words are actually being searched, and the
   * banner has to name the second: tapping Comfort then Free to watch runs
   * Comfort's phrase, so "Titles that feel like Free to watch" would describe
   * a query that is not running.
   */
  phraseKey: string | null;
  /** The lit preset, or null. Drives the log metadata and the Clear control. */
  moodKey: string | null;
  filters: BrowseFilters;
}

const EMPTY_INTENT: Intent = {
  text: "",
  phrase: null,
  phraseKey: null,
  moodKey: null,
  filters: DEFAULT_FILTERS,
};

export default function BrowseScreen() {
  const router = useRouter();
  const [intent, setIntent] = useState<Intent>(EMPTY_INTENT);
  const [debounced, setDebounced] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("best");
  // The chip added most recently, so the zero-result copy can name the one
  // thing to undo instead of telling the user to loosen "the filters".
  const [lastRefine, setLastRefine] = useState<RefineField | null>(null);
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
  const [semanticIntent, setSemanticIntent] = useState<SearchIntent | null>(
    null,
  );
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
  const { contentType: contentTypeParam, seed: filterSeed } =
    useLocalSearchParams<{
      contentType?: string;
      seed?: string;
    }>();
  const appliedSeedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!filterSeed || appliedSeedRef.current === filterSeed) return;
    if (!isContentType(contentTypeParam) || contentTypeParam === "all") return;
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

  const { data: results, isFetching } = useSearch(debounced);
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
  // `results !== undefined` is the wait for Mode A, and it is load-bearing
  // twice over. Without it `titleHit` is null for as long as the lookup is in
  // flight, so EVERY settled query — "severance" included — routed here for a
  // moment: the embed round trip fired and was paid for, and the "Reading that
  // as a feeling" banner and the refine row flashed on screen before the title
  // card replaced them. Retrieval still does not wait on the embedding (rule 1
  // above); it is the routing DECISION that now waits for the cheaper of the
  // two answers before committing.
  const describedRoute =
    searching &&
    results !== undefined &&
    !titleHit &&
    !!semanticOn &&
    !forceTitles;

  // The phrase actually sent to vector search: the typed text when it reads
  // as a description, otherwise the active preset's phrase. A preset whose
  // phrase is null ("Free to watch" — a fact, not a feeling) contributes only
  // its filters and leaves whatever phrase is already running (§2.3).
  const semanticQuery = describedRoute
    ? debounced.trim()
    : searching
      ? null
      : intent.phrase;
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
  // "Refine only where it helps" (§9.2). Hidden on a confident title hit:
  // there is nothing to refine about a title the user has already named, and
  // the prototype's state 2 shows the card with no controls above it.
  const showRefine = (searching && !titleHit) || filterOnlyMode || semanticMode;

  const browse = useBrowseDiscover(
    filters,
    sortMode,
    filterOnlyMode,
    userServices ?? [],
  );

  // Which four cards the empty state offers. Recomputed on mount and
  // whenever the profile lands; the hour is read once per render of the
  // empty state, which is as often as the answer can change.
  const { data: tasteProfile } = useQuery({
    queryKey: ["native", "tasteProfile", "clusters"],
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
    for (const w of watchlist ?? [])
      if (w.status === "watched") set.add(`${w.type}-${w.id}`);
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
        text: "",
        phrase: preset.phrase ?? prev.phrase,
        // Only a card that brought a phrase renames the banner. A phrase-less
        // card leaves the running phrase alone, so it must leave the name of
        // that phrase alone too.
        phraseKey: preset.phrase ? preset.key : prev.phraseKey,
        moodKey: preset.key,
        filters: { ...prev.filters, ...preset.filters },
      }));
      setDebounced("");

      if (semanticOn && (preset.phrase ?? intent.phrase)) {
        setFilterIntent(null);
        setSemanticIntent({
          nonce,
          mode: "semantic",
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
          mode: "filter",
          query: null,
          metadata: { ...meta, semantic: false },
        });
      }
    },
    [semanticOn, intent.phrase],
  );

  // FilterSheet apply. Clearing every filter is not a search, so it stages
  // nothing.
  //
  // The sheet writes the WHOLE filter object, including `released` and `cost`,
  // which it has no controls for. That is what keeps the two in sync in the
  // direction the sheet owns: a `Newer` chip survives a sheet apply, and shows
  // in the sheet's own Apply count, even though the sheet cannot edit it.
  const handleApplyFilters = useCallback((next: BrowseFilters) => {
    setIntent((prev) => ({ ...prev, filters: next }));
    // A sheet apply is not a chip, so it does not own the "try removing X"
    // suggestion — clearing it stops the empty state pointing at a chip the
    // user has not touched since.
    setLastRefine(null);
    setFilterIntent(
      countActiveFilters(next) > 0
        ? {
            nonce: Date.now(),
            mode: "filter",
            query: null,
            metadata: { filters: next },
          }
        : null,
    );
  }, []);

  /**
   * One refine chip.
   *
   * The whole mechanism is `intent.filters`: both `useBrowseDiscover` and
   * `useSemanticSearch` key their queries on every filter axis, so writing
   * one field REFETCHES rather than thinning the grid that is already there.
   * That is the difference from the category pills this row replaced, which
   * post-filtered a fixed list of ~40 TMDb hits and got quietly thinner with
   * each tap.
   *
   * The one path where it does post-filter is Mode A with the semantic flag
   * off, where `applyBrowseFilters` runs over the search results — honest,
   * and the row is hidden on the title-hit layout where post-filtering would
   * be misleading.
   */
  const handleRefineToggle = useCallback(
    (chip: RefineChip) => {
      const next = toggleRefineChip(filters, chip);
      const on = chip.isOn(next);
      setIntent((prev) => ({ ...prev, filters: next }));
      // Only an ADDED chip becomes the suggestion. Naming a chip the user
      // just removed would tell them to undo the thing they did to recover.
      setLastRefine(on ? chip.field : null);
      // Logged as `filter` alongside preset taps and sheet applies (§5.2).
      // `refine` + `on` are what let §6 ask which axis people actually reach
      // for and how often a refinement is immediately undone; the full filter
      // set goes with it because a chip only means something in the context
      // of what else was already active.
      //
      // What the row must NOT carry is `mood_key` or the typed text, and it
      // carried both until 2026-09-09. `isContentIntentSearch` reads a
      // `filter` row with a `mood_key` as a mood preset tapped with the flag
      // off — real content intent — so every chip tap while a preset was lit
      // re-armed the 60 s 1.3x taste boost a re-slice may never earn. The
      // typed text was the same defect on the other side: it made the 079
      // rollup count one term twice, once as the lookup and again under
      // `mode='filter'`. A chip is a constraint on the page already in front
      // of the user, not a statement of what they want, and its row now says
      // only that. `searchAttribution.ts` excludes `refine` rows outright as
      // well, so this cannot regress silently from the call site again.
      setSemanticIntent(null);
      // Same rule the sheet applies: removing the last constraint when there
      // is no text and no preset lands back on the empty state, and an empty
      // state is not a search. Logging it would enter a zero-result row for
      // a user who had just cleared their last filter, which reads in §6 as
      // exactly the retrieval failure the zero-result rate exists to catch.
      const stillASearch =
        countActiveFilters(next) > 0 ||
        intent.text.trim().length > 0 ||
        !!intent.moodKey;
      setFilterIntent(
        stillASearch
          ? {
              nonce: Date.now(),
              mode: "filter",
              query: null,
              metadata: refineLogMetadata(chip.field, on, next),
            }
          : null,
      );
    },
    [filters, intent.text, intent.moodKey],
  );

  /** The one control that resets everything — text excepted, which has its own ×. */
  const clearAll = useCallback(() => {
    setIntent((prev) => ({
      ...prev,
      phrase: null,
      phraseKey: null,
      moodKey: null,
      filters: DEFAULT_FILTERS,
    }));
    setLastRefine(null);
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
        filters.showWatched === "all"
          ? base
          : base.filter((it) =>
              filters.showWatched === "hide"
                ? !isWatched(it.id)
                : isWatched(it.id),
            );
      // Sorted like every other grid. The control is visible in this mode now
      // that filters reach the engine, and a visible Sort that does nothing is
      // the same defect as the category pills above. 'best' is identity, which
      // is exactly right here — the engine already returned relevance order.
      return sortItems(watchApplied, sortMode);
    }
    if (searching) {
      if (!results) return [];
      if (titleHit) {
        // The hit is rendered as its own card, so the grid below it is
        // "other matches" (prototype state 2) — and deliberately UNFILTERED.
        // The refine row and *More filters* both live inside the block this
        // layout hides, so a constraint carried in from a preset would thin
        // this grid with no control anywhere on screen to undo it: the same
        // defect that got the category pills deleted, one layout along. No
        // visible control, no filtering. Sort stays applied — reordering
        // hides nothing, and 'best', the default a user who never opened the
        // control still has, is identity.
        return sortItems(results.slice(1), sortMode);
      }
      return sortItems(
        applyBrowseFilters(results, filters, isWatched),
        sortMode,
      );
    }
    if (filterOnlyMode) {
      // /discover already applied service/genre/rating/runtime/type/released/
      // cost. Only the watched filter is client-side (it needs the local
      // watchlist).
      const base = browse.data ?? [];
      const watchApplied =
        filters.showWatched === "all"
          ? base
          : base.filter((it) =>
              filters.showWatched === "hide"
                ? !isWatched(it.id)
                : isWatched(it.id),
            );
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
  // A failed embed or RPC leaves `semantic.data` undefined, `shown` an empty
  // array and `loading` false — which to the loggers is indistinguishable
  // from a query the engine answered with nothing. It wrote a `result_count:
  // 0` row for what is an outage, into the one metric §6 reads as a retrieval
  // failure. `undefined` is what the hooks hold on, so an error logs nothing
  // at all and the tripwire keeps meaning what it says.
  const semanticFailed = semanticMode && semantic.isError && !semantic.data;
  const loggableResults = semanticFailed ? undefined : shown;

  // The card whose PHRASE is running, which is not always the last card
  // tapped — see `Intent.phraseKey`. The banner and the "nothing in that
  // mood" copy both name the query, so both read this rather than `moodKey`.
  const phrasePreset = intent.phraseKey
    ? presetByKey(intent.phraseKey)
    : undefined;
  /** Which layout answered the typed text. Both logged and stamped on impressions. */
  const route = titleHit ? "title" : describedRoute ? "described" : "lookup";
  // Mode A with the flag off is the one grid that is post-filtered rather
  // than refetched, so it is the one grid `cost` cannot reach — see
  // `orderedRefineChips`.
  const modeAGrid = Boolean(searching && !describedRoute);
  // Search vs browse: text on screen means the user asked for something by
  // name or by description, and everything else — a preset, filters alone —
  // is browsing. Closes the §4 gap (IN-SL-001): Browse rendered every result
  // set and recorded no impressions, so search CTR had no denominator.
  const gridSurface = searching ? ("search" as const) : ("browse" as const);
  // "There WAS something here before the filters" — the precondition for
  // blaming a chip. Mode A's unfiltered hit list answers it directly, which is
  // why this is the only place it can be asked.
  const tightened = Boolean(
    activeCount > 0 && searching && (results?.length ?? 0) > 0,
  );
  // Serialised rather than the array itself: a fresh array every render would
  // re-record every impression on the grid on every render.
  const activeRefineKey = activeRefineFields(filters).join(",");
  const impressionMetadata = useMemo(
    () => ({
      route: searching ? route : semanticMode ? "preset" : "filter",
      refine: activeRefineKey || null,
    }),
    [searching, route, semanticMode, activeRefineKey],
  );

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
    route,
    results: describedRoute ? loggableResults : results,
    isFetching: describedRoute ? loading : isFetching,
  });
  // Preset taps on the semantic path log against the semantic result set.
  useSearchIntentLog(
    semanticMode ? semanticIntent : null,
    semantic.data,
    semantic.isFetching,
  );
  // Preset taps (flag off), FilterSheet applies and refine-chip toggles log
  // against what is actually on screen, whichever list that came from —
  // `shown` is the semantic grid in semanticMode and `loading` covers its
  // fetch, so a chip tapped on the described route reports the count the
  // engine returned rather than Mode A's.
  //
  // This deliberately is NOT gated on `!semanticMode` any more. It was, so
  // that a preset tap could not log twice; but `handlePreset` already sets
  // exactly one of the two intents, and the gate meant a sheet apply on the
  // semantic path — and now every refine toggle there — wrote nothing at all.
  useSearchIntentLog(filterIntent, loggableResults, loading);

  const openDetail = (item: ContentItem) => {
    // First result tap settles the query immediately — the strongest signal
    // that the user stopped on this text.
    markQuerySettled();
    return router.push({
      pathname: "/detail/[id]",
      params: { id: item.id, title: item.title, image: item.image },
    });
  };

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <View className="px-5 pt-2">
        <View
          onTouchStart={() => touched('Browse search')}
          className="flex-row items-center gap-3 rounded-card border border-border bg-card px-4 py-3"
        >
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
            onFocus={() => reacted('Browse search')}
            onBlur={() =>
              setPlaceholderIndex((i) => (i + 1) % PRESET_SENTENCES.length)
            }
            placeholder={`Try: “${PRESET_SENTENCES[placeholderIndex]}”`}
            placeholderTextColor="rgba(245,241,232,0.4)"
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={markQuerySettled}
            className="flex-1 font-sans text-body text-foreground"
          />
          {intent.text.length > 0 ? (
            <Pressable
              onPress={() => setIntent((prev) => ({ ...prev, text: "" }))}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search text"
            >
              <X size={18} color="rgba(245,241,232,0.62)" />
            </Pressable>
          ) : null}
        </View>

        {presearch ? (
          <Text className="ml-1 mt-1.5 font-sans-medium text-kicker text-faint-foreground">
            Type a title, or describe what you feel like.
          </Text>
        ) : null}

        {/* Described-text banner — says what we did with the text, and offers
            the way back. Shown only for typed text routed to the engine; a
            preset tap gets the mood banner below instead. */}
        {describedRoute ? (
          <View className="mt-3 flex-row items-center gap-2.5">
            <Sparkles size={14} color="#e85d25" />
            <Text
              numberOfLines={1}
              className="flex-1 font-body-serif italic text-body text-foreground"
            >
              Reading that as a feeling, not a title.
            </Text>
            <Pressable
              onPress={() => setForceTitles(true)}
              hitSlop={8}
              accessibilityRole="button"
              className="rounded-pill px-2 py-1.5 active:opacity-70"
            >
              <Text className="font-sans-medium text-meta text-faint-foreground">
                Search titles instead
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Preset banner — italic "feels like" + Clear */}
        {semanticMode && !describedRoute && phrasePreset ? (
          <View className="mt-3 flex-row items-center justify-between gap-3">
            <View className="flex-1 flex-row items-center gap-2">
              <Sparkles size={14} color="#e85d25" />
              <Text
                numberOfLines={1}
                className="flex-1 font-body-serif italic text-body text-foreground"
              >
                Titles that feel like “{phrasePreset.label}”
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setIntent((prev) => ({
                  ...prev,
                  phrase: null,
                  phraseKey: null,
                  moodKey: null,
                }));
                setSemanticIntent(null);
              }}
              hitSlop={8}
              accessibilityRole="button"
              className="flex-row items-center gap-1 rounded-pill px-2 py-1.5 active:opacity-70"
            >
              <X size={12} color="rgba(245,241,232,0.5)" />
              <Text className="font-sans-medium text-meta text-faint-foreground">
                Clear
              </Text>
            </Pressable>
          </View>
        ) : null}

        {showRefine ? (
          <RefineRow
            filters={filters}
            onToggle={handleRefineToggle}
            activeCount={activeCount}
            onOpenSheet={() => setSheetOpen(true)}
            onClearAll={
              activeCount > 0 || intent.moodKey ? clearAll : undefined
            }
            sortMode={sortMode}
            onSortChange={setSortMode}
            resultCount={shown.length}
            loading={loading}
            clientSideOnly={modeAGrid}
          />
        ) : null}
      </View>

      {titleHit ? (
        <TitleHitCard
          item={titleHit.item}
          userServices={userServices ?? []}
          onOpenDetail={openDetail}
          impressionMetadata={impressionMetadata}
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
          keyboardShouldPersistTaps="handled"
          data={shown}
          numColumns={2}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <PosterGridCard
              item={item}
              onPress={openDetail}
              surface={gridSurface}
              // The title-hit card is position 0 and records its own
              // impression, so "other matches" start at 1.
              position={titleHit ? index + 1 : index}
              impressionMetadata={impressionMetadata}
            />
          )}
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
          moodLabel={phrasePreset?.label}
          tightened={tightened}
          // A lit chip only earns "try removing Newer" when a chip could
          // plausibly be what emptied the grid. Typing gibberish with a chip
          // lit found nothing because the words match nothing, and telling
          // that user to remove Newer sends them one tap further from an
          // answer. `tightened` is the evidence that filtering did it;
          // `!searching` is the browse case, where filters are the only
          // input there is. Everything else falls through to the plain copy.
          //
          // `modeAGrid` withholds *Free to watch* from the sentence for the
          // same reason `orderedRefineChips` withholds the chip: on the one
          // grid that post-filters, `applyBrowseFilters` ignores `cost`, so
          // it is provably not the chip that emptied anything.
          refine={
            tightened || !searching
              ? describeRefineEmptyState(filters, lastRefine, modeAGrid)
              : null
          }
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
  refine,
}: {
  query: string;
  filterOnly: boolean;
  semantic: boolean;
  described: boolean;
  moodLabel?: string;
  tightened: boolean;
  /** Set when a refine chip is active — see `describeRefineEmptyState`. */
  refine: { summary: string; removeLabel: string } | null;
}) {
  // A refined grid that came back empty gets the refine copy on EVERY route,
  // ahead of the route-specific text. "Nothing quite like that" is true and
  // useless when the user has just tapped two chips: it does not say which
  // tap emptied the grid, so the only recovery is to clear everything and
  // start over. Naming the last chip added is one tap back to results.
  if (refine) {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <Text className="text-center font-standfirst text-section text-foreground">
          {refine.summary}
        </Text>
        <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
          Try removing {refine.removeLabel}.
        </Text>
      </View>
    );
  }
  if (described) {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <Text className="text-center font-standfirst text-section text-foreground">
          Nothing quite like that
        </Text>
        <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
          We read “{query.trim()}” as a description and found nothing matching
          it and your filters. Try loosening the filters, or search for a title
          instead.
        </Text>
      </View>
    );
  }
  if (semantic) {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <Text className="text-center font-standfirst text-section text-foreground">
          Nothing in that mood
        </Text>
        <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
          We couldn’t find titles that feel like “{moodLabel}” right now. Try
          another feeling.
        </Text>
      </View>
    );
  }
  const title = filterOnly || tightened ? "Nothing matches" : "No matches";
  const body =
    filterOnly || tightened
      ? "Nothing matches this filter combination. Try loosening the filters."
      : `Nothing found for “${query.trim()}”. Try a different title.`;
  return (
    <View className="flex-1 items-center justify-center px-10">
      <Text className="text-center font-standfirst text-section text-foreground">
        {title}
      </Text>
      <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
        {body}
      </Text>
    </View>
  );
}

/** Narrows an untrusted route param to the filter vocabulary. */
function isContentType(value: string | undefined): value is ContentType {
  return (
    value === "all" || value === "movie" || value === "tv" || value === "doc"
  );
}
