import React from "react";
import type { ServiceId } from "./platformLogos";

export interface MoodRoomCardProps {
  /** Stable id for the room — used as the React key + atmosphere hash. */
  id: string;
  /** Fraunces label rendered front-and-centre on the tile. */
  label: string;
  /** Optional second-line copy: title count, theme, etc. */
  description?: string | null;
  /** Optional total title count for the room. */
  titleCount?: number;
  /** Optional service marks for the bottom-right of the tile. */
  services?: ServiceId[];
  /**
   * Atmosphere accent override. Six tokens are available
   * (--atm-amber / rose / teal / violet / forest / slate).
   * If omitted, the card hashes `id` to pick one deterministically.
   */
  accent?: string;
  onSelect: () => void;
}

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

/**
 * MoodRoomCard — square-ish tile per design-system.md / Phase 5 matrix:
 * room-accent gradient, Fraunces label centred, optional description and
 * title-count. Used by the global MoodRoomsRow surface (v2.5) and as a
 * primitive for any other "atmospheric tile" usage.
 */
export function MoodRoomCard({
  id,
  label,
  description,
  titleCount,
  accent,
  onSelect,
}: MoodRoomCardProps) {
  const tint = accent ?? atmosphereForKey(id);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="relative shrink-0 overflow-hidden text-left active:scale-[0.98] transition-transform"
      style={{
        width: 220,
        aspectRatio: "1 / 1",
        borderRadius: "var(--r-card)",
        // Atmosphere gradient: tint at the top → ink at the bottom for
        // the editorial cover-tone effect. Layered over surface-elev so
        // the tile reads on both light and dark themes.
        background: `linear-gradient(155deg, ${tint} 0%, color-mix(in srgb, ${tint} 35%, var(--bg)) 65%, var(--bg) 100%), var(--surface-elev)`,
      }}
    >
      {/* Subtle inner highlight along the top to lift the gradient. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{
          height: 1,
          background: "linear-gradient(to right, transparent, rgba(255,255,255,0.18), transparent)",
        }}
      />

      {/* Title block — bottom-aligned. */}
      <div className="absolute inset-x-0 bottom-0 p-5 flex flex-col gap-1.5">
        {description && (
          <span
            className="t-kicker"
            style={{ color: "rgba(255,255,255,0.78)" }}
          >
            {description}
          </span>
        )}
        <h3
          className="line-clamp-3"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 24,
            fontWeight: 700,
            fontVariationSettings: '"opsz" 36',
            letterSpacing: "-0.01em",
            color: "#fff",
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          {label}
        </h3>
        {typeof titleCount === "number" && titleCount > 0 && (
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "rgba(255,255,255,0.7)",
            }}
          >
            {titleCount} title{titleCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </button>
  );
}
