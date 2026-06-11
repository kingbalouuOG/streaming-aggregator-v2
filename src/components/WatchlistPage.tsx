import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Bookmark, LayoutGrid, List, Plus, ChevronRight, Trash2, CheckCircle2, ThumbsUp, ThumbsDown, ArrowUpDown, Clock, Star, Timer } from "lucide-react";
import { TickIcon } from "./icons";
import { motion, AnimatePresence } from "motion/react";
import { ContentItem } from "./ContentCard";
import { ServiceBadge } from "./ServiceBadge";
import { ImageSkeleton } from "./ImageSkeleton";
import { getCachedServices } from "@/lib/utils/serviceCache";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
import { useAppStore } from "@/lib/store/appStore";
import type { ServiceId } from "./platformLogos";

type WatchlistTab = "want" | "watched";
type ViewMode = "grid" | "list";
type Category = "all" | "tv" | "movie" | "doc";
type SortOption = "added" | "rating" | "shortest";

const SORT_OPTIONS: { value: SortOption; label: string; icon: typeof Clock }[] = [
  { value: "added", label: "Recently Added", icon: Clock },
  { value: "rating", label: "Highest Rated", icon: Star },
  { value: "shortest", label: "Shortest", icon: Timer },
];

function filterByCategory(items: ContentItem[], category: Category): ContentItem[] {
  if (category === "all") return items;
  return items.filter((i) => i.type === category);
}

function sortItems(items: ContentItem[], sort: SortOption): ContentItem[] {
  const sorted = [...items];
  switch (sort) {
    case "added":
      return sorted.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    case "rating":
      return sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    case "shortest":
      return sorted.sort((a, b) => {
        const aR = a.runtime ?? Infinity;
        const bR = b.runtime ?? Infinity;
        return aR - bR;
      });
    default:
      return sorted;
  }
}

function getCategoryCounts(items: ContentItem[]): Record<Category, number> {
  return {
    all: items.length,
    tv: items.filter((i) => i.type === "tv").length,
    movie: items.filter((i) => i.type === "movie").length,
    doc: items.filter((i) => i.type === "doc").length,
  };
}

interface WatchlistPageProps {
  watchlist: ContentItem[];
  watched: ContentItem[];
  activeSubTab?: "want" | "watched";
  onSubTabChange?: (tab: "want" | "watched") => void;
}

/** __DEV__ 500-item synthetic watchlist seed (PLAT-1 plan Q3).
 *  Triple-tap the tab header to layer 500 local-only ContentItems over
 *  the Want-to-watch list for the scroll-jank acceptance test. Never
 *  written to storage/Supabase; production builds tree-shake this. */
const SYNTHETIC_COUNT = 500;
const SYNTHETIC_SERVICES: ServiceId[] = ["netflix", "prime", "disney", "itvx", "channel4"];
function buildSyntheticItems(): ContentItem[] {
  const now = Date.now();
  return Array.from({ length: SYNTHETIC_COUNT }, (_, i) => ({
    // Non-empty `services` is deliberate: it short-circuits the cards'
    // getCachedServices fallback so synthetic rows never hit TMDb.
    id: `movie-${900001 + i}`,
    title: `Synthetic ${i + 1}`,
    image: "",
    services: [SYNTHETIC_SERVICES[i % SYNTHETIC_SERVICES.length]],
    rating: 5 + ((i * 7) % 50) / 10,
    year: 2000 + (i % 26),
    type: "movie" as const,
    runtime: 45 + (i % 135),
    addedAt: now - i * 60_000,
    genre: "Synthetic",
  }));
}

