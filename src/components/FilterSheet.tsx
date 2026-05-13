import { useState, useRef, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ServiceTile } from "./ServiceTile";
import { TV_UNSUPPORTED_GENRE_NAMES } from "@/lib/constants/genres";
import {
  defaultFor,
  type FilterState,
  type ContentType,
  type Cost,
  type Runtime,
  type ShowWatched,
} from "@/lib/search/filterState";
import type { ServiceId } from "./platformLogos";

// Catalogues live with the sheet for now; if a second consumer surfaces
// they can move to src/lib/search/catalogues.ts without touching the
// public API.
export const ALL_GENRES = [
  "Action", "Adventure", "Animation",
  "Comedy", "Crime", "Documentary", "Drama",
  "Family", "Fantasy", "History", "Horror",
  "Music", "Mystery", "Romance", "Sci-Fi",
  "Thriller", "War", "Western",
];
const TV_UNSUPPORTED_SET = new Set<string>(TV_UNSUPPORTED_GENRE_NAMES);
export const FILTER_LANGUAGES = [
  "English", "Japanese", "Korean", "Spanish",
  "French", "German", "Hindi", "Italian",
  "Turkish", "Danish", "Norwegian", "Swedish",
];

type SegmentedOption<T extends string> = { value: T; label: string };

const CONTENT_TYPE_OPTIONS: SegmentedOption<ContentType>[] = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "TV" },
  { value: "doc", label: "Docs" },
];

// Cost is multi-select (chip-based). Empty array = no filter (= "all").
// "Free" covers flatrate subscriptions + true free + ads. Rent / Buy
// are the two paid tiers. Pick any combination — selecting Free + Rent
// returns titles available either free OR for rent.
const COST_VALUES: readonly Cost[] = ["free", "rent", "buy"];
const COST_LABELS: Record<Cost, string> = {
  free: "Free",
  rent: "Rent",
  buy: "Buy",
};

const RUNTIME_OPTIONS: SegmentedOption<Runtime>[] = [
  { value: "any", label: "Any" },
  { value: "under_60", label: "Under 60" },
  { value: "60_120", label: "60–120" },
  { value: "over_120", label: "120+" },
];

const SHOW_WATCHED_OPTIONS: SegmentedOption<ShowWatched>[] = [
  { value: "all", label: "All" },
  { value: "hide", label: "Hide" },
  { value: "only", label: "Only" },
];

interface FilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onApply: (filters: FilterState) => void;
  /** ServiceIds the user has subscribed to. Drives the STREAMING SERVICES row. */
  userServices?: readonly ServiceId[];
}

/**
 * FilterSheet — Phase Search V2 redesign per artboard 05.
 *
 * Bottom sheet, 10 sections in scroll order:
 *   1. Only on my services (pinned toggle)
 *   2. STREAMING SERVICES (ServiceTile row)
 *   3. CONTENT TYPE (segmented)
 *   4. COST (segmented)
 *   5. RUNTIME (segmented, new axis)
 *   6. GENRE (chip multi-select)
 *   7. MINIMUM RATING (slider)
 *   8. SHOW WATCHED (segmented tri-state)
 *   9. LANGUAGE (chip multi-select)
 *
 * UK RATING omitted per the H7 resolution (no compliance pressure, no
 * clean UK/US/MPAA/TV mapping). DECADE dropped post-A2 review — Joe's
 * call that nobody would reach for it; the runtime + genre + minRating
 * axes already cover "what to watch tonight." Add either back when a
 * real user signal surfaces.
 *
 * Dismissal: × button, backdrop tap, or swipe-down on grabber — all
 * close without applying. Apply is the only commit affordance.
 */
