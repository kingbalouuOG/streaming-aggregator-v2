import React, { useState, useEffect } from "react";
import { Bookmark } from "lucide-react";
import { motion } from "motion/react";
import { ServiceBadge } from "./ServiceBadge";
import { ContentItem } from "./ContentCard";
import { ImageSkeleton } from "./ImageSkeleton";
import { getCachedServices } from "@/lib/utils/serviceCache";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
import type { ServiceId } from "./platformLogos";

interface BrowseCardProps {
  item: ContentItem;
  index?: number;
  onSelect?: (item: ContentItem) => void;
  bookmarked?: boolean;
  onToggleBookmark?: (item: ContentItem) => void;
  userServices?: ServiceId[];
}

export function BrowseCard({ item, index = 0, onSelect, bookmarked = false, onToggleBookmark, userServices }: BrowseCardProps) {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: Math.min(index * 0.04, 0.3),
        type: "spring",
        damping: 22,
        stiffness: 300,
      }}
      onClick={() => onSelect?.(item)}
      className="relative group rounded-xl overflow-hidden cursor-pointer aspect-[3/4]"
    >
      {/* Image with skeleton */}
      <ImageSkeleton
        src={item.image}
        alt={item.title}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

      {/* Bookmark button with haptic feedback */}
      <motion.button
        onClick={handleBookmark}
        whileTap={{ scale: 0.75 }}
        animate={
          justToggled
            ? { scale: [1, 1.3, 0.9, 1.05, 1] }
            : { scale: 1 }
        }
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={`absolute top-2.5 left-2.5 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
          bookmarked
            ? "bg-primary text-white"
            : "bg-black/40 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/60"
        }`}
      >
        <Bookmark className={`w-4 h-4 ${bookmarked ? "fill-current" : ""}`} />
      </motion.button>

      {/* Service badges - top right */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
        {services.map((service) => (
          <ServiceBadge key={service} service={service} size="md" />
        ))}
      </div>

      {/* Title overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        {item.rating && (
          <div className="flex items-center gap-1 mb-1">
            <span className="text-yellow-400 text-[11px]">&#9733;</span>
            <span className="text-white/80 text-[11px]">{item.rating.toFixed(1)}</span>
          </div>
        )}
        <h3 className="text-white text-[14px] leading-tight" style={{ fontWeight: 600 }}>
          {item.title}
        </h3>
        {item.year && (
          <span className="text-white/45 text-[11px]">{item.year}</span>
        )}
      </div>
    </motion.div>
  );
}
