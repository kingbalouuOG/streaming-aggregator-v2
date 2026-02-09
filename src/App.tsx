import React, { useState, useCallback, useRef, useMemo } from "react";
import { toast, Toaster } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { Loader2 } from "lucide-react";
import { CategoryFilter } from "./components/CategoryFilter";
import { ContentRow } from "./components/ContentRow";
import { FeaturedHero } from "./components/FeaturedHero";
import { BottomNav } from "./components/BottomNav";
import { ContentItem } from "./components/ContentCard";
import { BrowsePage } from "./components/BrowsePage";
import { DetailPage } from "./components/DetailPage";
import { FilterSheet, FilterState, defaultFilters } from "./components/FilterSheet";
import { WatchlistPage } from "./components/WatchlistPage";
import { ProfilePage } from "./components/ProfilePage";
import { OnboardingFlow, OnboardingData } from "./components/OnboardingFlow";
import { ThemeProvider, useTheme } from "./components/ThemeContext";
import { useUserPreferences } from "./hooks/useUserPreferences";
import { useWatchlist } from "./hooks/useWatchlist";
import { useContentService } from "./hooks/useContentService";
import { useRecommendations } from "./hooks/useRecommendations";
import { providerIdsToServiceIds } from "./lib/adapters/platformAdapter";
import { serviceIdsToProviderIds, providerIdToServiceId } from "./lib/adapters/platformAdapter";
import { GENRE_NAMES } from "./lib/constants/genres";
import type { ServiceId } from "./components/platformLogos";

