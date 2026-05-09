import React, { useMemo } from "react";
import { SectionHead } from "./SectionHead";
import { ServiceBadge } from "./ServiceBadge";
import { ImageSkeleton } from "./ImageSkeleton";
import { ChevronRightIcon } from "./icons";
import type { UpcomingRelease } from "@/hooks/useUpcoming";

interface CalendarListProps {
  items: UpcomingRelease[];
  /** Maximum rows rendered. Defaults to 6 to keep Home compact. */
  limit?: number;
  kicker?: string;
  title?: string;
  standfirst?: string;
  right?: React.ReactNode;
  onSelect: (item: UpcomingRelease) => void;
}

const WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayLabel(release: string): string {
  const today = startOfDay(new Date());
  const target = startOfDay(new Date(release));
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diff <= 0) return "TODAY";
  if (diff === 1) return "TOMORROW";
  return `${WEEKDAY[target.getDay()]} ${target.getDate()} ${MONTH[target.getMonth()]}`;
}

interface Group {
  label: string;
  items: UpcomingRelease[];
}

/**
 * CalendarList — vertical, date-grouped variant of CalendarStrip used
 * by Home. Each row is a thumb + title + service badge. Dates collapse
 * into TODAY / TOMORROW / WEEKDAY DD MMM headings.
 */
export function CalendarList({
  items,
  limit = 6,
  kicker = "ON THE CALENDAR",
  title = "Coming up.",
  standfirst,
  right,
  onSelect,
}: CalendarListProps) {
  const groups = useMemo<Group[]>(() => {
    const visible = items.slice(0, limit);
    const map = new Map<string, Group>();
    for (const item of visible) {
      const label = dayLabel(item.releaseDate);
      const existing = map.get(label);
      if (existing) existing.items.push(item);
      else map.set(label, { label, items: [item] });
    }
    return Array.from(map.values());
  }, [items, limit]);

  if (groups.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="px-5">
        <SectionHead kicker={kicker} title={title} standfirst={standfirst} right={right} />
      </div>
      <ul className="px-5 flex flex-col gap-2 list-none m-0 p-0">
        {groups.map((group) => (
          <li key={group.label} className="flex flex-col gap-1">
            <span
              className="t-kicker"
              style={{ color: "var(--fg-faint)" }}
            >
              {group.label}
            </span>
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item)}
                className="w-full flex items-center gap-3 py-2 text-left cursor-pointer"
                style={{
                  borderTop: "0.5px solid var(--hairline)",
                  background: "transparent",
                  color: "var(--fg)",
                }}
              >
                <div
                  className="shrink-0 overflow-hidden"
                  style={{
                    width: 48,
                    height: 64,
                    borderRadius: "var(--r-sm)",
                    background: "var(--surface-elev)",
                  }}
                >
                  <ImageSkeleton
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span
                    className="line-clamp-1"
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: 17,
                      fontWeight: 700,
                      fontVariationSettings: '"opsz" 24',
                      letterSpacing: "-0.01em",
                      lineHeight: 1.2,
                      color: "var(--fg)",
                    }}
                  >
                    {item.title}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: 11,
                      fontWeight: 500,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--fg-faint)",
                    }}
                  >
                    {item.genre}
                  </span>
                </div>
                {item.services[0] && (
                  <ServiceBadge service={item.services[0]} size="sm" />
                )}
                <ChevronRightIcon className="w-4 h-4 shrink-0" />
              </button>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
