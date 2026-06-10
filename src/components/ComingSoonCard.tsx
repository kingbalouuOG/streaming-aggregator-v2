import React, { useState, useEffect } from "react";
import { ServiceStack } from "./ServiceBadge";
import { getCachedServices } from "@/lib/utils/serviceCache";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
import type { UpcomingRelease } from "@/hooks/useUpcoming";
import type { ServiceId } from "./platformLogos";

interface ComingSoonCardProps {
  item: UpcomingRelease;
  onSelect: (item: UpcomingRelease) => void;
  bookmarked?: boolean;
  onToggleBookmark?: (item: UpcomingRelease) => void;
}

/**
 * Format a YYYY-MM-DD release date into the date-pill labels:
 *   today  → "TODAY"
 *   else   → e.g. "FRI 12"
 *
 * The pill renders as two lines for non-today dates so the day-of-week
 * tracks above the day-of-month at the same DM Sans size.
 */
function formatDatePill(dateStr: string): { line1: string; line2: string; isToday: boolean } {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date.getTime() === today.getTime()) {
    return { line1: "TODAY", line2: "", isToday: true };
  }

  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return { line1: days[date.getDay()], line2: String(date.getDate()), isToday: false };
}

/**
 * ComingSoonCard — vertical calendar entry per docs/design/redesign-plan.md
 * (date pill in primary, title under). Adopts the same anatomy that
 * the upcoming CalendarStrip primitive will use, so the Home "Coming
 * Soon" strip and the new CalendarStrip read as one visual family.
 *
 * No poster — editorial direction is typographic. If callers later
 * need poster art they can compose around this primitive.
 */
export function ComingSoonCard({ item, onSelect, bookmarked, onToggleBookmark }: ComingSoonCardProps) {
  const pill = formatDatePill(item.releaseDate);
  const [services, setServices] = useState<ServiceId[]>(item.services);

  useEffect(() => {
    if (item.services.length > 0) {
      setServices(item.services);
      return;
    }
    const { tmdbId, mediaType } = parseContentItemId(item.id);
    getCachedServices(String(tmdbId), mediaType).then(setServices);
  }, [item.id, item.services]);

  // Quiet the unused-prop warning for bookmark wiring; today the card
  // doesn't surface a bookmark control (per the editorial-strip spec),
  // but the props stay so call sites don't churn when CalendarStrip
  // adds its own bookmark affordance later.
  void bookmarked;
  void onToggleBookmark;

  return (
    <button
      onClick={() => onSelect(item)}
      className="shrink-0 text-left flex flex-col items-start gap-2 cursor-pointer"
      style={{ width: 140 }}
    >
      {/* Date pill — primary, two-line for dated entries, single line for TODAY */}
      <span
        className="inline-flex flex-col items-center justify-center px-3 py-1"
        style={{
          minWidth: 64,
          minHeight: 36,
          borderRadius: "var(--r-pill)",
          background: "var(--primary)",
          color: "#fff",
          fontFamily: "var(--font-ui)",
          fontWeight: 700,
          letterSpacing: "0.06em",
          lineHeight: 1.05,
        }}
      >
        <span style={{ fontSize: 10 }}>{pill.line1}</span>
        {pill.line2 && (
          <span style={{ fontSize: 14, letterSpacing: 0 }}>{pill.line2}</span>
        )}
      </span>

      {/* Title */}
      <h3
        className="line-clamp-2"
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 14,
          fontWeight: 600,
          color: "var(--fg)",
          lineHeight: 1.25,
        }}
      >
        {item.title}
      </h3>

      {/* Service marks */}
      {services.length > 0 && <ServiceStack services={services} size="sm" max={3} />}
    </button>
  );
}
