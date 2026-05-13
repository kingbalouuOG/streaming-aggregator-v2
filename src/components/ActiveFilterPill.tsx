import { X } from "lucide-react";

interface ActiveFilterPillProps {
  label: string;
  onRemove: () => void;
}

/**
 * ActiveFilterPill — small pill used in the Phase Search V2 results-page
 * active-filter strip (artboard 06). Label + × remove button.
 *
 * Visual contract (videx-search-v2.jsx SvActiveFilterPill):
 *   - Height 28, padding 0 6 0 10, radius 9999
 *   - Background `--primary-soft`, border `--primary-edge`
 *   - Text colour `--primary-fg-on-soft` (salmon — see H5 resolution)
 *   - Remove button: 18×18 circle, slightly stronger orange-tint bg
 *
 * Phase 1 search-only. Don't reach for this on other surfaces — if you
 * want a generic small chip, build it from the design-system MoodChip
 * variant instead.
 */
export function ActiveFilterPill({ label, onRemove }: ActiveFilterPillProps) {
  return (
    <span
      className="inline-flex items-center shrink-0 whitespace-nowrap"
      style={{
        height: 28,
        padding: "0 6px 0 10px",
        gap: 4,
        borderRadius: 9999,
        background: "var(--primary-soft)",
        border: "0.5px solid var(--primary-edge)",
        color: "var(--primary-fg-on-soft)",
        fontFamily: "var(--font-ui)",
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: "-0.005em",
      }}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className="flex items-center justify-center"
        style={{
          width: 18,
          height: 18,
          borderRadius: "9999px",
          border: "none",
          background: "rgba(232,93,37,0.20)",
          color: "var(--primary-fg-on-soft)",
          cursor: "pointer",
        }}
      >
        <X className="w-[9px] h-[9px]" strokeWidth={2.6} />
      </button>
    </span>
  );
}
