import { ReactNode } from "react";
import { Kicker } from "./Kicker";

interface SectionHeadProps {
  /** Optional. Renders as a <Kicker> above the title. */
  kicker?: string;
  /** Required. Fraunces 22 / 700 / opsz 36. */
  title: string;
  /** Optional. Italic Fraunces, magazine-pull-quote tone. */
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
export function SectionHead({ kicker, title, standfirst, right }: SectionHeadProps) {
  return (
    <header className="flex items-end justify-between gap-4 mb-3">
      <div className="min-w-0">
        {kicker && <Kicker>{kicker}</Kicker>}
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
              fontFamily: "var(--font-display)",
              fontStyle: "italic",
              fontSize: "var(--t-body)",
              color: "var(--fg-soft)",
              lineHeight: 1.4,
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
