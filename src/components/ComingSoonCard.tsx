import React, { useState, useEffect } from "react";
import { Bookmark } from "lucide-react";
import { motion } from "motion/react";
import { ServiceBadge } from "./ServiceBadge";
import { ImageSkeleton } from "./ImageSkeleton";
import { getCachedServices } from "@/lib/utils/serviceCache";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
import type { UpcomingRelease } from "@/hooks/useUpcoming";
import type { ServiceId } from "./platformLogos";

interface ComingSoonCardProps {
  item: UpcomingRelease;
  onSelect: (item: UpcomingRelease) => void;
  bookmarked?: boolean;
  onToggleBookmark?: (item: UpcomingRelease) => void;
}

function formatDateBadge(dateStr: string): { top: string; bottom: string; isToday: boolean } {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) {
    return { top: "TODAY", bottom: "", isToday: true };
  }

  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return { top: days[date.getDay()], bottom: String(date.getDate()), isToday: false };
}

export function ComingSoonCard({ item, onSelect, bookmarked, onToggleBookmark }: ComingSoonCardProps) {
  const badge = formatDateBadge(item.releaseDate);
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
    <div
      onClick={() => onSelect(item)}
      className="relative shrink-0 rounded-xl overflow-hidden cursor-pointer w-[140px] aspect-[3/4]"
    >
      <ImageSkeleton
        src={item.image}
        alt={item.title}
        className="w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

      {/* Date badge - top left */}
      <div
        className={`absolute top-2.5 left-2.5 rounded-lg px-1.5 py-1 text-center leading-tight ${
          badge.isToday
            ? "bg-primary text-white"
            : "bg-black/60 backdrop-blur-sm text-white"
        }`}
      >
        <div className="text-[9px] tracking-wider" style={{ fontWeight: 700 }}>
          {badge.top}
        </div>
        {badge.bottom && (
          <div className="text-[14px] -mt-0.5" style={{ fontWeight: 700 }}>
            {badge.bottom}
          </div>
        )}
      </div>

      {/* Bookmark - top right */}
      {onToggleBookmark && (
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark(item);
          }}
          whileTap={{ scale: 0.75 }}
          className={`absolute top-2.5 right-2.5 w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 ${
            bookmarked
              ? "bg-primary text-white"
              : "bg-black/40 backdrop-blur-sm text-white/70 hover:text-white"
          }`}
        >
          <Bookmark className={`w-3.5 h-3.5 ${bookmarked ? "fill-current" : ""}`} />
        </motion.button>
      )}

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <div className="flex items-center gap-1 mb-1">
          {services.slice(0, 2).map((s) => (
            <ServiceBadge key={s} service={s} size="sm" />
          ))}
          {item.genre && (
            <span className="text-white/60 text-[10px]">{item.genre}</span>
          )}
        </div>
        <h3
          className="text-white text-[12px] leading-tight line-clamp-2"
          style={{ fontWeight: 600 }}
        >
          {item.title}
        </h3>
      </div>
    </div>
  );
}
