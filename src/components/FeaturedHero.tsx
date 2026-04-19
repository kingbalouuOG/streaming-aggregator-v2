import React, { useState, useEffect, useRef, useCallback } from "react";
import { Info, Bookmark } from "lucide-react";
import { EyeFilledIcon } from "./icons";
import { motion } from "motion/react";
import { ServiceBadge } from "./ServiceBadge";
import { ImageSkeleton } from "./ImageSkeleton";
import { getCachedServices } from "@/lib/utils/serviceCache";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
import type { ServiceId } from "./platformLogos";
import type { ContentItem } from "./ContentCard";

// ── Single hero card (used by both single and carousel modes) ──

interface HeroCardProps {
  item: ContentItem;
  bookmarked: boolean;
  watched: boolean;
  userServices?: ServiceId[];
  onToggleBookmark: () => void;
  onInfoClick: () => void;
  scrollY: number;
}

function HeroCard({ item, bookmarked, watched, userServices, onToggleBookmark, onInfoClick, scrollY }: HeroCardProps) {
  const [loadedServices, setLoadedServices] = useState<ServiceId[]>(item.services);

  useEffect(() => {
    if (item.services.length > 0) { setLoadedServices(item.services); return; }
    const { tmdbId, mediaType } = parseContentItemId(item.id);
    getCachedServices(String(tmdbId), mediaType).then(setLoadedServices);
  }, [item.id, item.services]);

  const displayServices = userServices?.length
    ? loadedServices.filter((s) => userServices.includes(s))
    : loadedServices;

  const parallaxOffset = scrollY * 0.4;
  const heroOpacity = Math.max(0, 1 - scrollY / 500);

  const subtitle = item.type === 'tv' ? 'Trending on your services' : 'Popular right now';
  const tags = [
    ...(item.type ? [item.type === 'tv' ? 'TV Show' : item.type === 'doc' ? 'Documentary' : 'Movie'] : []),
    ...(item.year ? [String(item.year)] : []),
  ];

  return (
    <div className="relative w-full h-[380px] flex-shrink-0 overflow-hidden" style={{ scrollSnapAlign: "center" }}>
      {/* Background image with parallax */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translateY(${parallaxOffset}px) scale(${1 + scrollY * 0.0003})`,
          willChange: "transform",
        }}
      >
        <ImageSkeleton
          src={item.image}
          alt={item.title}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Gradient overlays */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to top, rgba(var(--hero-gradient), 1) 0%, rgba(var(--hero-gradient), 0.4) 50%, transparent 100%)`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, rgba(var(--hero-gradient), 0.6) 0%, transparent 40%)`,
        }}
      />

      {/* Content */}
      <div
        className="absolute bottom-0 left-0 right-0 px-5 pt-4 pb-5"
        style={{ opacity: heroOpacity }}
      >
        {/* Service badges */}
        <div className="flex items-center gap-1.5 mb-2">
          {displayServices.map((service) => (
            <ServiceBadge key={service} service={service} size="md" />
          ))}
          {displayServices.length > 0 && (
            <span className="text-white/50 text-[11px] ml-1">Available on {displayServices.length} service{displayServices.length > 1 ? "s" : ""}</span>
          )}
        </div>

        {/* Title */}
        <h1 className="text-white text-[28px] leading-tight mb-1" style={{ fontWeight: 800, letterSpacing: "-0.02em" }}>
          {item.title}
        </h1>
        <p className="text-white/60 text-[13px] mb-3">{subtitle}</p>

        {/* Tags */}
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          {tags.map((tag, index) => (
            <React.Fragment key={tag}>
              <span className="text-white/50 text-[12px]">{tag}</span>
              {index < tags.length - 1 && (
                <span className="text-white/20 text-[10px]">&bull;</span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          {watched ? (
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/50">
              <EyeFilledIcon className="w-4 h-4" />
              <span className="text-[14px]" style={{ fontWeight: 600 }}>Watched</span>
            </div>
          ) : (
            <motion.button
              onClick={onToggleBookmark}
              whileTap={{ scale: 0.92 }}
              animate={bookmarked ? { scale: [1, 1.15, 0.95, 1] } : undefined}
              transition={{ duration: 0.35 }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all shadow-lg ${
                bookmarked
                  ? "bg-primary/20 text-primary border border-primary/50 shadow-primary/20"
                  : "bg-primary text-white shadow-primary/30 hover:brightness-110"
              }`}
            >
              <motion.div
                animate={bookmarked ? { rotateY: [0, 180, 360] } : { rotateY: 0 }}
                transition={{ duration: 0.5 }}
              >
                <Bookmark className={`w-4 h-4 ${bookmarked ? "fill-current" : ""}`} />
              </motion.div>
              <span className="text-[14px]" style={{ fontWeight: 600 }}>
                {bookmarked ? "In Watchlist" : "Add to Watchlist"}
              </span>
            </motion.button>
          )}
          <button onClick={onInfoClick} className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm text-white/80 hover:bg-white/20 transition-all">
            <Info className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Carousel component ──

