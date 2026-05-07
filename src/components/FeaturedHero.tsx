/**
 * FeaturedHero — swipeable horizontal carousel of editorial heroes.
 *
 * Phase 5 redesign per the matrix: "Replace card-style auto-rotator
 * with editorial magazine hero. No auto-rotate; user swipes." The
 * card-style hero is gone — each entry is now a <MagazineHero>
 * (Phase 5 PR-K) rendering at the editorial 4:5 aspect.
 *
 * Touch interaction: native horizontal overflow with `scroll-snap-x
 * mandatory` so the user swipes between heroes and each one snaps to
 * the viewport. No timer, no auto-rotate, no parallax — the hero
 * gives full control to the reader.
 *
 * Single-item callers can either render <MagazineHero> directly
 * (recommended) or pass a 1-element items array; both behave
 * identically.
 */

import React, { useState, useRef, useEffect } from "react";
import { MagazineHero } from "./MagazineHero";
import type { ServiceId } from "./platformLogos";
import type { ContentItem } from "./ContentCard";

interface FeaturedHeroCarouselProps {
  items: ContentItem[];
  /** Bookmarked-id set; passed through for symmetry (MagazineHero
   *  does not currently render a bookmark control on the hero, but
   *  callers shouldn't have to know that). */
  bookmarkedIds?: Set<string>;
  watchedIds?: Set<string>;
  userServices?: ServiceId[];
  onToggleBookmark?: (item: ContentItem) => void;
  onItemSelect: (item: ContentItem) => void;
  /** Per-item kicker. Defaults to "TODAY'S PICK" on the first slot
   *  and "ALSO TONIGHT" on the rest. */
  kickerForIndex?: (i: number, item: ContentItem) => string;
  /** Optional standfirst per item. */
  standfirstForIndex?: (i: number, item: ContentItem) => string | undefined;
}

export function FeaturedHeroCarousel({
  items,
  userServices,
  onItemSelect,
  kickerForIndex,
  standfirstForIndex,
}: FeaturedHeroCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // Track which slide is centred so we can light up the dot indicator.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const i = Math.round(el.scrollLeft / el.clientWidth);
        setActive(i);
        ticking = false;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  if (items.length === 0) return null;

  const defaultKicker = (i: number) => (i === 0 ? "TODAY'S PICK" : "ALSO TONIGHT");

  return (
    <div className="editorial mb-6 mt-2">
      <div
        ref={scrollRef}
        className="flex w-full overflow-x-auto no-scrollbar"
        style={{
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
        }}
      >
        {items.map((item, i) => (
          <div
            key={item.id}
            className="shrink-0 w-full"
            style={{ scrollSnapAlign: "start" }}
          >
            <MagazineHero
              item={item}
              kicker={kickerForIndex ? kickerForIndex(i, item) : defaultKicker(i)}
              standfirst={
                standfirstForIndex
                  ? standfirstForIndex(i, item)
                  : ([item.year, item.genre].filter(Boolean).join(" · ") || undefined)
              }
              userServices={userServices}
              onSelect={onItemSelect}
            />
          </div>
        ))}
      </div>

      {/* Dot indicator — only when there's more than one slide. */}
      {items.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3" aria-hidden>
          {items.map((_, i) => (
            <span
              key={i}
              style={{
                width: i === active ? 18 : 6,
                height: 6,
                borderRadius: "var(--r-pill)",
                background: i === active ? "var(--primary)" : "var(--surface-tint)",
                transition: "width var(--d-base) var(--ease-out), background var(--d-base) var(--ease-out)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
