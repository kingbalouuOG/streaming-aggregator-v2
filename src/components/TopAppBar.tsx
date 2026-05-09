/**
 * TopAppBar — wordmark banner that lives at the top of Home and
 * scrolls with the page (no longer sticky). The Profile affordance is
 * the bottom-nav tab, so the bar carries the brand only.
 *
 * Wordmark resolves through `var(--fg)` so it auto-themes (cream on
 * dark, ink on light). Padding-top combines the Android notification
 * bar inset with extra breathing room — important to use a single
 * `calc()` rather than mixing `safe-top` with Tailwind `pt-*`, since
 * the second declaration wins and the env-inset gets clobbered.
 */
export function TopAppBar() {
  return (
    <header
      className="flex items-center px-4"
      style={{
        background: "var(--surface)",
        // Symmetric breathing room above + below the wordmark; the
        // env-inset sits ABOVE the 20px gap so on a device with a
        // notification bar the bar pushes the layout down without
        // eating into the visible padding around "Videx".
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)",
        paddingBottom: 20,
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
    </header>
  );
}