const categories = ["All", "Movies", "TV Shows", "Docs", "Anime"];

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const { resolvedTheme } = useTheme();
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeTab, setActiveTab] = useState("home");
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  // --- User preferences (onboarding, profile) ---
  const userPrefs = useUserPreferences();

  // --- Watchlist ---
  const wl = useWatchlist();

  // --- Derive provider IDs from user's selected services ---
  const connectedServices = userPrefs.preferences?.platforms
    ?.filter((p) => p.selected !== false)
    .map((p) => p.id) || [];

  // ServiceId[] for filtering card badges to user's subscribed services
  const connectedServiceIds = useMemo(
    () => providerIdsToServiceIds(connectedServices),
    [connectedServices.join(',')]
  );

  // --- Build home filters from category pills + FilterSheet ---
  const homeFilters: FilterState = useMemo(() => {
    const base = { ...filters };
    if (activeCategory === "Movies") base.contentType = "Movies";
    else if (activeCategory === "TV Shows") base.contentType = "TV";
    else if (activeCategory === "Docs") base.contentType = "Docs";
    else if (activeCategory === "Anime") {
      // Anime = Animation genre filter
      base.genres = [...new Set([...base.genres, "Animation"])];
    }
    return base;
  }, [filters, activeCategory]);

  // --- Content service (home page data) ---
  const content = useContentService(connectedServices, homeFilters);

  // --- Recommendations ---
  const recs = useRecommendations(connectedServices);

  const activeFilterCount =
    filters.services.length +
    (filters.contentType !== "All" ? 1 : 0) +
    (filters.cost !== "All" ? 1 : 0) +
    filters.genres.length +
    (filters.minRating > 0 ? 1 : 0);

  const handleItemSelect = (item: ContentItem) => {
    setSelectedItem(item);
  };

  const handleDetailBack = () => {
    setSelectedItem(null);
  };

  const handleTabChange = (tab: string) => {
    setSelectedItem(null);
    setActiveTab(tab);
  };

  const handleToggleBookmark = useCallback(async (item: ContentItem) => {
    const added = await wl.toggleBookmark(item);
    if (added) {
      toast.success("Added to Watchlist", { description: item.title, icon: "\u{1F516}" });
    } else {
      toast("Removed from Watchlist", { description: item.title, icon: "\u{1F516}" });
    }
  }, [wl.toggleBookmark]);

  const handleRemoveBookmark = useCallback(async (id: string) => {
    const item = [...wl.watchlist, ...wl.watched].find((i) => i.id === id);
    await wl.removeBookmark(id);
    toast("Removed from Watchlist", { description: item?.title || "Title removed", icon: "\u{1F5D1}\u{FE0F}" });
  }, [wl.removeBookmark, wl.watchlist, wl.watched]);

  const handleMoveToWatched = useCallback(async (id: string) => {
    const item = wl.watchlist.find((i) => i.id === id);
    await wl.moveToWatched(id);
    toast.success("Marked as Watched", { description: item?.title, icon: "\u{2705}" });
  }, [wl.moveToWatched, wl.watchlist]);

  const handleMoveToWantToWatch = useCallback(async (id: string) => {
    const item = wl.watched.find((i) => i.id === id);
    await wl.moveToWantToWatch(id);
    toast("Moved to Want to Watch", { description: item?.title, icon: "\u{1F516}" });
  }, [wl.moveToWantToWatch, wl.watched]);

  const handleOnboardingComplete = useCallback(async (data: OnboardingData) => {
    await userPrefs.completeOnboarding(data);
    toast.success(`Welcome, ${data.name}!`, {
      icon: "\u{1F389}",
      description: "Your profile is all set. Let's find something to watch!",
    });
  }, [userPrefs.completeOnboarding]);

  // --- Scroll tracking for hero parallax ---
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollY(scrollRef.current.scrollTop);
    }
  }, []);

  // ── Loading state ──
  if (userPrefs.loading) {
    return (
      <div className="size-full bg-background text-foreground flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // ── Show onboarding flow if not yet completed ──
  if (!userPrefs.onboardingComplete) {
    return (
      <>
        <OnboardingFlow onComplete={handleOnboardingComplete} />
        <ThemedToaster />
      </>
    );
  }

  // Featured item from content service
  const featured = content.featured;

  return (
    <div className="size-full bg-background text-foreground overflow-hidden flex justify-center">
      <div className="w-full max-w-md h-full flex flex-col relative">
        {/* Scrollable content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto pb-20 no-scrollbar"
        >
          {selectedItem ? (
            <DetailPage
              itemId={selectedItem.id}
              itemTitle={selectedItem.title}
              itemImage={selectedItem.image}
              onBack={handleDetailBack}
              bookmarked={wl.bookmarkedIds.has(selectedItem.id)}
              onToggleBookmark={() => handleToggleBookmark(selectedItem)}
              onItemSelect={handleItemSelect}
              bookmarkedIds={wl.bookmarkedIds}
              onToggleBookmarkItem={handleToggleBookmark}
              connectedServices={connectedServices}
              userServices={connectedServiceIds}
            />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
              >
              {activeTab === "home" && (
                <>
                  {/* Featured Hero */}
                  {featured ? (
                    <FeaturedHero
                      title={featured.title}
                      subtitle={featured.type === 'tv' ? 'Trending on your services' : 'Popular right now'}
                      image={featured.image}
                      services={featured.services}
                      tags={[...(featured.type ? [featured.type === 'tv' ? 'TV Show' : featured.type === 'doc' ? 'Documentary' : 'Movie'] : []), ...(featured.year ? [String(featured.year)] : [])]}
                      bookmarked={wl.bookmarkedIds.has(featured.id)}
                      onToggleBookmark={() => handleToggleBookmark(featured)}
                      scrollY={scrollY}
                    />
                  ) : content.loading ? (
                    <div className="w-full aspect-[4/3] bg-secondary animate-pulse" />
                  ) : null}

                  {/* Category filters */}
                  <CategoryFilter
                    categories={categories}
                    activeCategory={activeCategory}
                    onCategoryChange={setActiveCategory}
                    onFilterPress={() => setShowFilters(true)}
                    hasActiveFilters={activeFilterCount > 0}
                  />

                  {/* Content rows */}
                  {content.loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                  ) : (
                    <>
                      {recs.items.length > 0 && (
                        <ContentRow title="For You" items={recs.items} onItemSelect={handleItemSelect} bookmarkedIds={wl.bookmarkedIds} onToggleBookmark={handleToggleBookmark} userServices={connectedServiceIds} />
                      )}
                      <ContentRow title="Popular on Your Services" items={content.popular} onItemSelect={handleItemSelect} bookmarkedIds={wl.bookmarkedIds} onToggleBookmark={handleToggleBookmark} userServices={connectedServiceIds} />
                      <ContentRow title="Highest Rated" items={content.highestRated} variant="wide" onItemSelect={handleItemSelect} bookmarkedIds={wl.bookmarkedIds} onToggleBookmark={handleToggleBookmark} userServices={connectedServiceIds} />
                      <ContentRow title="Recently Added" items={content.recentlyAdded} onItemSelect={handleItemSelect} bookmarkedIds={wl.bookmarkedIds} onToggleBookmark={handleToggleBookmark} userServices={connectedServiceIds} />
                      {content.genreRows.map((row) => (
                        <ContentRow key={row.genreId} title={row.name} items={row.items} onItemSelect={handleItemSelect} bookmarkedIds={wl.bookmarkedIds} onToggleBookmark={handleToggleBookmark} userServices={connectedServiceIds} />
                      ))}
                    </>
                  )}
                </>
              )}

              {activeTab === "browse" && (
                <BrowsePage
                  onItemSelect={handleItemSelect}
                  filters={filters}
                  onFiltersChange={setFilters}
                  showFilters={showFilters}
                  onShowFiltersChange={setShowFilters}
                  bookmarkedIds={wl.bookmarkedIds}
                  onToggleBookmark={handleToggleBookmark}
                  providerIds={connectedServices}
                  userServices={connectedServiceIds}
                />
              )}

              {activeTab === "watchlist" && (
                <WatchlistPage
                  watchlist={wl.watchlist}
                  watched={wl.watched}
                  onRemoveBookmark={handleRemoveBookmark}
                  onMoveToWatched={handleMoveToWatched}
                  onMoveToWantToWatch={handleMoveToWantToWatch}
                  onItemSelect={handleItemSelect}
                  onNavigateToBrowse={() => setActiveTab("browse")}
                />
              )}

              {activeTab === "profile" && (
                <ProfilePage
                  watchlistCount={wl.watchlist.length}
                  watchedCount={wl.watched.length}
                  userProfile={userPrefs.profile ? {
                    name: userPrefs.profile.name,
                    email: userPrefs.profile.email,
                    services: userPrefs.preferences?.platforms
                      ?.map((p) => providerIdToServiceId(p.id))
                      .filter((s): s is ServiceId => s !== null) || [],
                    genres: userPrefs.preferences?.homeGenres
                      ?.map((id) => GENRE_NAMES[id])
                      .filter(Boolean) || [],
                  } : null}
                />
              )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* Bottom Navigation */}
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} watchlistCount={wl.watchlist.length + wl.watched.length} />

        {/* Global Filter Sheet (for home tab) */}
        {activeTab === "home" && (
          <FilterSheet
            isOpen={showFilters}
            onClose={() => setShowFilters(false)}
            filters={filters}
            onApply={setFilters}
            connectedServices={providerIdsToServiceIds(connectedServices)}
          />
        )}
      </div>

      {/* Global style for hiding scrollbars */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Toaster for notifications */}
      <ThemedToaster />
    </div>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="top-center"
      theme={resolvedTheme}
      offset="max(16px, env(safe-area-inset-top, 16px))"
      toastOptions={{
        style: {
          background: "var(--toast-bg)",
          border: "1px solid var(--toast-border)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          color: "var(--toast-color)",
        },
      }}
    />
  );
}
