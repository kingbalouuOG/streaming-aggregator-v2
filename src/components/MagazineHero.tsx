import React, { useEffect, useState } from "react";
import { Bookmark, Info, Play } from "lucide-react";
import { ImageSkeleton } from "./ImageSkeleton";
import { ServiceBadge, ServiceStack } from "./ServiceBadge";
import { getCachedServices } from "@/lib/utils/serviceCache";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
import { serviceLabels } from "./platformLogos";
import type { ContentItem } from "./ContentCard";
import type { ServiceId } from "./platformLogos";

interface MagazineHeroProps {
  item: ContentItem;
  /**
   * Optional taxonomic kicker — defaults to "TODAY'S PICK". Rendered
   * top-LEFT of the hero with a leading 1.5px dash mark.
   */
  kicker?: string;
  /** Optional Fraunces italic standfirst, magazine pull-quote tone. */
  standfirst?: string;
  /** Override kicker color (service / atmosphere tint for variants). */
  kickerColor?: string;
  /** Filter the rendered ServiceStack to only the user's connected services. */
  userServices?: ServiceId[];
  onSelect?: (item: ContentItem) => void;

  /* ── For You hero variants ── */
  /**
   * Optional top-left status pill (e.g. "✨ 96% match · Mood: contemplative").
   * Rendered as a glass-blur dark chip below the kicker. Skipped if undefined.
   * TODO(IN-V3-002): wire match% from taste-v2 + mood from per-title tag.
   */
  statusPill?: React.ReactNode;
  /**
   * When true, render a small "IN YOUR PLAN" chip alongside the meta line.
   * Caller derives this client-side: any item.services ∩ userServices ⇒ true.
   */
  inYourPlan?: boolean;
  /**
   * When true, render a CTA row (Play pill + bookmark + info) beneath the
   * standfirst. Defaults to true; pass false for hero contexts where the
   * whole hero is tappable and a CTA would be redundant.
   */
  showCta?: boolean;
  bookmarked?: boolean;
  onToggleBookmark?: (item: ContentItem) => void;
  onMoreInfo?: (item: ContentItem) => void;
  /** Runtime in minutes — surfaces in the meta line as e.g. "122m". */
  runtime?: number;
}

/**
 * MagazineHero — Home / For You header per design-system.md §4.
 *
 * Anatomy (top → bottom):
 *   • dash + kicker           top-left
 *   • service badge           top-right
 *   • optional status pill    below kicker (For You: "✨ 96% match · …")
 *   • Fraunces title          bottom-aligned block
 *   • italic standfirst       below title
 *   • CTA row (Play / 🔖 / ℹ) below standfirst when showCta
 *   • meta line (year · runtime · genre · ★ rating · IN YOUR PLAN)
 */
