import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  Tv,
  RefreshCw,
} from "lucide-react";
import { PLATFORMS, type PlatformDef } from "./platformLogos";
import { TASTE_CLUSTERS, MIN_CLUSTERS, MAX_CLUSTERS } from "@/lib/taste/tasteClusters";
import { logOnboardingEvent } from "@/lib/analytics/logger";
import { ONBOARDING_EVENTS } from "@/lib/analytics/events";
import { supabase } from "@/lib/supabase";
import { fetchServiceCentroids } from "@/lib/taste-v2/bootstrap";
import type { SliderState } from "@/lib/taste-v2/types";
import { DEFAULT_SLIDERS } from "@/lib/taste-v2/types";

// ── Service definitions ──────────────────────────────────
export type { PlatformDef as StreamingServiceDef };
export const allServices = PLATFORMS;
export { TASTE_CLUSTERS, MIN_CLUSTERS, MAX_CLUSTERS };

// ── Types ──────────────────────────────────
export interface OnboardingData {
  name: string;
  email: string;
  services: string[];
  clusters: string[];
  watchedTitles?: { tmdbId: number; mediaType: 'movie' | 'tv' }[];
  sliders?: SliderState;
  onboardingStartTime?: number;
}

interface OnboardingFlowProps {
  onComplete: (data: OnboardingData) => void;
}

const TOTAL_STEPS = 5;

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
  }),
};

// ── Watched grid title type ────────────────
interface WatchedGridTitle {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  year: number | null;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [watchedSelections, setWatchedSelections] = useState<Set<string>>(new Set());
  const [sliders, setSliders] = useState<SliderState>({ ...DEFAULT_SLIDERS });

  // Watched grid state
  const [watchedPool, setWatchedPool] = useState<WatchedGridTitle[]>([]);
  const [watchedRound, setWatchedRound] = useState(0);
  const [watchedPoolOffset, setWatchedPoolOffset] = useState(0);
  const [watchedLoading, setWatchedLoading] = useState(false);

  const onboardingStartRef = useRef(Date.now());
  const TITLES_PER_ROUND = 6;
  const TOTAL_ROUNDS = 3;

  useEffect(() => {
    void logOnboardingEvent(ONBOARDING_EVENTS.ONBOARDING_STARTED, {});
  }, []);

