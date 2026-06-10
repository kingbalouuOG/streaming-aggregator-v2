import React, { useMemo, useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, X, SlidersHorizontal, Loader2, Clock, Leaf, Zap, Moon, Heart, Check, ChevronDown } from "lucide-react";
import { BrowseCard } from "./BrowseCard";
import { ContentItem } from "./ContentCard";
import { FilterSheet, FilterState, ALL_GENRES, FILTER_LANGUAGES } from "./FilterSheet";
import { MoodChip } from "./MoodChip";
import { SearchSuggestions } from "./search/SearchSuggestions";
import { SearchModeIndicator } from "./search/SearchModeIndicator";
import { SearchSemanticCTA } from "./search/SearchSemanticCTA";
import { toast } from "sonner";
import { useSearch } from "@/hooks/useSearch";
import { useBrowse, type BrowseSortBy } from "@/hooks/useBrowse";
import { useItemAvailability } from "@/hooks/useItemAvailability";
import { useTasteRanking } from "@/hooks/useTasteRanking";
import { providerIdsToServiceIds } from "@/lib/adapters/platformAdapter";
import { GENRE_NAME_TO_ID } from "@/lib/constants/genres";
import { useFilterUrlSync } from "@/lib/search/useFilterUrlSync";
import {
  getRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
} from "@/lib/search/recentSearches";
import { buildActiveFilterPills, clearAllActiveFilters } from "@/lib/search/activeFilterPills";
import { ActiveFilterPill } from "./ActiveFilterPill";
import { hash as hashFilters, hashString, isDefault as isDefaultFilters } from "@/lib/search/filterState";
import { recordImpression } from "@/lib/instrumentation/impressionBatcher";
import { getCurrentSessionId } from "@/lib/instrumentation/sessionId";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
import { setCardClickContext } from "@/lib/instrumentation/clickContext";
import { emitSearch } from "@/lib/storage/interactions";
import type { ServiceId } from "./platformLogos";

const browseCategories = ["All", "Movies", "TV", "Docs"];

export interface BrowseStateSnapshot {
  query: string;
  results: ContentItem[];
  activeCategory: string;
  /** IDs of items the per-item /watch/providers check tagged as off-
   *  services. Saved across navigation so a tap-into-detail-then-back
   *  doesn't drop the off-service tint treatment. */
  unavailableIds: string[];
  /** [contentId, "From £X.XX"] tuples for items where a rent/buy
   *  price exists. Preserved across navigation. */
  rentBuyPrices: [string, string][];
  /** [contentId, tier[]] tuples — which tiers the user can use to
   *  watch each item. Persists so the cost filter still works after
   *  detail navigation without re-running per-item availability. */
  availableTiers: [string, ('free' | 'rent' | 'buy')[]][];
  /** [contentId, ServiceId[]] tuples — the displayable service set
   *  the renderer should use instead of the raw item.services list.
   *  Preserves on-service vs "where it lives" decisions across nav. */
  serviceBadges: [string, ServiceId[]][];
}

interface BrowsePageProps {
  onItemSelect?: (item: ContentItem) => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  showFilters: boolean;
  onShowFiltersChange: (show: boolean) => void;
  bookmarkedIds?: Set<string>;
  onToggleBookmark?: (item: ContentItem) => void;
  providerIds?: number[];
  userServices?: ServiceId[];
  watchedIds?: Set<string>;
  savedState?: React.MutableRefObject<BrowseStateSnapshot | null>;
  /** User's 1536D taste vector — drives the filter-only "Best match"
   *  sort. When null/undefined, Best match falls back to popularity. */
  tasteVector?: number[] | null;
  /** Phase Search V2 Cluster B — semantic search feature flag. When
   *  true, Mode C dispatch paths (mood chips, opt-in CTA tap) call
   *  the embed-query Edge function. When false, mood chips fall back
   *  to Mode A keyword search, and the opt-in CTA shows a preview
   *  toast on tap. */
  semanticFlagOn?: boolean;
}