export function MagazineHero({
  item,
  kicker = "TODAY'S PICK",
  standfirst,
  kickerColor,
  userServices,
  onSelect,
  statusPill,
  inYourPlan,
  showCta = true,
  bookmarked = false,
  onToggleBookmark,
  onMoreInfo,
  runtime,
}: MagazineHeroProps) {
  // Lazy-load services if the parent didn't pre-resolve them.
  const [resolved, setResolved] = useState<ServiceId[]>(item.services);
  useEffect(() => {
    if (item.services.length > 0) { setResolved(item.services); return; }
    const { tmdbId, mediaType } = parseContentItemId(item.id);
    getCachedServices(String(tmdbId), mediaType).then(setResolved);
  }, [item.id, item.services]);

  const services = userServices?.length
    ? resolved.filter((s) => userServices.includes(s))
    : resolved;

  // The "primary" service drives the CTA label and the top-right
  // badge. When the user-services filter wipes the list (item isn't
  // on any of the user's connected services), fall back to the
  // title's first listed service so the hero never renders without a
  // CTA / service mark.
  const primaryService = services[0] ?? resolved[0];

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="relative block w-full overflow-hidden text-left cursor-pointer"
      onClick={() => onSelect?.(item)}
      style={{
        aspectRatio: "4 / 5",
        background: "var(--surface-elev)",
      }}
      role="button"
      tabIndex={0}
    >
      <ImageSkeleton
        src={item.image}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover"
        priority
      />

      {/* Bottom gradient — read the title block */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(10,10,15,0.95) 0%, rgba(10,10,15,0.55) 35%, rgba(10,10,15,0) 70%)",
        }}
      />

      {/* Top-left: dash + kicker, optional status pill below */}
      <div
        className="absolute top-4 left-4 right-4 flex flex-col gap-2 items-start pointer-events-none"
        style={{ textShadow: "0 1px 4px rgba(0,0,0,0.45)" }}
      >
        <div className="inline-flex items-center gap-2">
          <span
            aria-hidden
            style={{
              width: 14,
              height: 1.5,
              background: kickerColor
                ? `color-mix(in srgb, ${kickerColor} 60%, white)`
                : "var(--cream)",
              borderRadius: 1,
            }}
          />
          <span
            className="t-kicker"
            style={{
              color: kickerColor
                ? `color-mix(in srgb, ${kickerColor} 60%, white)`
                : "var(--cream)",
            }}
          >
            {kicker}
          </span>
        </div>
        {statusPill ? <div
            className="inline-flex items-center px-3 py-1 pointer-events-auto"
            style={{
              borderRadius: "var(--r-pill)",
              background: "var(--scrim-glass)",
              backdropFilter: "blur(8px) saturate(160%)",
              WebkitBackdropFilter: "blur(8px) saturate(160%)",
              color: "#fff",
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.01em",
            }}
          >
            {statusPill}
          </div> : null}
      </div>

      {/* Top-right: primary service badge — full-bleed, no chip
          wrapper, soft drop-shadow halo lifts it off the poster. */}
      {primaryService ? <div
          className="absolute top-4 right-4 inline-flex"
          style={{ filter: "var(--badge-glow)" }}
        >
          <ServiceBadge service={primaryService} size="md" />
        </div> : null}

      {/* Title block — bottom-aligned */}
      <div
        className="absolute left-0 right-0 bottom-0 p-5 flex flex-col gap-2"
        style={{ textShadow: "0 1px 4px rgba(0,0,0,0.45)" }}
      >
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
        {standfirst ? <p
            className="line-clamp-3"
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "var(--t-body)",
              fontWeight: 400,
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.45,
              margin: 0,
            }}
          >
            {standfirst}
          </p> : null}

        {/* CTA row — Play pill + bookmark + info */}
        {showCta ? <div
            className="flex items-center gap-2 mt-2 pointer-events-auto"
            style={{ textShadow: "none" }}
          >
            {primaryService ? <button
                type="button"
                onClick={(e) => { stop(e); onSelect?.(item); }}
                className="inline-flex items-center gap-2 px-4 py-2.5"
                style={{
                  background: "rgba(255, 255, 255, 0.96)",
                  color: "#0a0a0f",
                  borderRadius: "var(--r-pill)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <Play className="w-4 h-4" fill="#0a0a0f" strokeWidth={0} />
                <span>Play on {serviceLabels[primaryService] ?? primaryService}</span>
              </button> : null}
            {onToggleBookmark ? <button
                type="button"
                onClick={(e) => { stop(e); onToggleBookmark(item); }}
                className="inline-flex items-center justify-center w-9 h-9"
                style={{
                  background: "var(--scrim-glass-action)",
                  backdropFilter: "blur(10px) saturate(160%)",
                  WebkitBackdropFilter: "blur(10px) saturate(160%)",
                  borderRadius: "var(--r-md)",
                  boxShadow: "var(--scrim-glass-edge)",
                  color: "#fff",
                }}
                aria-label={bookmarked ? "Remove bookmark" : "Add bookmark"}
              >
                <Bookmark className="w-4 h-4" fill={bookmarked ? "#fff" : "none"} strokeWidth={2} />
              </button> : null}
            {onMoreInfo ? <button
                type="button"
                onClick={(e) => { stop(e); onMoreInfo(item); }}
                className="inline-flex items-center justify-center w-9 h-9"
                style={{
                  background: "var(--scrim-glass-action)",
                  backdropFilter: "blur(10px) saturate(160%)",
                  WebkitBackdropFilter: "blur(10px) saturate(160%)",
                  borderRadius: "var(--r-md)",
                  boxShadow: "var(--scrim-glass-edge)",
                  color: "#fff",
                }}
                aria-label="More info"
              >
                <Info className="w-4 h-4" strokeWidth={2} />
              </button> : null}
          </div> : null}

        {/* Meta line — year · runtime · genre · ★ rating · IN YOUR PLAN */}
        <div
          className="flex items-center gap-2 mt-1 flex-wrap"
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--t-meta)",
            color: "rgba(255,255,255,0.72)",
          }}
        >
          {inYourPlan ? <span
              className="inline-flex items-center px-2 py-0.5"
              style={{
                background: "rgba(232, 93, 37, 0.18)",
                color: "#fff",
                border: "0.5px solid rgba(232, 93, 37, 0.5)",
                borderRadius: "var(--r-pill)",
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "1.2px",
              }}
            >
              IN YOUR PLAN
            </span> : null}
          {/* Build meta segments first, then join with `·` so we never
              render a dangling separator when leading fields are
              absent (year/runtime/genre may all be optional). */}
          {(() => {
            const parts: React.ReactNode[] = [];
            if (item.year) parts.push(<span key="y">{item.year}</span>);
            if (runtime) parts.push(<span key="rt">{runtime}m</span>);
            if (item.genre) parts.push(<span key="g">{item.genre}</span>);
            if (item.rating != null && item.rating > 0) {
              parts.push(
                <span key="r">
                  <span style={{ color: "var(--star)" }}>★</span> {item.rating.toFixed(1)}
                </span>,
              );
            }
            return parts.map((part, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span>·</span>}
                {part}
              </React.Fragment>
            ));
          })()}
          {/* Render the rest of the service stack inline only when the
              user has 2+ services — otherwise the top-right badge is
              the canonical service marker. */}
          {services.length > 1 && (
            <span className="inline-flex items-center gap-1 ml-auto" onClick={stop}>
              <ServiceStack services={services.slice(1)} size="sm" max={3} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
