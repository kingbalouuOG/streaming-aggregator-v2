import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft, Calendar, Film, Tv, SlidersHorizontal, Bookmark, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ServiceBadge } from "./ServiceBadge";
import { ImageSkeleton } from "./ImageSkeleton";
import type { UpcomingRelease } from "@/hooks/useUpcoming";
import type { ServiceId } from "./platformLogos";

interface CalendarPageProps {
  items: UpcomingRelease[];
  loading: boolean;
  onBack: () => void;
  onItemSelect: (item: UpcomingRelease) => void;
  userServices?: ServiceId[];
  bookmarkedIds?: Set<string>;
  onToggleBookmark?: (item: UpcomingRelease) => void;
}

function formatGroupDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === tomorrow.getTime()) return "Tomorrow";

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}

function formatDatePill(dateStr: string): { day: string; num: string; isToday: boolean } {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return {
    day: days[date.getDay()],
    num: String(date.getDate()),
    isToday: date.getTime() === today.getTime(),
  };
}

/** Flattened row model for the virtualized upcoming list — one row
 *  per date-group header, one row per release. `gapBelow` bakes the
 *  original flex-gap spacing (8px between items, 24px between
 *  groups, 0 after the final item) into the measured row height. */
type CalendarRow =
  | { kind: "header"; date: string }
  | { kind: "item"; item: UpcomingRelease; gapBelow: number };

