import React, { useState, useEffect } from "react";
import { Bookmark } from "lucide-react";
import { TickIcon } from "./icons";
import { motion } from "motion/react";
import { ServiceBadge } from "./ServiceBadge";
import { ImageSkeleton } from "./ImageSkeleton";
import { getCachedServices } from "@/lib/utils/serviceCache";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
import type { ServiceId } from "./platformLogos";

export interface ContentItem {
  id: string;
  title: string;
  image: string;
  services: ServiceId[];
  rating?: number;
  year?: number;
  type?: "movie" | "tv" | "doc";
  matchPercentage?: number;
  runtime?: number;
  addedAt?: number;
  genre?: string;
  language?: string;
  genreIds?: number[];
  originalLanguage?: string;
  popularity?: number;
  voteCount?: number;
}

interface ContentCardProps {
  item: ContentItem;
  /**
   * Visual size of the card.
   *
   *   "default" — fixed 165x240 for horizontal ContentRow scrollers.
   *   "wide"    — fixed 200x280 for horizontal ContentRow scrollers
   *                that want slightly larger cards.
   *   "grid"    — fills its parent column, maintains a 5:7 poster
   *                aspect ratio. Use in 2-col (or wider) CSS grids
   *                where fixed widths would overflow narrow columns.
   */
  variant?: "default" | "wide" | "grid";
  onSelect?: (item: ContentItem) => void;
  bookmarked?: boolean;
  onToggleBookmark?: (item: ContentItem) => void;
  userServices?: ServiceId[];
  watched?: boolean;
}

export function ContentCard({ item, variant = "default", onSelect, bookmarked = false, onToggleBookmark, userServices, watched = false }: ContentCardProps) {
  const [justToggled, setJustToggled] = useState(false);
  const [allServices, setAllServices] = useState<ServiceId[]>(item.services);

  useEffect(() => {
    if (item.services.length > 0) return;
    const { tmdbId, mediaType } = parseContentItemId(item.id);
    getCachedServices(String(tmdbId), mediaType).then(setAllServices);
  }, [item.id, item.services]);

  const services = userServices?.length
    ? allServices.filter((s) => userServices.includes(s))
    : allServices;

  const handleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    setJustToggled(true);
    onToggleBookmark?.(item);
    setTimeout(() => setJustToggled(false), 400);
  };

  const sizeClass =
    variant === "grid" ? "w-full aspect-[5/7]" :
    variant === "wide" ? "w-[200px] h-[280px]" :
    "w-[165px] h-[240px]";
  // Horizontal scrollers want shrink-0 so cards keep their fixed
  // width as the row overflows. In a grid the cell determines width,
  // and shrink-0 is a no-op — harmless to keep for the fixed
  // variants and unnecessary for "grid".
  const shrinkClass = variant === "grid" ? "" : "shrink-0";

  return (
    <div
      onClick={() => onSelect?.(item)}
      className={`relative group ${shrinkClass} rounded-xl overflow-hidden cursor-pointer ${sizeClass}`}
    >
      {/* Image with skeleton */}
      <ImageSkeleton
        src={item.image}
        alt={item.title}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

      {/* Service badges */}
      <div className="absolute top-3 left-3 flex items-center gap-1">
        {services.map((service) => (
          <ServiceBadge key={service} service={service} size="md" />
        ))}
      </div>

      {/* Watched tick or Bookmark button */}
      {watched ? (
        <div className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
          <TickIcon className="w-3.5 h-3.5 text-white" />
        </div>
      ) : (
        <motion.button
          onClick={handleBookmark}
          whileTap={{ scale: 0.75 }}
          animate={
            justToggled
              ? { scale: [1, 1.3, 0.9, 1.05, 1] }
              : { scale: 1 }
          }
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className={`absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 ${
            bookmarked
              ? "bg-primary text-white"
              : "bg-black/40 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/60"
          }`}
        >
          <Bookmark className={`w-3.5 h-3.5 ${bookmarked ? "fill-current" : ""}`} />
        </motion.button>
      )}

      {/* Title + meta */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        {item.rating != null && item.rating > 0 && (
          <div className="flex items-center gap-1 mb-1">
            <span className="text-yellow-400 text-[11px]">&#9733;</span>
            <span className="text-white/80 text-[11px]">{item.rating.toFixed(1)}</span>
          </div>
        )}
        <h3 className="text-white text-[13px] leading-tight" style={{ fontWeight: 600 }}>
          {item.title}
        </h3>
        {item.year && (
          <span className="text-white/50 text-[11px]">{item.year}</span>
        )}
      </div>
    </div>
  );
}