export function FilterSheet({ isOpen, onClose, filters, onApply, userServices }: FilterSheetProps) {
  const [local, setLocal] = useState<FilterState>(filters);
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // Sync local state when sheet opens
  useEffect(() => {
    if (isOpen) setLocal(filters);
  }, [isOpen, filters]);

  // Dynamic genre list: hide unsupported genres when TV is selected
  const visibleGenres = useMemo(
    () => local.contentType === "tv"
      ? ALL_GENRES.filter((g) => !TV_UNSUPPORTED_SET.has(g))
      : ALL_GENRES,
    [local.contentType],
  );

  // Auto-clear unsupported genre selections when switching to TV
  useEffect(() => {
    if (local.contentType === "tv") {
      const hasUnsupported = local.genres.some((g) => TV_UNSUPPORTED_SET.has(g));
      if (hasUnsupported) {
        setLocal((prev) => ({
          ...prev,
          genres: prev.genres.filter((g) => !TV_UNSUPPORTED_SET.has(g)),
        }));
      }
    }
  }, [local.contentType, local.genres]);

  // ── Toggle helpers ────────────────────────────────────────────
  const toggleService = (id: ServiceId) => {
    setLocal((prev) => ({
      ...prev,
      services: prev.services.includes(id)
        ? prev.services.filter((s) => s !== id)
        : [...prev.services, id],
    }));
  };

  const toggleGenre = (genre: string) => {
    setLocal((prev) => ({
      ...prev,
      genres: prev.genres.includes(genre)
        ? prev.genres.filter((g) => g !== genre)
        : [...prev.genres, genre],
    }));
  };

  const toggleCost = (c: Cost) => {
    setLocal((prev) => ({
      ...prev,
      costs: prev.costs.includes(c)
        ? prev.costs.filter((x) => x !== c)
        : [...prev.costs, c],
    }));
  };

  const toggleLanguage = (lang: string) => {
    setLocal((prev) => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter((l) => l !== lang)
        : [...prev.languages, lang],
    }));
  };

  // ── Slider ────────────────────────────────────────────────────
  const updateRating = (clientX: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    // Step 0.1 per design brief §3.6
    setLocal((prev) => ({ ...prev, minRating: Math.round(ratio * 100) / 10 }));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateRating(e.clientX);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    updateRating(e.clientX);
  };
  const handlePointerUp = () => { isDragging.current = false; };

  // ── Footer actions ────────────────────────────────────────────
  const handleClearAll = () => setLocal(defaultFor(userServices ?? []));
  const handleApply = () => {
    onApply(local);
    onClose();
  };

  // ── Active filter count ───────────────────────────────────────
  // Counts the same axes the URL serialiser emits — keep in sync.
  const activeFilterCount =
    (sameSet(local.services, userServices ?? []) ? 0 : 1) +
    (local.contentType !== "all" ? 1 : 0) +
    (local.costs.length > 0 ? 1 : 0) +
    (local.runtime !== "any" ? 1 : 0) +
    (local.genres.length > 0 ? 1 : 0) +
    (local.minRating > 0 ? 1 : 0) +
    (local.showWatched !== "all" ? 1 : 0) +
    (local.languages.length > 0 ? 1 : 0) +
    (local.onlyOnMyServices ? 0 : 1);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: "var(--backdrop)" }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="relative w-full max-w-md max-h-[90vh] flex flex-col"
            style={{
              background: "var(--surface-elev)",
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              boxShadow: "var(--shadow-sheet)",
            }}
          >
            {/* Grabber pill */}
            <div className="flex justify-center pt-2 pb-1">
              <span
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: "var(--r-pill)",
                  background: "var(--hairline)",
                }}
              />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between px-5 pt-2 pb-4">
              <div className="flex items-baseline gap-3">
                <div>
                  <span className="t-kicker">REFINE</span>
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
                      margin: 0,
                    }}
                  >
                    Filters.
                  </h2>
                </div>
                {activeFilterCount > 0 && (
                  <span
                    className="inline-flex items-center justify-center"
                    style={{
                      minWidth: 22,
                      height: 22,
                      padding: "0 7px",
                      borderRadius: "9999px",
                      background: "var(--primary-soft)",
                      border: "0.5px solid var(--primary-edge)",
                      color: "var(--primary-fg-on-soft)",
                      fontFamily: "var(--font-ui)",
                      fontSize: 12,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                    aria-label={`${activeFilterCount} active filters`}
                  >
                    {activeFilterCount}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 inline-flex items-center justify-center"
                style={{ color: "var(--fg-soft)" }}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* ── Section 1: Only on my services (pinned) ──────── */}
            <div className="px-5 pb-4">
              <button
                type="button"
                onClick={() => setLocal((p) => ({ ...p, onlyOnMyServices: !p.onlyOnMyServices }))}
                className="flex items-center justify-between w-full px-4 py-3 transition-colors"
                style={{
                  background: "var(--surface-tint)",
                  border: "0.5px solid var(--hairline)",
                  borderRadius: "var(--r-md)",
                }}
                aria-pressed={local.onlyOnMyServices ? "true" : "false"}
              >
                <span className="flex flex-col items-start text-left">
                  <span
                    style={{
                      fontFamily: "var(--font-ui)",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--fg)",
                    }}
                  >
                    Only on my services
                  </span>
                  <span
                    style={{
                      marginTop: 2,
                      fontFamily: "var(--font-ui)",
                      fontSize: 11,
                      fontWeight: 500,
                      color: "var(--fg-faint)",
                    }}
                  >
                    Hide titles not in your stack.
                  </span>
                </span>
                <span
                  className="relative shrink-0"
                  style={{
                    width: 36,
                    height: 22,
                    borderRadius: 9999,
                    background: local.onlyOnMyServices ? "var(--primary)" : "var(--switch-background)",
                    transition: "background var(--d-fast) var(--ease-out)",
                  }}
                >
                  <span
                    className="absolute top-[2px]"
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "9999px",
                      background: "#fff",
                      left: local.onlyOnMyServices ? 16 : 2,
                      transition: "left var(--d-fast) var(--ease-out)",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                    }}
                  />
                </span>
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 pb-4 no-scrollbar">
              {/* ── Section 2: STREAMING SERVICES ───────────────── */}
              <SectionLabel kicker="Your services" sub="All on by default — tap to exclude.">
                STREAMING SERVICES
              </SectionLabel>
              <div className="flex gap-3 mb-6 overflow-x-auto no-scrollbar -mx-1 px-1">
                {(userServices ?? []).map((id) => (
                  <ServiceTile
                    key={id}
                    service={id}
                    active={local.services.includes(id)}
                    onToggle={toggleService}
                  />
                ))}
              </div>

              {/* ── Section 3: CONTENT TYPE ─────────────────────── */}
              <SectionLabel sub="Movies, TV or docs?">CONTENT TYPE</SectionLabel>
              <Segmented<ContentType>
                options={CONTENT_TYPE_OPTIONS}
                value={local.contentType}
                onChange={(v) => setLocal((p) => ({ ...p, contentType: v }))}
              />

              {/* ── Section 4: COST (multi-select) ──────────────── */}
              <SectionLabel sub="Pick any — free, rent, buy.">COST</SectionLabel>
              <ChipMulti
                options={COST_VALUES}
                getLabel={(c) => COST_LABELS[c]}
                isSelected={(c) => local.costs.includes(c)}
                onToggle={toggleCost}
              />

              {/* ── Section 5: RUNTIME (new) ────────────────────── */}
              <SectionLabel sub="How much time tonight?">RUNTIME</SectionLabel>
              <Segmented<Runtime>
                options={RUNTIME_OPTIONS}
                value={local.runtime}
                onChange={(v) => setLocal((p) => ({ ...p, runtime: v }))}
              />

              {/* ── Section 6: GENRE ────────────────────────────── */}
              <SectionLabel sub="Pick one or more.">GENRE</SectionLabel>
              <ChipMulti
                options={visibleGenres}
                getLabel={(g) => g}
                isSelected={(g) => local.genres.includes(g)}
                onToggle={toggleGenre}
              />

              {/* ── Section 7: MINIMUM RATING ───────────────────── */}
              <SectionLabel sub="Critic + audience.">MINIMUM RATING</SectionLabel>
              <div className="mb-2">
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 28,
                    fontWeight: 800,
                    fontVariationSettings: '"opsz" 36',
                    letterSpacing: "-0.02em",
                    color: local.minRating > 0 ? "var(--primary)" : "var(--fg-soft)",
                    lineHeight: 1,
                  }}
                >
                  {local.minRating === 0 ? "Any" : `${local.minRating.toFixed(1)}+`}
                </span>
              </div>
              <div
                ref={sliderRef}
                className="relative h-10 flex items-center mb-1 touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                <div className="absolute left-0 right-0 h-1 rounded-full" style={{ background: "var(--slider-track)" }} />
                <div
                  className="absolute left-0 h-1 rounded-full"
                  style={{ background: "var(--primary)", width: `${(local.minRating / 10) * 100}%` }}
                />
                <div
                  className="absolute w-5 h-5 rounded-full -translate-x-1/2"
                  style={{
                    background: "var(--primary)",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                    left: `${(local.minRating / 10) * 100}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between mb-6" style={{ color: "var(--fg-faint)", fontSize: 11 }}>
                <span>0</span>
                <span>5</span>
                <span>10</span>
              </div>

              {/* ── Section 8: SHOW WATCHED (tri-state) ─────────── */}
              <SectionLabel sub="Already-watched titles.">SHOW WATCHED</SectionLabel>
              <Segmented<ShowWatched>
                options={SHOW_WATCHED_OPTIONS}
                value={local.showWatched}
                onChange={(v) => setLocal((p) => ({ ...p, showWatched: v }))}
              />

              {/* ── Section 9: LANGUAGE ─────────────────────────── */}
              <SectionLabel sub="None selected = show all.">LANGUAGE</SectionLabel>
              <ChipMulti
                options={FILTER_LANGUAGES}
                getLabel={(l) => l}
                isSelected={(l) => local.languages.includes(l)}
                onToggle={toggleLanguage}
              />
            </div>

            {/* Footer */}
            <div
              className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 flex gap-3"
              style={{ borderTop: "0.5px solid var(--hairline)" }}
            >
              <button
                type="button"
                onClick={handleClearAll}
                className="flex-1 py-3 transition-colors"
                style={{
                  background: "var(--surface-tint)",
                  color: "var(--fg)",
                  borderRadius: "var(--r-pill)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="flex-1 py-3 transition-colors"
                style={{
                  background: "var(--primary)",
                  color: "var(--primary-foreground)",
                  borderRadius: "var(--r-pill)",
                  fontFamily: "var(--font-ui)",
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Apply{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ─── Internal helpers ───────────────────────────────────────────

function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set<T>(a);
  for (const v of b) if (!set.has(v)) return false;
  return true;
}

interface SectionLabelProps {
  children: React.ReactNode;
  kicker?: string;
  sub?: string;
}

function SectionLabel({ children, kicker, sub }: SectionLabelProps) {
  return (
    <div className="mb-3">
      {kicker && (
        <p
          className="t-kicker"
          style={{ color: "var(--fg-faint)", marginBottom: 2 }}
        >
          {kicker}
        </p>
      )}
      <p className="t-kicker">{children}</p>
      {sub && (
        <p
          style={{
            marginTop: 4,
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            fontWeight: 500,
            color: "var(--fg-faint)",
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
}

function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="flex gap-2 mb-6">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="flex-1 py-2 transition-all"
            style={{
              background: active ? "var(--primary-soft)" : "transparent",
              color: active ? "var(--primary-fg-on-soft)" : "var(--fg-soft)",
              border: active ? "0.5px solid var(--primary-edge)" : "0.5px solid var(--hairline)",
              borderRadius: "var(--r-pill)",
              fontFamily: "var(--font-ui)",
              fontSize: 12.5,
              fontWeight: 600,
              letterSpacing: "-0.005em",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

interface ChipMultiProps<T extends string> {
  options: readonly T[];
  getLabel: (v: T) => string;
  isSelected: (v: T) => boolean;
  onToggle: (v: T) => void;
}

function ChipMulti<T extends string>({ options, getLabel, isSelected, onToggle }: ChipMultiProps<T>) {
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {options.map((opt) => {
        const selected = isSelected(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className="px-4 py-2 transition-colors"
            style={{
              background: selected ? "var(--primary-soft)" : "transparent",
              color: selected ? "var(--primary-fg-on-soft)" : "var(--fg-soft)",
              border: selected
                ? "0.5px solid var(--primary-edge)"
                : "0.5px solid var(--hairline)",
              borderRadius: "var(--r-pill)",
              fontFamily: "var(--font-ui)",
              fontSize: 12.5,
              fontWeight: 600,
              letterSpacing: "-0.005em",
            }}
          >
            {getLabel(opt)}
          </button>
        );
      })}
    </div>
  );
}

// FilterState is re-exported so existing import paths keep compiling.
export type { FilterState };
