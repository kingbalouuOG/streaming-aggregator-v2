import React, { useState, useRef, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { EyeIcon, EyeOffIcon } from "./icons";
import { motion, AnimatePresence } from "motion/react";
import { PLATFORMS, getPlatform } from "./platformLogos";
import { TV_UNSUPPORTED_GENRE_NAMES } from "@/lib/constants/genres";

// ----- Data -----
const contentTypes = ["All", "Movies", "TV", "Docs"];
const costOptions = ["All", "Free", "Paid"];
const ALL_GENRES = [
  "Action", "Adventure", "Animation",
  "Comedy", "Crime", "Documentary", "Drama",
  "Family", "Fantasy", "History", "Horror",
  "Music", "Mystery", "Romance", "Sci-Fi",
  "Thriller", "War", "Western",
];
const TV_UNSUPPORTED_SET = new Set<string>(TV_UNSUPPORTED_GENRE_NAMES);
const languages = [
  "English", "Japanese", "Korean", "Spanish",
  "French", "German", "Hindi", "Italian",
  "Turkish", "Danish", "Norwegian", "Swedish",
];

// ----- Filter state types -----
export interface FilterState {
  services: string[];
  contentType: string;
  cost: string;
  genres: string[];
  minRating: number;
  showWatched: boolean;
  languages: string[];
}

const defaultFilters: FilterState = {
  services: [],
  contentType: "All",
  cost: "All",
  genres: [],
  minRating: 0,
  showWatched: false,
  languages: [],
};

interface FilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onApply: (filters: FilterState) => void;
  connectedServices?: string[];
}

