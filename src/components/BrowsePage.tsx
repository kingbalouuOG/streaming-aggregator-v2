import React, { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { Search, X, SlidersHorizontal, Loader2, Clock, Leaf, Zap, Moon, Heart } from "lucide-react";
import { BrowseCard } from "./BrowseCard";
import { ContentItem } from "./ContentCard";
import { FilterSheet, FilterState, ALL_GENRES, FILTER_LANGUAGES } from "./FilterSheet";
import { MoodChip } from "./MoodChip";
import { SearchSuggestions } from "./search/SearchSuggestions";
import { useSearch } from "@/hooks/useSearch";
import { providerIdsToServiceIds } from "@/lib/adapters/platformAdapter";
import { GENRE_NAME_TO_ID } from "@/lib/constants/genres";
import { useFilterUrlSync } from "@/lib/search/useFilterUrlSync";
import {
  getRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
} from "@/lib/search/recentSearches";
import type { ServiceId } from "./platformLogos";

const browseCategories = ["All", "Movies", "TV"];

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

  const search = useSearch(userServices, initial?.query, initial?.results, {
    onlyOnMyServices: filters.onlyOnMyServices,
    initialUnavailableIds: initial?.unavailableIds,
    initialRentBuyPrices: initial?.rentBuyPrices,
    initialAvailableTiers: initial?.availableTiers,
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

  // Ref to track latest values for unmount cleanup
  const searchRef = useRef(search);
  searchRef.current = search;

  // Save state back to ref on unmount
  useEffect(() => {
    return () => {
      if (savedState) {
        savedState.current = {
          query: searchRef.current.query,
          results: searchRef.current.results,
          activeCategory: searchRef.current.activeCategory,
          unavailableIds: Array.from(searchRef.current.unavailableIds),
          rentBuyPrices: Array.from(searchRef.current.rentBuyPrices.entries()),
          availableTiers: Array.from(searchRef.current.availableTiers.entries()).map(
            ([id, tiers]) => [id, Array.from(tiers)] as [string, ('free' | 'rent' | 'buy')[]],
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

  const handleBrowseByFilter = useCallback(() => {
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

  // Display items: search results, filtered by cost/genre/rating/language
  const rawItems = search.results;
  const displayItems = useMemo(() => {
    let items = rawItems;
    if (filters.costs.length > 0) {
      // Per-item availableTiers tells us which tiers the user can use
      // to watch each title (restricted to user services when on-
      // service; unrestricted when off-service). Item passes the cost
      // filter when the intersection with the selected costs is non-
      // empty. Items missing from the map are still resolving — keep
      // them visible until the per-item flow lands so the grid
      // doesn't churn empty during availability resolution.
      const costSet = new Set(filters.costs);
      items = items.filter((item) => {
        const tiers = search.availableTiers.get(item.id);
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
  }, [rawItems, filters.costs, filters.genres, filters.minRating, filters.languages, search.availableTiers]);
  const isLoading = search.loading;

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
            Browse-by-filter (custom search), and mood chips (atmospheric
            entry points). All hidden the moment the user types. */}
        {!hasQuery && !isLoading && (
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
              onClick={handleBrowseByFilter}
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
                  Browse by filter
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
                Service, genre, runtime, rating — build the query that fits your night.
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

        {!searchFocused && isLoading && displayItems.length === 0 && isSearching && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {!searchFocused && displayItems.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {displayItems.map((item, index) => (
              <BrowseCard key={item.id} item={item} index={index} onSelect={onItemSelect} bookmarked={bookmarkedIds?.has(item.id)} onToggleBookmark={onToggleBookmark} userServices={userServices} watched={watchedIds?.has(item.id)} offService={search.unavailableIds.has(item.id)} rentBuyPriceLabel={search.rentBuyPrices.get(item.id)} />
            ))}
          </div>
        )}

        {/* No results state — only on the submitted view */}
        {!searchFocused && isSearching && !isLoading && displayItems.length === 0 && search.results.length >= 0 && !search.tooShort && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-[15px]" style={{ fontWeight: 500 }}>
              No results found
            </p>
            <p className="text-muted-foreground/60 text-[13px] mt-1">
              Try a different search term
            </p>
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