export function BrowsePage({ onItemSelect, filters, onFiltersChange, showFilters, onShowFiltersChange, bookmarkedIds, onToggleBookmark, providerIds = [], userServices, watchedIds, savedState, tasteVector, semanticFlagOn = false }: BrowsePageProps) {
  const initial = savedState?.current;

  const search = useSearch(userServices, initial?.query, initial?.results, {
    filters,
    userTasteVector: tasteVector,
  });

  // Mirror filter state to the URL hash so deep links and back-button
  // navigation restore prior filters. Hook reads on mount, writes on
  // change. Phase Search V2 A1.
  useFilterUrlSync(filters, onFiltersChange, userServices ?? [], {
    genres: ALL_GENRES,
    languages: FILTER_LANGUAGES,
    enabled: true,
  });

  // Sync category from saved state on mount
  useEffect(() => {
    if (initial?.activeCategory && initial.activeCategory !== search.activeCategory) {
      search.setActiveCategory(initial.activeCategory);
    }
  }, []);

  // Refs to capture latest values for the unmount snapshot. The
  // snapshot survives navigation to a detail page so a tap-into-then-
  // back restores results AND the per-item availability decisions.
  const searchRef = useRef(search);
  searchRef.current = search;
  // availabilityRef is wired below once `availability` is defined; it's
  // declared here so the unmount effect closes over the correct ref.
  const availabilityRef = useRef<{ unavailableIds: Set<string>; rentBuyPrices: Map<string, string>; availableTiers: Map<string, Set<'free' | 'rent' | 'buy'>>; serviceBadges: Map<string, ServiceId[]> } | null>(null);

  // Save state back to ref on unmount
  useEffect(() => {
    return () => {
      if (savedState && availabilityRef.current) {
        const a = availabilityRef.current;
        savedState.current = {
          query: searchRef.current.query,
          results: searchRef.current.results,
          activeCategory: searchRef.current.activeCategory,
          unavailableIds: Array.from(a.unavailableIds),
          rentBuyPrices: Array.from(a.rentBuyPrices.entries()),
          availableTiers: Array.from(a.availableTiers.entries()).map(
            ([id, tiers]) => [id, Array.from(tiers)] as [string, ('free' | 'rent' | 'buy')[]],
          ),
          serviceBadges: Array.from(a.serviceBadges.entries()).map(
            ([id, ids]) => [id, [...ids]] as [string, ServiceId[]],
          ),
        };
      }
    };
  }, [savedState]);

  const hasQuery = search.query.trim().length > 0;
  const isSearching = search.query.trim().length >= 2;

  // Search input focus state — drives the suggestions/grid toggle.
  // Focused + has query → suggestions list (artboard 02).
  // Blurred (post-Enter / post-tap-outside) → results grid.
  const [searchFocused, setSearchFocused] = useState(false);

  // Sort axis. `best` is the default — relevance order for text
  // search, popularity for filter-only browse. Explicit options
  // override both. Session state (not in FilterState / URL) — it's
  // an ordering concern, not a filtering one.
  type SortMode = "best" | "popularity" | "rating" | "a_z" | "z_a";
  const [sortBy, setSortBy] = useState<SortMode>("best");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const SORT_LABELS: Record<SortMode, string> = {
    best: "Best match",
    popularity: "Popularity",
    rating: "Rating",
    a_z: "A–Z",
    z_a: "Z–A",
  };
  const SORT_OPTIONS: SortMode[] = ["best", "popularity", "rating", "a_z", "z_a"];
  const browseSortBy: BrowseSortBy =
    sortBy === "rating" ? "vote_average.desc"
    : sortBy === "a_z" ? "title.asc"
    : sortBy === "z_a" ? "title.desc"
    : "popularity.desc"; // best + popularity both map here for /discover

  // Close the sort menu on outside-click / Escape.
  useEffect(() => {
    if (!sortMenuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSortMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [sortMenuOpen]);

  // Recent searches — local store. Tracked in state so add/remove
  // re-renders the empty state. The store is the source of truth; the
  // state mirror is just a render trigger.
  const [recents, setRecents] = useState<string[]>(() => getRecentSearches());
  const lastRecordedRef = useRef<string>('');

  // Record a query into the recents store once it's submitted in a
  // meaningful way (≥ 2 chars + has resolved with a non-loading state).
  // Dedupe via the most-recently-recorded ref so re-renders don't keep
  // re-adding the same query.
  useEffect(() => {
    if (!isSearching || search.loading) return;
    const q = search.query.trim();
    if (!q || q === lastRecordedRef.current) return;
    lastRecordedRef.current = q;
    addRecentSearch(q);
    setRecents(getRecentSearches());
  }, [search.query, search.loading, isSearching]);

  const handleSelectRecent = useCallback((query: string) => {
    search.setQuery(query);
  }, [search]);

  const handleDismissRecent = useCallback((query: string) => {
    removeRecentSearch(query);
    setRecents(getRecentSearches());
  }, []);

  const handleClearRecents = useCallback(() => {
    clearRecentSearches();
    setRecents([]);
  }, []);

  // Mood-chip tap → populate the query, then dispatch Mode C
  // (semantic) when the user has the feature flag on. Flag-off users
  // silently fall back to Mode A — the chip is a discovery hint, not
  // a hard semantic-only contract.
  const handleMoodChip = useCallback((phrase: string) => {
    // Arm the mode before setQuery so the debounced query effect
    // dispatches via the semantic path. Calling setMode with its own
    // dispatch would race the debounced Mode A from setQuery.
    if (semanticFlagOn) {
      search.setMode('semantic', { dispatch: false });
    }
    search.setQuery(phrase);
  }, [search, semanticFlagOn]);

  // Mode A → Mode C opt-in tap. Flag on: dispatch semantic. Flag
  // off: show the preview toast so the CTA isn't a dead button
  // during the eval-gated rollout.
  const handleSemanticAccept = useCallback(() => {
    if (semanticFlagOn) {
      search.setMode('semantic');
      return;
    }
    toast('Semantic search is in preview', {
      description: 'We’re tuning this for accuracy. It’ll switch on for everyone once the eval rig is green.',
    });
  }, [search, semanticFlagOn]);

  // Mode C revert — "Search keywords instead" link.
  const handleSemanticRevert = useCallback(() => {
    search.setMode('lookup');
  }, [search]);

  const handleBuildYourSearch = useCallback(() => {
    onShowFiltersChange(true);
  }, [onShowFiltersChange]);

  const activeFilterCount =
    filters.services.length +
    (filters.contentType !== "all" ? 1 : 0) +
    (filters.costs.length > 0 ? 1 : 0) +
    (filters.runtime !== "any" ? 1 : 0) +
    filters.genres.length +
    (filters.minRating > 0 ? 1 : 0) +
    (filters.showWatched !== "all" ? 1 : 0) +
    filters.languages.length;

  // Per-axis pills for the results-page active-filter strip. Each
  // pill carries its own remove handler so the renderer doesn't have
  // to know which axis it's clearing.
  const activeFilterPills = useMemo(
    () => buildActiveFilterPills(filters, userServices ?? [], onFiltersChange),
    [filters, userServices, onFiltersChange],
  );

  // Filter-only browse mode — when the user opens FilterSheet via
  // "Build your search" and applies filters without typing a query.
  // useBrowse hits /discover/movie + /discover/tv with the filter set
  // and the user's providers, so we surface results purely on filter
  // criteria.
  //
  // `skip` gates the /discover round-trip: when the user is searching
  // by text OR filters are at default, useBrowse's results would be
  // ignored anyway. Calling the hook unconditionally satisfies React's
  // hooks rules; the skip flag prevents wasted network calls.
  const filtersAreDefault = useMemo(
    () => isDefaultFilters(filters, userServices ?? []),
    [filters, userServices],
  );
  const filterOnlyMode = !hasQuery && !filtersAreDefault;
  const browse = useBrowse(filters, providerIds, !filterOnlyMode, browseSortBy);

  // Phase Search V2 A10 — instrumentation. Hash values are derived
  // here; the useEffect bodies that emit live below `displayItems`.
  const impressionDedupRef = useRef<Set<string>>(new Set());
  const filterSetHash = useMemo(() => hashFilters(filters), [filters]);
  const queryTrimmed = search.query.trim();
  const queryHash = useMemo(
    () => (queryTrimmed ? hashString(queryTrimmed.toLowerCase()) : ''),
    [queryTrimmed],
  );
  const searchMode: 'lookup' | 'filter' = queryTrimmed.length >= 2 ? 'lookup' : 'filter';
  const lastFilterModeEmitRef = useRef<string>('');

  // Display items: in text-search mode the source is search.results;
  // in filter-only mode it's browse.items (TMDb /discover with the
  // filter set).
  const rawItems = filterOnlyMode ? browse.items : search.results;

  // Per-item availability — single source of truth for both surfaces.
  // Drives off-service tint, rent/buy price chip, and the cost filter
  // (via the availableTiers map). Snapshot fields restore the same
  // state across detail-page navigation.
  const availability = useItemAvailability(rawItems, userServices, {
    onlyOnMyServices: filters.onlyOnMyServices,
    initialUnavailableIds: initial?.unavailableIds,
    initialRentBuyPrices: initial?.rentBuyPrices,
    initialAvailableTiers: initial?.availableTiers,
    initialServiceBadges: initial?.serviceBadges,
  });

  const displayItems = useMemo(() => {
    // Drop items the availability check decided to remove (no UK
    // availability OR off-service + drop mode).
    let items = rawItems.filter((item) => !availability.removedIds.has(item.id));
    if (filters.costs.length > 0) {
      // Per-item availableTiers tells us which tiers the user can use
      // to watch each title (restricted to user services when on-
      // service; unrestricted when off-service). Items missing from
      // the map are still resolving — keep them visible until the
      // per-item flow lands so the grid doesn't churn empty during
      // availability resolution.
      const costSet = new Set(filters.costs);
      items = items.filter((item) => {
        const tiers = availability.availableTiers.get(item.id);
        if (!tiers) return true;
        for (const c of costSet) if (tiers.has(c)) return true;
        return false;
      });
    }
    if (filters.genres.length > 0) {
      const genreIdSet = new Set(filters.genres.map((name) => GENRE_NAME_TO_ID[name]).filter(Boolean));
      items = items.filter((item) =>
        item.genreIds?.some((id) => genreIdSet.has(id))
      );
    }
    if (filters.minRating > 0) {
      items = items.filter((item) => (item.rating || 0) >= filters.minRating);
    }
    if (filters.languages.length > 0) {
      items = items.filter((item) =>
        item.language ? filters.languages.includes(item.language) : true
      );
    }
    // Apply sort. `best` preserves source order — relevance for text
    // search, popularity for filter-only (TMDb's default). Explicit
    // sort modes override both, and since they're applied client-side
    // they work uniformly across search + browse paths.
    if (sortBy === "popularity") {
      items = [...items].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    } else if (sortBy === "rating") {
      items = [...items].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    } else if (sortBy === "a_z") {
      items = [...items].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "z_a") {
      items = [...items].sort((a, b) => b.title.localeCompare(a.title));
    }
    return items;
  }, [rawItems, filters.costs, filters.genres, filters.minRating, filters.languages, availability.removedIds, availability.availableTiers, sortBy]);

  // "Best match" in filter-only mode is taste-ranked — re-sort the
  // post-filter items by cosine similarity to the user's taste
  // vector. Text-search keeps its relevance order (the search-utils
  // re-rank already factors in taste as a tie-breaker), and other
  // sort modes ignore taste entirely. When the user has no taste
  // vector yet (pre-onboarding signal), best falls back to the
  // popularity ordering set by the items source.
  const tasteRankEnabled = filterOnlyMode && sortBy === "best" && !!tasteVector;
  const taste = useTasteRanking(displayItems, tasteVector ?? null, tasteRankEnabled);
  const finalItems = tasteRankEnabled && taste.rankedItems ? taste.rankedItems : displayItems;

  const isLoading = filterOnlyMode ? browse.loading : search.loading;

  // Keep availabilityRef in sync so the unmount snapshot captures the
  // latest state without re-rendering on every map mutation.
  availabilityRef.current = availability;

  // Auto-paginate to a minimum visible count. After per-item
  // availability settles, the grid often holds fewer items than the
  // user expects from page 1. Search and browse have different
  // expectations — search is targeted (3 pages × 20 ≈ 60 candidates
  // is plenty for a typed query), browse is scan-mode (the user
  // wants to skim a stack). Browse caps go higher.
  const MIN_VISIBLE_SEARCH = 4;
  const MIN_VISIBLE_BROWSE = 12;
  const MAX_AUTO_FETCH_PAGES_SEARCH = 3;
  const MAX_AUTO_FETCH_PAGES_BROWSE = 6;
  const autoFetchedRef = useRef(0);
  useEffect(() => {
    // Reset counter on fresh query / category change.
    autoFetchedRef.current = 0;
  }, [search.query, search.activeCategory]);
  useEffect(() => {
    // Auto-paginate covers both modes — TMDb's first page often
    // returns 20 candidates that the availability + post-filter prune
    // down to just 1–2 visible. Keep fetching the next page until
    // we've shown the user at least MIN_VISIBLE titles, capped at
    // MAX_AUTO_FETCH_PAGES so a query with no on-services hits doesn't
    // run forever.
    if (filterOnlyMode) {
      if (browse.loading) return;
      if (!browse.hasMore) return;
      if (autoFetchedRef.current >= MAX_AUTO_FETCH_PAGES_BROWSE) return;
      if (displayItems.length >= MIN_VISIBLE_BROWSE) return;
      autoFetchedRef.current += 1;
      browse.loadMore();
      return;
    }
    if (search.loading) return;
    if (search.query.trim().length < 2) return;
    if (!search.hasMore) return;
    if (autoFetchedRef.current >= MAX_AUTO_FETCH_PAGES_SEARCH) return;
    if (displayItems.length >= MIN_VISIBLE_SEARCH) return;
    autoFetchedRef.current += 1;
    search.loadMore();
  }, [filterOnlyMode, search.loading, search.hasMore, search.query, search.activeCategory, browse.loading, browse.hasMore, displayItems.length, search, browse]);

  // Search-surface card impressions — record once per (tmdbId, query,
  // filter set) tuple per session. Empty-state cards (recents / mood
  // chips) aren't search results so skip when no query AND filters
  // are at default.
  useEffect(() => {
    if (queryTrimmed.length < 2 && isDefaultFilters(filters, userServices ?? [])) return;
    if (displayItems.length === 0) return;
    const sessionId = getCurrentSessionId();
    displayItems.forEach((item, position) => {
      const { tmdbId } = parseContentItemId(item.id);
      if (Number.isNaN(tmdbId)) return;
      const key = `${tmdbId}:${sessionId}:${queryHash}:${filterSetHash}`;
      if (impressionDedupRef.current.has(key)) return;
      impressionDedupRef.current.add(key);
      recordImpression({
        contentId: tmdbId,
        sourceSurface: 'search',
        position,
        metadata: {
          mode: searchMode,
          query_hash: queryHash || null,
          filter_set_hash: filterSetHash,
        },
      });
    });
  }, [displayItems, queryHash, filterSetHash, searchMode, queryTrimmed, filters, userServices]);

  // Mode 'filter' search event — fires once per distinct filter-set
  // when the user is in a filter-only state (no query, ≥ 1 filter).
  // emitSearch's text-query path (mode=lookup) is owned by useSearch.
  useEffect(() => {
    if (queryTrimmed.length >= 2) return;
    if (isDefaultFilters(filters, userServices ?? [])) return;
    if (lastFilterModeEmitRef.current === filterSetHash) return;
    lastFilterModeEmitRef.current = filterSetHash;
    emitSearch('', displayItems.length, {
      mode: 'filter',
      metadata: { filter_set_hash: filterSetHash },
    });
  }, [filters, userServices, filterSetHash, queryTrimmed, displayItems.length]);

  // ── PLAT-1 §3: results-grid virtualization (E&P brief §5) ───────
  // Long grids chunk finalItems into 2-per-row pairs rendered through
  // a row virtualizer attached to the App-level scroll container.
  // Short grids (< 21 items — i.e. a typical page-1 result set) keep
  // the original markup, including BrowseCard's staggered entrance.
  const VIRTUALIZE_MIN = 21;
  const virtualizeGrid = finalItems.length >= VIRTUALIZE_MIN;
  const gridRowCount = virtualizeGrid ? Math.ceil(finalItems.length / 2) : 0;

  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Resolve the nearest scrollable ancestor and the grid's offset
  // within it. The deps cover the state that changes the height of
  // the content above the grid (sticky header rows, filter strip,
  // mode indicator, CTA); the guarded setState only re-renders when
  // the offset actually moved.
  useLayoutEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    if (!scrollParentRef.current) {
      let p: HTMLElement | null = el.parentElement;
      while (p) {
        const { overflowY } = window.getComputedStyle(p);
        if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") break;
        p = p.parentElement;
      }
      scrollParentRef.current = p;
    }
    const sp = scrollParentRef.current;
    if (!sp) return;
    const margin = Math.round(
      el.getBoundingClientRect().top - sp.getBoundingClientRect().top + sp.scrollTop,
    );
    setScrollMargin((prev) => (Math.abs(prev - margin) > 1 ? margin : prev));
  }, [finalItems.length, displayItems.length, searchFocused, hasQuery, isSearching, filtersAreDefault, activeFilterPills.length, search.mode, search.tooShort, search.shouldShowSemanticCTA, isLoading]);

  const rowVirtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: gridRowCount,
    getScrollElement: () => scrollParentRef.current,
    // 5/7 poster (~237px at 390px viewports) + 8px text offset +
    // ~47px title/meta + 12px row gap. measureElement corrects.
    estimateSize: () => 304,
    overscan: 4,
    scrollMargin,
    getItemKey: (index) => finalItems[index * 2]?.id ?? index,
  });

  // Single source for the card render so the virtual and non-virtual
  // paths share identical per-item availability decisions (badges,
  // off-service tint, rent/buy label) and the SAME flat-index click
  // context — `index` is always the position in finalItems, never the
  // virtual row index.
  const renderBrowseCard = (item: ContentItem, index: number, virtualized = false) => {
    // Override item.services with the matched/displayable
    // set from the availability check so the ServiceStack
    // reflects on-service vs "where it lives" intent.
    const badges = availability.serviceBadges.get(item.id);
    const renderItem = badges ? { ...item, services: badges } : item;
    return (
      <BrowseCard
        key={item.id}
        item={renderItem}
        index={index}
        virtualized={virtualized}
        onSelect={(selected) => {
          // ENG-1 Workstream D: stash the ranked origin for
          // position-at-click on downstream outcome events.
          const { tmdbId } = parseContentItemId(selected.id);
          if (!Number.isNaN(tmdbId)) {
            setCardClickContext({ contentId: tmdbId, position: index, surface: 'search' });
          }
          onItemSelect?.(selected);
        }}
        bookmarked={bookmarkedIds?.has(item.id)}
        onToggleBookmark={onToggleBookmark}
        userServices={userServices}
        watched={watchedIds?.has(item.id)}
        offService={availability.unavailableIds.has(item.id)}
        rentBuyPriceLabel={availability.rentBuyPrices.get(item.id)}
      />
    );
  };

  return (
    <div className="flex flex-col gap-0">
      {/* Sticky search + filter controls */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl pb-1" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))", backgroundColor: "var(--background)" }}>
        {/* Full-width search bar. The filter icon button used to live
            here on the right but moved below — from the empty state
            the user picks between typing and the "Build your search"
            CTA, so the icon was redundant. From the results page the
            Edit filters pill takes its place on a row below. */}
        <div className="px-5 mb-3">
          <div className="relative">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] pointer-events-none"
              style={{ color: "var(--fg-faint)" }}
            />
            <input
              type="text"
              placeholder="Search titles, moods, descriptions"
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(e) => {
                // Enter commits the query — blur dismisses the mobile
                // keyboard, which in turn drops the suggestions list
                // and surfaces the results grid.
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="w-full pl-10 pr-10 py-3 outline-none transition-all"
              style={{
                background: "var(--surface-elev)",
                border: "0.5px solid var(--hairline)",
                borderRadius: "var(--r-card)",
                color: "var(--fg)",
                fontFamily: "var(--font-ui)",
                fontSize: 14,
              }}
            />
            {search.query ? <button
                type="button"
                onClick={() => search.clearSearch()}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center"
                style={{
                  borderRadius: "var(--r-pill)",
                  background: "var(--surface-tint)",
                  color: "var(--fg-soft)",
                }}
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button> : null}
          </div>
        </div>

        {/* Controls row — Edit filters left, Sort right. Same pill
            height + font on both so they sit on a shared baseline.
            Hidden on the bare landing state (no query AND default
            filters). Sort only appears once results are showing
            (typing-only suggestions view drops it). */}
        {(hasQuery || !filtersAreDefault) ? <div className="px-5 mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onShowFiltersChange(true)}
              className="inline-flex items-center gap-1.5"
              style={{
                padding: "6px 12px",
                background: activeFilterCount > 0 ? "var(--primary-soft)" : "var(--surface-tint)",
                border: activeFilterCount > 0
                  ? "0.5px solid var(--primary-edge)"
                  : "0.5px solid var(--hairline)",
                borderRadius: "var(--r-pill)",
                color: activeFilterCount > 0 ? "var(--primary-fg-on-soft)" : "var(--fg)",
                fontFamily: "var(--font-ui)",
                fontSize: 12.5,
                fontWeight: 600,
                letterSpacing: "-0.005em",
              }}
              aria-label="Edit filters"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Edit filters</span>
              {activeFilterCount > 0 && (
                <span
                  className="inline-flex items-center justify-center"
                  style={{
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    borderRadius: "9999px",
                    background: "var(--primary)",
                    color: "#fff",
                    fontFamily: "var(--font-ui)",
                    fontSize: 10.5,
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>
            {!searchFocused && displayItems.length > 0 && (
              <div ref={sortMenuRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setSortMenuOpen((o) => !o)}
                  className="inline-flex items-center gap-1.5"
                  aria-haspopup="listbox"
                  aria-expanded={sortMenuOpen}
                  aria-label={`Sort: ${SORT_LABELS[sortBy]}`}
                  style={{
                    padding: "6px 12px",
                    background: sortMenuOpen ? "var(--primary-soft)" : "var(--surface-tint)",
                    border: sortMenuOpen
                      ? "0.5px solid var(--primary-edge)"
                      : "0.5px solid var(--hairline)",
                    borderRadius: "var(--r-pill)",
                    color: sortMenuOpen ? "var(--primary-fg-on-soft)" : "var(--fg)",
                    fontFamily: "var(--font-ui)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    letterSpacing: "-0.005em",
                    transition: "background var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out)",
                  }}
                >
                  <span style={{ color: "var(--fg-faint)" }}>Sort</span>
                  <span>{SORT_LABELS[sortBy]}</span>
                  <ChevronDown
                    className="w-3 h-3"
                    style={{
                      transform: sortMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform var(--d-fast) var(--ease-out)",
                    }}
                  />
                </button>
                {sortMenuOpen ? <div
                    role="listbox"
                    className="absolute z-30 flex flex-col py-1"
                    style={{
                      top: "calc(100% + 6px)",
                      right: 0,
                      minWidth: 160,
                      background: "var(--surface-elev)",
                      border: "0.5px solid var(--hairline)",
                      borderRadius: "var(--r-md)",
                      boxShadow: "var(--shadow-card)",
                    }}
                  >
                    {SORT_OPTIONS.map((opt) => {
                      const selected = sortBy === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            setSortBy(opt);
                            setSortMenuOpen(false);
                          }}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-left"
                          style={{
                            background: selected ? "var(--surface-tint)" : "transparent",
                            color: selected ? "var(--fg)" : "var(--fg-soft)",
                            fontFamily: "var(--font-ui)",
                            fontSize: 13,
                            fontWeight: selected ? 600 : 500,
                            letterSpacing: "-0.005em",
                          }}
                        >
                          <span>{SORT_LABELS[opt]}</span>
                          {selected ? <Check
                              className="w-3.5 h-3.5 shrink-0"
                              style={{ color: "var(--primary)" }}
                            /> : null}
                        </button>
                      );
                    })}
                  </div> : null}
              </div>
            )}
          </div> : null}

        {/* Category filter pills — editorial chip bar with kicker. */}
        {isSearching ? <div className="px-5 mb-3">
            <div
              className="t-kicker"
              style={{ marginBottom: 8 }}
            >
              FILTER
            </div>
            <div className="flex items-center gap-2">
              {browseCategories.map((category) => {
                const isActive = category === search.activeCategory;
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => search.setActiveCategory(category)}
                    className="px-3 py-1.5 whitespace-nowrap"
                    style={{
                      background: isActive ? "var(--primary-soft)" : "transparent",
                      color: isActive ? "var(--primary)" : "var(--fg-soft)",
                      border: isActive
                        ? "1px solid color-mix(in srgb, var(--primary) 50%, transparent)"
                        : "1px solid var(--hairline)",
                      borderRadius: "var(--r-pill)",
                      fontFamily: "var(--font-ui)",
                      fontSize: 13,
                      fontWeight: isActive ? 600 : 500,
                      letterSpacing: "0.01em",
                      transition: "background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out)",
                    }}
                  >
                    {category}
                  </button>
                );
              })}
            </div>
          </div> : null}

      </div>

      {/* Content area */}
      <div className="px-5">
        {/* Empty state — Phase Search V2 A3 per artboard 01.
            Three composable journeys: recents (history shortcut),
            "Build your search" (filter-only browse), and mood chips
            (atmospheric entry points). Hidden the moment the user
            types OR applies any filter. */}
        {!hasQuery && !isLoading && filtersAreDefault ? <div className="flex flex-col pt-4 pb-8 gap-8">
            {/* RECENT — only renders when the user has prior queries */}
            {recents.length > 0 && (
              <section className="flex flex-col">
                <header className="flex items-center justify-between mb-3">
                  <span className="t-kicker">RECENT</span>
                  <button
                    type="button"
                    onClick={handleClearRecents}
                    className="t-kicker"
                    style={{ color: "var(--fg-faint)", letterSpacing: "1.4px" }}
                    aria-label="Clear recent searches"
                  >
                    CLEAR
                  </button>
                </header>
                <ul className="flex flex-col">
                  {recents.slice(0, 5).map((query) => (
                    <li
                      key={query}
                      className="flex items-center justify-between gap-3 py-3"
                      style={{ borderBottom: "0.5px solid var(--hairline)" }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectRecent(query)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <Clock className="w-4 h-4 shrink-0" style={{ color: "var(--fg-faint)" }} />
                        <span
                          className="truncate"
                          style={{
                            fontFamily: "var(--font-ui)",
                            fontSize: 14,
                            fontWeight: 500,
                            color: "var(--fg)",
                          }}
                        >
                          {query}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDismissRecent(query)}
                        className="w-7 h-7 flex items-center justify-center shrink-0"
                        style={{ color: "var(--fg-faint)" }}
                        aria-label={`Remove ${query} from recent searches`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Browse-by-filter CTA — full-width, opens FilterSheet
                standalone. Per design brief §3.1: the orange weight is
                intentional; this is the larger of the two journeys. */}
            <button
              type="button"
              onClick={handleBuildYourSearch}
              className="flex flex-col items-start text-left"
              style={{
                padding: "20px 22px",
                borderRadius: "var(--r-lg)",
                background: "var(--primary)",
                color: "#fff",
              }}
            >
              <span className="flex items-center gap-3">
                <SlidersHorizontal className="w-5 h-5" />
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 19,
                    fontWeight: 600,
                    fontVariationSettings: '"opsz" 36',
                    letterSpacing: "-0.01em",
                    lineHeight: 1.15,
                  }}
                >
                  Build your search
                </span>
              </span>
              <span
                style={{
                  marginTop: 4,
                  marginLeft: 32,
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  fontWeight: 500,
                  opacity: 0.85,
                  lineHeight: 1.3,
                }}
              >
                Pick service, cost, runtime, genre, rating — Apply to browse the matches.
              </span>
            </button>

            {/* Mood-chip grid — 2×2. Each chip seeds a search query
                with the mood label. Hue maps to the editorial atmosphere
                accents in index.css so the chips read as related but
                distinct. */}
            <section className="flex flex-col">
              <header className="flex flex-col mb-3">
                <span className="t-kicker">OR START WITH A FEELING</span>
                <span
                  style={{
                    marginTop: 4,
                    fontFamily: "var(--font-ui)",
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--fg-faint)",
                  }}
                >
                  Tap to search the mood.
                </span>
              </header>
              <div className="grid grid-cols-2 gap-2">
                <MoodChip
                  icon={<Leaf className="w-3.5 h-3.5" strokeWidth={2} />}
                  label="Slow burn"
                  sub="Patient & quiet"
                  hue="var(--atm-teal)"
                  onClick={() => handleMoodChip("Slow burn")}
                />
                <MoodChip
                  icon={<Zap className="w-3.5 h-3.5" strokeWidth={2} />}
                  label="Quick hit"
                  sub="Under 90 min"
                  hue="var(--atm-amber)"
                  onClick={() => handleMoodChip("Quick hit")}
                />
                <MoodChip
                  icon={<Moon className="w-3.5 h-3.5" strokeWidth={2} />}
                  label="Late-night"
                  sub="Strange & dark"
                  hue="var(--atm-violet)"
                  onClick={() => handleMoodChip("Late-night")}
                />
                <MoodChip
                  icon={<Heart className="w-3.5 h-3.5" strokeWidth={2} />}
                  label="Comfort"
                  sub="A favourite kind"
                  hue="var(--atm-rose)"
                  onClick={() => handleMoodChip("Comfort")}
                />
              </div>
            </section>
          </div> : null}

        {/* Typing view — suggestions list under the input. Renders
            while the input is focused so the user sees dense matches
            as they type. Enter (or tapping out) blurs the input and
            surfaces the full results grid below. */}
        {searchFocused && hasQuery ? <SearchSuggestions
            query={search.query}
            items={displayItems}
            loading={isLoading}
            tooShort={search.tooShort}
            onSelect={(item) => onItemSelect?.(item)}
          /> : null}

        {/* Submitted view — full results grid */}
        {!searchFocused && hasQuery && search.tooShort ? <div className="flex flex-col items-center justify-center py-20 text-center">
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontSize: 14,
                fontWeight: 500,
                color: "var(--fg-soft)",
              }}
            >
              Keep typing…
            </p>
          </div> : null}

        {!searchFocused && isLoading && displayItems.length === 0 && (isSearching || filterOnlyMode) ? <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div> : null}

        {/* Mode A → Mode C opt-in CTA. Renders when useSearch
            decides the current Mode A query looks free-text and
            sparse. Tap dispatches Mode C when flag on, or shows a
            preview toast when off — handler decides. Above any
            sparse-grid render so the user sees the CTA even when
            results.length is 0–2. */}
        {!searchFocused && search.shouldShowSemanticCTA ? <SearchSemanticCTA query={search.query} onAccept={handleSemanticAccept} /> : null}

        {!searchFocused && displayItems.length > 0 && (
          <>
            {/* Mode C indicator — italic Fraunces "Showing titles
                like '…'" + revert link. Only renders in semantic
                mode so Mode A grids stay un-prefixed. */}
            {search.mode === 'semantic' && (
              <SearchModeIndicator query={search.query} onRevert={handleSemanticRevert} />
            )}

            {/* Active-filter strip — only when ≥ 1 filter active.
                Kicker "N FILTERS · CLEAR" + horizontally-scrolling
                pills + count row + Edit-filters shortcut. */}
            {activeFilterPills.length > 0 && (
              <div className="flex flex-col mb-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="t-kicker">
                    {activeFilterPills.length} {activeFilterPills.length === 1 ? "FILTER" : "FILTERS"}
                  </span>
                  <button
                    type="button"
                    onClick={() => clearAllActiveFilters(userServices ?? [], onFiltersChange)}
                    className="t-kicker"
                    style={{ color: "var(--fg-faint)" }}
                    aria-label="Clear all filters"
                  >
                    CLEAR
                  </button>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
                  {activeFilterPills.map((p) => (
                    <ActiveFilterPill key={p.key} label={p.label} onRemove={p.onRemove} />
                  ))}
                </div>
                {/* Count row + inline Edit-filters pill removed — the
                    counts were too coarse to be useful (TMDb totals
                    in the thousands), and the filter sheet is one tap
                    away via the sliders icon next to the search bar. */}
              </div>
            )}

            {virtualizeGrid ? (
              /* Virtualized path — one absolutely-positioned virtual
                 row per item pair, rendered with the same
                 `grid grid-cols-2 gap-3` shell. The inter-row gap is
                 baked into each row as padding so measured heights
                 include it (last row stays flush, as today). */
              <div
                ref={gridWrapRef}
                className="relative w-full"
                style={{ height: rowVirtualizer.getTotalSize() }}
              >
                {rowVirtualizer.getVirtualItems().map((vRow) => (
                  <div
                    key={vRow.key}
                    data-index={vRow.index}
                    ref={rowVirtualizer.measureElement}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${vRow.start - rowVirtualizer.options.scrollMargin}px)` }}
                  >
                    <div
                      className="grid grid-cols-2 gap-3"
                      style={{ paddingBottom: vRow.index === gridRowCount - 1 ? 0 : 12 }}
                    >
                      {[vRow.index * 2, vRow.index * 2 + 1].map((flatIndex) => {
                        const item = finalItems[flatIndex];
                        return item ? renderBrowseCard(item, flatIndex, true) : null;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {finalItems.map((item, index) => renderBrowseCard(item, index))}
              </div>
            )}
          </>
        )}

        {/* No-results state — redesigned per artboard. Distinguishes
            "no matches for this query at all" from "matches exist but
            filters are too tight." */}
        {!searchFocused && !isLoading && displayItems.length === 0 && !search.tooShort && (isSearching || filterOnlyMode) ? <div className="flex flex-col items-start py-12">
            <Search className="w-8 h-8 mb-4" style={{ color: "var(--fg-faint)" }} />
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 19,
                fontWeight: 600,
                fontVariationSettings: '"opsz" 24',
                color: "var(--fg)",
                letterSpacing: "-0.01em",
                lineHeight: 1.2,
                margin: 0,
                marginBottom: 8,
              }}
            >
              {activeFilterPills.length > 0
                ? "Nothing matches this combination."
                : `No matches for ‘${search.query.trim()}’.`}
            </p>
            <p
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--fg-soft)",
                lineHeight: 1.45,
                margin: 0,
                marginBottom: 16,
              }}
            >
              {activeFilterPills.length > 0
                ? "Loosen a filter to widen the catch — Edit filters opens the sheet, or drop one chip below."
                : "Try a different spelling or a related phrase."}
            </p>
            {activeFilterPills.length > 0 && (
              <button
                type="button"
                onClick={() => onShowFiltersChange(true)}
                className="inline-flex items-center gap-2"
                style={{
                  padding: "8px 14px",
                  background: "var(--primary)",
                  color: "#fff",
                  borderRadius: "var(--r-pill)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Edit filters
              </button>
            )}
          </div> : null}

        {/* Load more — covers both modes. Auto-paginate fills the
            grid to the per-mode visible threshold; this button is the
            user's explicit "give me more" once they're past it. */}
        {((filterOnlyMode && browse.hasMore) || (!filterOnlyMode && search.hasMore)) && displayItems.length > 0 ? <div className="flex justify-center py-6">
            <button
              type="button"
              onClick={() => (filterOnlyMode ? browse.loadMore() : search.loadMore())}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 transition-colors"
              style={{
                padding: "8px 18px",
                background: "var(--surface-tint)",
                border: "0.5px solid var(--hairline)",
                borderRadius: "var(--r-pill)",
                color: "var(--fg)",
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "-0.005em",
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load more"}
            </button>
          </div> : null}
      </div>

      {/* Filter Sheet */}
      <FilterSheet
        isOpen={showFilters}
        onClose={() => onShowFiltersChange(false)}
        filters={filters}
        onApply={onFiltersChange}
        userServices={providerIdsToServiceIds(providerIds)}
      />
    </div>
  );
}