export function FilterSheet({ isOpen, onClose, filters, onApply, connectedServices }: FilterSheetProps) {
  const [local, setLocal] = useState<FilterState>(filters);
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  // Track toggled items for animation
  const [lastToggledService, setLastToggledService] = useState<string | null>(null);
  const [lastToggledGenre, setLastToggledGenre] = useState<string | null>(null);

  // Sync local state when sheet opens
  useEffect(() => {
    if (isOpen) setLocal(filters);
  }, [isOpen, filters]);

  // Dynamic genre list: hide unsupported genres when TV is selected
  const visibleGenres = useMemo(
    () => local.contentType === "TV"
      ? ALL_GENRES.filter((g) => !TV_UNSUPPORTED_SET.has(g))
      : ALL_GENRES,
    [local.contentType]
  );

  // Auto-clear unsupported genre selections when switching to TV
  useEffect(() => {
    if (local.contentType === "TV") {
      const hasUnsupported = local.genres.some((g) => TV_UNSUPPORTED_SET.has(g));
      if (hasUnsupported) {
        setLocal((prev) => ({
          ...prev,
          genres: prev.genres.filter((g) => !TV_UNSUPPORTED_SET.has(g)),
        }));
      }
    }
  }, [local.contentType]);

  // Toggle helpers
  const toggleService = (id: string) => {
    setLastToggledService(id);
    setLocal((prev) => ({
      ...prev,
      services: prev.services.includes(id)
        ? prev.services.filter((s) => s !== id)
        : [...prev.services, id],
    }));
  };

  const toggleGenre = (genre: string) => {
    setLastToggledGenre(genre);
    setLocal((prev) => ({
      ...prev,
      genres: prev.genres.includes(genre)
        ? prev.genres.filter((g) => g !== genre)
        : [...prev.genres, genre],
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

  // Slider logic
  const updateRating = (clientX: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setLocal((prev) => ({ ...prev, minRating: Math.round(ratio * 10) }));
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

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const handleClearAll = () => setLocal(defaultFilters);
  const handleApply = () => {
    onApply(local);
    onClose();
  };

  const activeFilterCount =
    local.services.length +
    (local.contentType !== "All" ? 1 : 0) +
    (local.cost !== "All" ? 1 : 0) +
    local.genres.length +
    (local.minRating > 0 ? 1 : 0) +
    (local.showWatched ? 1 : 0) +
    local.languages.length;

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
            className="relative w-full max-w-md bg-surface-elevated rounded-t-3xl max-h-[90vh] flex flex-col"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full" style={{ background: "var(--drag-handle)" }} />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-4 pt-1">
              <h2 className="text-foreground text-[20px]" style={{ fontWeight: 700 }}>
                Filters
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 pb-4 no-scrollbar">
              {/* STREAMING SERVICES */}
              <SectionLabel>STREAMING SERVICES</SectionLabel>
              <div className="flex flex-wrap gap-3 mb-6">
                {(connectedServices?.length ? PLATFORMS.filter((p) => connectedServices.includes(p.id)) : PLATFORMS).map((svc) => {
                  const selected = local.services.includes(svc.id);
                  return (
                    <motion.button
                      key={svc.id}
                      onClick={() => toggleService(svc.id)}
                      animate={
                        lastToggledService === svc.id
                          ? { scale: [1, 1.2, 0.95, 1] }
                          : { scale: 1 }
                      }
                      transition={{
                        duration: 0.35,
                        ease: [0.25, 0.46, 0.45, 0.94],
                      }}
                      onAnimationComplete={() => {
                        if (lastToggledService === svc.id) setLastToggledService(null);
                      }}
                      whileTap={{ scale: 0.9 }}
                      className={`w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center transition-all duration-200 border-2 ${
                        selected
                          ? `${svc.selectedBorder} shadow-lg ring-1 ring-primary/30`
                          : "border-transparent opacity-50 hover:opacity-100"
                      }`}
                    >
                      <img src={svc.logo} alt={svc.name} className="w-full h-full object-cover" />
                    </motion.button>
                  );
                })}
              </div>

              {/* CONTENT TYPE */}
              <SectionLabel>CONTENT TYPE</SectionLabel>
              <div className="flex gap-2 mb-6">
                {contentTypes.map((type) => {
                  const active = local.contentType === type;
                  return (
                    <button
                      key={type}
                      onClick={() => setLocal((p) => ({ ...p, contentType: type }))}
                      className={`px-4 py-1.5 rounded-full text-[13px] transition-all duration-200 ${
                        active
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>

              {/* COST */}
              <SectionLabel>COST</SectionLabel>
              <div className="flex bg-secondary rounded-xl p-1 mb-6">
                {costOptions.map((opt) => {
                  const active = local.cost === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => setLocal((p) => ({ ...p, cost: opt }))}
                      className={`flex-1 py-2 rounded-lg text-[13px] transition-all duration-200 ${
                        active
                          ? "bg-primary text-primary-foreground shadow-md"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              {/* GENRE */}
              <SectionLabel>GENRE</SectionLabel>
              <div className="flex flex-wrap gap-2 mb-6">
                {visibleGenres.map((genre) => {
                  const selected = local.genres.includes(genre);
                  return (
                    <motion.button
                      key={genre}
                      onClick={() => toggleGenre(genre)}
                      animate={
                        lastToggledGenre === genre
                          ? { scale: [1, 1.1, 0.96, 1] }
                          : { scale: 1 }
                      }
                      transition={{
                        duration: 0.3,
                        ease: [0.25, 0.46, 0.45, 0.94],
                      }}
                      onAnimationComplete={() => {
                        if (lastToggledGenre === genre) setLastToggledGenre(null);
                      }}
                      whileTap={{ scale: 0.93 }}
                      className={`px-3.5 py-1.5 rounded-full text-[13px] transition-colors duration-200 border ${
                        selected
                          ? "bg-primary/15 border-primary text-primary"
                          : "bg-transparent text-muted-foreground hover:text-foreground"
                      }`}
                      style={{ borderColor: selected ? undefined : "var(--check-border-2)" }}
                    >
                      {genre}
                    </motion.button>
                  );
                })}
              </div>

              {/* MINIMUM RATING */}
              <SectionLabel>MINIMUM RATING</SectionLabel>
              <div className="mb-2">
                <span className="text-primary text-[15px]" style={{ fontWeight: 600 }}>
                  {local.minRating === 0 ? "Any" : local.minRating.toFixed(0)}
                </span>
              </div>
              <div
                ref={sliderRef}
                className="relative h-10 flex items-center mb-1 touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                {/* Track */}
                <div className="absolute left-0 right-0 h-1 rounded-full" style={{ background: "var(--slider-track)" }} />
                {/* Active track */}
                <div
                  className="absolute left-0 h-1 bg-primary rounded-full"
                  style={{ width: `${(local.minRating / 10) * 100}%` }}
                />
                {/* Thumb */}
                <div
                  className="absolute w-5 h-5 rounded-full bg-primary shadow-lg shadow-primary/40 -translate-x-1/2 cursor-grab active:cursor-grabbing"
                  style={{ left: `${(local.minRating / 10) * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-muted-foreground text-[11px] mb-6">
                <span>0</span>
                <span>5</span>
                <span>10</span>
              </div>

              {/* SHOW WATCHED */}
              <SectionLabel>SHOW WATCHED</SectionLabel>
              <button
                onClick={() => setLocal((p) => ({ ...p, showWatched: !p.showWatched }))}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl mb-4 transition-all duration-200 border ${
                  local.showWatched
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-secondary border-transparent text-muted-foreground"
                }`}
              >
                {local.showWatched ? (
                  <EyeIcon className="w-5 h-5 shrink-0" />
                ) : (
                  <EyeOffIcon className="w-5 h-5 shrink-0" />
                )}
                <span className="text-[13px]" style={{ fontWeight: 600 }}>
                  {local.showWatched ? "Visible" : "Hidden"}
                </span>
              </button>

              {/* LANGUAGE */}
              <SectionLabel>LANGUAGE</SectionLabel>
              <p className="text-muted-foreground/60 text-[11px] -mt-1.5 mb-3">
                Select languages you want to see. None selected = show all.
              </p>
              <div className="flex flex-wrap gap-2 mb-6">
                {languages.map((lang) => {
                  const selected = local.languages.includes(lang);
                  return (
                    <button
                      key={lang}
                      onClick={() => toggleLanguage(lang)}
                      className={`px-3.5 py-1.5 rounded-full text-[13px] transition-colors duration-200 border ${
                        selected
                          ? "bg-primary/15 border-primary text-primary"
                          : "bg-transparent text-muted-foreground hover:text-foreground"
                      }`}
                      style={{ borderColor: selected ? undefined : "var(--check-border-2)" }}
                    >
                      {lang}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom bar */}
            <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 flex gap-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <button
                onClick={handleClearAll}
                className="flex-1 py-3 rounded-2xl bg-secondary text-foreground text-[14px] transition-colors hover:bg-accent"
                style={{ fontWeight: 600 }}
              >
                Clear All
              </button>
              <button
                onClick={handleApply}
                className="flex-1 py-3 rounded-2xl bg-primary text-primary-foreground text-[14px] shadow-lg shadow-primary/30 transition-colors hover:bg-primary/90"
                style={{ fontWeight: 600 }}
              >
                Apply Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </button>
            </div>
          </motion.div>

          <style>{`
            .no-scrollbar::-webkit-scrollbar { display: none; }
            .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          `}</style>
        </div>
      )}
    </AnimatePresence>
  );
}

// Small helper for section labels
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-muted-foreground text-[11px] tracking-widest mb-3"
      style={{ fontWeight: 600 }}
    >
      {children}
    </p>
  );
}

export { defaultFilters };