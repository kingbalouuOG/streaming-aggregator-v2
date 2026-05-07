import React from "react";
import { ImageSkeleton } from "./ImageSkeleton";
import type { ContentItem } from "./ContentCard";

const ATMOSPHERE_TINTS = [
  "var(--atm-amber)",
  "var(--atm-rose)",
  "var(--atm-teal)",
  "var(--atm-violet)",
  "var(--atm-forest)",
  "var(--atm-slate)",
] as const;

function atmosphereForKey(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return ATMOSPHERE_TINTS[Math.abs(hash) % ATMOSPHERE_TINTS.length];
}

interface StackedThumbnailsProps {
  thumbnails: ContentItem[];
  /** Width of each thumbnail in CSS pixels. */
  width: number;
}

/**
 * Three-thumbnail "fan" — used by MoodRoomCard and AnchorMoodRoomCard.
 * Renders up to three poster thumbnails side-by-side with subtle
 * outward rotations so the middle one reads as the focal point.
 */
function StackedThumbnails({ thumbnails, width }: StackedThumbnailsProps) {
  const tiles = thumbnails.slice(0, 3);
  return (
    <div className="flex justify-center items-end gap-1.5">
      {tiles.map((t, i) => {
        const rotation = i === 0 ? -4 : i === 2 ? 4 : 0;
        const lift = i === 1 ? 0 : 6;
        return (
          <div
            key={t.id}
            className="overflow-hidden shrink-0"
            style={{
              width,
              aspectRatio: "2 / 3",
              borderRadius: "var(--r-md)",
              transform: `translateY(${lift}px) rotate(${rotation}deg)`,
              boxShadow: "0 8px 18px rgba(0,0,0,0.25)",
              background: "var(--surface-tint)",
            }}
          >
            <ImageSkeleton
              src={t.image}
              alt={t.title}
              className="w-full h-full object-cover"
            />
          </div>
        );
      })}
    </div>
  );
}

export interface MoodRoomCardProps {
  /** Stable id — used as the React key + atmosphere hash. */
  id: string;
  /** Fraunces label rendered front-and-centre on the tile. */
  label: string;
  /** Optional total title count for the room. */
  titleCount?: number;
  /** Up to 3 thumbnails for the fan. */
  thumbnails: ContentItem[];
  /** Atmosphere accent override (defaults to a hash of `id`). */
  accent?: string;
  /** Defaults to "MOOD ROOM"; override for "THE FEATURED ROOM" etc. */
  kicker?: string;
  /**
   * Card width — `"100%"` (default) for grid layouts, fixed pixels
   * (e.g. 220) for horizontal-scroll rows. `MoodRoomsRow` passes a
   * fixed width; ForYou's "five more rooms" grid uses the default.
   */
  width?: number | string;
  onSelect: () => void;
}

/**
 * MoodRoomCard — square-ish atmosphere-tinted tile per design-system
 * §3 atmosphere accents. Top half: a fan of three poster thumbnails.
 * Bottom: kicker (with bullet · titles meta when titleCount > 0) +
 * Fraunces label.
 */
export function MoodRoomCard({
  id,
  label,
  titleCount,
  thumbnails,
  accent,
  kicker = "MOOD ROOM",
  width = "100%",
  onSelect,
}: MoodRoomCardProps) {
  const tint = accent ?? atmosphereForKey(id);
  const kickerLine =
    typeof titleCount === "number" && titleCount > 0
      ? `${kicker} · ${titleCount} TITLES`
      : kicker;

  return (
    <button
      type="button"
      onClick={onSelect}
      className="relative shrink-0 overflow-hidden text-left active:scale-[0.99] transition-transform flex flex-col"
      style={{
        width,
        minHeight: 220,
        borderRadius: "var(--r-card)",
        background: `linear-gradient(160deg, color-mix(in srgb, ${tint} 28%, var(--surface-elev)) 0%, var(--surface-elev) 70%)`,
        border: "0.5px solid var(--hairline)",
      }}
    >
      <div className="pt-5 pb-3">
        <StackedThumbnails thumbnails={thumbnails} width={64} />
      </div>
      <div className="px-4 pb-4 mt-auto">
        <span
          className="t-kicker"
          style={{ color: `color-mix(in srgb, ${tint} 70%, white)` }}
        >
          {kickerLine}
        </span>
        <h3
          className="line-clamp-2 mt-1"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontWeight: 700,
            fontVariationSettings: '"opsz" 24',
            letterSpacing: "-0.01em",
            color: "var(--fg)",
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          {label}
        </h3>
      </div>
    </button>
  );
}

