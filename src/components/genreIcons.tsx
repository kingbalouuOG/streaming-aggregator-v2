import React from "react";

// Glyph DATA moved to @/lib/constants/genreGlyphs (NATIVE-3 follow-up) so
// the native GenreIconTile can render the same icons. Re-exported here so
// existing web consumers (ProfilePage, OnboardingFlow, ForYouPage) are
// unchanged. The web `<GenreIconTile>` component stays below.
import { GLYPHS, type GlyphName } from "@/lib/constants/genreGlyphs";

export {
  GLYPHS,
  CLUSTER_GLYPHS,
  MOOD_GLYPH_NAMES,
  PROFILE_GLYPHS,
  type GlyphName,
  type GlyphDef,
} from "@/lib/constants/genreGlyphs";

interface GenreIconTileProps {
  /** Glyph name; falls back to a neutral filled square if unknown. */
  glyph: GlyphName;
  /** Tile width/height in CSS pixels. Default 44. */
  size?: number;
  /** Override the tile background. Defaults to `--surface-tint`. */
  tile?: string;
  /** Optional className passthrough on the wrapper. */
  className?: string;
}

/**
 * GenreIconTile — cream glyph + offset orange ghost on a tinted
 * rounded square. Mirrors the `GenreIcon.jsx` recipe from the v3
 * design export, but with the FA path inlined so we don't ship the
 * webfont. Both layers share the FA viewBox so the glyphs centre
 * pixel-perfectly regardless of the icon's native aspect.
 */
export function GenreIconTile({
  glyph,
  size = 44,
  tile = "var(--surface-tint)",
  className,
}: GenreIconTileProps) {
  const def = GLYPHS[glyph];
  if (!def) return null;
  const offset = Math.max(1, Math.round(size * 0.04));
  const glyphSize = size * 0.5;
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: size * 0.22,
        background: tile,
        border: "0.5px solid var(--hairline)",
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <svg
        viewBox={def.viewBox}
        width={glyphSize}
        height={glyphSize}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(calc(-50% + ${offset}px), calc(-50% + ${offset}px))`,
          color: "var(--primary)",
          display: "block",
        }}
      >
        <path d={def.d} fill="currentColor" />
      </svg>
      <svg
        viewBox={def.viewBox}
        width={glyphSize}
        height={glyphSize}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          color: "var(--fg)",
          display: "block",
        }}
      >
        <path d={def.d} fill="currentColor" />
      </svg>
    </span>
  );
}
