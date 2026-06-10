import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { BookmarkIcon, BookmarkFilledIcon, TickIcon } from "./icons";
import { ImageSkeleton } from "./ImageSkeleton";
import { ServiceStack } from "./ServiceBadge";
import { getCachedServices } from "@/lib/utils/serviceCache";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
import type { ServiceId } from "./platformLogos";

export interface ContentItem {
  id: string;
  title: string;
  image: string;
  /** TMDb backdrop URL (16:9). Optional — set by contentAdapter from
   *  the upstream `backdrop_path`. Used by the WideCard variant. */
  backdrop?: string;
  services: ServiceId[];
  rating?: number;
  year?: number;
  type?: "movie" | "tv" | "doc";
  matchPercentage?: number;
  runtime?: number;
  addedAt?: number;
  genre?: string;
  /** Plot synopsis from TMDb. Used as a stopgap standfirst on the
   *  MagazineHero until editorial copy lands (IN-V3-001). */
  overview?: string;
  language?: string;
  genreIds?: number[];
  originalLanguage?: string;
  popularity?: number;
  voteCount?: number;
  /** ENG-1 Workstream C: true for exploration-slot picks in Recommended
   *  For You. ContentRow writes it into card_impressions.metadata so
   *  ENG-2 can measure exploration CTR separately. No visual treatment. */
  exploration?: boolean;
}

/**
 * Visual size variants per docs/design/design-system.md §4.
 *
 *   "default" — 160px wide. Horizontal scrollers.
 *   "wide"    — 220px wide. Horizontal scrollers that want larger cards.
 *   "lead"    — 358px wide, full-bleed. Editorial spotlight rows.
 *   "mosaic"  — fills its parent column at 5:7 aspect. Mosaic grids.
 *   "grid"    — DEPRECATED alias for "mosaic"; remove after the last
 *                non-mosaic call-site migrates.
 */
type Variant = "default" | "wide" | "lead" | "mosaic" | "grid";

interface ContentCardProps {
  item: ContentItem;
  variant?: Variant;
  onSelect?: (item: ContentItem) => void;
  bookmarked?: boolean;
  onToggleBookmark?: (item: ContentItem) => void;
  /**
   * When set, the rendered ServiceStack is filtered to only the user's
   * connected services — so the card surfaces "where to watch on YOUR
   * stack." If undefined, all the title's services render.
   */
  userServices?: ServiceId[];
  watched?: boolean;
  /**
   * Phase Search V2: when true, the poster + its overlays tint to
   * grayscale 0.65 / brightness 0.78 — the pre-attentive signal for
   * "not on your services." Rating and bookmark stay visible and
   * interactive; service icons show *where* the title lives, not
   * filtered to the user's stack.
   *
   * Default `false` keeps every other surface visually unchanged.
   */
  offService?: boolean;
  /**
   * Phase Search V2: bottom-right "From £X.XX" pill. Rendered outside
   * the tinted poster container so the orange chip stays vibrant
   * against the muted backdrop. Use for off-service titles that are
   * still actionable via rent/buy. Pair with `offService=true`.
   */
  rentBuyPriceLabel?: string;
}

