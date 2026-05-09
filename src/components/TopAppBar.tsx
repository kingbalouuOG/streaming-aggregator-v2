import { UserIcon } from "./icons";

interface TopAppBarProps {
  onProfileTap: () => void;
}

/**
 * TopAppBar — sticky chrome above the main scroll surface.
 * Anatomy: Fraunces "Videx" wordmark left, profile glyph right.
 * Wordmark resolves through `var(--fg)` so it auto-themes (cream on
 * dark, ink on light) — matches the editorial vocabulary in §3.
 */
export function TopAppBar({ onProfileTap }: TopAppBarProps) {
  return (
    <header
      className="flex items-center justify-between px-4 safe-top"
      style={{
        height: 52,
        background: "var(--surface)",
        borderBottom: "0.5px solid var(--hairline)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 24,
          fontWeight: 700,
          fontVariationSettings: '"opsz" 36',
          letterSpacing: "-0.02em",
          color: "var(--fg)",
          lineHeight: 1,
        }}
      >
        Videx
      </span>
      <button
        type="button"
        onClick={onProfileTap}
        aria-label="Profile"
        className="inline-flex items-center justify-center w-8 h-8"
        style={{
          background: "var(--surface-tint)",
          borderRadius: "var(--r-pill)",
          color: "var(--fg)",
        }}
      >
        <UserIcon className="w-4 h-4" />
      </button>
    </header>
  );
}
