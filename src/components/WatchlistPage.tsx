import React, { useState, useEffect, useRef, useCallback } from "react";
import { Bookmark, LayoutGrid, List, Plus, ChevronRight, Trash2, CheckCircle2, ThumbsUp, ThumbsDown, ArrowUpDown, Clock, Star, Timer } from "lucide-react";
import { TickIcon } from "./icons";
import { motion, AnimatePresence } from "motion/react";
import { ContentItem } from "./ContentCard";
import { ServiceBadge } from "./ServiceBadge";
import { ImageSkeleton } from "./ImageSkeleton";
import { getCachedServices } from "@/lib/utils/serviceCache";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
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
  onRemoveBookmark: (id: string) => void;
  onMoveToWatched: (id: string) => void;
  onMoveToWantToWatch: (id: string) => void;
  onItemSelect: (item: ContentItem) => void;
  onNavigateToBrowse: () => void;
  ratings?: Record<string, 'up' | 'down'>;
  onRate?: (id: string, rating: 'up' | 'down' | null) => void;
  activeSubTab?: "want" | "watched";
  onSubTabChange?: (tab: "want" | "watched") => void;
}

export function WatchlistPage({
  watchlist,
  watched,
  onRemoveBookmark,
  onMoveToWatched,
  onMoveToWantToWatch,
  onItemSelect,
  onNavigateToBrowse,
  ratings,
  onRate,
  activeSubTab,
  onSubTabChange,
}: WatchlistPageProps) {
  const [localTab, setLocalTab] = useState<WatchlistTab>("want");
  const activeTab = activeSubTab ?? localTab;
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const [activeSort, setActiveSort] = useState<SortOption>("added");
  const [showSortMenu, setShowSortMenu] = useState(false);

  // Reset category when switching tabs
  const handleTabChange = (tab: WatchlistTab) => {
    if (onSubTabChange) onSubTabChange(tab);
    else setLocalTab(tab);
    setActiveCategory("all");
  };

  const tabItems = activeTab === "want" ? watchlist : watched;
  const categoryCounts = getCategoryCounts(tabItems);
  const items = sortItems(filterByCategory(tabItems, activeCategory), activeSort);
  const totalItems = watchlist.length + watched.length;

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky header + tab bar */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl" style={{ backgroundColor: "var(--background)", paddingTop: "max(0.5rem, env(safe-area-inset-top, 0.5rem))" }}>
        {/* Segmented tab bar */}
        <div className="px-5 mb-4">
        <div className="flex bg-secondary rounded-2xl p-1">
          <button
            onClick={() => handleTabChange("want")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] transition-all duration-250 ${
              activeTab === "want"
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                : "text-muted-foreground hover:text-foreground"
            }`}
            style={{ fontWeight: 600 }}
          >
            <Bookmark
              className="w-3.5 h-3.5"
            />
            Want to Watch ({watchlist.length})
          </button>
          <button
            onClick={() => handleTabChange("watched")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] transition-all duration-250 ${
              activeTab === "watched"
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                : "text-muted-foreground hover:text-foreground"
            }`}
            style={{ fontWeight: 600 }}
          >
            <CheckCircle2
              className="w-3.5 h-3.5"
            />
            Watched ({watched.length})
          </button>
        </div>
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
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-[12px] border transition-all duration-200 ${
                  isActive
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-secondary/50 text-muted-foreground border-transparent"
                }`}
                style={{ fontWeight: isActive ? 600 : 500 }}
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
                {showSortMenu && (
                  <>
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
                  </>
                )}
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
          <p className="text-muted-foreground/50 text-[11px] text-center italic">
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
          viewMode === "grid" ? (
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
              <motion.button
                layout
                onClick={onNavigateToBrowse}
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
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
      transition={{ type: "spring", damping: 25, stiffness: 350 }}
      className="relative group rounded-xl overflow-hidden cursor-pointer aspect-[3/4]"
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowActions(true);
      }}
    >
      {/* Poster */}
      <ImageSkeleton
        src={item.image}
        alt={item.title}
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

      {/* Service badges - top left */}
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1">
        {services.slice(0, 3).map((service) => (
          <ServiceBadge key={service} service={service} size="md" />
        ))}
      </div>

      {/* Bookmark/Watched indicator - top right */}
      {tab === "watched" ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMoveToWantToWatch();
          }}
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center transition-transform active:scale-90"
        >
          <TickIcon className="w-4 h-4 text-white" />
        </button>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-2.5 right-2.5 w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center transition-transform active:scale-90"
        >
          <Bookmark className="w-4 h-4 fill-current" />
        </button>
      )}

      {/* Title + rating at bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <div className="flex items-end justify-between gap-2">
          <h3
            className="text-white text-[14px] leading-tight flex-1 min-w-0"
            style={{ fontWeight: 600 }}
          >
            {item.title}
          </h3>
          {tab === "watched" && onRate && (
            <div className="flex items-center gap-1 shrink-0">
              <motion.button
                onClick={(e) => { e.stopPropagation(); onRate(rating === 'up' ? null : 'up'); }}
                whileTap={{ scale: 0.8 }}
                animate={rating === 'up' ? { scale: [1, 1.2, 1] } : undefined}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 ${
                  rating === 'up'
                    ? "bg-emerald-500 text-white"
                    : "bg-black/50 backdrop-blur-sm text-white/60"
                }`}
              >
                <ThumbsUp className={`w-3 h-3 ${rating === 'up' ? 'fill-current' : ''}`} />
              </motion.button>
              <motion.button
                onClick={(e) => { e.stopPropagation(); onRate(rating === 'down' ? null : 'down'); }}
                whileTap={{ scale: 0.8 }}
                animate={rating === 'down' ? { scale: [1, 1.2, 1] } : undefined}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-200 ${
                  rating === 'down'
                    ? "bg-red-500 text-white"
                    : "bg-black/50 backdrop-blur-sm text-white/60"
                }`}
              >
                <ThumbsDown className={`w-3 h-3 ${rating === 'down' ? 'fill-current' : ''}`} />
              </motion.button>
            </div>
          )}
        </div>
      </div>

      {/* Quick action overlay (on long-press / right-click) */}
      <AnimatePresence>
        {showActions && (
          <motion.div
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ---- Swipeable List Card ---- */
const SWIPE_THRESHOLD = 70;
const ACTION_WIDTH = 140;

function SwipeableListCard({
  item,
  tab,
  onSelect,
  onRemove,
  onMoveToWatched,
  onMoveToWantToWatch,
  rating,
  onRate,
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
      layout
      initial={{ opacity: 0, x: -20 }}
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
            className="text-foreground text-[14px] truncate"
            style={{ fontWeight: 600 }}
          >
            {item.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            {services.slice(0, 3).map((s) => (
              <ServiceBadge key={s} service={s} size="sm" />
            ))}
            {item.year && (
              <span className="text-muted-foreground text-[11px] ml-1">
                {item.year}
              </span>
            )}
            {item.rating && (
              <>
                <span className="text-muted-foreground text-[11px] mx-0.5">
                  ·
                </span>
                <span className="text-yellow-400 text-[11px]">&#9733;</span>
                <span className="text-muted-foreground text-[11px]">
                  {item.rating}
                </span>
              </>
            )}
            {tab === "watched" && onRate && (
              <>
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
              </>
            )}
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

/* ---- Empty State ---- */
function EmptyState({
  tab,
  onBrowse,
}: {
  tab: WatchlistTab;
  onBrowse: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
        {tab === "want" ? (
          <Bookmark className="w-7 h-7 text-muted-foreground" />
        ) : (
          <CheckCircle2 className="w-7 h-7 text-muted-foreground" />
        )}
      </div>
      <p
        className="text-foreground text-[16px] mb-1"
        style={{ fontWeight: 600 }}
      >
        {tab === "want" ? "Nothing here yet" : "No watched titles"}
      </p>
      <p className="text-muted-foreground text-[13px] max-w-[240px] mb-5">
        {tab === "want"
          ? "Bookmark shows and movies while browsing to save them here"
          : "Mark titles as watched to track your progress"}
      </p>
      {tab === "want" && (
        <button
          onClick={onBrowse}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl transition-all hover:brightness-110 shadow-lg shadow-primary/30"
        >
          <Plus className="w-4 h-4" />
          <span className="text-[14px]" style={{ fontWeight: 600 }}>
            Browse Content
          </span>
        </button>
      )}
    </motion.div>
  );
}