import React, { useState, useRef, useEffect, useMemo } from "react";
import { ArrowLeft, Calendar, Film, Tv, SlidersHorizontal, Bookmark } from "lucide-react";
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
              <h1 className="text-foreground text-[18px]" style={{ fontWeight: 700 }}>
                Coming Soon
              </h1>
              <p className="text-muted-foreground text-[12px]">
                {filtered.length} upcoming title{filtered.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowServiceFilter(!showServiceFilter)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              showServiceFilter || serviceFilter !== "all"
                ? "bg-primary/15 text-primary"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        {/* Service filter pills */}
        <AnimatePresence>
          {showServiceFilter && userServices && userServices.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex gap-1.5 overflow-x-auto px-5 pb-3 no-scrollbar">
                <button
                  onClick={() => setServiceFilter("all")}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-[12px] border transition-all ${
                    serviceFilter === "all"
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "bg-secondary/50 text-muted-foreground border-transparent"
                  }`}
                  style={{ fontWeight: serviceFilter === "all" ? 600 : 500 }}
                >
                  All Services
                </button>
                {userServices.map((s) => (
                  <button
                    key={s}
                    onClick={() => setServiceFilter(s === serviceFilter ? "all" : s)}
                    className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] border transition-all ${
                      serviceFilter === s
                        ? "bg-primary/15 text-primary border-primary/30"
                        : "bg-secondary/50 text-muted-foreground border-transparent"
                    }`}
                    style={{ fontWeight: serviceFilter === s ? 600 : 500 }}
                  >
                    <ServiceBadge service={s} size="sm" />
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Date scroller */}
        {uniqueDates.length > 0 && (
          <div
            ref={dateScrollRef}
            className="flex gap-1.5 overflow-x-auto px-5 pt-1 pb-3 no-scrollbar"
          >
            <button
              onClick={() => setDateFilter("all")}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[12px] border transition-all ${
                dateFilter === "all"
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "bg-secondary/50 text-muted-foreground border-transparent"
              }`}
              style={{ fontWeight: dateFilter === "all" ? 600 : 500 }}
            >
              All
            </button>
            {uniqueDates.map((date) => {
              const pill = formatDatePill(date);
              const isActive = dateFilter === date;
              return (
                <button
                  key={date}
                  data-today={pill.isToday}
                  onClick={() => setDateFilter(date === dateFilter ? "all" : date)}
                  className={`shrink-0 flex flex-col items-center px-2.5 py-1 rounded-lg text-center border transition-all min-w-[40px] ${
                    isActive
                      ? "bg-primary/15 text-primary border-primary/30"
                      : pill.isToday
                        ? "bg-primary text-white border-primary"
                        : "bg-secondary/50 text-muted-foreground border-transparent"
                  }`}
                  style={{ fontWeight: isActive || pill.isToday ? 600 : 500 }}
                >
                  <span className="text-[9px] tracking-wider">{pill.day}</span>
                  <span className="text-[13px] -mt-0.5">{pill.num}</span>
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
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
        ) : (
          <div className="flex flex-col gap-6 pb-6">
            {grouped.map(([date, releases]) => (
              <div key={date}>
                <h3
                  className="text-foreground text-[14px] mb-2.5"
                  style={{ fontWeight: 700 }}
                >
                  {formatGroupDate(date)}
                </h3>
                <div className="flex flex-col gap-2">
                  {releases.map((item) => {
                    const isBookmarked = bookmarkedIds?.has(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => onItemSelect(item)}
                        className="flex items-start gap-3 p-2.5 rounded-xl bg-secondary/50 text-left w-full transition-colors hover:bg-secondary/80 cursor-pointer"
                      >
                        {/* Thumbnail */}
                        <div className="relative w-16 h-24 rounded-lg overflow-hidden shrink-0">
                          <ImageSkeleton
                            src={item.image}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-1 left-1">
                            <div className="w-4 h-4 rounded bg-black/60 flex items-center justify-center">
                              {item.type === "movie" ? (
                                <Film className="w-2.5 h-2.5 text-white" />
                              ) : (
                                <Tv className="w-2.5 h-2.5 text-white" />
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0 py-0.5">
                          <h4
                            className="text-foreground text-[14px] truncate"
                            style={{ fontWeight: 600 }}
                          >
                            {item.title}
                          </h4>
                          <div className="flex items-center gap-1.5 mt-1">
                            {item.services.slice(0, 3).map((s) => (
                              <ServiceBadge key={s} service={s} size="sm" />
                            ))}
                            {item.genre && (
                              <span className="text-muted-foreground text-[11px]">
                                {item.genre}
                              </span>
                            )}
                          </div>
                          {item.overview && (
                            <p className="text-muted-foreground text-[11px] mt-1 line-clamp-2 leading-relaxed">
                              {item.overview}
                            </p>
                          )}
                        </div>
                        {/* Bookmark */}
                        {onToggleBookmark && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleBookmark(item);
                            }}
                            className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all mt-0.5 ${
                              isBookmarked
                                ? "bg-primary text-white"
                                : "bg-secondary text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? "fill-current" : ""}`} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