export function WatchlistPage({
  watchlist,
  watched,
  activeSubTab,
  onSubTabChange,
}: WatchlistPageProps) {
  // PLAT-1: app-level state + stable action callbacks from the store
  // (App is the writer; this page is a reader).
  const userServices = useAppStore((s) => s.userServices);
  const ratings = useAppStore((s) => s.ratings);
  const setAppTab = useAppStore((s) => s.setActiveTab);
  const onItemSelect = useAppStore((s) => s.actions.onItemSelect);
  const onRemoveBookmark = useAppStore((s) => s.actions.onRemoveBookmark);
  const onMoveToWatched = useAppStore((s) => s.actions.onMoveToWatched);
  const onMoveToWantToWatch = useAppStore((s) => s.actions.onMoveToWantToWatch);
  const onRate = useAppStore((s) => s.actions.onRate);
  const onNavigateToBrowse = useCallback(() => setAppTab("browse"), [setAppTab]);

  const [localTab, setLocalTab] = useState<WatchlistTab>("want");
  const activeTab = activeSubTab ?? localTab;
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [activeSort, setActiveSort] = useState<SortOption>("added");
  const [showSortMenu, setShowSortMenu] = useState(false);

  // ── __DEV__ synthetic seed (PLAT-1 plan Q3) ─────────────────────
  // LOCAL component state only — layered over the real list at render
  // time, never persisted. Triple-tap the tab header toggles it.
  const [syntheticActive, setSyntheticActive] = useState(false);
  const seedTapCountRef = useRef(0);
  const seedTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSeedGesture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!__DEV__) return;
    // Taps on the tab chips themselves switch tabs — only count taps
    // on the header's non-interactive area.
    if ((e.target as HTMLElement).closest("button")) return;
    seedTapCountRef.current += 1;
    if (seedTapTimerRef.current) clearTimeout(seedTapTimerRef.current);
    if (seedTapCountRef.current >= 3) {
      seedTapCountRef.current = 0;
      setSyntheticActive((v) => !v);
    } else {
      seedTapTimerRef.current = setTimeout(() => {
        seedTapCountRef.current = 0;
      }, 600);
    }
  };
  const syntheticItems = useMemo<ContentItem[]>(
    () => (__DEV__ && syntheticActive ? buildSyntheticItems() : []),
    [syntheticActive]
  );
  const effectiveWatchlist = useMemo(
    () => (syntheticItems.length > 0 ? [...watchlist, ...syntheticItems] : watchlist),
    [watchlist, syntheticItems]
  );

  // Reset category when switching tabs
  const handleTabChange = (tab: WatchlistTab) => {
    if (onSubTabChange) onSubTabChange(tab);
    else setLocalTab(tab);
    setActiveCategory("all");
  };

  const tabItems = activeTab === "want" ? effectiveWatchlist : watched;
  const categoryCounts = getCategoryCounts(tabItems);
  const items = sortItems(filterByCategory(tabItems, activeCategory), activeSort);
  const totalItems = effectiveWatchlist.length + watched.length;

  // ── PLAT-1 §3: list virtualization (E&P brief §5) ──────────────
  // Long lists render through a row virtualizer attached to the
  // App-level scroll container (App.tsx scrollRef — the nearest
  // overflow-y ancestor). Short lists keep the original, fully
  // animated markup so empty/short states stay pixel-identical.
  const VIRTUALIZE_MIN = 21;
  const virtualize = items.length >= VIRTUALIZE_MIN;
  const gridMode = viewMode === "grid";
  // Grid mode chunks items into 2-per-row pairs; the trailing "Add
  // titles" card occupies the slot after the last item, so the row
  // count covers items.length + 1 slots. List mode is 1 item per row.
  const rowCount = virtualize
    ? gridMode
      ? Math.ceil((items.length + 1) / 2)
      : items.length
    : 0;

  const listWrapRef = useRef<HTMLDivElement | null>(null);
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Resolve the nearest scrollable ancestor and the list's offset
  // within it. The deps cover every piece of state that can change
  // the height of the content above the list (tabs, pills, progress
  // bar, swipe hint); the guarded setState only re-renders when the
  // offset actually moved.
  useLayoutEffect(() => {
    const el = listWrapRef.current;
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
  }, [effectiveWatchlist.length, watched.length, items.length, tabItems.length, totalItems, viewMode, activeTab, activeCategory, activeSort]);

  const rowVirtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: rowCount,
    getScrollElement: () => scrollParentRef.current,
    // Grid rows: 5/7 poster (~237px at 390px viewports) + 8px text
    // offset + ~47px title/meta + 12px row gap. List rows: 80px thumb
    // + 20px card padding + 8px row gap. measureElement corrects.
    estimateSize: () => (gridMode ? 304 : 108),
    overscan: 4,
    scrollMargin,
    getItemKey: (index) =>
      gridMode ? items[index * 2]?.id ?? "add-card-row" : items[index].id,
  });

  // Measured row heights are keyed by item id, and the same id maps
  // to a very different height in grid vs list mode — flush the
  // measurement cache when the view mode flips.
  useEffect(() => {
    rowVirtualizer.measure();
  }, [viewMode, rowVirtualizer]);

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky header + tab bar */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl" style={{ backgroundColor: "var(--background)", paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))" }}>
        {/* Editorial chip tabs — replace the segmented control.
            __DEV__: triple-tap the non-button area of this header row
            to toggle the 500-item synthetic seed (PLAT-1 plan Q3). */}
        <div
          className="px-5 pt-3 mb-4 flex gap-2 items-center"
          onClick={__DEV__ ? handleSeedGesture : undefined}
        >
          {(["want", "watched"] as const).map((t) => {
            const active = activeTab === t;
            const label = t === "want" ? "Want to watch" : "Watched";
            const count = t === "want" ? effectiveWatchlist.length : watched.length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => handleTabChange(t)}
                className="inline-flex items-center gap-2 px-3 py-1.5"
                style={{
                  background: active ? "var(--primary-soft)" : "transparent",
                  color: active ? "var(--primary)" : "var(--fg-soft)",
                  border: active
                    ? "1px solid color-mix(in srgb, var(--primary) 50%, transparent)"
                    : "1px solid var(--hairline)",
                  borderRadius: "var(--r-pill)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  letterSpacing: "0.01em",
                  transition: "background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out)",
                }}
              >
                {t === "want" ? <Bookmark className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                <span>{label}</span>
                <span style={{ opacity: active ? 0.7 : 0.6 }}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Category filter pills */}
      {tabItems.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto px-5 mb-3 no-scrollbar">
          {(["all", "tv", "movie", "doc"] as Category[]).map((cat) => {
            const count = categoryCounts[cat];
            if (cat !== "all" && count === 0) return null;
            const label = cat === "all" ? "All" : cat === "tv" ? "TV Shows" : cat === "movie" ? "Movies" : "Docs";
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className="shrink-0 px-3 py-1.5 text-[12px] transition-all duration-200"
                style={{
                  background: isActive ? "var(--primary-soft)" : "transparent",
                  color: isActive ? "var(--primary)" : "var(--fg-soft)",
                  border: isActive
                    ? "1px solid color-mix(in srgb, var(--primary) 50%, transparent)"
                    : "1px solid var(--hairline)",
                  borderRadius: "var(--r-pill)",
                  fontFamily: "var(--font-ui)",
                  fontWeight: isActive ? 600 : 500,
                  letterSpacing: "0.01em",
                }}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Count + sort + view toggle */}
      {tabItems.length > 0 && (
        <div className="flex items-center justify-between px-5 mb-3">
          <span className="text-muted-foreground text-[13px]">
            {items.length} title{items.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            {/* Sort dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowUpDown className="w-3 h-3" />
                <span className="text-[12px]" style={{ fontWeight: 500 }}>
                  {SORT_OPTIONS.find((o) => o.value === activeSort)?.label}
                </span>
              </button>
              <AnimatePresence>
                {showSortMenu ? <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-30 bg-black/10"
                      onClick={() => setShowSortMenu(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-1 min-w-[180px] rounded-xl bg-card border shadow-lg z-40 overflow-hidden"
                    >
                      {SORT_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        const isActive = activeSort === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => { setActiveSort(opt.value); setShowSortMenu(false); }}
                            className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] transition-colors ${
                              isActive
                                ? "text-primary bg-primary/8"
                                : "text-foreground hover:bg-secondary/50"
                            }`}
                            style={{ fontWeight: isActive ? 600 : 500 }}
                          >
                            <Icon className="w-3.5 h-3.5" />
                            {opt.label}
                          </button>
                        );
                      })}
                    </motion.div>
                  </> : null}
              </AnimatePresence>
            </div>
            {/* View mode toggle */}
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={() => setViewMode("grid")}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  viewMode === "grid"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  viewMode === "list"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Swipe hint - only in list view with items */}
      {items.length > 0 && viewMode === "list" && (
        <div className="px-5 mb-2">
          <p className="text-muted-foreground/50 text-[11px] text-center">
            Swipe left on a title for quick actions
          </p>
        </div>
      )}

      {/* Progress bar - shows when there are watched items */}
      {totalItems > 0 && watched.length > 0 && (
        <div className="px-5 mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-muted-foreground text-[11px]">
              Watched {watched.length} of {totalItems}
            </span>
            <span className="text-primary text-[11px]" style={{ fontWeight: 600 }}>
              {Math.round((watched.length / totalItems) * 100)}%
            </span>
          </div>
          <div className="h-1 bg-secondary rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: `${(watched.length / totalItems) * 100}%`,
              }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 px-5">
        {items.length > 0 ? (
          virtualize ? (
            /* Virtualized path — rows are absolutely positioned inside
               a total-height container. Grid rows hold an item pair in
               the same `grid grid-cols-2 gap-3` shell; the inter-row
               gap is baked into each row as padding so measured row
               heights include it (last row stays flush, as today). */
            <div
              ref={listWrapRef}
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
                  {gridMode ? (
                    <div
                      className="grid grid-cols-2 gap-3"
                      style={{ paddingBottom: vRow.index === rowCount - 1 ? 0 : 12 }}
                    >
                      {[vRow.index * 2, vRow.index * 2 + 1].map((slot) => {
                        if (slot < items.length) {
                          const item = items[slot];
                          return (
                            <GridCard
                              key={item.id}
                              item={item}
                              tab={activeTab}
                              onSelect={() => onItemSelect(item)}
                              onRemove={() => onRemoveBookmark(item.id)}
                              onMoveToWatched={() => onMoveToWatched(item.id)}
                              onMoveToWantToWatch={() => onMoveToWantToWatch(item.id)}
                              rating={ratings?.[item.id]}
                              onRate={onRate ? (r) => onRate(item.id, r) : undefined}
                              virtualized
                            />
                          );
                        }
                        if (slot === items.length) {
                          return <AddTitlesCard key="add-card" onClick={onNavigateToBrowse} />;
                        }
                        return null;
                      })}
                    </div>
                  ) : (
                    <div style={{ paddingBottom: vRow.index === rowCount - 1 ? 0 : 8 }}>
                      <SwipeableListCard
                        item={items[vRow.index]}
                        tab={activeTab}
                        onSelect={() => onItemSelect(items[vRow.index])}
                        onRemove={() => onRemoveBookmark(items[vRow.index].id)}
                        onMoveToWatched={() => onMoveToWatched(items[vRow.index].id)}
                        onMoveToWantToWatch={() => onMoveToWantToWatch(items[vRow.index].id)}
                        rating={ratings?.[items[vRow.index].id]}
                        onRate={onRate ? (r) => onRate(items[vRow.index].id, r) : undefined}
                        userServices={userServices}
                        virtualized
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 gap-3">
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <GridCard
                    key={item.id}
                    item={item}
                    tab={activeTab}
                    onSelect={() => onItemSelect(item)}
                    onRemove={() => onRemoveBookmark(item.id)}
                    onMoveToWatched={() => onMoveToWatched(item.id)}
                    onMoveToWantToWatch={() => onMoveToWantToWatch(item.id)}
                    rating={ratings?.[item.id]}
                    onRate={onRate ? (r) => onRate(item.id, r) : undefined}
                  />
                ))}
              </AnimatePresence>
              {/* Add card */}
              <AddTitlesCard onClick={onNavigateToBrowse} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <SwipeableListCard
                    key={item.id}
                    item={item}
                    tab={activeTab}
                    onSelect={() => onItemSelect(item)}
                    onRemove={() => onRemoveBookmark(item.id)}
                    onMoveToWatched={() => onMoveToWatched(item.id)}
                    onMoveToWantToWatch={() => onMoveToWantToWatch(item.id)}
                    rating={ratings?.[item.id]}
                    onRate={onRate ? (r) => onRate(item.id, r) : undefined}
                    userServices={userServices}
                  />
                ))}
              </AnimatePresence>
            </div>
          )
        ) : tabItems.length > 0 ? (
          /* Category filter yielded no results */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-muted-foreground text-[14px]" style={{ fontWeight: 500 }}>
              No {activeCategory === "tv" ? "TV shows" : activeCategory === "movie" ? "movies" : "docs"} in this list
            </p>
            <button
              onClick={() => setActiveCategory("all")}
              className="text-primary text-[13px] mt-2"
              style={{ fontWeight: 500 }}
            >
              Show all
            </button>
          </div>
        ) : (
          <EmptyState tab={activeTab} onBrowse={onNavigateToBrowse} />
        )}
      </div>
    </div>
  );
}

/* ---- Add-titles card (shared by virtual + non-virtual grid) ---- */
function AddTitlesCard({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      layout
      onClick={onClick}
      className="aspect-[3/4] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors cursor-pointer"
      style={{ borderColor: "var(--overlay-medium)" }}
    >
      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
        <Plus className="w-5 h-5" />
      </div>
      <span className="text-[12px]" style={{ fontWeight: 500 }}>
        Add titles
      </span>
    </motion.button>
  );
}

/* ---- Grid Card ---- */
interface CardProps {
  item: ContentItem;
  tab: WatchlistTab;
  onSelect: () => void;
  onRemove: () => void;
  onMoveToWatched: () => void;
  onMoveToWantToWatch: () => void;
  rating?: 'up' | 'down';
  onRate?: (rating: 'up' | 'down' | null) => void;
  userServices?: ServiceId[];
  /** True when the card renders inside a virtual row. Disables the
   *  mount/layout animations — virtual rows remount on scroll, so
   *  replaying the entrance animation per scroll-into-view would be
   *  a visible behaviour change from the non-virtual grid. */
  virtualized?: boolean;
}

function GridCard({
  item,
  tab,
  onSelect,
  onRemove,
  onMoveToWatched,
  onMoveToWantToWatch,
  rating,
  onRate,
  virtualized,
}: CardProps) {
  const [showActions, setShowActions] = useState(false);
  const [services, setServices] = useState<ServiceId[]>(item.services);

  useEffect(() => {
    if (item.services.length > 0) {
      setServices(item.services);
      return;
    }
    const { tmdbId, mediaType } = parseContentItemId(item.id);
    getCachedServices(String(tmdbId), mediaType).then(setServices);
  }, [item.id, item.services]);

  return (
    <motion.div
      layout={!virtualized}
      initial={virtualized ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
      transition={{ type: "spring", damping: 25, stiffness: 350 }}
      className="relative group cursor-pointer"
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowActions(true);
      }}
    >
      {/* Poster — matches ContentCard anatomy: services TL glass chip,
          bookmark/tick TR, ★ rating BL, title + meta beneath the
          poster (not overlaid). */}
      <div
        className="relative w-full aspect-[5/7] overflow-hidden"
        style={{ borderRadius: "var(--r-card)" }}
      >
        <ImageSkeleton
          src={item.image}
          alt={item.title}
          className="w-full h-full object-cover"
        />

        {services.length > 0 && (
          <div
            className="absolute top-2 left-2 inline-flex items-center gap-0.5"
            style={{ filter: "var(--badge-glow)" }}
          >
            {services.slice(0, 2).map((service) => (
              <ServiceBadge key={service} service={service} size="md" />
            ))}
          </div>
        )}

        {tab === "watched" ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMoveToWantToWatch(); }}
            className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center transition-transform active:scale-90"
            style={{
              borderRadius: "var(--r-md)",
              background: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
            aria-label="Move to want to watch"
          >
            <TickIcon className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center transition-transform active:scale-90"
            style={{
              borderRadius: "var(--r-md)",
              background: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
            aria-label="Remove from watchlist"
          >
            <Bookmark className="w-4 h-4 fill-current" />
          </button>
        )}

        {item.rating != null && item.rating > 0 && (
          <div
            className="absolute bottom-2 left-2 inline-flex items-center gap-1"
            style={{
              padding: "3px 7px",
              background: "var(--scrim-glass-action)",
              backdropFilter: "blur(8px) saturate(160%)",
              WebkitBackdropFilter: "blur(8px) saturate(160%)",
              boxShadow: "var(--scrim-glass-edge)",
              borderRadius: "var(--r-pill)",
              color: "#fff",
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            <span style={{ color: "var(--star)" }}>★</span>
            <span>{item.rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      {/* Title + meta + thumbs (watched) — beneath the poster */}
      <div className="mt-2 px-0.5 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3
            className="line-clamp-2"
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--fg)",
              lineHeight: 1.25,
            }}
          >
            {item.title}
          </h3>
          {(item.year || item.genre) ? <p
              className="mt-1 truncate"
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--fg-faint)",
                lineHeight: 1.3,
                margin: 0,
              }}
            >
              {[item.genre, item.year].filter(Boolean).join(" · ")}
            </p> : null}
        </div>
        {tab === "watched" && onRate ? <div className="flex items-center gap-1 shrink-0 mt-0.5">
            <motion.button
              onClick={(e) => { e.stopPropagation(); onRate(rating === 'up' ? null : 'up'); }}
              whileTap={{ scale: 0.8 }}
              animate={rating === 'up' ? { scale: [1, 1.2, 1] } : undefined}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200"
              style={{
                background: rating === 'up' ? 'var(--success)' : 'var(--surface-tint)',
                color: rating === 'up' ? '#fff' : 'var(--fg-faint)',
              }}
              aria-label="Thumbs up"
            >
              <ThumbsUp className={`w-3 h-3 ${rating === 'up' ? 'fill-current' : ''}`} />
            </motion.button>
            <motion.button
              onClick={(e) => { e.stopPropagation(); onRate(rating === 'down' ? null : 'down'); }}
              whileTap={{ scale: 0.8 }}
              animate={rating === 'down' ? { scale: [1, 1.2, 1] } : undefined}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200"
              style={{
                background: rating === 'down' ? 'var(--danger)' : 'var(--surface-tint)',
                color: rating === 'down' ? '#fff' : 'var(--fg-faint)',
              }}
              aria-label="Thumbs down"
            >
              <ThumbsDown className={`w-3 h-3 ${rating === 'down' ? 'fill-current' : ''}`} />
            </motion.button>
          </div> : null}
      </div>

      {/* Quick action overlay (on long-press / right-click) */}
      <AnimatePresence>
        {showActions ? <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-10 p-3"
            onClick={(e) => {
              e.stopPropagation();
              setShowActions(false);
            }}
          >
            {tab === "want" ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveToWatched();
                  setShowActions(false);
                }}
                className="w-full py-2.5 rounded-xl bg-primary text-white text-[13px] flex items-center justify-center gap-2"
                style={{ fontWeight: 600 }}
              >
                <CheckCircle2 className="w-4 h-4" />
                Mark as Watched
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveToWantToWatch();
                  setShowActions(false);
                }}
                className="w-full py-2.5 rounded-xl bg-primary text-white text-[13px] flex items-center justify-center gap-2"
                style={{ fontWeight: 600 }}
              >
                <Bookmark className="w-4 h-4" />
                Move to Want to Watch
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
                setShowActions(false);
              }}
              className="w-full py-2.5 rounded-xl bg-secondary text-foreground text-[13px] flex items-center justify-center gap-2"
              style={{ fontWeight: 600 }}
            >
              Remove
            </button>
          </motion.div> : null}
      </AnimatePresence>
    </motion.div>
  );
}

