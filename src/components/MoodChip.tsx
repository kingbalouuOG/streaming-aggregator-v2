import type { ReactNode } from "react";

interface MoodChipProps {
  /** Glyph rendered inside the 28×28 square at the left of the chip.
   *  Typically a lucide icon at 14px stroke 2. */
  icon: ReactNode;
  /** Primary line — Fraunces 13 / 700 / cream. */
  label: string;
  /** Optional second line — DM Sans 10 / 500 / tints toward `hue`
   *  when active so the accent reads. */
  sub?: string;
  /** Accent colour. Hex / rgba / var(--atm-*) all fine. Defaults to
   *  brand `--primary`. */
  hue?: string;
  active?: boolean;
  onClick?: () => void;
}

/**
 * MoodChip — empty-state "Or start with a feeling" tile used in the
 * Phase Search V2 search empty state (artboard 01) and the as-you-type
 * "Or a feeling" keep-frame row (artboard 02).
 *
 * Different anatomy from the existing design-system §4 MoodChip pill
 * (For You refiner) — this is the bigger 2×2 grid variant with icon,
 * label, optional subtitle, and an accent-tinted active state. Search-
 * surface use only for now; a future cleanup pass can unify the two if
 * a third caller surfaces.
 *
 * Visual contract (videx-search-v2.jsx SvMoodChip):
 *   - 14 radius card, 10×14 padding
 *   - Inactive: paper-tint bg, faint hairline edge, fg-soft icon/label
 *   - Active: `${hue}1f` bg, `${hue}70` edge, cream label, hue subtitle
 *   - 28×28 icon square inset against the chip body
 */
export function MoodChip({ icon, label, sub, hue, active = false, onClick }: MoodChipProps) {
  const accent = hue || "var(--primary)";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-[10px] shrink-0 text-left focus:outline-none transition-colors"
      style={{
        padding: "10px 14px",
        borderRadius: 14,
        background: active
          ? `color-mix(in srgb, ${accent} 12%, transparent)`
          : "rgba(245,241,232,0.03)",
        border: active
          ? `0.5px solid color-mix(in srgb, ${accent} 44%, transparent)`
          : "0.5px solid var(--hairline)",
      }}
      aria-pressed={active}
    >
      <span
        className="flex items-center justify-center shrink-0"
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: active
            ? `color-mix(in srgb, ${accent} 19%, transparent)`
            : "var(--surface-tint)",
          color: active ? accent : "var(--fg-soft)",
        }}
      >
        {icon}
      </span>
      <span className="flex flex-col min-w-0">
        <span
          className="truncate"
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "-0.005em",
            lineHeight: 1.1,
            color: active ? "var(--fg)" : "var(--fg-soft)",
          }}
        >
          {label}
        </span>
        {sub && (
          <span
            className="truncate"
            style={{
              marginTop: 2,
              fontFamily: "var(--font-ui)",
              fontSize: 10,
              fontWeight: 500,
              color: active ? accent : "var(--fg-soft)",
            }}
          >
            {sub}
          </span>
        )}
      </span>
    </button>
  );
}
