import React, { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { Search, X, SlidersHorizontal, Loader2, Clock, Leaf, Zap, Moon, Heart } from "lucide-react";
import { BrowseCard } from "./BrowseCard";
import { ContentItem } from "./ContentCard";
import { FilterSheet, FilterState, ALL_GENRES, FILTER_LANGUAGES } from "./FilterSheet";
import { MoodChip } from "./MoodChip";
import { SearchSuggestions } from "./search/SearchSuggestions";
import { useSearch } from "@/hooks/useSearch";
import { useBrowse } from "@/hooks/useBrowse";
import { useItemAvailability } from "@/hooks/useItemAvailability";
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
}

export function BrowsePage({ onItemSelect, filters, onFiltersChange, showFilters, onShowFiltersChange, bookmarkedIds, onToggleBookmark, providerIds = [], userServices, watchedIds, savedState }: BrowsePageProps) {
  const initial = savedState?.current;

  const search = useSearch(userServices, initial?.query, initial?.results);

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

  // Mood-chip tap → populate query + submit as a regular search. When
  // Cluster B (semantic search) lands, this will dispatch Mode C; for
  // now it's plain Mode A keyword search.
  const handleMoodChip = useCallback((phrase: string) => {
    search.setQuery(phrase);
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
  const browse = useBrowse(filters, providerIds, !filterOnlyMode);

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
    return items;
  }, [rawItems, filters.costs, filters.genres, filters.minRating, filters.languages, availability.removedIds, availability.availableTiers]);
  const isLoading = filterOnlyMode ? browse.loading : search.loading;

  // Keep availabilityRef in sync so the unmount snapshot captures the
  // latest state without re-rendering on every map mutation.
  availabilityRef.current = availability;

  // Auto-paginate to a minimum visible count. After per-item
  // availability settles, the grid often holds fewer items than the
  // user expects from page 1 — TMDb returns 40 candidates per page;
  // filtering can leave 0–3 visible. Keep fetching the next page
  // until we've shown the user at least MIN_VISIBLE titles, capped at
  // MAX_AUTO_FETCH_PAGES to avoid runaway when a query has no on-
  // services hits at all.
  const MIN_VISIBLE = 4;
  const MAX_AUTO_FETCH_PAGES = 3;
  const autoFetchedRef = useRef(0);
  useEffect(() => {
    // Reset counter on fresh query / category change.
    autoFetchedRef.current = 0;
  }, [search.query, search.activeCategory]);
  useEffect(() => {
    if (filterOnlyMode) return; // Auto-paginate only applies to text search
    if (search.loading) return;
    if (search.query.trim().length < 2) return;
    if (!search.hasMore) return;
    if (autoFetchedRef.current >= MAX_AUTO_FETCH_PAGES) return;
    if (displayItems.length >= MIN_VISIBLE) return;
    autoFetchedRef.current += 1;
    search.loadMore();
  }, [filterOnlyMode, search.loading, search.hasMore, search.query, search.activeCategory, displayItems.length, search]);

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

  return (
    <div className="flex flex-col gap-0">
      {/* Sticky search + filter controls */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl pb-1" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))", backgroundColor: "var(--background)" }}>
        {/* Search bar + Filter button — editorial paper/ink surface. */}
        <div className="px-5 mb-3 flex gap-2">
          <div className="relative flex-1">
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
            {search.query && (
              <button
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
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => onShowFiltersChange(true)}
            className="relative w-11 h-11 flex items-center justify-center shrink-0 transition-all duration-200"
            style={{
              background: activeFilterCount > 0 ? "var(--primary-soft)" : "var(--surface-elev)",
              border: activeFilterCount > 0
                ? "1px solid color-mix(in srgb, var(--primary) 50%, transparent)"
                : "0.5px solid var(--hairline)",
              borderRadius: "var(--r-card)",
              color: activeFilterCount > 0 ? "var(--primary)" : "var(--fg-soft)",
            }}
            aria-label="Filters"
          >
            <SlidersHorizontal className="w-[18px] h-[18px]" />
            {activeFilterCount > 0 && (
              <span
                className="absolute -top-1 -right-1 inline-flex items-center justify-center"
                style={{
                  minWidth: 18,
                  height: 18,
                  padding: "0 4px",
                  borderRadius: "var(--r-pill)",
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 10,
                  fontWeight: 700,
                  border: "2px solid var(--surface)",
                }}
              >
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Category filter pills — editorial chip bar with kicker. */}
        {isSearching && (
          <div className="px-5 mb-3">
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
          </div>
        )}

      </div>

      {/* Content area */}
      <div className="px-5">
        {/* Empty state — Phase Search V2 A3 per artboard 01.
            Three composable journeys: recents (history shortcut),
            "Build your search" (filter-only browse), and mood chips
            (atmospheric entry points). Hidden the moment the user
            types OR applies any filter. */}
        {!hasQuery && !isLoading && filtersAreDefault && (
          <div className="flex flex-col pt-4 pb-8 gap-8">
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
          </div>
        )}

        {/* Typing view — suggestions list under the input. Renders
            while the input is focused so the user sees dense matches
            as they type. Enter (or tapping out) blurs the input and
            surfaces the full results grid below. */}
        {searchFocused && hasQuery && (
          <SearchSuggestions
            query={search.query}
            items={displayItems}
            loading={isLoading}
            tooShort={search.tooShort}
            onSelect={(item) => onItemSelect?.(item)}
          />
        )}

        {/* Submitted view — full results grid */}
        {!searchFocused && hasQuery && search.tooShort && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
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
          </div>
        )}

        {!searchFocused && isLoading && displayItems.length === 0 && (isSearching || filterOnlyMode) && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {!searchFocused && displayItems.length > 0 && (
          <>
            {/* Mode indicator row — copy adapts to the source:
                  text search → "Results for '<query>' · N in your stack"
                  filter-only → "Filter results · N titles"
                The bolded value contrasts against the faint surround. */}
            <div
              className="flex items-baseline gap-1 mb-3"
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--fg-soft)",
                letterSpacing: "-0.005em",
              }}
            >
              {filterOnlyMode ? (
                <span>
                  Filter results{" "}
                  <span style={{ color: "var(--fg-faint)" }}>
                    · {displayItems.length} {displayItems.length === 1 ? "title" : "titles"}
                  </span>
                </span>
              ) : (
                <>
                  <span>
                    Results for{" "}
                    <span style={{ color: "var(--fg)", fontWeight: 600 }}>
                      &lsquo;{search.query.trim()}&rsquo;
                    </span>
                  </span>
                  {filters.onlyOnMyServices && (
                    <span style={{ color: "var(--fg-faint)" }}>
                      · {displayItems.length - availability.unavailableIds.size} in your stack
                    </span>
                  )}
                </>
              )}
            </div>

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
                <div
                  className="flex items-center justify-between mt-3 pt-3"
                  style={{ borderTop: "0.5px solid var(--hairline)" }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: 13,
                      color: "var(--fg-soft)",
                    }}
                  >
                    <span style={{ color: "var(--fg)", fontWeight: 700 }}>
                      {displayItems.length} {displayItems.length === 1 ? "title" : "titles"}
                    </span>{" "}
                    match{displayItems.length === 1 ? "es" : ""} all {activeFilterPills.length}{" "}
                    filter{activeFilterPills.length === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onShowFiltersChange(true)}
                    className="inline-flex items-center gap-1.5 shrink-0"
                    style={{
                      padding: "5px 10px",
                      background: "var(--primary-soft)",
                      border: "0.5px solid var(--primary-edge)",
                      borderRadius: "var(--r-pill)",
                      color: "var(--primary-fg-on-soft)",
                      fontFamily: "var(--font-ui)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Edit filters
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {displayItems.map((item, index) => {
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
                    onSelect={onItemSelect}
                    bookmarked={bookmarkedIds?.has(item.id)}
                    onToggleBookmark={onToggleBookmark}
                    userServices={userServices}
                    watched={watchedIds?.has(item.id)}
                    offService={availability.unavailableIds.has(item.id)}
                    rentBuyPriceLabel={availability.rentBuyPrices.get(item.id)}
                  />
                );
              })}
            </div>
          </>
        )}

        {/* No-results state — redesigned per artboard. Distinguishes
            "no matches for this query at all" from "matches exist but
            filters are too tight." */}
        {!searchFocused && !isLoading && displayItems.length === 0 && !search.tooShort && (isSearching || filterOnlyMode) && (
          <div className="flex flex-col items-start py-12">
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
                : `No matches for &lsquo;${search.query.trim()}&rsquo;.`}
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
          </div>
        )}

        {/* Load more for search */}
        {search.hasMore && displayItems.length > 0 && (
          <div className="flex justify-center py-6">
            <button
              onClick={search.loadMore}
              disabled={search.loading}
              className="px-6 py-2 rounded-full bg-secondary text-foreground text-[13px] hover:bg-accent transition-colors"
            >
              {search.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load More"}
            </button>
          </div>
        )}
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