/* ---- Swipeable List Card ---- */
const SWIPE_THRESHOLD = 70;
const ACTION_WIDTH = 140;

function relativeAdded(addedAt?: number): string | null {
  if (!addedAt) return null;
  const minutes = Math.max(1, Math.floor((Date.now() - addedAt) / 60_000));
  if (minutes < 60) return `${minutes}M AGO`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}D AGO`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}MO AGO`;
  return `${Math.floor(months / 12)}Y AGO`;
}

function SwipeableListCard({
  item,
  tab,
  onSelect,
  onRemove,
  onMoveToWatched,
  onMoveToWantToWatch,
  rating,
  onRate,
  userServices,
  virtualized,
}: CardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const [services, setServices] = useState<ServiceId[]>(item.services);

  useEffect(() => {
    if (item.services.length > 0) {
      setServices(item.services);
      return;
    }
    const { tmdbId, mediaType } = parseContentItemId(item.id);
    getCachedServices(String(tmdbId), mediaType).then(setServices);
  }, [item.id, item.services]);
  const isHorizontalRef = useRef<boolean | null>(null);
  const currentOffsetRef = useRef(0);
  const isDraggingRef = useRef(false);

  // --- Shared pointer logic ---
  const startSwipe = useCallback((clientX: number, clientY: number) => {
    touchStartRef.current = { x: clientX, y: clientY, time: Date.now() };
    isHorizontalRef.current = null;
    setIsSwiping(true);
  }, []);

  const moveSwipe = useCallback((clientX: number, clientY: number) => {
    if (!isSwiping) return false;
    const deltaX = clientX - touchStartRef.current.x;
    const deltaY = clientY - touchStartRef.current.y;

    if (isHorizontalRef.current === null) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        isHorizontalRef.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
      return false;
    }

    if (!isHorizontalRef.current) return false;

    const startOffset = isOpen ? -ACTION_WIDTH : 0;
    let newOffset = startOffset + deltaX;

    if (newOffset > 0) {
      newOffset = newOffset * 0.3;
    } else if (newOffset < -ACTION_WIDTH) {
      newOffset = -ACTION_WIDTH - (Math.abs(newOffset) - ACTION_WIDTH) * 0.3;
    }

    currentOffsetRef.current = newOffset;
    setOffsetX(newOffset);
    isDraggingRef.current = true;
    return true;
  }, [isSwiping, isOpen]);

  const endSwipe = useCallback(() => {
    setIsSwiping(false);
    isHorizontalRef.current = null;
    const offset = currentOffsetRef.current;
    const velocity = Math.abs(offset) / ((Date.now() - touchStartRef.current.time) || 1);

    if (offset < -SWIPE_THRESHOLD || (offset < -30 && velocity > 0.5)) {
      setOffsetX(-ACTION_WIDTH);
      currentOffsetRef.current = -ACTION_WIDTH;
      setIsOpen(true);
    } else {
      setOffsetX(0);
      currentOffsetRef.current = 0;
      setIsOpen(false);
    }

    // Reset drag flag after a tick so click handler can check it
    setTimeout(() => { isDraggingRef.current = false; }, 0);
  }, []);

  // --- Touch events ---
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startSwipe(touch.clientX, touch.clientY);
  }, [startSwipe]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const handled = moveSwipe(touch.clientX, touch.clientY);
    if (handled) e.preventDefault();
  }, [moveSwipe]);

  const handleTouchEnd = useCallback(() => {
    endSwipe();
  }, [endSwipe]);

  // --- Mouse events (for desktop) ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    startSwipe(e.clientX, e.clientY);

    const onMouseMove = (ev: MouseEvent) => {
      moveSwipe(ev.clientX, ev.clientY);
    };
    const onMouseUp = () => {
      endSwipe();
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [startSwipe, moveSwipe, endSwipe]);

  const handleClose = useCallback(() => {
    setOffsetX(0);
    currentOffsetRef.current = 0;
    setIsOpen(false);
  }, []);

  const handlePrimaryAction = useCallback(() => {
    handleClose();
    if (tab === "want") {
      onMoveToWatched();
    } else {
      onMoveToWantToWatch();
    }
  }, [tab, onMoveToWatched, onMoveToWantToWatch, handleClose]);

  const handleDeleteAction = useCallback(() => {
    handleClose();
    onRemove();
  }, [onRemove, handleClose]);

  const revealProgress = Math.min(1, Math.abs(offsetX) / ACTION_WIDTH);

  return (
    <motion.div
      layout={!virtualized}
      initial={virtualized ? false : { opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -60, transition: { duration: 0.25 } }}
      transition={{ type: "spring", damping: 25, stiffness: 350 }}
      className="relative rounded-xl overflow-hidden"
    >
      {/* Action buttons revealed behind */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch"
        style={{ width: ACTION_WIDTH }}
      >
        {/* Primary action */}
        <button
          onClick={handlePrimaryAction}
          className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${
            tab === "want"
              ? "bg-emerald-600 hover:bg-emerald-500"
              : "bg-primary hover:bg-primary/80"
          }`}
          style={{
            opacity: revealProgress,
            transform: `scale(${0.8 + revealProgress * 0.2})`,
          }}
        >
          {tab === "want" ? (
            <CheckCircle2 className="w-5 h-5 text-white" />
          ) : (
            <Bookmark className="w-5 h-5 text-white" />
          )}
          <span
            className="text-white text-[10px] leading-tight text-center px-1"
            style={{ fontWeight: 600 }}
          >
            {tab === "want" ? "Watched" : "Unwatched"}
          </span>
        </button>
        {/* Delete action */}
        <button
          onClick={handleDeleteAction}
          className="flex-1 flex flex-col items-center justify-center gap-1 bg-red-600 hover:bg-red-500 transition-all"
          style={{
            opacity: revealProgress,
            transform: `scale(${0.8 + revealProgress * 0.2})`,
          }}
        >
          <Trash2 className="w-5 h-5 text-white" />
          <span
            className="text-white text-[10px] leading-tight"
            style={{ fontWeight: 600 }}
          >
            Remove
          </span>
        </button>
      </div>

      {/* Foreground card */}
      <div
        className="relative flex items-center gap-3 bg-secondary/50 rounded-xl p-2.5 cursor-pointer z-10 select-none"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isSwiping ? "none" : "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
          willChange: "transform",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onClick={() => {
          if (isDraggingRef.current) return;
          if (isOpen) {
            handleClose();
          } else {
            onSelect();
          }
        }}
      >
        {/* Thumbnail */}
        <div className="relative w-14 h-20 rounded-lg overflow-hidden shrink-0">
          <ImageSkeleton
            src={item.image}
            alt={item.title}
            className="w-full h-full object-cover"
          />
          {tab === "watched" && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <TickIcon className="w-4 h-4 text-emerald-400" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3
            className="text-foreground truncate"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              fontWeight: 700,
              fontVariationSettings: '"opsz" 24',
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
            }}
          >
            {item.title}
          </h3>
          {(() => {
            const inPlan =
              !!userServices?.length &&
              services.some((s) => userServices.includes(s));
            const added = relativeAdded(item.addedAt);
            return (
              <div
                className="flex items-center gap-2 mt-1 flex-wrap"
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--fg-faint)",
                }}
              >
                {services[0] ? <ServiceBadge service={services[0]} size="sm" /> : null}
                {inPlan ? <span
                    style={{
                      background: "color-mix(in srgb, var(--primary) 18%, transparent)",
                      color: "#fff",
                      border: "0.5px solid color-mix(in srgb, var(--primary) 50%, transparent)",
                      borderRadius: "var(--r-pill)",
                      padding: "1px 6px",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                    }}
                  >
                    IN YOUR PLAN
                  </span> : null}
                {added ? <span>{added}</span> : null}
                {item.rating != null && item.rating > 0 && (
                  <span>
                    <span style={{ color: "var(--star)" }}>★</span> {item.rating.toFixed(1)}
                  </span>
                )}
              </div>
            );
          })()}
          <div className="flex items-center gap-1.5 mt-1">
            {tab === "watched" && onRate ? <>
                <span className="text-muted-foreground text-[11px] mx-0.5">·</span>
                <motion.button
                  onClick={(e) => { e.stopPropagation(); onRate(rating === 'up' ? null : 'up'); }}
                  whileTap={{ scale: 0.8 }}
                  className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 ${
                    rating === 'up' ? "text-emerald-400" : "text-muted-foreground/40"
                  }`}
                >
                  <ThumbsUp className={`w-3 h-3 ${rating === 'up' ? 'fill-current' : ''}`} />
                </motion.button>
                <motion.button
                  onClick={(e) => { e.stopPropagation(); onRate(rating === 'down' ? null : 'down'); }}
                  whileTap={{ scale: 0.8 }}
                  className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 ${
                    rating === 'down' ? "text-red-400" : "text-muted-foreground/40"
                  }`}
                >
                  <ThumbsDown className={`w-3 h-3 ${rating === 'down' ? 'fill-current' : ''}`} />
                </motion.button>
              </> : null}
          </div>
        </div>

        {/* Inline actions (visible when not swiped) */}
        <div
          className="flex items-center gap-1 shrink-0 transition-opacity"
          style={{ opacity: isOpen ? 0 : 1 }}
        >
          {tab === "want" ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveToWatched();
              }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors"
              title="Mark as watched"
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveToWantToWatch();
              }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Move to want to watch"
            >
              <Bookmark className="w-4 h-4" />
            </button>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
        </div>
      </div>
    </motion.div>
  );
}

/* ---- Empty State ----
 * Editor's-note tone per the Phase 4 matrix: kicker, Fraunces title,
 * italic standfirst, no decorative icon-tile.
 */
function EmptyState({
  tab,
  onBrowse,
}: {
  tab: WatchlistTab;
  onBrowse: () => void;
}) {
  const isWant = tab === "want";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="editorial flex flex-col items-start py-16"
    >
      <span
        className="t-kicker"
        style={{ marginBottom: 12 }}
      >
        {isWant ? "EDITOR'S NOTE · YOUR LIST" : "EDITOR'S NOTE · ARCHIVE"}
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
        {isWant ? "An empty queue is a fresh slate." : "Nothing watched yet — that's a feature."}
      </h2>
      <p
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "var(--t-body)",
          fontWeight: 400,
          color: "var(--fg-soft)",
          lineHeight: 1.45,
          margin: 0,
          marginBottom: 24,
        }}
      >
        {isWant
          ? "Bookmark shows and films as you browse — they'll land here, ready for tonight."
          : "Mark titles as watched once you've finished them; they collect here as a private archive."}
      </p>
      {isWant ? <button
          type="button"
          onClick={onBrowse}
          className="inline-flex items-center gap-2 px-5 py-2.5"
          style={{
            background: "var(--primary)",
            color: "#fff",
            borderRadius: "var(--r-pill)",
            fontFamily: "var(--font-ui)",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          <Plus className="w-4 h-4" />
          <span>Browse content →</span>
        </button> : null}
    </motion.div>
  );
}