  // Fetch watched grid candidates when entering Step 3
  const fetchWatchedGridCandidates = useCallback(async () => {
    if (selectedServices.length === 0) return;
    setWatchedLoading(true);

    try {
      // Fetch per-service top titles (avoids centroid collapse)
      const allCandidates: WatchedGridTitle[] = [];
      const seenIds = new Set<number>();

      for (const serviceId of selectedServices) {
        const centroids = await fetchServiceCentroids([serviceId]);
        if (centroids.length === 0) continue;

        const serviceCentroid = centroids[0];
        const vectorStr = `[${serviceCentroid.join(',')}]`;

        const { data: matched } = await supabase.rpc('match_titles_by_vector', {
          query_vector: vectorStr,
          match_limit: 30,
        });

        if (!matched) continue;

        // Get full metadata for matched titles
        const tmdbIds = (matched as any[]).map((m: any) => m.tmdb_id);
        const { data: titles } = await supabase
          .from('titles' as any)
          .select('tmdb_id, media_type, title, poster_path, release_year, popularity')
          .in('tmdb_id', tmdbIds)
          .gte('popularity', 20)
          .not('poster_path', 'is', null);

        // Check availability on this service
        const { data: availRows } = await supabase
          .from('streaming_availability' as any)
          .select('tmdb_id')
          .in('tmdb_id', tmdbIds)
          .eq('service_id', serviceId);

        const availSet = new Set(((availRows as any[]) || []).map((r: any) => r.tmdb_id));

        for (const t of ((titles as any[]) || [])) {
          if (seenIds.has(t.tmdb_id)) continue;
          if (!availSet.has(t.tmdb_id)) continue;
          seenIds.add(t.tmdb_id);
          allCandidates.push({
            tmdbId: t.tmdb_id,
            mediaType: t.media_type,
            title: t.title,
            posterPath: t.poster_path,
            year: t.release_year,
          });
        }
      }

      // Shuffle for variety
      for (let i = allCandidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allCandidates[i], allCandidates[j]] = [allCandidates[j], allCandidates[i]];
      }

      setWatchedPool(allCandidates);
      setWatchedPoolOffset(0);
      setWatchedRound(0);
    } catch (err) {
      console.error('[Onboarding] Failed to fetch watched grid candidates:', err);
    } finally {
      setWatchedLoading(false);
    }
  }, [selectedServices]);

  // Current round's visible titles
  const roundStartIdx = watchedRound * TITLES_PER_ROUND + watchedPoolOffset;
  const currentRoundTitles = watchedPool.slice(roundStartIdx, roundStartIdx + TITLES_PER_ROUND);

  const canContinue = [
    selectedServices.length > 0,                      // Step 1: Services
    true,                                             // Step 2: Watched grid (optional)
    selectedClusters.length >= MIN_CLUSTERS,           // Step 3: Clusters
    true,                                             // Step 4: Summary + sliders
  ];

  const goNext = async () => {
    if (step === 0) {
      void logOnboardingEvent(ONBOARDING_EVENTS.SERVICES_COMPLETED, {
        service_count: selectedServices.length,
        services: selectedServices,
      });
      // Pre-fetch watched grid titles for Step 2
      fetchWatchedGridCandidates();
    }
    if (step === 1 && watchedRound < TOTAL_ROUNDS - 1) {
      // Advance to next round within Step 2
      setWatchedRound(r => r + 1);
      return;
    }
    // Step 1 (watched grid) has no dedicated analytics event — selections logged at completion
    if (step === 2) {
      void logOnboardingEvent(ONBOARDING_EVENTS.CLUSTERS_COMPLETED, {
        cluster_count: selectedClusters.length,
        clusters: selectedClusters,
      });
    }
    if (step < TOTAL_STEPS - 1) {
      setDirection(1);
      setStep(s => s + 1);
      return;
    }

    // Step 5 (index 4) — finish onboarding
    const watchedTitles = [...watchedSelections].map(key => {
      const [mt, id] = key.split('-');
      return { tmdbId: parseInt(id, 10), mediaType: mt as 'movie' | 'tv' };
    });

    onComplete({
      name: '', email: '',
      services: selectedServices,
      clusters: selectedClusters,
      watchedTitles,
      sliders,
      onboardingStartTime: onboardingStartRef.current,
    });
  };

  const goBack = () => {
    if (step === 1 && watchedRound > 0) {
      setWatchedRound(r => r - 1);
      return;
    }
    setDirection(-1);
    setStep(s => s - 1);
  };

  const toggleService = (id: string) => {
    setSelectedServices(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const toggleCluster = (clusterId: string) => {
    setSelectedClusters(prev => {
      if (prev.includes(clusterId)) return prev.filter(c => c !== clusterId);
      if (prev.length >= MAX_CLUSTERS) return prev;
      return [...prev, clusterId];
    });
  };

  const selectAllServices = () => {
    setSelectedServices(prev =>
      prev.length === allServices.length ? [] : allServices.map(s => s.id)
    );
  };

  const clearClusters = () => setSelectedClusters([]);

  const toggleWatchedTitle = (tmdbId: number, mediaType: string) => {
    const key = `${mediaType}-${tmdbId}`;
    setWatchedSelections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const refreshWatchedTitles = () => {
    setWatchedPoolOffset(prev => prev + TITLES_PER_ROUND);
  };

  // CTA button text
  const getCtaText = () => {
    if (step === 1 && watchedRound < TOTAL_ROUNDS - 1) return `Next round (${watchedRound + 1}/${TOTAL_ROUNDS})`;
    if (step === TOTAL_STEPS - 1) return 'Start exploring VIDEX';
    return 'Continue';
  };

  return (
    <div className="size-full bg-background text-foreground flex justify-center overflow-hidden">
      <div className="w-full max-w-md h-full flex flex-col relative">
        {/* ── Progress bar ────────────────────── */}
        <div className="px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-2 flex items-center gap-2">
          {(step > 0 || (step === 1 && watchedRound > 0)) && (
            <motion.button
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={goBack}
              className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors mr-1"
            >
              <ArrowLeft className="w-4 h-4" />
            </motion.button>
          )}
          <div className="flex-1 flex items-center gap-1.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: step >= i ? "100%" : "0%" }}
                  transition={{ duration: 0.5, ease: "easeInOut", delay: step >= i ? i * 0.05 : 0 }}
                />
              </div>
            ))}
          </div>
          <span className="text-muted-foreground text-[12px] ml-2 tabular-nums" style={{ fontWeight: 500 }}>
            {step + 1}/{TOTAL_STEPS}
          </span>
        </div>

        {/* ── Step content ──────────────────── */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence initial={false} custom={direction} mode="wait">
            <motion.div
              key={step === 1 ? `step1-round${watchedRound}` : `step${step}`}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className="absolute inset-0 flex flex-col"
            >
              {step === 0 && (
                <StepServices
                  selected={selectedServices}
                  onToggle={toggleService}
                  onSelectAll={selectAllServices}
                />
              )}
              {step === 1 && (
                <StepWatchedGrid
                  titles={currentRoundTitles}
                  selected={watchedSelections}
                  onToggle={toggleWatchedTitle}
                  onRefresh={refreshWatchedTitles}
                  round={watchedRound}
                  totalRounds={TOTAL_ROUNDS}
                  loading={watchedLoading}
                />
              )}
              {step === 2 && (
                <StepClusters
                  selected={selectedClusters}
                  onToggle={toggleCluster}
                  onClear={clearClusters}
                />
              )}
              {step === 3 && (
                <StepTasteSummary
                  selectedClusters={selectedClusters}
                  sliders={sliders}
                  onSlidersChange={setSliders}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Bottom CTA ───────────────────── */}
        <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
          {step === 0 && selectedServices.length === 0 && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              Select at least one service to continue
            </p>
          )}
          {step === 0 && selectedServices.length > 0 && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              {selectedServices.length} service{selectedServices.length !== 1 ? "s" : ""} selected
            </p>
          )}
          {step === 1 && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              {watchedSelections.size > 0
                ? `${watchedSelections.size} title${watchedSelections.size !== 1 ? 's' : ''} selected`
                : 'Tap titles you\'ve watched and enjoyed'}
            </p>
          )}
          {step === 2 && selectedClusters.length < MIN_CLUSTERS && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              Pick at least {MIN_CLUSTERS} that match your vibe
            </p>
          )}
          {step === 2 && selectedClusters.length >= MIN_CLUSTERS && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              {selectedClusters.length} of {MAX_CLUSTERS} selected
            </p>
          )}

          <motion.button
            onClick={goNext}
            disabled={!canContinue[step] && step < TOTAL_STEPS - 1}
            whileTap={canContinue[step] || step === TOTAL_STEPS - 1 ? { scale: 0.97 } : undefined}
            className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[15px] transition-all duration-300 ${
              canContinue[step] || step === TOTAL_STEPS - 1
                ? "bg-primary text-white shadow-lg shadow-primary/25"
                : "bg-secondary text-muted-foreground cursor-not-allowed"
            }`}
            style={{ fontWeight: 600 }}
          >
            {getCtaText()}
            {step < TOTAL_STEPS - 1 && <ArrowRight className="w-4.5 h-4.5" />}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// ── Step 1: Select Services ─────────────────────────────
// ═════════════════════════════════════════════════════════
function StepServices({
  selected,
  onToggle,
  onSelectAll,
}: {
  selected: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
}) {
  return (
    <div className="flex flex-col h-full px-6 overflow-y-auto no-scrollbar">
      <div className="pt-4 pb-5">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-2"
        >
          <div className="w-10 h-10 rounded-2xl bg-blue-500/15 flex items-center justify-center">
            <Tv className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-foreground text-[20px]" style={{ fontWeight: 700 }}>
              Your streaming services
            </h2>
            <p className="text-muted-foreground text-[13px]">
              Which platforms are you subscribed to?
            </p>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {allServices.map((service, idx) => {
          const isSelected = selected.includes(service.id);
          return (
            <motion.button
              key={service.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * idx, type: "spring", damping: 20, stiffness: 300 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onToggle(service.id)}
              className={`relative flex items-center gap-3 px-3 py-3.5 rounded-2xl border transition-all duration-250 ${
                isSelected
                  ? "border-primary/50 bg-primary/8 shadow-sm shadow-primary/10"
                  : "bg-secondary/40 hover:bg-secondary/60"
              }`}
              style={{ borderColor: isSelected ? undefined : "var(--border-subtle)" }}
            >
              <img
                src={service.logo}
                alt={service.name}
                className={`w-10 h-10 rounded-xl object-cover shrink-0 transition-transform duration-200 ${
                  isSelected ? "scale-110" : ""
                }`}
              />
              <div className="flex flex-col items-start flex-1 min-w-0">
                <span className="text-foreground text-[13px] truncate w-full text-left" style={{ fontWeight: 600 }}>
                  {service.name}
                </span>
                <span className="text-muted-foreground text-[10px] truncate w-full text-left">
                  {service.description}
                </span>
              </div>
              <div
                className={`absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                  isSelected ? "border-primary bg-primary scale-100" : "bg-transparent scale-90"
                }`}
                style={{ borderColor: isSelected ? undefined : "var(--check-border)" }}
              >
                <AnimatePresence>
                  {isSelected && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                      transition={{ type: "spring", damping: 15, stiffness: 400 }}>
                      <Check className="w-3 h-3 text-white" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="mt-4 text-center">
        <button onClick={onSelectAll} className="text-primary text-[13px] hover:underline transition-colors">
          {selected.length === allServices.length ? "Deselect All" : "Select All"}
        </button>
      </div>
      <div className="h-4" />
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// ── Step 2: Watched Grid ────────────────────────────────
// ═════════════════════════════════════════════════════════
function StepWatchedGrid({
  titles,
  selected,
  onToggle,
  onRefresh,
  round,
  totalRounds,
  loading,
}: {
  titles: WatchedGridTitle[];
  selected: Set<string>;
  onToggle: (tmdbId: number, mediaType: string) => void;
  onRefresh: () => void;
  round: number;
  totalRounds: number;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col h-full px-6 overflow-y-auto no-scrollbar">
      <div className="pt-4 pb-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-primary text-[12px] mb-1" style={{ fontWeight: 600 }}>
            Round {round + 1} of {totalRounds}
          </p>
          <h2 className="text-foreground text-[20px] mb-1" style={{ fontWeight: 700 }}>
            What have you watched?
          </h2>
          <p className="text-muted-foreground text-[13px]">
            Tap titles you've watched and enjoyed
          </p>
        </motion.div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-xl bg-secondary animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {titles.map((title, idx) => {
            const key = `${title.mediaType}-${title.tmdbId}`;
            const isSelected = selected.has(key);
            return (
              <motion.button
                key={key}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05 * idx }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onToggle(title.tmdbId, title.mediaType)}
                className="relative aspect-[2/3] rounded-xl overflow-hidden group"
              >
                <img
                  src={`https://image.tmdb.org/t/p/w342${title.posterPath}`}
                  alt={title.title}
                  className={`w-full h-full object-cover transition-all duration-200 ${
                    isSelected ? "brightness-75 scale-105" : "group-hover:brightness-90"
                  }`}
                />
                {/* Title overlay at bottom */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
                  <p className="text-white text-[12px] leading-tight" style={{ fontWeight: 600 }}>
                    {title.title}
                  </p>
                  {title.year && (
                    <p className="text-white/60 text-[10px]">{title.year}</p>
                  )}
                </div>
                {/* Selection indicator */}
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg"
                  >
                    <Check className="w-4 h-4 text-white" />
                  </motion.div>
                )}
                {/* Selection border */}
                {isSelected && (
                  <div className="absolute inset-0 rounded-xl border-2 border-primary pointer-events-none" />
                )}
              </motion.button>
            );
          })}
        </div>
      )}

      {/* See different titles */}
      <div className="mt-4 text-center">
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1.5 text-primary text-[13px] hover:underline transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          See different titles
        </button>
      </div>
      <div className="h-4" />
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// ── Step 3: Select Taste Clusters ───────────────────────
// ═════════════════════════════════════════════════════════
function StepClusters({
  selected,
  onToggle,
  onClear,
}: {
  selected: string[];
  onToggle: (clusterId: string) => void;
  onClear: () => void;
}) {
  const atLimit = selected.length >= MAX_CLUSTERS;

  return (
    <div className="flex flex-col h-full px-6 overflow-y-auto no-scrollbar">
      <div className="pt-4 pb-5">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-2"
        >
          <div className="w-10 h-10 rounded-2xl bg-primary/15 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-foreground text-[20px]" style={{ fontWeight: 700 }}>
                What do you love to watch?
              </h2>
            </div>
            <p className="text-muted-foreground text-[13px]">
              Pick at least {MIN_CLUSTERS} genres
            </p>
          </div>
          <AnimatePresence>
            {selected.length > 0 && (
              <motion.span
                key={selected.length}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="bg-primary text-white text-[12px] px-2 py-0.5 rounded-full tabular-nums"
                style={{ fontWeight: 600 }}
              >
                {selected.length} selected
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {TASTE_CLUSTERS.map((cluster, idx) => {
          const isSelected = selected.includes(cluster.id);
          const isDisabled = atLimit && !isSelected;
          return (
            <motion.button
              key={cluster.id}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: isDisabled ? 0.4 : 1, scale: isDisabled ? 0.98 : 1 }}
              transition={{ delay: 0.03 * idx, type: "spring", damping: 20, stiffness: 300 }}
              whileTap={!isDisabled ? { scale: 0.94 } : undefined}
              onClick={() => !isDisabled && onToggle(cluster.id)}
              className={`relative flex items-center gap-4 py-3 rounded-2xl border text-left transition-all duration-250 ${
                isSelected
                  ? "border-primary/50 bg-primary/10"
                  : isDisabled
                    ? "bg-secondary/20 cursor-not-allowed"
                    : "bg-secondary/40 hover:bg-secondary/60"
              }`}
              style={{ paddingLeft: '1rem', paddingRight: '2.5rem', borderColor: isSelected ? undefined : "var(--border-subtle)" }}
            >
              <span className={`text-[22px] shrink-0 transition-transform duration-200 ${isSelected ? "scale-115" : ""}`}>
                {cluster.emoji}
              </span>
              <div className="flex flex-col items-start min-w-0 flex-1">
                <span
                  className={`text-[13px] leading-tight transition-colors duration-200 ${
                    isSelected ? "text-foreground" : "text-muted-foreground"
                  }`}
                  style={{ fontWeight: isSelected ? 600 : 500 }}
                >
                  {cluster.name}
                </span>
              </div>
              <div
                className={`absolute top-2 right-2 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                  isSelected ? "border-primary bg-primary" : "bg-transparent"
                }`}
                style={{ borderColor: isSelected ? undefined : "var(--check-border-2)" }}
              >
                <AnimatePresence>
                  {isSelected && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                      transition={{ type: "spring", damping: 15, stiffness: 400 }}>
                      <Check className="w-2.5 h-2.5 text-white" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {atLimit && (
          <motion.p
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.3 }}
            className="text-primary text-[12px] text-center mt-3"
          >
            Maximum {MAX_CLUSTERS} selected
          </motion.p>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selected.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 text-center">
            <button onClick={onClear} className="text-muted-foreground text-[13px] hover:text-foreground transition-colors">
              Clear selections
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="h-4" />
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// ── Step 4: Taste Summary + Sliders ─────────────────────
// ═════════════════════════════════════════════════════════
function StepTasteSummary({
  selectedClusters,
  sliders,
  onSlidersChange,
}: {
  selectedClusters: string[];
  sliders: SliderState;
  onSlidersChange: (s: SliderState) => void;
}) {
  const clusters = selectedClusters
    .map(id => TASTE_CLUSTERS.find(c => c.id === id))
    .filter(Boolean) as typeof TASTE_CLUSTERS;

  // Build prose summary from cluster adjectives/moods
  const topClusters = clusters.slice(0, 3);
  const summaryText = topClusters.length >= 2
    ? `Your taste leans toward ${topClusters.map(c => c.name).join(', ')}. You enjoy ${topClusters[0].adjective} stories with ${topClusters[1].mood}.`
    : topClusters.length === 1
      ? `Your taste leans toward ${topClusters[0].name}. You enjoy ${topClusters[0].adjective} stories with ${topClusters[0].mood}.`
      : 'Your taste profile is being built from your service selections.';

  const sliderConfig = [
    { key: 'catalogueAge' as const, left: 'New releases', right: 'Best match regardless of age' },
    { key: 'comfortZone' as const, left: 'Stick with what I like', right: 'Surprise me' },
    { key: 'contentMix' as const, left: 'Focus on films', right: 'Focus on TV series' },
    { key: 'variety' as const, left: 'Finish what I start', right: 'Try lots of things' },
  ];

  const resetSliders = () => onSlidersChange({ ...DEFAULT_SLIDERS });

  return (
    <div className="flex flex-col h-full px-6 overflow-y-auto no-scrollbar">
      <div className="pt-4 pb-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="text-foreground text-[20px] mb-2" style={{ fontWeight: 700 }}>
            Almost there! 🎬
          </h2>
          <p className="text-muted-foreground text-[13px] mb-4">
            Here's what we've learned about your recommendations.
          </p>
        </motion.div>

        {/* Taste summary card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mb-5"
        >
          <p className="text-foreground text-[14px] leading-relaxed mb-3">
            {summaryText}
          </p>
          <ol className="space-y-1">
            {clusters.slice(0, 5).map((c, i) => (
              <li key={c.id} className="flex items-center gap-2 text-[13px]">
                <span className="text-primary" style={{ fontWeight: 600 }}>{i + 1}.</span>
                <span className="text-[16px]">{c.emoji}</span>
                <span className="text-foreground" style={{ fontWeight: 500 }}>{c.name}</span>
              </li>
            ))}
          </ol>
        </motion.div>

        {/* Sliders */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="text-foreground text-[15px] mb-3" style={{ fontWeight: 600 }}>
            How should we pick for you?
          </h3>
          <div className="space-y-5">
            {sliderConfig.map(({ key, left, right }) => (
              <div key={key}>
                <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                  <span>{left}</span>
                  <span>{right}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(sliders[key] * 100)}
                  onChange={e => onSlidersChange({ ...sliders, [key]: parseInt(e.target.value, 10) / 100 })}
                  className="w-full h-1.5 rounded-full appearance-none bg-secondary cursor-pointer accent-primary"
                />
                <p className="text-center text-[11px] text-primary mt-0.5" style={{ fontWeight: 500 }}>
                  {sliders[key] === 0.5 || (key === 'comfortZone' && sliders[key] === 0.25) ? 'Balanced' : ''}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 text-center">
            <button onClick={resetSliders} className="text-muted-foreground text-[12px] hover:text-foreground transition-colors">
              Reset to defaults
            </button>
          </div>
        </motion.div>
      </div>
      <div className="h-4" />
    </div>
  );
}
