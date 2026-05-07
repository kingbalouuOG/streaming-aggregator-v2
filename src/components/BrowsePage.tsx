import React, { useMemo, useEffect, useRef } from "react";
import { Search, X, SlidersHorizontal, Loader2 } from "lucide-react";
import { BrowseCard } from "./BrowseCard";
import { ContentItem } from "./ContentCard";
import { FilterSheet, FilterState } from "./FilterSheet";
import { useSearch } from "@/hooks/useSearch";
import { providerIdsToServiceIds } from "@/lib/adapters/platformAdapter";
import { GENRE_NAME_TO_ID } from "@/lib/constants/genres";
import type { ServiceId } from "./platformLogos";

const browseCategories = ["All", "Movies", "TV"];

export interface BrowseStateSnapshot {
  query: string;
  results: ContentItem[];
  activeCategory: string;
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
        };
      }
    };
  }, [savedState]);

  const hasQuery = search.query.trim().length > 0;
  const isSearching = search.query.trim().length >= 2;

  const activeFilterCount =
    filters.services.length +
    (filters.contentType !== "All" ? 1 : 0) +
    (filters.cost !== "All" ? 1 : 0) +
    filters.genres.length +
    (filters.minRating > 0 ? 1 : 0) +
    filters.languages.length;

  // Display items: search results, filtered by genre/rating/language
  const rawItems = search.results;
  const displayItems = useMemo(() => {
    let items = rawItems;
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
  }, [rawItems, filters.genres, filters.minRating, filters.languages]);
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
              placeholder="Search movies and TV shows…"
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
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
              background: activeFilterCount > 0 ? "var(--primary)" : "var(--surface-elev)",
              border: activeFilterCount > 0 ? "none" : "0.5px solid var(--hairline)",
              borderRadius: "var(--r-card)",
              color: activeFilterCount > 0 ? "#fff" : "var(--fg-soft)",
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
                  color: "#fff",
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
                      background: isActive ? "var(--primary)" : "var(--surface-tint)",
                      color: isActive ? "#fff" : "var(--fg-soft)",
                      borderRadius: "var(--r-pill)",
                      fontFamily: "var(--font-ui)",
                      fontSize: 13,
                      fontWeight: isActive ? 600 : 500,
                      letterSpacing: "0.01em",
                      transition: "background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out)",
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
        {/* Empty default state — editor's-note tone */}
        {!hasQuery && !isLoading && (
          <div className="flex flex-col items-start py-16">
            <span className="t-kicker" style={{ marginBottom: 12 }}>
              EDITOR'S NOTE · BROWSE
            </span>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--t-headline)",
                fontWeight: 600,
                fontVariationSettings: '"opsz" 48',
                letterSpacing: "-0.01em",
                color: "var(--fg)",
                lineHeight: 1.15,
                margin: 0,
                marginBottom: 12,
              }}
            >
              What are you in the mood for?
            </h2>
            <p
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontSize: "var(--t-body)",
                color: "var(--fg-soft)",
                lineHeight: 1.45,
                margin: 0,
              }}
            >
              Search movies and TV shows — we'll show you where they're available across your stack.
            </p>
          </div>
        )}

        {/* Too short query state */}
        {search.tooShort && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-muted-foreground text-[13px]">Keep typing to search...</p>
          </div>
        )}

        {/* Loading state */}
        {isLoading && displayItems.length === 0 && isSearching && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {/* Results grid */}
        {displayItems.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {displayItems.map((item, index) => (
              <BrowseCard key={item.id} item={item} index={index} onSelect={onItemSelect} bookmarked={bookmarkedIds?.has(item.id)} onToggleBookmark={onToggleBookmark} userServices={userServices} watched={watchedIds?.has(item.id)} />
            ))}
          </div>
        )}

        {/* No results state */}
        {isSearching && !isLoading && displayItems.length === 0 && search.results.length >= 0 && !search.tooShort && (
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
        connectedServices={providerIdsToServiceIds(providerIds)}
      />
    </div>
  );
}
