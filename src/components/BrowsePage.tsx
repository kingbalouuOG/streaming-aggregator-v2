import React, { useState, useMemo } from "react";
import { Search, X, SlidersHorizontal, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { BrowseCard } from "./BrowseCard";
import { ContentItem } from "./ContentCard";
import { FilterSheet, FilterState, defaultFilters } from "./FilterSheet";
import { useSearch } from "@/hooks/useSearch";
import { useBrowse } from "@/hooks/useBrowse";
import { providerIdsToServiceIds } from "@/lib/adapters/platformAdapter";
import type { ServiceId } from "./platformLogos";

const browseCategories = ["All", "Movies", "TV"];

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
}

export function BrowsePage({ onItemSelect, filters, onFiltersChange, showFilters, onShowFiltersChange, bookmarkedIds, onToggleBookmark, providerIds = [], userServices }: BrowsePageProps) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const search = useSearch();
  const isSearching = search.query.trim().length > 0;

  // Build filters with category override (memoized to avoid unstable object refs)
  const browseFilters: FilterState = useMemo(() => ({
    ...filters,
    contentType: activeCategory === "Movies" ? "Movies" : activeCategory === "TV" ? "TV" : filters.contentType,
  }), [filters, activeCategory]);
  const browse = useBrowse(browseFilters, providerIds);

  const handleSearchSelect = (term: string) => {
    search.setQuery(term);
    setIsSearchFocused(false);
    if (!recentSearches.includes(term)) {
      setRecentSearches((prev) => [term, ...prev].slice(0, 5));
    }
  };

  const handleSearchSubmit = () => {
    if (search.query.trim() && !recentSearches.includes(search.query.trim())) {
      setRecentSearches((prev) => [search.query.trim(), ...prev].slice(0, 5));
    }
    setIsSearchFocused(false);
  };

  const showSuggestions = isSearchFocused && !search.query.trim();

  const activeFilterCount =
    filters.services.length +
    (filters.contentType !== "All" ? 1 : 0) +
    (filters.cost !== "All" ? 1 : 0) +
    filters.genres.length +
    (filters.minRating > 0 ? 1 : 0);

  // Display items: search results or browse results
  const displayItems = isSearching ? search.results : browse.items;
  const isLoading = isSearching ? search.loading : browse.loading;

  return (
    <div className="flex flex-col gap-0">
      {/* Sticky search + filter controls */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl pb-1" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))", backgroundColor: "var(--background)" }}>
        {/* Search bar + Filter button */}
        <div className="px-4 mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search movies and TV shows..."
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
              className="w-full bg-secondary rounded-xl pl-10 pr-10 py-3 text-[14px] text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/40 transition-all"
            />
            {search.query && (
              <button
                onClick={() => search.clearSearch()}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={() => onShowFiltersChange(true)}
            className={`relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 ${
              activeFilterCount > 0
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            <SlidersHorizontal className="w-[18px] h-[18px]" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4.5 h-4.5 min-w-[18px] rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center border-2 border-background" style={{ fontWeight: 700 }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Category filter pills (hidden during search) */}
        {!isSearching && (
          <div className="flex items-center gap-2 px-4 mb-3">
            {browseCategories.map((category) => {
              const isActive = category === activeCategory;
              return (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`px-4 py-1.5 rounded-full text-[13px] whitespace-nowrap transition-all duration-200 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        )}

        {/* Search suggestions dropdown */}
        <AnimatePresence>
          {showSuggestions && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="px-4 pb-4"
            >
              <div className="bg-secondary/80 backdrop-blur-lg rounded-2xl border p-4" style={{ borderColor: "var(--border-subtle)" }}>
                {recentSearches.length > 0 && (
                  <div className="mb-4">
                    <p className="text-muted-foreground text-[11px] tracking-widest mb-2.5" style={{ fontWeight: 600 }}>
                      RECENT
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {recentSearches.map((term) => (
                        <button
                          key={term}
                          onMouseDown={(e) => { e.preventDefault(); handleSearchSelect(term); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] text-foreground text-[12px] hover:bg-accent transition-colors"
                          style={{ background: "var(--overlay-subtle)" }}
                        >
                          <Search className="w-3 h-3 text-muted-foreground" />
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content grid */}
      <div className="px-4">
        {isLoading && displayItems.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : displayItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {displayItems.map((item, index) => (
              <BrowseCard key={item.id} item={item} index={index} onSelect={onItemSelect} bookmarked={bookmarkedIds?.has(item.id)} onToggleBookmark={onToggleBookmark} userServices={userServices} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Search className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-[15px]" style={{ fontWeight: 500 }}>
              {isSearching ? "No results found" : "No content available"}
            </p>
            <p className="text-muted-foreground/60 text-[13px] mt-1">
              {isSearching ? "Try a different search term" : "Try adjusting your filters"}
            </p>
          </div>
        )}

        {/* Load more for browse (not search) */}
        {!isSearching && browse.hasMore && displayItems.length > 0 && (
          <div className="flex justify-center py-6">
            <button
              onClick={browse.loadMore}
              disabled={browse.loading}
              className="px-6 py-2 rounded-full bg-secondary text-foreground text-[13px] hover:bg-accent transition-colors"
            >
              {browse.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load More"}
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
