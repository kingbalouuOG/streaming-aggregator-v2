import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
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
import { CalendarPage } from "./components/CalendarPage";
import { ComingSoonCard } from "./components/ComingSoonCard";
import { ThemeProvider, useTheme } from "./components/ThemeContext";
import { useUserPreferences } from "./hooks/useUserPreferences";
import { useWatchlist } from "./hooks/useWatchlist";
import { useHomeContent } from "./hooks/useHomeContent";
import { useUpcoming } from "./hooks/useUpcoming";
import { LazyGenreSection } from "./components/LazyGenreSection";
import { providerIdsToServiceIds, serviceIdsToProviderIds, providerIdToServiceId } from "./lib/adapters/platformAdapter";
import { GENRE_NAMES } from "./lib/constants/genres";
import type { ServiceId } from "./components/platformLogos";
import { App as CapApp } from "@capacitor/app";

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
  const [showCalendar, setShowCalendar] = useState(false);
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

  // Set of watched item IDs for detail page
  const watchedIds = useMemo(
    () => new Set(wl.watched.map((i) => i.id)),
    [wl.watched]
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

  // --- Home content (lazy-loaded sections) ---
  const home = useHomeContent(connectedServices, homeFilters);

  // --- Upcoming content (Coming Soon) ---
  const upcoming = useUpcoming(connectedServices);

  const activeFilterCount =
    filters.services.length +
    (filters.contentType !== "All" ? 1 : 0) +
    (filters.cost !== "All" ? 1 : 0) +
    filters.genres.length +
    (filters.minRating > 0 ? 1 : 0) +
    (filters.showWatched ? 1 : 0);

  // Filter out watched items from home content unless showWatched is on
  const filterWatched = useCallback((items: ContentItem[]) => {
    if (filters.showWatched || watchedIds.size === 0) return items;
    return items.filter((item) => !watchedIds.has(item.id));
  }, [filters.showWatched, watchedIds]);

  const handleItemSelect = (item: ContentItem) => {
    setSelectedItem(item);
  };

  const handleDetailBack = () => {
    setSelectedItem(null);
  };

  const handleTabChange = (tab: string) => {
    setSelectedItem(null);
    setShowCalendar(false);
    setActiveTab(tab);
  };

  const handleToggleBookmark = useCallback(async (item: ContentItem) => {
    try {
      const added = await wl.toggleBookmark(item);
      if (added) {
        toast.success("Added to Watchlist", { description: item.title, icon: "\u{1F516}" });
      } else {
        toast("Removed from Watchlist", { description: item.title, icon: "\u{1F516}" });
      }
    } catch (err) {
      console.error('[handleToggleBookmark]', err);
      toast.error("Something went wrong");
    }
  }, [wl.toggleBookmark]);

  const handleRemoveBookmark = useCallback(async (id: string) => {
    try {
      const item = [...wl.watchlist, ...wl.watched].find((i) => i.id === id);
      await wl.removeBookmark(id);
      toast("Removed from Watchlist", { description: item?.title || "Title removed", icon: "\u{1F5D1}\u{FE0F}" });
    } catch (err) {
      console.error('[handleRemoveBookmark]', err);
      toast.error("Something went wrong");
    }
  }, [wl.removeBookmark, wl.watchlist, wl.watched]);

  const handleMoveToWatched = useCallback(async (id: string) => {
    try {
      const item = wl.watchlist.find((i) => i.id === id);
      await wl.moveToWatched(id);
      toast.success("Marked as Watched", { description: item?.title, icon: "\u{2705}" });
    } catch (err) {
      console.error('[handleMoveToWatched]', err);
      toast.error("Something went wrong");
    }
  }, [wl.moveToWatched, wl.watchlist]);

  const handleMoveToWantToWatch = useCallback(async (id: string) => {
    try {
      const item = wl.watched.find((i) => i.id === id);
      await wl.moveToWantToWatch(id);
      toast("Moved to Want to Watch", { description: item?.title, icon: "\u{1F516}" });
    } catch (err) {
      console.error('[handleMoveToWantToWatch]', err);
      toast.error("Something went wrong");
    }
  }, [wl.moveToWantToWatch, wl.watched]);

  const handleRate = useCallback(async (id: string, rating: 'up' | 'down' | null) => {
    try {
      const storageRating = rating === 'up' ? 1 : rating === 'down' ? -1 : 0;
      await wl.setRating(id, storageRating as -1 | 0 | 1);
      if (rating === 'up') {
        toast.success("Thumbs up!", { description: "Thanks! This improves your recommendations.", icon: "\u{1F44D}" });
      } else if (rating === 'down') {
        toast.success("Thumbs down", { description: "Thanks! This improves your recommendations.", icon: "\u{1F44E}" });
      } else {
        toast("Rating removed", { description: "Your rating has been cleared.", icon: "\u{1F504}" });
      }
    } catch (err) {
      console.error('[handleRate]', err);
      toast.error("Something went wrong");
    }
  }, [wl.setRating]);

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

  // ── Android back button ──
  useEffect(() => {
    const listener = CapApp.addListener("backButton", () => {
      if (selectedItem) {
        setSelectedItem(null);
      } else if (showCalendar) {
        setShowCalendar(false);
      } else if (activeTab !== "home") {
        setActiveTab("home");
      } else {
        CapApp.exitApp();
      }
    });
    return () => { listener.then((l) => l.remove()); };
  }, [selectedItem, showCalendar, activeTab]);

  // ── Pull-to-refresh ──
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pullStartY = useRef(0);
  const isPulling = useRef(false);
  const PULL_THRESHOLD = 80;

  const handlePullStart = useCallback((clientY: number) => {
    if (scrollRef.current && scrollRef.current.scrollTop <= 0 && !isRefreshing) {
      pullStartY.current = clientY;
      isPulling.current = true;
    }
  }, [isRefreshing]);

  const handlePullMove = useCallback((clientY: number) => {
    if (!isPulling.current || isRefreshing) return;
    if (scrollRef.current && scrollRef.current.scrollTop > 0) {
      isPulling.current = false;
      setPullDistance(0);
      return;
    }
    const delta = Math.max(0, clientY - pullStartY.current);
    // Dampen the pull distance
    setPullDistance(Math.min(delta * 0.5, 120));
  }, [isRefreshing]);

  const handlePullEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;
    if (pullDistance >= PULL_THRESHOLD) {
      setIsRefreshing(true);
      setPullDistance(PULL_THRESHOLD);
      try {
        if (activeTab === "home") {
          await home.reload();
        }
      } catch {}
      setIsRefreshing(false);
    }
    setPullDistance(0);
  }, [pullDistance, activeTab, home.reload]);

  // Featured item from home content (skip watched unless showWatched is on)
  const featured = useMemo(() => {
    if (filters.showWatched || !home.featured) return home.featured;
    if (!watchedIds.has(home.featured.id)) return home.featured;
    // If the featured item is watched, pick next non-watched from popular
    return home.popular.items.find((item) => !watchedIds.has(item.id)) || home.featured;
  }, [home.featured, home.popular.items, filters.showWatched, watchedIds]);

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

  return (
    <div className="size-full bg-background text-foreground overflow-hidden flex justify-center">
      <div className="w-full max-w-md h-full flex flex-col relative">
        {/* Pull-to-refresh indicator */}
        {(pullDistance > 0 || isRefreshing) && !selectedItem && activeTab === "home" && (
          <div
            className="absolute top-0 left-0 right-0 z-20 flex items-center justify-center pointer-events-none"
            style={{ height: pullDistance, transition: isPulling.current ? 'none' : 'height 0.3s ease' }}
          >
            <Loader2
              className={`w-5 h-5 text-primary ${isRefreshing ? 'animate-spin' : ''}`}
              style={{
                opacity: Math.min(pullDistance / PULL_THRESHOLD, 1),
                transform: `rotate(${pullDistance * 3}deg)`,
              }}
            />
          </div>
        )}

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onTouchStart={(e) => handlePullStart(e.touches[0].clientY)}
          onTouchMove={(e) => handlePullMove(e.touches[0].clientY)}
          onTouchEnd={handlePullEnd}
          className="flex-1 overflow-y-auto pb-4 no-scrollbar"
          style={{ transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined, transition: isPulling.current ? 'none' : 'transform 0.3s ease' }}
        >
          {showCalendar ? (
            <CalendarPage
              items={upcoming.items}
              loading={upcoming.loading}
              onBack={() => setShowCalendar(false)}
              onItemSelect={(item) => {
                setShowCalendar(false);
                handleItemSelect({ id: item.id, title: item.title, image: item.image, services: item.services, rating: item.rating, type: item.type });
              }}
              userServices={connectedServiceIds}
              bookmarkedIds={wl.bookmarkedIds}
              onToggleBookmark={(item) => handleToggleBookmark({ id: item.id, title: item.title, image: item.image, services: item.services, rating: item.rating, type: item.type })}
            />
          ) : selectedItem ? (
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
              watchedIds={watchedIds}
              onMoveToWatched={handleMoveToWatched}
              onMoveToWantToWatch={handleMoveToWantToWatch}
              userRating={wl.ratings[selectedItem.id] || null}
              onRate={handleRate}
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
                      watched={watchedIds.has(featured.id)}
                    />
                  ) : home.loading ? (
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
                  {home.loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                  ) : (
                    <>
                      {home.forYou.items.length > 0 && (
                        <ContentRow title="For You" items={filterWatched(home.forYou.items)} onItemSelect={handleItemSelect} bookmarkedIds={wl.bookmarkedIds} onToggleBookmark={handleToggleBookmark} userServices={connectedServiceIds} watchedIds={watchedIds} />
                      )}
                      {upcoming.items.length > 0 && (
                        <div className="mb-6">
                          <div className="flex items-center justify-between px-5 mb-3">
                            <h2 className="text-foreground text-[16px]" style={{ fontWeight: 700 }}>Coming Soon</h2>
                            <button onClick={() => setShowCalendar(true)} className="text-primary text-[13px]" style={{ fontWeight: 500 }}>See All</button>
                          </div>
                          <div className="flex gap-3 overflow-x-auto px-5 no-scrollbar" style={{ scrollbarWidth: "none" }}>
                            {upcoming.items.slice(0, 8).map((item) => (
                              <ComingSoonCard
                                key={item.id}
                                item={item}
                                onSelect={(u) => handleItemSelect({ id: u.id, title: u.title, image: u.image, services: u.services, rating: u.rating, type: u.type })}
                                bookmarked={wl.bookmarkedIds.has(item.id)}
                                onToggleBookmark={(u) => handleToggleBookmark({ id: u.id, title: u.title, image: u.image, services: u.services, rating: u.rating, type: u.type })}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      <ContentRow title="Popular on Your Services" items={filterWatched(home.popular.items)} onItemSelect={handleItemSelect} bookmarkedIds={wl.bookmarkedIds} onToggleBookmark={handleToggleBookmark} userServices={connectedServiceIds} watchedIds={watchedIds} onLoadMore={home.popular.loadMore} loadingMore={home.popular.loadingMore} hasMore={home.popular.hasMore} />
                      <ContentRow title="Highest Rated" items={filterWatched(home.highestRated.items)} variant="wide" onItemSelect={handleItemSelect} bookmarkedIds={wl.bookmarkedIds} onToggleBookmark={handleToggleBookmark} userServices={connectedServiceIds} watchedIds={watchedIds} onLoadMore={home.highestRated.loadMore} loadingMore={home.highestRated.loadingMore} hasMore={home.highestRated.hasMore} />
                      {home.hiddenGems.items.length > 0 && (
                        <ContentRow title="Hidden Gems" items={filterWatched(home.hiddenGems.items)} onItemSelect={handleItemSelect} bookmarkedIds={wl.bookmarkedIds} onToggleBookmark={handleToggleBookmark} userServices={connectedServiceIds} watchedIds={watchedIds} />
                      )}
                      <ContentRow title="Recently Added" items={filterWatched(home.recentlyAdded.items)} onItemSelect={handleItemSelect} bookmarkedIds={wl.bookmarkedIds} onToggleBookmark={handleToggleBookmark} userServices={connectedServiceIds} watchedIds={watchedIds} onLoadMore={home.recentlyAdded.loadMore} loadingMore={home.recentlyAdded.loadingMore} hasMore={home.recentlyAdded.hasMore} />
                      {home.genreList.map((genreId) => (
                        <LazyGenreSection
                          key={genreId}
                          genreId={genreId}
                          baseParams={home.baseParams}
                          sectionKeyBase={home.sectionKeyBase}
                          filterGenreIds={home.filterGenreIds}
                          fetchMovies={home.fetchMovies}
                          fetchTV={home.fetchTV}
                          excludeIds={home.excludeIds}
                          onNewIds={home.registerIds}
                          genreAffinities={home.genreAffinities}
                          onItemSelect={handleItemSelect}
                          bookmarkedIds={wl.bookmarkedIds}
                          onToggleBookmark={handleToggleBookmark}
                          userServices={connectedServiceIds}
                          watchedIds={watchedIds}
                          filterWatched={filterWatched}
                        />
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
                  watchedIds={watchedIds}
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
                  ratings={wl.ratings}
                  onRate={handleRate}
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
                  onSignOut={userPrefs.signOut}
                  onUpdateServices={userPrefs.updateServices}
                  onUpdateGenres={userPrefs.updateGenres}
                  onUpdateProfile={userPrefs.updateProfile}
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