export interface FeaturedMoodRoomCardProps {
  id: string;
  label: string;
  titleCount: number;
  /** Italic Fraunces standfirst — rendered with curly quotes around it. */
  quote?: string;
  /** Bullet stats line (e.g. "Strong fit · 42 titles · Across 5 of 6 services"). */
  stats?: string;
  thumbnails: ContentItem[];
  accent?: string;
  ctaLabel?: string;
  onSelect: () => void;
}

/**
 * FeaturedMoodRoomCard — the cover-story variant of MoodRoomCard.
 * Same anatomy but bigger thumbnails, multi-line title, italic quote,
 * bullet meta, and an "Enter the room →" pill CTA in the room's
 * atmosphere tint.
 */
export function FeaturedMoodRoomCard({
  id,
  label,
  titleCount,
  quote,
  stats,
  thumbnails,
  accent,
  ctaLabel = "Enter the room",
  onSelect,
}: FeaturedMoodRoomCardProps) {
  const tint = accent ?? atmosphereForKey(id);

  return (
    <div
      className="overflow-hidden flex flex-col"
      style={{
        borderRadius: "var(--r-card)",
        background: `linear-gradient(160deg, color-mix(in srgb, ${tint} 22%, var(--surface-elev)) 0%, var(--surface-elev) 80%)`,
        border: "0.5px solid var(--hairline)",
      }}
    >
      <div className="pt-8 pb-6">
        <StackedThumbnails thumbnails={thumbnails} width={88} />
      </div>
      <div className="px-5 pb-5">
        <div className="flex items-center gap-1.5 mb-2">
          <span
            aria-hidden
            style={{
              width: 14,
              height: 1.5,
              background: `color-mix(in srgb, ${tint} 70%, white)`,
              borderRadius: 1,
            }}
          />
          <span
            className="t-kicker"
            style={{ color: `color-mix(in srgb, ${tint} 70%, white)` }}
          >
            THE FEATURED ROOM · {titleCount} TITLES
          </span>
        </div>
        <h3
          className="line-clamp-3"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            fontWeight: 700,
            fontVariationSettings: '"opsz" 48',
            letterSpacing: "-0.01em",
            color: "var(--fg)",
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          {label}
        </h3>
        {quote && (
          <p
            className="mt-2"
            style={{
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontSize: "var(--t-body)",
              color: "var(--fg-soft)",
              lineHeight: 1.45,
              margin: 0,
            }}
          >
            “{quote}”
          </p>
        )}
        {stats && (
          <div className="flex items-center gap-1.5 mt-3">
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: tint,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                color: "var(--fg-soft)",
              }}
            >
              {stats}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onSelect}
          className="inline-flex items-center gap-2 mt-4 px-5 py-2.5"
          style={{
            background: `color-mix(in srgb, ${tint} 35%, var(--surface-tint))`,
            color: `color-mix(in srgb, ${tint} 75%, white)`,
            borderRadius: "var(--r-pill)",
            fontFamily: "var(--font-ui)",
            fontSize: 14,
            fontWeight: 600,
            border: `0.5px solid color-mix(in srgb, ${tint} 50%, transparent)`,
          }}
        >
          <span>{ctaLabel}</span>
          <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}
