import React, { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from "react";
import { toast, Toaster } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { Loader2 } from "lucide-react";
import { CategoryFilter } from "./components/CategoryFilter";
import { ContentRow } from "./components/ContentRow";
import { FeaturedHero } from "./components/FeaturedHero";
import { BottomNav } from "./components/BottomNav";
import { ContentItem } from "./components/ContentCard";
import { BrowsePage, BrowseStateSnapshot } from "./components/BrowsePage";
import { DetailPage } from "./components/DetailPage";
import { FilterSheet, FilterState, defaultFilters } from "./components/FilterSheet";
import { WatchlistPage } from "./components/WatchlistPage";
import { ProfilePage } from "./components/ProfilePage";
import { OnboardingFlow, OnboardingData } from "./components/OnboardingFlow";
import { CalendarPage } from "./components/CalendarPage";
import { ComingSoonCard } from "./components/ComingSoonCard";
import { ThemeProvider, useTheme } from "./components/ThemeContext";
import { AuthProvider, useAuth } from "./components/AuthContext";
import AuthScreen from "./components/auth/AuthScreen";
import SignUpSuccess from "./components/auth/SignUpSuccess";
import NoConnectionScreen from "./components/auth/NoConnectionScreen";
import ResetPasswordScreen from "./components/auth/ResetPasswordScreen";
import { useNetworkStatus } from "./hooks/useNetworkStatus";
import { supabase } from "./lib/supabase";
import { useUserPreferences } from "./hooks/useUserPreferences";
import { useWatchlist } from "./hooks/useWatchlist";
import { useHomeContent } from "./hooks/useHomeContent";
import { useUpcoming } from "./hooks/useUpcoming";
import { LazyGenreSection } from "./components/LazyGenreSection";
import { providerIdsToServiceIds, serviceIdsToProviderIds, providerIdToServiceId } from "./lib/adapters/platformAdapter";
import { reorderWithinWindows } from "./lib/taste/genreBlending";
import type { ServiceId } from "./components/platformLogos";
import { App as CapApp } from "@capacitor/app";
import { useTasteProfile } from "./hooks/useTasteProfile";
import { migrateFromLegacyPreferences } from "./lib/storage/tasteProfile";
import { IMMEDIATE_LOAD_COUNT } from "./lib/taste/tasteVector";
import { logOnboardingEvent } from "./lib/analytics/logger";
import { ONBOARDING_EVENTS } from "./lib/analytics/events";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { maintainCache } from "./lib/api/cache";

const categories = ["All", "Movies", "TV Shows", "Docs", "Anime"];

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

function AppContent() {
  const { resolvedTheme } = useTheme();
  const auth = useAuth();
  const { isOnline, recheck: recheckNetwork } = useNetworkStatus();
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeTab, setActiveTab] = useState("home");
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [watchlistSubTab, setWatchlistSubTab] = useState<"want" | "watched">("want");
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [showSignUpSuccess, setShowSignUpSuccess] = useState(false);
  const [authUsername, setAuthUsername] = useState<string | null>(null);
  const prevSessionRef = useRef<boolean>(false);
  const justOnboardedRef = useRef(false);

  // --- Prune stale cache entries on startup ---
  useEffect(() => { maintainCache(); }, []);

  // --- User preferences (onboarding, profile) ---
  const userId = auth.loading ? null : (auth.user?.id ?? null);
  const userPrefs = useUserPreferences(userId);

  // Detect sign-in: session just appeared (returning user)
  useEffect(() => {
    const hasSession = !!auth.session;
    if (hasSession && !prevSessionRef.current && !auth.loading && !userPrefs.loading && !showSignUpSuccess) {
      setActiveTab("home");
      if (userPrefs.onboardingComplete) {
        toast.success('Welcome back!', { icon: '\u{1F44B}' });
      }
    }
    prevSessionRef.current = hasSession;
  }, [auth.session, auth.loading, userPrefs.loading, userPrefs.onboardingComplete, showSignUpSuccess]);

  // Called explicitly by AuthScreen when sign-up succeeds
  const handleSignUpSuccess = useCallback(async (username: string) => {
    // Clear any stale localStorage from before auth was added
    await userPrefs.signOut();
    setAuthUsername(username);
    setShowSignUpSuccess(true);
  }, [userPrefs.signOut]);

  // --- Watchlist ---
  const wl = useWatchlist(userId);

  // --- Taste profile (continuous learning) ---
  const taste = useTasteProfile();

  // --- Migration: create taste profile for existing users ---
  useEffect(() => {
    if (userPrefs.onboardingComplete && !taste.loading && !taste.profile) {
      const homeGenres = userPrefs.preferences?.homeGenres;
      if (homeGenres && homeGenres.length > 0) {
        migrateFromLegacyPreferences(homeGenres).then(() => taste.reload());
      }
    }
  }, [userPrefs.onboardingComplete, taste.loading, taste.profile, userPrefs.preferences?.homeGenres?.join(',')]);

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

  // --- First home view tracking (fires once after onboarding) ---
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ref-gated single-fire, extra deps would cause re-fires
  useEffect(() => {
    if (justOnboardedRef.current && !home.loading && activeTab === 'home') {
      justOnboardedRef.current = false;
      // Update if homepage sections change
      const sectionCount = [
        home.forYou.items.length > 0,
        home.recentlyAdded.items.length > 0,
        home.highestRated.items.length > 0,
        home.popular.items.length > 0,
        home.hiddenGems.items.length > 0,
      ].filter(Boolean).length + home.genreList.length;

      void logOnboardingEvent(ONBOARDING_EVENTS.FIRST_HOME_VIEW, {
        has_taste_vector: !!home.tasteVector,
        section_count: sectionCount,
      });
    }
  }, [home.loading, activeTab]);

  // --- Upcoming content (Coming Soon) ---
  const upcoming = useUpcoming(connectedServices, home.fetchMovies, home.fetchTV);
  const reorderedUpcoming = useMemo(
    () => home.tasteVector
      ? reorderWithinWindows(upcoming.items, home.tasteVector, (item) => item.genreIds || [])
      : upcoming.items,
    [upcoming.items, home.tasteVector]
  );

  const activeFilterCount =
    filters.services.length +
    (filters.contentType !== "All" ? 1 : 0) +
    (filters.cost !== "All" ? 1 : 0) +
    filters.genres.length +
    (filters.minRating > 0 ? 1 : 0) +
    (filters.showWatched ? 1 : 0) +
    filters.languages.length;

  // Filter out watched items from home content unless showWatched is on
  const filterWatched = useCallback((items: ContentItem[]) => {
    if (filters.showWatched || watchedIds.size === 0) return items;
    return items.filter((item) => !watchedIds.has(item.id));
  }, [filters.showWatched, watchedIds]);

  // Filter by language selection
  const filterLanguage = useCallback((items: ContentItem[]) => {
    if (filters.languages.length === 0) return items;
    return items.filter((item) =>
      item.language ? filters.languages.includes(item.language) : true
    );
  }, [filters.languages]);

  const handleItemSelect = (item: ContentItem) => {
    if (scrollRef.current) {
      savedScrollPositions.current[activeTab] = scrollRef.current.scrollTop;
    }
    setSelectedItem(item);
  };

  const handleDetailBack = () => {
    setSelectedItem(null);
  };

  const handleShowCalendar = () => {
    if (scrollRef.current) {
      savedScrollPositions.current[activeTab] = scrollRef.current.scrollTop;
    }
    setShowCalendar(true);
  };

  const handleTabChange = (tab: string) => {
    if (scrollRef.current) {
      savedScrollPositions.current[activeTab] = scrollRef.current.scrollTop;
    }
    setSelectedItem(null);
    setShowCalendar(false);
    setActiveTab(tab);
  };

  // Helper: extract content metadata for taste tracking from a ContentItem
  const buildTasteMeta = useCallback((item: ContentItem) => {
    const numericId = parseInt(item.id.replace(/^(movie|tv)-/, ''), 10);
    const contentType = item.type === 'doc' ? 'movie' as const : (item.type || 'movie') as 'movie' | 'tv';
    return {
      contentId: numericId,
      contentType,
      genreIds: item.genreIds || [],
      popularity: 0,
      releaseYear: item.year || null,
      originalLanguage: item.originalLanguage || null,
    };
  }, []);

  const handleToggleBookmark = useCallback(async (item: ContentItem) => {
    try {
      const added = await wl.toggleBookmark(item);
      if (added) {
        toast.success("Added to Watchlist", { description: item.title, icon: "\u{1F516}" });
        // Fire-and-forget taste tracking
        taste.trackInteraction(buildTasteMeta(item), 'watchlist_add');
      } else {
        toast("Removed from Watchlist", { description: item.title, icon: "\u{1F516}" });
        taste.trackInteraction(buildTasteMeta(item), 'removed');
      }
    } catch (err) {
      console.error('[handleToggleBookmark]', err);
      toast.error("Something went wrong");
    }
  }, [wl.toggleBookmark, taste.trackInteraction, buildTasteMeta]);

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
      // If not already in watchlist, add it first (direct-to-watched flow)
      if (!wl.bookmarkedIds.has(id) && selectedItem) {
        await wl.toggleBookmark(selectedItem);
      }
      await wl.moveToWatched(id);
      const item = [...wl.watchlist, ...wl.watched].find((i) => i.id === id);
      toast.success("Marked as Watched", { description: item?.title || selectedItem?.title, icon: "\u{2705}" });
      // Fire-and-forget taste tracking — prefer source with genreIds
      const trackItem = (item?.genreIds?.length ? item : null) || (selectedItem?.genreIds?.length ? selectedItem : null) || item || selectedItem;
      if (trackItem) taste.trackInteraction(buildTasteMeta(trackItem), 'watched');
    } catch (err) {
      console.error('[handleMoveToWatched]', err);
      toast.error("Something went wrong");
    }
  }, [wl.moveToWatched, wl.toggleBookmark, wl.bookmarkedIds, wl.watchlist, wl.watched, selectedItem, taste.trackInteraction, buildTasteMeta]);

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
      // Fire-and-forget taste tracking for thumbs up/down
      if (rating === 'up' || rating === 'down') {
        const wlItem = [...wl.watchlist, ...wl.watched].find((i) => i.id === id);
        // Prefer source with genreIds (selectedItem from card usually has them; older watchlist items may not)
        const item = (wlItem?.genreIds?.length ? wlItem : null) || (selectedItem?.genreIds?.length ? selectedItem : null) || wlItem || selectedItem;
        if (item) {
          taste.trackInteraction(buildTasteMeta(item), rating === 'up' ? 'thumbs_up' : 'thumbs_down');
        }
      }
    } catch (err) {
      console.error('[handleRate]', err);
      toast.error("Something went wrong");
    }
  }, [wl.setRating, wl.watchlist, wl.watched, selectedItem, taste.trackInteraction, buildTasteMeta]);

  const handleOnboardingComplete = useCallback(async (data: OnboardingData) => {
    // Populate name/email from auth context (onboarding no longer collects them)
    const name = auth.username || auth.user?.email?.split('@')[0] || 'User';
    const email = auth.user?.email || '';
    await userPrefs.completeOnboarding({ ...data, name, email });

    void logOnboardingEvent(ONBOARDING_EVENTS.ONBOARDING_COMPLETED, {
      total_duration_seconds: Math.round((Date.now() - (data.onboardingStartTime || Date.now())) / 1000),
    });
    justOnboardedRef.current = true;

    // Mark onboarding complete in Supabase profile
    if (auth.user) {
      supabase.from('profiles').update({ onboarding_completed: true, updated_at: new Date().toISOString() }).eq('id', auth.user.id).then(({ error }) => {
        if (error) console.error('[Supabase] Failed to update onboarding status:', error);
      });
    }

    setActiveTab("home");
    toast.success(`Welcome, ${name}!`, {
      icon: "\u{1F389}",
      description: "Your profile is all set. Let's find something to watch!",
    });
  }, [userPrefs.completeOnboarding, auth.username, auth.user]);

  // --- Scroll tracking for hero parallax ---
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);
  const savedScrollPositions = useRef<Record<string, number>>({});
  const browseStateRef = useRef<BrowseStateSnapshot | null>(null);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      setScrollY(scrollRef.current.scrollTop);
    }
  }, []);

  // Restore scroll position synchronously before paint
  useLayoutEffect(() => {
    if (scrollRef.current) {
      if (selectedItem) {
        scrollRef.current.scrollTop = 0;
      } else {
        const saved = savedScrollPositions.current[activeTab] ?? 0;
        scrollRef.current.scrollTop = saved;
      }
    }
  }, [selectedItem, activeTab]);

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

  // ── Auth loading state ──
  if (auth.loading) {
    return (
      <div className="size-full bg-background text-foreground flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // ── Password recovery mode → reset password screen ──
  if (auth.isPasswordRecovery) {
    return (
      <>
        <ResetPasswordScreen />
        <ThemedToaster />
      </>
    );
  }

  // ── Not authenticated → auth screens ──
  if (!auth.session) {
    return (
      <>
        <AuthScreen onSignUpSuccess={handleSignUpSuccess} />
        <ThemedToaster />
      </>
    );
  }

  // ── Authenticated but offline → no connection screen ──
  if (!isOnline) {
    return (
      <>
        <NoConnectionScreen onRetry={recheckNetwork} />
        <ThemedToaster />
      </>
    );
  }

  // ── User preferences loading ──
  if (userPrefs.loading) {
    return (
      <div className="size-full bg-background text-foreground flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // ── Sign-up success interstitial ──
  if (showSignUpSuccess) {
    return (
      <>
        <SignUpSuccess
          username={authUsername}
          onContinue={() => setShowSignUpSuccess(false)}
        />
        <ThemedToaster />
      </>
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
          style={{ overflowX: 'hidden', overscrollBehaviorX: 'none', transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined, transition: isPulling.current ? 'none' : 'transform 0.3s ease' }}
        >
          <AnimatePresence mode="wait">
          {showCalendar ? (
            <motion.div
              key="calendar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
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
            </motion.div>
          ) : selectedItem ? (
            <motion.div
              key={`detail-${selectedItem.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
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
            </motion.div>
          ) : (
              <motion.div
                key={`tab-${activeTab}`}
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
                      itemId={featured.id}
                      services={featured.services}
                      tags={[...(featured.type ? [featured.type === 'tv' ? 'TV Show' : featured.type === 'doc' ? 'Documentary' : 'Movie'] : []), ...(featured.year ? [String(featured.year)] : [])]}
                      bookmarked={wl.bookmarkedIds.has(featured.id)}
                      onToggleBookmark={() => handleToggleBookmark(featured)}
                      scrollY={scrollY}
                      watched={watchedIds.has(featured.id)}
                      userServices={connectedServiceIds}
                    />
                  ) : home.loading ? (
                    <div className="w-full aspect-[4/3] bg-secondary/80 overflow-hidden">
                      <div className="w-full h-full" style={{
                        background: "linear-gradient(90deg, transparent 0%, var(--shimmer-color) 50%, transparent 100%)",
                        backgroundSize: "200% 100%",
                        animation: "shimmer 1.5s ease-in-out infinite",
                      }} />
                    </div>
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
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                  ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                      {home.forYou.items.length > 0 && (
                        <ContentRow title="For You" items={filterLanguage(filterWatched(home.forYou.items)).filter((item) => (item.type === 'movie' && home.fetchMovies) || (item.type === 'tv' && home.fetchTV))} onItemSelect={handleItemSelect} bookmarkedIds={wl.bookmarkedIds} onToggleBookmark={handleToggleBookmark} userServices={connectedServiceIds} watchedIds={watchedIds} />
                      )}
                      <ContentRow title="Recently Added" items={filterLanguage(filterWatched(home.recentlyAdded.items))} onItemSelect={handleItemSelect} bookmarkedIds={wl.bookmarkedIds} onToggleBookmark={handleToggleBookmark} userServices={connectedServiceIds} watchedIds={watchedIds} onLoadMore={home.recentlyAdded.loadMore} loadingMore={home.recentlyAdded.loadingMore} hasMore={home.recentlyAdded.hasMore} />
                      <ContentRow title="Highest Rated" items={filterLanguage(filterWatched(home.highestRated.items))} variant="wide" onItemSelect={handleItemSelect} bookmarkedIds={wl.bookmarkedIds} onToggleBookmark={handleToggleBookmark} userServices={connectedServiceIds} watchedIds={watchedIds} onLoadMore={home.highestRated.loadMore} loadingMore={home.highestRated.loadingMore} hasMore={home.highestRated.hasMore} />
                      <ContentRow title="Popular on Your Services" items={filterLanguage(filterWatched(home.popular.items))} onItemSelect={handleItemSelect} bookmarkedIds={wl.bookmarkedIds} onToggleBookmark={handleToggleBookmark} userServices={connectedServiceIds} watchedIds={watchedIds} onLoadMore={home.popular.loadMore} loadingMore={home.popular.loadingMore} hasMore={home.popular.hasMore} />
                      {home.hiddenGems.items.length > 0 && (
                        <ContentRow title="Hidden Gems" items={filterLanguage(filterWatched(home.hiddenGems.items)).filter((item) => (item.type === 'movie' && home.fetchMovies) || (item.type === 'tv' && home.fetchTV))} onItemSelect={handleItemSelect} bookmarkedIds={wl.bookmarkedIds} onToggleBookmark={handleToggleBookmark} userServices={connectedServiceIds} watchedIds={watchedIds} />
                      )}
                      {reorderedUpcoming.length > 0 && (
                        <div className="mb-6 overflow-hidden">
                          <div className="flex items-center justify-between px-5 mb-3">
                            <h2 className="text-foreground text-[17px]" style={{ fontWeight: 700 }}>Coming Soon</h2>
                            <button onClick={handleShowCalendar} className="text-primary text-[13px]" style={{ fontWeight: 500 }}>See All</button>
                          </div>
                          <div className="flex gap-3 overflow-x-auto px-5 no-scrollbar" style={{ scrollbarWidth: "none" }}>
                            {reorderedUpcoming.slice(0, 8).map((item) => (
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
                      {home.genreList.map((genreId, idx) => (
                        <LazyGenreSection
                          key={genreId}
                          genreId={genreId}
                          immediate={idx < IMMEDIATE_LOAD_COUNT}
                          baseParams={home.baseParams}
                          sectionKeyBase={home.sectionKeyBase}
                          filterGenreIds={home.filterGenreIds}
                          fetchMovies={home.fetchMovies}
                          fetchTV={home.fetchTV}
                          excludeIds={home.genreExcludeIds}
                          onNewIds={home.registerGenreIds}
                          genreAffinities={home.genreAffinities}
                          tasteVector={home.tasteVector}
                          onItemSelect={handleItemSelect}
                          bookmarkedIds={wl.bookmarkedIds}
                          onToggleBookmark={handleToggleBookmark}
                          userServices={connectedServiceIds}
                          watchedIds={watchedIds}
                          filterWatched={(items) => filterLanguage(filterWatched(items))}
                        />
                      ))}
                    </motion.div>
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
                  savedState={browseStateRef}
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
                  activeSubTab={watchlistSubTab}
                  onSubTabChange={setWatchlistSubTab}
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
                    clusters: userPrefs.preferences?.selectedClusters || [],
                  } : null}
                  onSignOut={auth.signOut}
                  onUpdateServices={userPrefs.updateServices}
                  onUpdateClusters={userPrefs.updateClusters}
                  onUpdateProfile={userPrefs.updateProfile}
                  onNavigateHome={() => setActiveTab("home")}
                  isAuthenticated={!!auth.session}
                  username={auth.username}
                  email={auth.user?.email || null}
                  onDeleteAccount={auth.deleteAccount}
                />
              )}
              </motion.div>
          )}
          </AnimatePresence>
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
