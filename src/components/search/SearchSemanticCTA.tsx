import { SparkleIcon } from "../icons";

interface SearchSemanticCTAProps {
  /** The current Mode A query — interpolated into the CTA copy. */
  query: string;
  /** Tap handler. Wired to either setMode('semantic') when the flag
   *  is on, or a preview toast when it's off. The component itself
   *  doesn't know which; the consumer (BrowsePage) gates. */
  onAccept: () => void;
}

/**
 * Mode A → Mode C opt-in CTA — Phase Search V2 Cluster B (B5).
 *
 * Renders inline above the (sparse) Mode A results grid when
 * `useSearch.shouldShowSemanticCTA` is true. Per artboard 04b:
 *
 *   ✦  Search for '<query>' as a description
 *      Find titles that feel like '<query>'.
 *
 * Full-width card with the `--scrim-glass-action` + `--scrim-glass-
 * edge` treatment so the surface reads as actionable but quietly
 * distinct from the regular results below.
 *
 * Behaviour split (gating lives in the consumer):
 *   - Flag on: tapping fires setMode('semantic').
 *   - Flag off: tapping shows a "preview" toast — same CTA, no embed
 *     round-trip. Avoids dead-button confusion during the eval-gated
 *     rollout.
 */
export function SearchSemanticCTA({ query, onAccept }: SearchSemanticCTAProps) {
  const trimmed = query.trim();
  return (
    <button
      type="button"
      onClick={onAccept}
      className="flex items-center gap-3 w-full text-left mb-4"
      style={{
        padding: "14px 16px",
        background: "var(--scrim-glass-action)",
        boxShadow: "var(--scrim-glass-edge)",
        borderRadius: "var(--r-lg)",
        backdropFilter: "blur(10px) saturate(160%)",
        WebkitBackdropFilter: "blur(10px) saturate(160%)",
      }}
    >
      <span
        className="flex items-center justify-center shrink-0"
        style={{
          width: 36,
          height: 36,
          borderRadius: "9999px",
          background: "var(--primary-soft)",
          color: "var(--primary)",
        }}
      >
        <SparkleIcon className="w-4 h-4" />
      </span>
      <span className="flex flex-col min-w-0">
        <span
          className="truncate"
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--fg)",
            letterSpacing: "-0.005em",
            lineHeight: 1.2,
          }}
        >
          Search for &lsquo;{trimmed}&rsquo; as a description
        </span>
        <span
          className="truncate"
          style={{
            marginTop: 2,
            fontFamily: "var(--font-ui)",
            fontSize: 12,
            fontWeight: 500,
            color: "var(--fg-soft)",
            lineHeight: 1.3,
          }}
        >
          Find titles that feel like &lsquo;{trimmed}&rsquo;.
        </span>
      </span>
    </button>
  );
}