export function ContentCard({
  item,
  variant = "default",
  onSelect,
  bookmarked = false,
  onToggleBookmark,
  userServices,
  watched = false,
  offService = false,
  rentBuyPriceLabel,
}: ContentCardProps) {
  const [justToggled, setJustToggled] = useState(false);
  const [allServices, setAllServices] = useState<ServiceId[]>(item.services);

  // Lazy-load services if the parent didn't pre-resolve them. Discover
  // endpoints often return items with empty services arrays; the
  // cached lookup fills them in.
  useEffect(() => {
    if (item.services.length > 0) { setAllServices(item.services); return; }
    const { tmdbId, mediaType } = parseContentItemId(item.id);
    getCachedServices(String(tmdbId), mediaType).then(setAllServices);
  }, [item.id, item.services]);

  // Service stack content depends on the availability state:
  //   - On a user service → filter to the matching service(s) so the
  //     card reads "where to watch on YOUR stack."
  //   - Off-service → show ALL the title's services. The icons carry
  //     the "where it lives" signal that replaces the dropped "Not on
  //     yours" label.
  const visibleServices = offService
    ? allServices
    : userServices?.length
      ? allServices.filter((s) => userServices.includes(s))
      : allServices;

  const handleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    setJustToggled(true);
    onToggleBookmark?.(item);
    setTimeout(() => setJustToggled(false), 400);
  };

  const isMosaic = variant === "mosaic" || variant === "grid";
  const posterClass =
    isMosaic ? "w-full aspect-[5/7]" :
    variant === "lead" ? "w-[358px] aspect-[5/7]" :
    variant === "wide" ? "w-[220px] aspect-[5/7]" :
    "w-[160px] aspect-[5/7]";
  const widthClass = isMosaic ? "w-full" : "shrink-0";
  const widthForBlock =
    isMosaic ? "w-full" :
    variant === "lead" ? "w-[358px]" :
    variant === "wide" ? "w-[220px]" :
    "w-[160px]";

  // Tint applies to every descendant of the poster element — service
  // icons, bookmark, rating pill all dim with the artwork. The rent/
  // buy pill renders *outside* the tinted poster element so the orange
  // chip stays vibrant against the muted backdrop (per the design's
  // "different corners coexist" treatment).
  const posterStyle: React.CSSProperties = {
    borderRadius: "var(--r-card)",
    ...(offService && { filter: "grayscale(0.65) brightness(0.78)" }),
  };

  return (
    <div
      onClick={() => onSelect?.(item)}
      className={`group ${widthClass} ${widthForBlock} cursor-pointer`}
    >
      {/* Poster — wrapped in a position:relative outer so the price
          pill can sit at BR outside the tinted child. */}
      <div className={`relative ${posterClass}`}>
      <div
        className={`relative overflow-hidden w-full h-full`}
        style={posterStyle}
      >
        <ImageSkeleton
          src={item.image}
          alt={item.title}
          className="w-full h-full object-cover"
        />

        {/* Service stack — top-left of poster, full-bleed (no chip)
            with a soft halo so the marks read against any backdrop.
            Cap at 2 to avoid crowding the corner. */}
        {visibleServices.length > 0 && (
          <div
            className="absolute top-2 left-2 inline-flex"
            style={{ filter: "var(--badge-glow)" }}
          >
            <ServiceStack services={visibleServices} size="md" max={2} />
          </div>
        )}

        {/* Bookmark / watched — top-right, 28×28 glass blur */}
        {watched ? (
          <div
            className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center"
            style={{
              borderRadius: "var(--r-md)",
              background: "var(--primary)",
              color: "#fff",
            }}
          >
            <TickIcon className="w-4 h-4" />
          </div>
        ) : (
          <motion.button
            onClick={handleBookmark}
            whileTap={{ scale: 0.85 }}
            animate={
              justToggled
                ? { scale: [1, 1.25, 0.95, 1.05, 1] }
                : { scale: 1 }
            }
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center"
            style={{
              borderRadius: "var(--r-md)",
              background: "var(--scrim-glass-action)",
              backdropFilter: "blur(10px) saturate(160%)",
              WebkitBackdropFilter: "blur(10px) saturate(160%)",
              boxShadow: "var(--scrim-glass-edge)",
              color: "#fff",
            }}
            aria-label={bookmarked ? "Remove bookmark" : "Add bookmark"}
            aria-pressed={bookmarked}
          >
            {bookmarked
              ? <BookmarkFilledIcon className="w-4 h-4" />
              : <BookmarkIcon className="w-4 h-4" />}
          </motion.button>
        )}

        {/* Rating pill — bottom-left, always rendered when present.
            Off-service cards keep the rating: tinting handles the
            availability signal; one corner owns one job. */}
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

      {/* Rent/buy price pill — bottom-right, outside the tint so the
          orange brand colour stays saturated against the muted
          backdrop. Phase Search V2 only renders this on off-service
          rentables; on-service cards never carry it. */}
      {rentBuyPriceLabel ? <div
          className="absolute bottom-2 right-2 inline-flex items-center"
          style={{
            padding: "3px 9px",
            background: "var(--primary)",
            borderRadius: "var(--r-pill)",
            color: "#fff",
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: "0.01em",
            boxShadow: "0 1px 3px rgba(0,0,0,0.30)",
          }}
        >
          {rentBuyPriceLabel}
        </div> : null}
      </div>

      {/* Title + meta — below the poster, not overlaid.
          Service stack now lives on the poster (top-left); meta line
          here is uppercase GENRE · YEAR per the editorial reference. */}
      <div className="mt-2 px-0.5">
        <h3
          className="line-clamp-2"
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "14px",
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
    </div>
  );
}
