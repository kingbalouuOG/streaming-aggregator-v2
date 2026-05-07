import React, { useEffect, useState } from "react";
import { ImageSkeleton } from "./ImageSkeleton";
import { ServiceStack } from "./ServiceBadge";
import { getCachedServices } from "@/lib/utils/serviceCache";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
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
  // Lazy-load services if the parent didn't pre-resolve them. Same
  // pattern ContentCard uses — the discover endpoints often return
  // items with empty services arrays, and the cached lookup fills
  // them in. Without this the hero ServiceStack stays hidden.
  const [resolved, setResolved] = useState<ServiceId[]>(item.services);
  useEffect(() => {
    if (item.services.length > 0) { setResolved(item.services); return; }
    const { tmdbId, mediaType } = parseContentItemId(item.id);
    getCachedServices(String(tmdbId), mediaType).then(setResolved);
  }, [item.id, item.services]);

  const services = userServices?.length
    ? resolved.filter((s) => userServices.includes(s))
    : resolved;

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

      {/* Title block — bottom-aligned. Inline kicker (rather than the
          shared <Kicker> primitive) so we can layer a text-shadow for
          legibility against any backdrop image, and brighten an
          atmosphere-tinted color via color-mix so the mid-tone tints
          (slate, forest…) read clearly on the dark gradient. */}
      <div
        className="absolute left-0 right-0 bottom-0 p-5 flex flex-col gap-2"
        style={{ textShadow: "0 1px 4px rgba(0,0,0,0.45)" }}
      >
        <span
          className="t-kicker"
          style={
            kickerColor
              ? { color: `color-mix(in srgb, ${kickerColor} 60%, white)` }
              : undefined
          }
        >
          {kicker}
        </span>
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
