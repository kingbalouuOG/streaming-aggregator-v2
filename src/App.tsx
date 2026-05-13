import React, { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from "react";
import { toast, Toaster } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { Loader2 } from "lucide-react";
import { CategoryFilter } from "./components/CategoryFilter";
import { ContentRow } from "./components/ContentRow";
// FeaturedHeroCarousel — replaced on Home by <MagazineHero>; the file
// stays for now until the Phase 5 FeaturedHero matrix row formally
// retires it.
import { ForYouPage } from "./components/ForYouPage";
import { MoodRoomPage } from "./components/MoodRoomPage";
import type { AnchorRoomPreview } from "./hooks/useAnchorMoodRooms";
import { BottomNav } from "./components/BottomNav";
import { ContentItem } from "./components/ContentCard";
import { BrowsePage, BrowseStateSnapshot } from "./components/BrowsePage";
import { DetailPage } from "./components/DetailPage";
import { FilterSheet } from "./components/FilterSheet";
import { defaultFor, type FilterState } from "./lib/search/filterState";
import { WatchlistPage } from "./components/WatchlistPage";
import { ProfilePage } from "./components/ProfilePage";
import { OnboardingFlow, OnboardingData } from "./components/OnboardingFlow";
import { CalendarPage } from "./components/CalendarPage";
// ComingSoonCard — Home no longer mounts these directly; the
// CalendarList primitive renders them internally.
import { MagazineHero } from "./components/MagazineHero";
import { TopAppBar } from "./components/TopAppBar";
import { EditorsNote } from "./components/EditorsNote";
import { CalendarList } from "./components/CalendarList";
import { FreeTonight } from "./components/FreeTonight";
import { NumberedChart } from "./components/NumberedChart";
import { LongRead } from "./components/LongRead";
import { WideCard } from "./components/WideCard";
import { SectionHead } from "./components/SectionHead";
import { ContentCard } from "./components/ContentCard";
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
import { providerIdsToServiceIds, providerIdToServiceId } from "./lib/adapters/platformAdapter";
import { warmRenderForYou } from "./lib/recommendations-v2/edgeWarmup";
import type { ServiceId } from "./components/platformLogos";
import { App as CapApp } from "@capacitor/app";
import { useTasteProfile } from "./hooks/useTasteProfile";
import { logOnboardingEvent } from "./lib/analytics/logger";
import { ONBOARDING_EVENTS } from "./lib/analytics/events";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { maintainCache } from "./lib/api/cache";
import { flushNow } from "./lib/instrumentation/impressionBatcher";
import { parseContentItemId } from "./lib/adapters/contentAdapter";
import { emitContentInteraction } from "./lib/storage/interactions";
import { useIntersectionObserver } from "./hooks/useIntersectionObserver";
import { IconsDebug, SectionHeadDebug, ContentCardDebug, ServiceStackDebug, BottomNavDebug, MagazineHeroDebug, EditorsNoteDebug, WideCardDebug } from "./dev/DesignSystemDebug";

const categories = ["All", "Movies", "TV Shows", "Docs", "Anime"];

/**
 * Sentinel for the lazy-loaded Genre Spotlight chain. Mounts a thin
 * div below the last rendered spotlight; when it scrolls into view,
 * fires `onVisible` to load the next cluster. Re-keyed by the parent
 * on each load so a fresh observer attaches to the new sentinel.
 */
function GenreSpotlightSentinel({
  onVisible,
  loading,
}: {
  onVisible: () => void;
  loading: boolean;
}) {
  const { ref, isVisible } = useIntersectionObserver({
    rootMargin: "300px 0px",
    triggerOnce: true,
  });
  useEffect(() => {
    if (isVisible && !loading) onVisible();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);
  return <div ref={ref} className="h-1" />;
}

export default function App() {
  // Dev-only design-system debug routes. The entire `if` branch is
  // statically eliminated in production builds by Vite, which also
  // tree-shakes the `./dev/DesignSystemDebug` import since it has no
  // other reference site.
  if (import.meta.env.DEV) {
    const debug = new URLSearchParams(window.location.search).get("debug");
    if (debug === "icons") return <IconsDebug />;
    if (debug === "sectionhead") return <SectionHeadDebug />;
    if (debug === "contentcard") return <ContentCardDebug />;
    if (debug === "servicestack") return <ServiceStackDebug />;
    if (debug === "bottomnav") return <BottomNavDebug />;
    if (debug === "magazinehero") return <MagazineHeroDebug />;
    if (debug === "editorsnote") return <EditorsNoteDebug />;
    if (debug === "widecards") return <WideCardDebug />;
  }

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
  useTheme();
  const auth = useAuth();
  const { isOnline, recheck: recheckNetwork } = useNetworkStatus();
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeTab, setActiveTab] = useState("home");
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [selectedAnchorRoom, setSelectedAnchorRoom] = useState<AnchorRoomPreview | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [watchlistSubTab, setWatchlistSubTab] = useState<"want" | "watched">("want");
  const [filters, setFilters] = useState<FilterState>(() => defaultFor([]));
  const [showSignUpSuccess, setShowSignUpSuccess] = useState(false);
  const [showSignUpOnboarding, setShowSignUpOnboarding] = useState(false);
  const [authUsername, setAuthUsername] = useState<string | null>(null);
  const prevSessionRef = useRef<boolean>(false);
  const justOnboardedRef = useRef(false);

  // --- Prune stale cache entries on startup ---
  useEffect(() => { maintainCache(); }, []);

  // Warmup ref needs to be at component top-level (Hooks rule). The
  // useEffect that consumes it is below, after connectedServices is
  // declared, since we need user services to fire the warmup.
  const warmedRef = useRef(false);

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

  // Phase Search V2 Cluster B — semantic search feature flag. Read
  // once when the user resolves; module-level cache in featureFlags.ts
  // keeps subsequent reads cheap. Defaults to false so production
  // users don't see Mode C surfaces until Joe flips the flag in
  // Studio.
  const [semanticFlagOn, setSemanticFlagOn] = useState(false);
  useEffect(() => {
    if (!userId) {
      setSemanticFlagOn(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { getFlag } = await import('./lib/featureFlags');
      const on = await getFlag('search_semantic', false);
      if (!cancelled) setSemanticFlagOn(on);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // --- Derive provider IDs from user's selected services ---
  const connectedServices = userPrefs.preferences?.platforms
    ?.filter((p) => p.selected !== false)
    .map((p) => p.id) || [];

  // ServiceId[] for filtering card badges to user's subscribed services
  const connectedServiceIds = useMemo(
    () => providerIdsToServiceIds(connectedServices),
    [connectedServices.join(',')]
  );

  // Seed the filter's `services` array from the user's connected
  // services on first resolve. `filters` is initialised with
  // `defaultFor([])` because connectedServiceIds isn't known at mount
  // time, so without this the FilterSheet opens with an empty service
  // set (every tile unselected) until the user manually picks one.
  // The ref guards against re-seeding if the user later deselects all
  // services on purpose.
  const filtersSeededRef = useRef(false);
  useEffect(() => {
    if (filtersSeededRef.current) return;
    if (connectedServiceIds.length === 0) return;
    filtersSeededRef.current = true;
    setFilters((prev) => ({ ...prev, services: connectedServiceIds }));
  }, [connectedServiceIds]);

  // --- Warm the For You Edge Function (IN-466 Variant A) ---
  // Fire-and-forget hit on render-foryou-rows itself once auth + prefs
  // have resolved. Edge Function instances are per-function, so warming
  // a noop function doesn't help — we have to warm the function we
  // actually want hot. Cost: one extra full pipeline run per app
  // session. Gain: first For You navigation hits ~800ms warm instead
  // of 5-12s cold. Logic lives in edgeWarmup.ts.
  useEffect(() => {
    if (warmedRef.current) return;
    if (auth.loading || userPrefs.loading) return;
    if (!auth.session || connectedServices.length === 0) return;
    warmedRef.current = true;
    void warmRenderForYou(connectedServices);
  }, [auth.loading, auth.session, userPrefs.loading, connectedServices.join(',')]);

  // Set of watched item IDs for detail page
  const watchedIds = useMemo(
    () => new Set(wl.watched.map((i) => i.id)),
    [wl.watched]
  );

  // --- Build home filters from category pills + FilterSheet ---
  const homeFilters: FilterState = useMemo(() => {
    const base = { ...filters };
    if (activeCategory === "Movies") base.contentType = "movie";
    else if (activeCategory === "TV Shows") base.contentType = "tv";
    else if (activeCategory === "Docs") base.contentType = "doc";
    else if (activeCategory === "Anime") {
      // Anime = Animation genre filter
      base.genres = [...new Set([...base.genres, "Animation"])];
    }
    return base;
  }, [filters, activeCategory]);

  // --- Home content (lazy-loaded sections) ---
  const home = useHomeContent(connectedServices, homeFilters);

  // --- First home view tracking (fires once after onboarding) ---
   
  useEffect(() => {
    if (justOnboardedRef.current && !home.loading && activeTab === 'home') {
      justOnboardedRef.current = false;
      // Update if homepage sections change
      const sectionCount = [
        home.recentlyAdded.items.length > 0,
        home.popular.items.length > 0,
        home.perServiceCharts.length > 0,
        home.genreSpotlights.length > 0,
      ].filter(Boolean).length;

      void logOnboardingEvent(ONBOARDING_EVENTS.FIRST_HOME_VIEW, {
        has_taste_vector: true,
        section_count: sectionCount,
      });
    }
  }, [home.loading, activeTab]);

  // --- Upcoming content (Coming Soon) ---
  const upcoming = useUpcoming(connectedServices, home.fetchMovies, home.fetchTV);
  const reorderedUpcoming = upcoming.items;

  const activeFilterCount =
    filters.services.length +
    (filters.contentType !== "all" ? 1 : 0) +
    (filters.costs.length > 0 ? 1 : 0) +
    (filters.runtime !== "any" ? 1 : 0) +
    filters.genres.length +
    (filters.minRating > 0 ? 1 : 0) +
    (filters.showWatched !== "all" ? 1 : 0) +
    filters.languages.length;

  // Filter out watched items from home content based on showWatched setting.
  // 'all' → show everything; 'hide' → drop watched; 'only' → keep just watched.
  const filterWatched = useCallback((items: ContentItem[]) => {
    if (filters.showWatched === "all" || watchedIds.size === 0) return items;
    if (filters.showWatched === "only") return items.filter((item) => watchedIds.has(item.id));
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
    // Flush trigger #6: detail page entry. Fire-and-forget — we
    // don't await because the selection UI should be instant.
    void flushNow();
    if (scrollRef.current) {
      savedScrollPositions.current[activeTab] = scrollRef.current.scrollTop;
    }
    setSelectedItem(item);
  };

  const pendingScrollRestore = useRef<number | null>(null);

  const handleDetailBack = () => {
    // Save the scroll position we want to restore AFTER the exit animation finishes
    pendingScrollRestore.current = savedScrollPositions.current[activeTab] ?? 0;
    setSelectedItem(null);
  };

  const handleSelectAnchorRoom = (preview: AnchorRoomPreview) => {
    // Flush trigger (parity with handleItemSelect): any pending For You
    // card impressions must be attributed to for_you, not to the room
    // surface we're navigating into.
    void flushNow();
    if (scrollRef.current) {
      savedScrollPositions.current[activeTab] = scrollRef.current.scrollTop;
    }
    setSelectedAnchorRoom(preview);
  };

  const handleMoodRoomBack = () => {
    pendingScrollRestore.current = savedScrollPositions.current[activeTab] ?? 0;
    setSelectedAnchorRoom(null);
  };

  const handleShowCalendar = () => {
    if (scrollRef.current) {
      savedScrollPositions.current[activeTab] = scrollRef.current.scrollTop;
    }
    setShowCalendar(true);
  };

  const handleTabChange = (tab: string) => {
    // Flush trigger #5: bottom nav tab change. Fire-and-forget —
    // we don't await because the tab UI should switch instantly.
    void flushNow();
    if (scrollRef.current) {
      savedScrollPositions.current[activeTab] = scrollRef.current.scrollTop;
    }
    setSelectedItem(null);
    setSelectedAnchorRoom(null);
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
      if (item) {
        const { tmdbId, mediaType } = parseContentItemId(id);
        emitContentInteraction('removed', tmdbId, mediaType, { title: item.title });
      }
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
      const isInWatchlist = wl.bookmarkedIds.has(id);
      const isWatched = watchedIds.has(id);
      let autoMarked = false;

      // Auto-add to watchlist and mark as watched if needed
      if (rating !== null && !isWatched) {
        if (!isInWatchlist && selectedItem) {
          await wl.toggleBookmark(selectedItem);
        }
        await wl.moveToWatched(id);
        autoMarked = true;
        // Taste tracking for the auto-watched action
        const trackItem = (selectedItem?.genreIds?.length ? selectedItem : null) || selectedItem;
        if (trackItem) taste.trackInteraction(buildTasteMeta(trackItem), 'watched');
      }

      const storageRating = rating === 'up' ? 1 : rating === 'down' ? -1 : 0;
      await wl.setRating(id, storageRating as -1 | 0 | 1);
      if (rating === 'up') {
        toast.success(autoMarked ? "Marked as watched — Thumbs up!" : "Thumbs up!", {
          description: "Thanks! This improves your recommendations.", icon: "\u{1F44D}",
        });
      } else if (rating === 'down') {
        toast.success(autoMarked ? "Marked as watched — Thumbs down" : "Thumbs down", {
          description: "Thanks! This improves your recommendations.", icon: "\u{1F44E}",
        });
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
  }, [wl.setRating, wl.toggleBookmark, wl.moveToWatched, wl.bookmarkedIds, watchedIds, wl.watchlist, wl.watched, selectedItem, taste.trackInteraction, buildTasteMeta]);

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
    // Force all home sections to refetch with the new taste profile
    void home.reload();
    toast.success(`Welcome, ${name}!`, {
      icon: "\u{1F389}",
      description: "Your profile is all set. Let's find something to watch!",
    });
  }, [userPrefs.completeOnboarding, auth.username, auth.user, home.reload]);

  // --- Scroll tracking ---
  const scrollRef = useRef<HTMLDivElement>(null);
  const [, setScrollY] = useState(0);
  const savedScrollPositions = useRef<Record<string, number>>({});
  const browseStateRef = useRef<BrowseStateSnapshot | null>(null);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    setScrollY(scrollRef.current.scrollTop);
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

  // Delayed scroll restore — covers AnimatePresence exit animation (0.18s)
  // The useLayoutEffect above fires before the exit animation finishes,
  // so the browser clamps scrollTop to 0 when content swaps. This re-applies after.
  // Triggers on either selectedItem or selectedMoodRoomId clearing; whichever
  // pushed pendingScrollRestore is the one we're returning from.
  useEffect(() => {
    if (selectedItem || selectedAnchorRoom || pendingScrollRestore.current === null) return;
    const target = pendingScrollRestore.current;
    pendingScrollRestore.current = null;

    // Wait for exit animation (0.18s) + enter animation start + one frame
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = target;
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [selectedItem, selectedAnchorRoom]);

  // ── Android back button ──
  // Hierarchy: DetailPage > MoodRoomPage > Calendar > non-home tab > exit.
  // DetailPage sits above MoodRoomPage in the render chain (a detail
  // opened from within a room should back to the room, not to For You).
  useEffect(() => {
    const listener = CapApp.addListener("backButton", () => {
      if (selectedItem) {
        handleDetailBack();
      } else if (selectedAnchorRoom) {
        handleMoodRoomBack();
      } else if (showCalendar) {
        setShowCalendar(false);
      } else if (activeTab !== "home") {
        setActiveTab("home");
      } else {
        CapApp.exitApp();
      }
    });
    return () => { listener.then((l) => l.remove()); };
  }, [selectedItem, selectedAnchorRoom, showCalendar, activeTab]);

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
      } catch {
        // ignore reload failure; UI just stops the spinner
      }
      setIsRefreshing(false);
    }
    setPullDistance(0);
  }, [pullDistance, activeTab, home.reload]);

  // Phase 4: featured hero replaced by carousel in FeaturedHeroCarousel.
  // The carousel uses home.popular.items directly (filtered in JSX).

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

  // ── Not authenticated → auth screens or sign-up onboarding ──
  if (!auth.session) {
    if (showSignUpOnboarding) {
      // Sign-up via the v2 onboarding flow (Step 1 handles auth)
      return (
        <>
          <OnboardingFlow onComplete={handleOnboardingComplete} />
          <ThemedToaster />
        </>
      );
    }
    return (
      <>
        <AuthScreen
          onSignUpSuccess={handleSignUpSuccess}
          onStartSignUp={() => setShowSignUpOnboarding(true)}
        />
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
        <OnboardingFlow onComplete={handleOnboardingComplete} skipAuth />
        <ThemedToaster />
      </>
    );
  }

  const showTopAppBar = !selectedItem && !selectedAnchorRoom && !showCalendar;

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

        {/* Scrollable content. TopAppBar lives INSIDE the scroller so
            it scrolls away with the rest of the page (no longer
            sticky). When the bar isn't shown (detail / calendar /
            mood-room overlays), the scroller adds its own safe-top so
            content clears the notification bar. */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onTouchStart={(e) => handlePullStart(e.touches[0].clientY)}
          onTouchMove={(e) => handlePullMove(e.touches[0].clientY)}
          onTouchEnd={handlePullEnd}
          className={`flex-1 overflow-y-auto pb-4 no-scrollbar${showTopAppBar ? "" : " safe-top"}`}
          style={{ overflowX: 'hidden', overscrollBehaviorX: 'none', transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined, transition: isPulling.current ? 'none' : 'transform 0.3s ease' }}
        >
          {showTopAppBar && <TopAppBar />}
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
          ) : selectedAnchorRoom ? (
            <motion.div
              key={`anchor-room-${selectedAnchorRoom.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
            <MoodRoomPage
              kind="anchor"
              anchor={selectedAnchorRoom.anchor}
              anchorTitle={selectedAnchorRoom.anchorTitle}
              anchorYear={selectedAnchorRoom.anchorYear}
              llmLabel={selectedAnchorRoom.llmLabel}
              providerIds={connectedServices}
              connectedServiceIds={connectedServiceIds}
              sharedFilters={home.sharedFilters ?? null}
              filterWatched={filterWatched}
              filterLanguage={filterLanguage}
              bookmarkedIds={wl.bookmarkedIds}
              watchedIds={watchedIds}
              onItemSelect={handleItemSelect}
              onToggleBookmark={handleToggleBookmark}
              onBack={handleMoodRoomBack}
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
                  {/* §5.1 — Magazine hero (single feature, replaces the
                      auto-rotating FeaturedHeroCarousel pending Phase 5
                      FeaturedHero matrix row). Picks the first popular,
                      not-yet-watched item with poster art. */}
                  {(() => {
                    const heroItem = home.popular.items.find(
                      (it) => it.image && !watchedIds.has(it.id),
                    );
                    return heroItem ? (
                      <div className="mb-8 mt-2">
                        <MagazineHero
                          item={heroItem}
                          kicker="TODAY'S PICK"
                          standfirst={heroItem.overview}
                          userServices={connectedServiceIds}
                          onSelect={handleItemSelect}
                          bookmarked={wl.bookmarkedIds.has(heroItem.id)}
                          onToggleBookmark={handleToggleBookmark}
                          onMoreInfo={handleItemSelect}
                          runtime={heroItem.runtime}
                          inYourPlan={
                            connectedServiceIds.length > 0 &&
                            heroItem.services.some((s) => connectedServiceIds.includes(s))
                          }
                        />
                      </div>
                    ) : home.loading ? (
                      <div className="mb-8 mt-2">
                        <div
                          className="w-full overflow-hidden"
                          style={{
                            aspectRatio: "4 / 5",
                            background: "var(--surface-elev)",
                          }}
                        />
                      </div>
                    ) : null;
                  })()}

                  {/* §5.2 — Editor's Note (Phase 6 wired). useHomeContent
                      reads from the editor_notes table once-per-day and
                      falls back to a baked-in sample when the table
                      isn't yet populated. */}
                  <div className="editorial mb-8">
                    <EditorsNote
                      kicker={home.editorNote.kicker}
                      teaser={home.editorNote.teaser}
                      body={home.editorNote.body}
                    />
                  </div>

                  {/* Browse-by chips. Static (no sticky / no scroll-hide).
                      The trailing filter button is omitted — Home doesn't
                      need to surface filters at this level. */}
                  <CategoryFilter
                    categories={categories}
                    activeCategory={activeCategory}
                    onCategoryChange={setActiveCategory}
                  />

                  {/* Content rows */}
                  {home.loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                  ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                      {/* §5.3 — Recently added */}
                      <ContentRow
                        kicker="JUST IN"
                        title="Recently added."
                        sectionKey="recently-added"
                        sourceSurface="home"
                        items={filterLanguage(filterWatched(home.recentlyAdded.items))}
                        onItemSelect={handleItemSelect}
                        bookmarkedIds={wl.bookmarkedIds}
                        onToggleBookmark={handleToggleBookmark}
                        userServices={connectedServiceIds}
                        watchedIds={watchedIds}
                        onLoadMore={home.recentlyAdded.loadMore}
                        loadingMore={home.recentlyAdded.loadingMore}
                        hasMore={home.recentlyAdded.hasMore}
                      />

                      {/* Free Tonight — green-framed row of items free
                          on the user's connected free services (BBC /
                          ITVX / Channel 4). Skipped when the user has
                          none of those services. */}
                      <FreeTonight
                        items={filterLanguage(filterWatched(home.popular.items))}
                        userServices={connectedServiceIds}
                        onSelect={handleItemSelect}
                        bookmarkedIds={wl.bookmarkedIds}
                        onToggleBookmark={handleToggleBookmark}
                        watchedIds={watchedIds}
                      />

                      {/* Long Read — hardcoded editorial spotlight.
                          See TODO(IN-V3-001) inside LongRead.tsx for the
                          parking-lot data-source follow-up. */}
                      <LongRead onSelect={() => {}} />

                      {/* §5.4 — The Charts (numbered editorial Top-5) */}
                      <NumberedChart
                        kicker="THE CHARTS"
                        title="Trending across your stack."
                        standfirst="What everyone's queueing tonight."
                        items={filterLanguage(filterWatched(home.popular.items))}
                        userServices={connectedServiceIds}
                        onSelect={handleItemSelect}
                      />

                      {/* §5.5 — Editorial spotlight (single full-bleed lead).
                          Falls back to the second popular item; the first is
                          already used by the Magazine hero. */}
                      {(() => {
                        const spotlight = home.popular.items.find(
                          (it, i) => i > 0 && it.image && !watchedIds.has(it.id),
                        );
                        return spotlight ? (
                          <div className="editorial mt-3 mb-9">
                            <SectionHead
                              kicker="EDITORIAL SPOTLIGHT"
                              title="One to watch tonight."
                              standfirst="Pulled from the chart, with a recommendation."
                            />
                            <ContentCard
                              item={spotlight}
                              variant="lead"
                              onSelect={handleItemSelect}
                              bookmarked={wl.bookmarkedIds.has(spotlight.id)}
                              onToggleBookmark={handleToggleBookmark}
                              userServices={connectedServiceIds}
                              watched={watchedIds.has(spotlight.id)}
                            />
                          </div>
                        ) : null;
                      })()}

                      {/* §5.6 — Per-service rows with service-tinted kickers */}
                      {home.perServiceCharts.map((chart) => (
                        <ContentRow
                          key={`svc-${chart.serviceId}`}
                          kicker={`NEW ON ${chart.serviceName.toUpperCase()}`}
                          kickerColor={`var(--svc-${chart.serviceId})`}
                          title={`This week on ${chart.serviceName}.`}
                          sectionKey={`svc-chart-${chart.serviceId}`}
                          sourceSurface="home"
                          items={filterLanguage(filterWatched(chart.items))}
                          onItemSelect={handleItemSelect}
                          bookmarkedIds={wl.bookmarkedIds}
                          onToggleBookmark={handleToggleBookmark}
                          userServices={connectedServiceIds}
                          watchedIds={watchedIds}
                        />
                      ))}

                      {/* §5.7 — Critics' Picks (landscape WideCard row) */}
                      {home.criticallyAcclaimed.length > 0 && (
                        <section className="mb-8">
                          <div className="editorial mb-3">
                            <SectionHead
                              kicker="CRITICS' PICKS"
                              title="Decade-defining work."
                              standfirst="High-rated cinema, surfaced from your stack."
                            />
                          </div>
                          <div
                            className="flex gap-4 overflow-x-auto no-scrollbar px-5 pb-1"
                            style={{ scrollbarWidth: "none" }}
                          >
                            {filterLanguage(filterWatched(home.criticallyAcclaimed)).map((item) => (
                              <WideCard
                                key={item.id}
                                item={item}
                                userServices={connectedServiceIds}
                                onSelect={handleItemSelect}
                              />
                            ))}
                          </div>
                        </section>
                      )}

                      {/* §5.7 — Calendar strip. Anchored ABOVE the lazy
                          genre chain so it stays put as the user scrolls;
                          the chain loads beneath it. */}
                      {reorderedUpcoming.length > 0 && (
                        <CalendarList
                          items={reorderedUpcoming}
                          kicker="ON THE CALENDAR"
                          title="Coming up."
                          standfirst="The next two weeks across your stack."
                          right={
                            <button
                              type="button"
                              onClick={handleShowCalendar}
                              className="text-primary"
                              style={{ fontSize: "var(--t-meta)", fontWeight: 500 }}
                            >
                              See all →
                            </button>
                          }
                          onSelect={(u) =>
                            handleItemSelect({
                              id: u.id, title: u.title, image: u.image,
                              services: u.services, rating: u.rating, type: u.type,
                            })
                          }
                        />
                      )}

                      {/* Genre Spotlights (Phase 4 — lazy chain). Sits
                          BELOW the calendar; further clusters mount as
                          the user scrolls past the previous sentinel,
                          and the calendar stays anchored where it loaded. */}
                      {home.genreSpotlights.map((spotlight, idx) =>
                        spotlight.items.length > 0 ? (
                          <ContentRow
                            key={`genre-spotlight-${idx}`}
                            kicker="GENRE"
                            title={`${spotlight.clusterName}.`}
                            sectionKey={`genre-spotlight-${idx}`}
                            sourceSurface="home"
                            items={filterLanguage(filterWatched(spotlight.items))}
                            onItemSelect={handleItemSelect}
                            bookmarkedIds={wl.bookmarkedIds}
                            onToggleBookmark={handleToggleBookmark}
                            userServices={connectedServiceIds}
                            watchedIds={watchedIds}
                          />
                        ) : null,
                      )}
                      {home.canLoadMoreGenreSpotlights && (
                        <GenreSpotlightSentinel
                          key={`spotlight-sentinel-${home.genreSpotlights.length}`}
                          onVisible={home.loadMoreGenreSpotlights}
                          loading={home.spotlightsLoading}
                        />
                      )}

                    </motion.div>
                  )}
                </>
              )}

              {activeTab === "foryou" && (
                <ForYouPage
                  providerIds={connectedServices}
                  connectedServiceIds={connectedServiceIds}
                  sharedFilters={home.sharedFilters ?? null}
                  filterWatched={filterWatched}
                  filterLanguage={filterLanguage}
                  onItemSelect={handleItemSelect}
                  onSelectAnchorRoom={handleSelectAnchorRoom}
                  bookmarkedIds={wl.bookmarkedIds}
                  onToggleBookmark={handleToggleBookmark}
                  watchedIds={watchedIds}
                  upcoming={reorderedUpcoming}
                  onSelectUpcoming={(u) =>
                    handleItemSelect({
                      id: u.id, title: u.title, image: u.image,
                      services: u.services, rating: u.rating, type: u.type,
                    })
                  }
                />
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
                  tasteVector={taste.profile?.tasteVector ?? null}
                  semanticFlagOn={semanticFlagOn}
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
                  userServices={connectedServiceIds}
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
            userServices={connectedServiceIds}
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
