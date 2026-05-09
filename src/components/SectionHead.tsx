import { ReactNode } from "react";
import { Kicker } from "./Kicker";

interface SectionHeadProps {
  /** Optional. Renders as a <Kicker> above the title. */
  kicker?: string;
  /** Override the kicker's default --primary color (e.g. service tint). */
  kickerColor?: string;
  /** Required. Fraunces 22 / 700 / opsz 36. */
  title: string;
  /** Optional. DM Sans body copy beneath the title. */
  standfirst?: string;
  /**
   * Optional trailing slot — typically a "See all →" link or a
   * lightweight chip / count. Extension to design-system.md §4's
   * anatomy; encoded once here so per-screen rows don't reinvent
   * the wrapper.
   */
  right?: ReactNode;
}

/**
 * SectionHead — wraps every horizontal row in the v3 editorial
 * redesign. Kicker (orange tracked) → title (Fraunces) → optional
 * italic standfirst, with an optional trailing slot.
 *
 * Anatomy: docs/v3-design/design-system.md §4.
 */
export function SectionHead({ kicker, kickerColor, title, standfirst, right }: SectionHeadProps) {
  return (
    <header className="flex items-end justify-between gap-4 mb-3">
      <div className="min-w-0">
        {kicker && <Kicker color={kickerColor}>{kicker}</Kicker>}
        <h2
          className="mt-1"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--t-title)",
            fontWeight: 700,
            fontVariationSettings: '"opsz" 36',
            letterSpacing: "-0.01em",
            color: "var(--fg)",
            lineHeight: 1.15,
          }}
        >
          {title}
        </h2>
        {standfirst && (
          <p
            className="mt-1"
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: "var(--t-body)",
              fontWeight: 400,
              color: "var(--fg-soft)",
              lineHeight: 1.45,
            }}
          >
            {standfirst}
          </p>
        )}
      </div>
      {right && <div className="shrink-0 flex items-center">{right}</div>}
    </header>
  );
}
