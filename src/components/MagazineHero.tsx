import React from "react";
import { ImageSkeleton } from "./ImageSkeleton";
import { Kicker } from "./Kicker";
import { ServiceStack } from "./ServiceBadge";
import type { ContentItem } from "./ContentCard";
import type { ServiceId } from "./platformLogos";

interface MagazineHeroProps {
  item: ContentItem;
  /**
   * Optional taxonomic kicker shown above the title — e.g.
   * "TODAY'S PICK", "EDITOR'S CHOICE", or a service-tinted
   * "NEW ON NETFLIX". Defaults to "TODAY'S PICK".
   */
  kicker?: string;
  /** Optional Fraunces italic standfirst, magazine pull-quote tone. */
  standfirst?: string;
  /** Override kicker color (e.g. service tint for per-service heroes). */
  kickerColor?: string;
  /** Filter the rendered ServiceStack to only the user's connected services. */
  userServices?: ServiceId[];
  onSelect?: (item: ContentItem) => void;
}

/**
 * MagazineHero — the v3 Home / For You header per design-system.md §4.
 *
 *   Full-bleed backdrop image with a bottom gradient overlay.
 *   Kicker → Fraunces title → 1-line standfirst → ServiceStack + meta.
 *   No buttons; the whole hero is tappable.
 *
 * Width is parent-controlled (typically the .editorial container);
 * the hero clamps itself with a 4:5 aspect ratio so the image stays
 * dominant while leaving room for the bottom block.
 */
export function MagazineHero({
  item,
  kicker = "TODAY'S PICK",
  standfirst,
  kickerColor,
  userServices,
  onSelect,
}: MagazineHeroProps) {
  const services = userServices?.length
    ? item.services.filter((s) => userServices.includes(s))
    : item.services;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      className="relative block w-full overflow-hidden text-left cursor-pointer"
      style={{
        aspectRatio: "4 / 5",
        borderRadius: "var(--r-card)",
        background: "var(--surface-elev)",
      }}
    >
      <ImageSkeleton
        src={item.image}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Bottom gradient overlay — dark fade to read the title block */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(10,10,15,0.92) 0%, rgba(10,10,15,0.55) 35%, rgba(10,10,15,0) 65%)",
        }}
      />

      {/* Title block — bottom-aligned */}
      <div className="absolute left-0 right-0 bottom-0 p-5 flex flex-col gap-2">
        <Kicker color={kickerColor}>{kicker}</Kicker>
        <h1
          className="line-clamp-3"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 36,
            fontWeight: 800,
            fontVariationSettings: '"opsz" 96',
            letterSpacing: "-0.02em",
            color: "#fff",
            lineHeight: 1.05,
            margin: 0,
          }}
        >
          {item.title}
        </h1>
        {standfirst && (
          <p
            className="line-clamp-1"
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontSize: "var(--t-body)",
              color: "rgba(255,255,255,0.78)",
              lineHeight: 1.35,
              margin: 0,
            }}
          >
            {standfirst}
          </p>
        )}
        <div
          className="flex items-center gap-3 mt-1"
          style={{ fontSize: "var(--t-meta)", color: "rgba(255,255,255,0.72)" }}
        >
          {services.length > 0 && <ServiceStack services={services} size="sm" max={4} />}
          {(item.year || item.genre) && (
            <span style={{ fontFamily: "var(--font-ui)" }}>
              {[item.year, item.genre].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