export function CalendarPage({ items, loading, onBack, onItemSelect, userServices, bookmarkedIds, onToggleBookmark }: CalendarPageProps) {
  const [serviceFilter, setServiceFilter] = useState<ServiceId | "all">("all");
  const [dateFilter, setDateFilter] = useState<string | "all">("all");
  const [showServiceFilter, setShowServiceFilter] = useState(false);
  const dateScrollRef = useRef<HTMLDivElement>(null);

  // Unique dates from items
  const uniqueDates = useMemo(() => {
    const dates = [...new Set(items.map((i) => i.releaseDate))].sort();
    return dates;
  }, [items]);

  // Filter items
  const filtered = useMemo(() => {
    let result = items;
    if (serviceFilter !== "all") {
      result = result.filter((i) => i.services.includes(serviceFilter));
    }
    if (dateFilter !== "all") {
      result = result.filter((i) => i.releaseDate === dateFilter);
    }
    return result;
  }, [items, serviceFilter, dateFilter]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: Record<string, UpcomingRelease[]> = {};
    filtered.forEach((item) => {
      if (!groups[item.releaseDate]) groups[item.releaseDate] = [];
      groups[item.releaseDate].push(item);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // ── PLAT-1 §3: upcoming-list virtualization (E&P brief §5) ──────
  // Long lists flatten the date groups into header/item rows rendered
  // through a virtualizer attached to the App-level scroll container.
  // Short lists keep the original grouped markup untouched.
  const VIRTUALIZE_MIN = 21;
  const virtualize = filtered.length >= VIRTUALIZE_MIN;

  const rows = useMemo<CalendarRow[]>(() => {
    if (!virtualize) return [];
    const out: CalendarRow[] = [];
    grouped.forEach(([date, releases], groupIndex) => {
      out.push({ kind: "header", date });
      releases.forEach((item, releaseIndex) => {
        const lastInGroup = releaseIndex === releases.length - 1;
        const lastGroup = groupIndex === grouped.length - 1;
        out.push({
          kind: "item",
          item,
          gapBelow: lastInGroup ? (lastGroup ? 0 : 24) : 8,
        });
      });
    });
    return out;
  }, [grouped, virtualize]);

  const listWrapRef = useRef<HTMLDivElement | null>(null);
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Resolve the nearest scrollable ancestor and the list's offset
  // within it. Deps cover the state that changes the height of the
  // sticky header block above the list (filter pills, date scroller);
  // the guarded setState only re-renders when the offset moved.
  useLayoutEffect(() => {
    const el = listWrapRef.current;
    if (!el) return;
    if (!scrollParentRef.current) {
      let p: HTMLElement | null = el.parentElement;
      while (p) {
        const { overflowY } = window.getComputedStyle(p);
        if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") break;
        p = p.parentElement;
      }
      scrollParentRef.current = p;
    }
    const sp = scrollParentRef.current;
    if (!sp) return;
    const margin = Math.round(
      el.getBoundingClientRect().top - sp.getBoundingClientRect().top + sp.scrollTop,
    );
    setScrollMargin((prev) => (Math.abs(prev - margin) > 1 ? margin : prev));
  }, [filtered.length, uniqueDates.length, showServiceFilter, userServices, serviceFilter, dateFilter, loading]);

  const rowVirtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: rows.length,
    getScrollElement: () => scrollParentRef.current,
    // Header rows: kicker line + 10px margin. Item rows: 96px thumb +
    // 20px card padding + 8px row gap. measureElement corrects.
    estimateSize: (index) => (rows[index].kind === "header" ? 30 : 124),
    overscan: 6,
    scrollMargin,
    getItemKey: (index) => {
      const row = rows[index];
      return row.kind === "header" ? `header:${row.date}` : row.item.id;
    },
  });

  // Auto-scroll date pills to today
  useEffect(() => {
    if (dateScrollRef.current) {
      const todayPill = dateScrollRef.current.querySelector('[data-today="true"]');
      if (todayPill) {
        todayPill.scrollIntoView({ inline: "center", behavior: "smooth" });
      }
    }
  }, [uniqueDates]);

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky header */}
      <div
        className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl border-b border-border/50"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))" }}
      >
        <div className="flex items-center justify-between px-5 pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-foreground"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <span className="t-kicker">ON THE CALENDAR</span>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--t-title)",
                  fontWeight: 700,
                  fontVariationSettings: '"opsz" 36',
                  letterSpacing: "-0.01em",
                  color: "var(--fg)",
                  lineHeight: 1.15,
                  margin: 0,
                  marginTop: 2,
                }}
              >
                Coming up.
              </h1>
              <p
                style={{
                  fontFamily: "var(--font-ui)",
                  fontSize: 12,
                  color: "var(--fg-soft)",
                  marginTop: 2,
                }}
              >
                {filtered.length} upcoming title{filtered.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowServiceFilter(!showServiceFilter)}
            className="w-8 h-8 flex items-center justify-center transition-colors"
            style={{
              background:
                showServiceFilter || serviceFilter !== "all"
                  ? "var(--primary-soft)"
                  : "transparent",
              color:
                showServiceFilter || serviceFilter !== "all"
                  ? "var(--primary)"
                  : "var(--fg-soft)",
              border:
                showServiceFilter || serviceFilter !== "all"
                  ? "1px solid color-mix(in srgb, var(--primary) 50%, transparent)"
                  : "1px solid var(--hairline)",
              borderRadius: "var(--r-md)",
            }}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* Service filter pills */}
        <AnimatePresence>
          {showServiceFilter && userServices && userServices.length > 0 ? <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex gap-2 overflow-x-auto px-5 pb-3 no-scrollbar">
                <button
                  type="button"
                  onClick={() => setServiceFilter("all")}
                  className="shrink-0 px-3 py-1.5"
                  style={{
                    background: serviceFilter === "all" ? "var(--primary-soft)" : "transparent",
                    color: serviceFilter === "all" ? "var(--primary)" : "var(--fg-soft)",
                    border: serviceFilter === "all"
                      ? "1px solid color-mix(in srgb, var(--primary) 50%, transparent)"
                      : "1px solid var(--hairline)",
                    borderRadius: "var(--r-pill)",
                    fontFamily: "var(--font-ui)",
                    fontSize: 12,
                    fontWeight: serviceFilter === "all" ? 600 : 500,
                    transition: "background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out)",
                  }}
                >
                  All services
                </button>
                {userServices.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setServiceFilter(s === serviceFilter ? "all" : s)}
                    className="shrink-0 inline-flex items-center justify-center px-2 py-1"
                    style={{
                      background: serviceFilter === s ? "var(--primary-soft)" : "var(--surface-tint)",
                      borderRadius: "var(--r-pill)",
                      outline: serviceFilter === s ? "1px solid var(--primary-edge)" : "none",
                      transition: "background var(--d-fast) var(--ease-out)",
                    }}
                  >
                    <ServiceBadge service={s} size="sm" />
                  </button>
                ))}
              </div>
            </motion.div> : null}
        </AnimatePresence>

        {/* Date scroller */}
        {uniqueDates.length > 0 && (
          <div
            ref={dateScrollRef}
            className="flex gap-2 overflow-x-auto px-5 pt-1 pb-3 no-scrollbar"
          >
            <button
              type="button"
              onClick={() => setDateFilter("all")}
              className="shrink-0 px-3 py-1.5"
              style={{
                background: dateFilter === "all" ? "var(--primary-soft)" : "transparent",
                color: dateFilter === "all" ? "var(--primary)" : "var(--fg-soft)",
                border: dateFilter === "all"
                  ? "1px solid color-mix(in srgb, var(--primary) 50%, transparent)"
                  : "1px solid var(--hairline)",
                borderRadius: "var(--r-pill)",
                fontFamily: "var(--font-ui)",
                fontSize: 12,
                fontWeight: dateFilter === "all" ? 600 : 500,
                transition: "background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out)",
              }}
            >
              All
            </button>
            {uniqueDates.map((date) => {
              const pill = formatDatePill(date);
              const isActive = dateFilter === date;
              const isPrimary = isActive || pill.isToday;
              return (
                <button
                  key={date}
                  type="button"
                  data-today={pill.isToday}
                  onClick={() => setDateFilter(date === dateFilter ? "all" : date)}
                  className="shrink-0 flex flex-col items-center justify-center text-center"
                  style={{
                    minWidth: 48,
                    minHeight: 36,
                    padding: "4px 10px",
                    background: isPrimary ? "var(--primary-soft)" : "transparent",
                    color: isPrimary ? "var(--primary)" : "var(--fg-soft)",
                    border: isPrimary
                      ? "1px solid color-mix(in srgb, var(--primary) 50%, transparent)"
                      : "1px solid var(--hairline)",
                    borderRadius: "var(--r-pill)",
                    fontFamily: "var(--font-ui)",
                    fontWeight: 700,
                    lineHeight: 1.05,
                    transition: "background var(--d-fast) var(--ease-out), color var(--d-fast) var(--ease-out), border-color var(--d-fast) var(--ease-out)",
                  }}
                >
                  <span style={{ fontSize: 9, letterSpacing: "0.06em" }}>{pill.day}</span>
                  <span style={{ fontSize: 13 }}>{pill.num}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 px-5 pt-3">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
              <Calendar className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-foreground text-[16px] mb-1" style={{ fontWeight: 600 }}>
              No upcoming releases
            </p>
            <p className="text-muted-foreground text-[13px] max-w-[240px]">
              No new titles found in the next 30 days for your services
            </p>
          </div>
        ) : virtualize ? (
          /* Virtualized path — flattened header/item rows, absolutely
             positioned inside a total-height container. Group spacing
             (header margin, 8px item gap, 24px group gap) is baked
             into each row so the rendered layout is identical to the
             grouped markup below. */
          <div className="pb-6">
            <div
              ref={listWrapRef}
              className="relative w-full"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {rowVirtualizer.getVirtualItems().map((vRow) => {
                const row = rows[vRow.index];
                return (
                  <div
                    key={vRow.key}
                    data-index={vRow.index}
                    ref={rowVirtualizer.measureElement}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${vRow.start - rowVirtualizer.options.scrollMargin}px)` }}
                  >
                    {row.kind === "header" ? (
                      <GroupDateLabel date={row.date} />
                    ) : (
                      <div style={{ paddingBottom: row.gapBelow }}>
                        <ReleaseRow
                          item={row.item}
                          isBookmarked={bookmarkedIds?.has(row.item.id)}
                          onSelect={() => onItemSelect(row.item)}
                          onToggleBookmark={onToggleBookmark}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6 pb-6">
            {grouped.map(([date, releases]) => (
              <div key={date}>
                <GroupDateLabel date={date} />
                <div className="flex flex-col gap-2">
                  {releases.map((item) => (
                    <ReleaseRow
                      key={item.id}
                      item={item}
                      isBookmarked={bookmarkedIds?.has(item.id)}
                      onSelect={() => onItemSelect(item)}
                      onToggleBookmark={onToggleBookmark}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Date-group kicker (shared by virtual + grouped paths) ---- */
function GroupDateLabel({ date }: { date: string }) {
  return (
    <span
      className="t-kicker mb-2.5 inline-block"
      style={{ color: "var(--fg-faint)" }}
    >
      {formatGroupDate(date)}
    </span>
  );
}

/* ---- Release row card (shared by virtual + grouped paths) ---- */
interface ReleaseRowProps {
  item: UpcomingRelease;
  isBookmarked?: boolean;
  onSelect: () => void;
  onToggleBookmark?: (item: UpcomingRelease) => void;
}

function ReleaseRow({ item, isBookmarked, onSelect, onToggleBookmark }: ReleaseRowProps) {
  return (
    <div
      onClick={onSelect}
      className="flex items-start gap-3 p-2.5 text-left w-full cursor-pointer"
      style={{
        borderRadius: "var(--r-md)",
        background: "var(--surface-tint)",
        color: "var(--fg)",
        transition: "background var(--d-fast) var(--ease-out)",
      }}
    >
      {/* Thumbnail */}
      <div
        className="relative w-16 h-24 overflow-hidden shrink-0"
        style={{ borderRadius: "var(--r-sm)" }}
      >
        <ImageSkeleton
          src={item.image}
          alt={item.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-1 left-1">
          <div
            className="w-4 h-4 flex items-center justify-center"
            style={{
              borderRadius: 4,
              background: "var(--scrim-glass)",
              backdropFilter: "blur(6px) saturate(160%)",
              WebkitBackdropFilter: "blur(6px) saturate(160%)",
              color: "#fff",
            }}
          >
            {item.type === "movie" ? (
              <Film className="w-2.5 h-2.5" />
            ) : (
              <Tv className="w-2.5 h-2.5" />
            )}
          </div>
        </div>
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0 py-0.5">
        <h4
          className="truncate"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontWeight: 700,
            fontVariationSettings: '"opsz" 24',
            letterSpacing: "-0.01em",
            color: "var(--fg)",
            lineHeight: 1.2,
          }}
        >
          {item.title}
        </h4>
        <div className="flex items-center gap-1.5 mt-1">
          {item.services.slice(0, 3).map((s) => (
            <ServiceBadge key={s} service={s} size="sm" />
          ))}
          {item.genre ? <span
              style={{
                fontFamily: "var(--font-ui)",
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--fg-faint)",
              }}
            >
              {item.genre}
            </span> : null}
        </div>
        {item.overview ? <p
            className="mt-1 line-clamp-2"
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              color: "var(--fg-soft)",
              lineHeight: 1.5,
            }}
          >
            {item.overview}
          </p> : null}
      </div>
      {/* Bookmark */}
      {onToggleBookmark ? <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark(item);
          }}
          className="shrink-0 w-7 h-7 flex items-center justify-center transition-all mt-0.5"
          style={{
            borderRadius: "var(--r-md)",
            background: isBookmarked ? "var(--primary)" : "var(--surface-elev)",
            color: isBookmarked ? "var(--primary-foreground)" : "var(--fg-soft)",
          }}
          aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}
        >
          <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? "fill-current" : ""}`} />
        </button> : null}
    </div>
  );
}