const AUTO_ROTATE_MS = 6000;
const RESUME_DELAY_MS = 3000;

interface FeaturedHeroCarouselProps {
  items: ContentItem[];
  bookmarkedIds: Set<string>;
  watchedIds: Set<string>;
  userServices?: ServiceId[];
  onToggleBookmark: (item: ContentItem) => void;
  onItemSelect: (item: ContentItem) => void;
  scrollY?: number;
}

export function FeaturedHeroCarousel({
  items,
  bookmarkedIds,
  watchedIds,
  userServices,
  onToggleBookmark,
  onItemSelect,
  scrollY = 0,
}: FeaturedHeroCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const autoRotateRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPausedRef = useRef(false);

  const itemCount = items.length;

  // Track active index from scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIndex(Math.min(idx, itemCount - 1));
  }, [itemCount]);

  // Scroll to a specific index
  const scrollToIndex = useCallback((idx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  }, []);

  // Auto-rotation
  const stopAutoRotate = useCallback(() => {
    if (autoRotateRef.current) {
      clearInterval(autoRotateRef.current);
      autoRotateRef.current = null;
    }
  }, []);

  const startAutoRotate = useCallback(() => {
    if (itemCount <= 1) return;
    stopAutoRotate();
    autoRotateRef.current = setInterval(() => {
      if (isPausedRef.current) return;
      setActiveIndex(prev => {
        const next = (prev + 1) % itemCount;
        scrollToIndex(next);
        return next;
      });
    }, AUTO_ROTATE_MS);
  }, [itemCount, scrollToIndex, stopAutoRotate]);

  // Pause on touch, resume after delay
  const handleTouchStart = useCallback(() => {
    isPausedRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      isPausedRef.current = false;
    }, RESUME_DELAY_MS);
  }, []);

  useEffect(() => {
    startAutoRotate();
    return () => {
      stopAutoRotate();
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [startAutoRotate, stopAutoRotate]);

  if (items.length === 0) return null;

  return (
    <div className="relative" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      {/* Scrollable carousel */}
      <div
        ref={scrollRef}
        className="flex overflow-x-auto no-scrollbar"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}
        onScroll={handleScroll}
        onPointerDown={handleTouchStart}
        onPointerUp={handleTouchEnd}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {items.map((item) => (
          <HeroCard
            key={item.id}
            item={item}
            bookmarked={bookmarkedIds.has(item.id)}
            watched={watchedIds.has(item.id)}
            userServices={userServices}
            onToggleBookmark={() => onToggleBookmark(item)}
            onInfoClick={() => onItemSelect(item)}
            scrollY={scrollY}
          />
        ))}
      </div>

      {/* Dot indicators */}
      {itemCount > 1 && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5 z-10">
          {items.map((_, idx) => (
            <button
              key={idx}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                idx === activeIndex ? "bg-primary w-4" : "bg-white/40"
              }`}
              onClick={() => {
                scrollToIndex(idx);
                isPausedRef.current = true;
                if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
                resumeTimerRef.current = setTimeout(() => { isPausedRef.current = false; }, RESUME_DELAY_MS);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

