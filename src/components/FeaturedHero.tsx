import React from "react";
import { Info, Bookmark } from "lucide-react";
import { motion } from "motion/react";
import { ServiceBadge } from "./ServiceBadge";
import { ImageSkeleton } from "./ImageSkeleton";
import type { ServiceId } from "./platformLogos";

interface FeaturedHeroProps {
  title: string;
  subtitle: string;
  image: string;
  services: ServiceId[];
  tags: string[];
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
  scrollY?: number;
}

export function FeaturedHero({ title, subtitle, image, services, tags, bookmarked, onToggleBookmark, scrollY = 0 }: FeaturedHeroProps) {
  // Parallax: image moves at 40% of scroll speed
  const parallaxOffset = scrollY * 0.4;
  const heroOpacity = Math.max(0, 1 - scrollY / 500);

  return (
    <div className="relative w-full h-[380px] overflow-hidden" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      {/* Background image with parallax */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translateY(${parallaxOffset}px) scale(${1 + scrollY * 0.0003})`,
          willChange: "transform",
        }}
      >
        <ImageSkeleton
          src={image}
          alt={title}
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

      {/* Content - fade with scroll */}
      <div
        className="absolute bottom-0 left-0 right-0 p-4 pb-5"
        style={{ opacity: heroOpacity }}
      >
        {/* Service badges */}
        <div className="flex items-center gap-1.5 mb-2">
          {services.map((service) => (
            <ServiceBadge key={service} service={service} size="md" />
          ))}
          <span className="text-white/50 text-[11px] ml-1">Available on {services.length} service{services.length > 1 ? "s" : ""}</span>
        </div>

        {/* Title */}
        <h1 className="text-white text-[28px] leading-tight mb-1" style={{ fontWeight: 800, letterSpacing: "-0.02em" }}>
          {title}
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
          <button className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm text-white/80 hover:bg-white/20 transition-all">
            <Info className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}