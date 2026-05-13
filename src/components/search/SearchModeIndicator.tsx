import { ArrowLeft } from "lucide-react";

interface SearchModeIndicatorProps {
  /** The user's current query — surfaced verbatim in the indicator
   *  copy. */
  query: string;
  /** Tap handler for the "Search keywords instead" link. Wired to
   *  useSearch.setMode('lookup'). */
  onRevert: () => void;
}

/**
 * Mode indicator for Mode C semantic results — Phase Search V2
 * Cluster B (B5). Renders above the results grid when the user is
 * in 'semantic' mode. Per artboard 04:
 *
 *   Showing titles like 'lonely cowboys'
 *   ← Search keywords instead
 *
 * Italic Fraunces 13 for the indicator line, `--fg-soft` colour.
 * Revert link in `--primary` with a leading arrow.
 */
export function SearchModeIndicator({ query, onRevert }: SearchModeIndicatorProps) {
  const trimmed = query.trim();
  return (
    <div className="flex flex-col gap-1 mb-3">
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontStyle: "italic",
          fontSize: 13,
          fontWeight: 500,
          color: "var(--fg-soft)",
          letterSpacing: "-0.005em",
          margin: 0,
        }}
      >
        Showing titles like &lsquo;{trimmed}&rsquo;
      </p>
      <button
        type="button"
        onClick={onRevert}
        className="inline-flex items-center gap-1 self-start"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--primary)",
          fontFamily: "var(--font-ui)",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "-0.005em",
          padding: 0,
          cursor: "pointer",
        }}
      >
        <ArrowLeft className="w-3 h-3" />
        Search keywords instead
      </button>
    </div>
  );
}
