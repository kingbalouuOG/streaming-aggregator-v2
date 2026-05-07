import React from "react";
import { SectionHead } from "./SectionHead";
import { ComingSoonCard } from "./ComingSoonCard";
import type { UpcomingRelease } from "@/hooks/useUpcoming";

interface CalendarStripProps {
  /** Upcoming releases, already date-sorted by the caller. */
  items: UpcomingRelease[];
  /**
   * Maximum cards rendered in the strip. Defaults to 8 to match the
   * Home "Coming Soon" budget. Pass `Infinity` to render all.
   */
  limit?: number;
  /** Section kicker. Defaults to "ON THE CALENDAR". */
  kicker?: string;
  /** Section title. Defaults to "Coming up." */
  title?: string;
  /** Optional Fraunces italic standfirst. */
  standfirst?: string;
  /** Optional trailing slot — typically a "See all →" link. */
  right?: React.ReactNode;
  onSelect: (item: UpcomingRelease) => void;
}

/**
 * CalendarStrip per docs/v3-design/redesign-plan.md (Phase 5 New) —
 * a horizontal scroll of upcoming dates with service marks. Each
 * entry is a <ComingSoonCard> (date pill in primary + title + small
 * service stack), already restyled in Phase 1.
 *
 * Sits at the foot of Home and For You per design-system.md §5; can
 * be used standalone elsewhere too.
 */
export function CalendarStrip({
  items,
  limit = 8,
  kicker = "ON THE CALENDAR",
  title = "Coming up.",
  standfirst,
  right,
  onSelect,
}: CalendarStripProps) {
  if (items.length === 0) return null;
  const visible = items.slice(0, limit);

  return (
    <section className="mb-6">
      <div className="px-5">
        <SectionHead kicker={kicker} title={title} standfirst={standfirst} right={right} />
      </div>
      <div
        className="flex gap-4 overflow-x-auto no-scrollbar px-5 pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {visible.map((item) => (
          <ComingSoonCard key={item.id} item={item} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
