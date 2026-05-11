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
}

/**
 * Visual size variants per docs/v3-design/design-system.md §4.
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
   * Phase Search V2 search-results composition. When true, the card
   * renders an off-services state: the bottom-left rating pill is
   * replaced by a "Not on yours" label and the poster + meta drop to
   * 0.75 opacity to read as suppressed (artboard 03 / 06).
   *
   * Mutually exclusive with the rating pill — never both, per the
   * design brief §2 "One signal per element" principle.
   *
   * Default `false` keeps existing call-sites visually unchanged.
   */
  notOnYours?: boolean;
}

export function ContentCard({
  item,
  variant = "default",
  onSelect,
  bookmarked = false,
  onToggleBookmark,
  userServices,
  watched = false,
  notOnYours = false,
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

  // Visible service stack — filtered to the user's connected services
  // when provided so callers can surface "on your stack" cleanly.
  const visibleServices = userServices?.length
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

  return (
    <div
      onClick={() => onSelect?.(item)}
      className={`group ${widthClass} ${widthForBlock} cursor-pointer`}
      style={notOnYours ? { opacity: 0.75 } : undefined}
    >
      {/* Poster */}
      <div
        className={`relative overflow-hidden ${posterClass}`}
        style={{ borderRadius: "var(--r-card)" }}
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

        {/* Bottom-left pill — rating OR "Not on yours", never both
            (design brief §2 "One signal per element"). The off-
            services pill takes priority when `notOnYours` is set so
            search results stay legible at a glance. */}
        {notOnYours ? (
          <div
            className="absolute bottom-2 left-2 inline-flex items-center"
            style={{
              padding: "3px 8px",
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
              letterSpacing: "0.01em",
            }}
          >
            Not on yours
          </div>
        ) : (
          item.rating != null && item.rating > 0 && (
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
          )
        )}
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
        {(item.year || item.genre) && (
          <p
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
          </p>
        )}
      </div>
    </div>
  );
}
