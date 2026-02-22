import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  Tv,
} from "lucide-react";
import { PLATFORMS, type PlatformDef } from "./platformLogos";
import { TasteQuiz } from "./quiz/TasteQuiz";
import type { TasteVector } from "@/lib/taste/tasteVector";
import type { QuizAnswer } from "@/lib/storage/tasteProfile";
import { TASTE_CLUSTERS, MIN_CLUSTERS, MAX_CLUSTERS, type TasteCluster } from "@/lib/taste/tasteClusters";
import { logOnboardingEvent } from "@/lib/analytics/logger";
import { ONBOARDING_EVENTS } from "@/lib/analytics/events";

// ── Service definitions ──────────────────────────────────
export type { PlatformDef as StreamingServiceDef };

export const allServices = PLATFORMS;

// Re-export cluster constants for consumers
export { TASTE_CLUSTERS, MIN_CLUSTERS, MAX_CLUSTERS };

// ── Types ──────────────────────────────────
export interface OnboardingData {
  name: string;
  email: string;
  services: string[];
  clusters: string[];
  quizAnswers?: QuizAnswer[];
  tasteVector?: TasteVector;
  onboardingStartTime?: number;
}

interface OnboardingFlowProps {
  onComplete: (data: OnboardingData) => void;
}

const TOTAL_STEPS = 3; // Services, Taste Clusters, Quiz

// ── Slide direction logic ──────────────────
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0,
  }),
};

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const onboardingStartRef = useRef(Date.now());

  useEffect(() => {
    void logOnboardingEvent(ONBOARDING_EVENTS.ONBOARDING_STARTED, {});
  }, []);

  const canContinue = [
    selectedServices.length > 0,
    selectedClusters.length >= MIN_CLUSTERS,
  ];

  const goNext = () => {
    if (step === 0) {
      void logOnboardingEvent(ONBOARDING_EVENTS.SERVICES_COMPLETED, {
        service_count: selectedServices.length,
        services: selectedServices,
      });
    }
    if (step === 1) {
      void logOnboardingEvent(ONBOARDING_EVENTS.CLUSTERS_COMPLETED, {
        cluster_count: selectedClusters.length,
        clusters: selectedClusters,
      });
    }
    if (step < 2) {
      setDirection(1);
      setStep((s) => s + 1);
      return;
    }
  };

  const goBack = () => {
    setDirection(-1);
    setStep((s) => s - 1);
  };

  // Quiz completion: includes quiz answers + vector
  // Name/email populated by App.tsx from auth context
  const handleQuizComplete = (quizAnswers: QuizAnswer[], tasteVector: TasteVector) => {
    onComplete({
      name: '', email: '',
      services: selectedServices, clusters: selectedClusters,
      quizAnswers, tasteVector,
      onboardingStartTime: onboardingStartRef.current,
    });
  };

  // Quiz skip: complete onboarding without quiz data
  const handleQuizSkip = () => {
    void logOnboardingEvent(ONBOARDING_EVENTS.QUIZ_SKIPPED, { questions_answered: 0 });
    onComplete({
      name: '', email: '',
      services: selectedServices, clusters: selectedClusters,
      onboardingStartTime: onboardingStartRef.current,
    });
  };

  const toggleService = (id: string) => {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleCluster = (clusterId: string) => {
    setSelectedClusters((prev) => {
      if (prev.includes(clusterId)) return prev.filter((c) => c !== clusterId);
      if (prev.length >= MAX_CLUSTERS) return prev;
      return [...prev, clusterId];
    });
  };

  const selectAllServices = () => {
    if (selectedServices.length === allServices.length) {
      setSelectedServices([]);
    } else {
      setSelectedServices(allServices.map((s) => s.id));
    }
  };

  const clearClusters = () => {
    setSelectedClusters([]);
  };

  // Step 2 (Quiz) takes over the full viewport — no chrome
  if (step === 2) {
    return (
      <div className="size-full bg-background text-foreground">
        <TasteQuiz
          onComplete={handleQuizComplete}
          onSkip={handleQuizSkip}
          showSkip={true}
          userClusters={selectedClusters}
        />
      </div>
    );
  }

  return (
    <div className="size-full bg-background text-foreground flex justify-center overflow-hidden">
      <div className="w-full max-w-md h-full flex flex-col relative">
        {/* ── Progress bar ────────────────────── */}
        <div className="px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-2 flex items-center gap-2">
          {step > 0 && (
            <motion.button
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={goBack}
              className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors mr-1"
            >
              <ArrowLeft className="w-4 h-4" />
            </motion.button>
          )}
          <div className="flex-1 flex items-center gap-2">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: step >= i ? "100%" : "0%" }}
                  transition={{ duration: 0.5, ease: "easeInOut", delay: step >= i ? i * 0.1 : 0 }}
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
              key={step}
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
                <StepClusters
                  selected={selectedClusters}
                  onToggle={toggleCluster}
                  onClear={clearClusters}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Bottom CTA ───────────────────── */}
        <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
          {/* Helper text */}
          {step === 0 && selectedServices.length === 0 && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              Select at least one service to continue
            </p>
          )}
          {step === 1 && selectedClusters.length < MIN_CLUSTERS && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              Pick at least {MIN_CLUSTERS} that match your vibe
            </p>
          )}
          {step === 0 && selectedServices.length > 0 && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              {selectedServices.length} service{selectedServices.length !== 1 ? "s" : ""} selected
            </p>
          )}
          {step === 1 && selectedClusters.length >= MIN_CLUSTERS && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              {selectedClusters.length} of {MAX_CLUSTERS} selected
            </p>
          )}

          <motion.button
            onClick={goNext}
            disabled={!canContinue[step]}
            whileTap={canContinue[step] ? { scale: 0.97 } : undefined}
            className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[15px] transition-all duration-300 ${
              canContinue[step]
                ? "bg-primary text-white shadow-lg shadow-primary/25"
                : "bg-secondary text-muted-foreground cursor-not-allowed"
            }`}
            style={{ fontWeight: 600 }}
          >
            Continue
            <ArrowRight className="w-4.5 h-4.5" />
          </motion.button>

          {step > 0 && (
            <button
              onClick={goNext}
              disabled={false}
              className="w-full mt-2 py-2 text-muted-foreground text-[13px] hover:text-foreground transition-colors"
              style={{ fontWeight: 500, display: canContinue[step] ? "none" : "block" }}
            >
              Skip for now
            </button>
          )}
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
      {/* Header */}
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
              Your Services
            </h2>
            <p className="text-muted-foreground text-[13px]">
              Which platforms do you subscribe to?
            </p>
          </div>
        </motion.div>
      </div>

      {/* Service grid */}
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
              {/* Service icon */}
              <img
                src={service.logo}
                alt={service.name}
                className={`w-10 h-10 rounded-xl object-cover shrink-0 transition-transform duration-200 ${
                  isSelected ? "scale-110" : ""
                }`}
              />

              {/* Info */}
              <div className="flex flex-col items-start flex-1 min-w-0">
                <span className="text-foreground text-[13px] truncate w-full text-left" style={{ fontWeight: 600 }}>
                  {service.name}
                </span>
                <span className="text-muted-foreground text-[10px] truncate w-full text-left">
                  {service.description}
                </span>
              </div>

              {/* Checkbox */}
              <div
                className={`absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                  isSelected
                    ? "border-primary bg-primary scale-100"
                    : "bg-transparent scale-90"
                }`}
                style={{ borderColor: isSelected ? undefined : "var(--check-border)" }}
              >
                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ type: "spring", damping: 15, stiffness: 400 }}
                    >
                      <Check className="w-3 h-3 text-white" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Select all button */}
      <div className="mt-4 text-center">
        <button
          onClick={onSelectAll}
          className="text-primary text-[13px] hover:underline transition-colors"
        >
          {selected.length === allServices.length ? "Deselect All" : "Select All"}
        </button>
      </div>

      {/* Bottom spacer */}
      <div className="h-4" />
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// ── Step 2: Select Taste Clusters ───────────────────────
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
      {/* Header */}
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
                Your Taste
              </h2>
              {/* Counter badge */}
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
                    {selected.length}/{MAX_CLUSTERS}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <p className="text-muted-foreground text-[13px]">
              Pick 3–5 that match your vibe
            </p>
          </div>
        </motion.div>
      </div>

      {/* Cluster grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {TASTE_CLUSTERS.map((cluster, idx) => {
          const isSelected = selected.includes(cluster.id);
          const isDisabled = atLimit && !isSelected;
          return (
            <motion.button
              key={cluster.id}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{
                opacity: isDisabled ? 0.4 : 1,
                scale: isDisabled ? 0.98 : 1,
              }}
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

              {/* Check mark */}
              <div
                className={`absolute top-2 right-2 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                  isSelected
                    ? "border-primary bg-primary"
                    : "bg-transparent"
                }`}
                style={{ borderColor: isSelected ? undefined : "var(--check-border-2)" }}
              >
                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ type: "spring", damping: 15, stiffness: 400 }}
                    >
                      <Check className="w-2.5 h-2.5 text-white" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Max selection message */}
      <AnimatePresence>
        {atLimit && (
          <motion.p
            initial={{ opacity: 0, y: -10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -10, height: 0 }}
            transition={{ duration: 0.3, ease: [0.0, 0.0, 0.2, 1] }}
            className="text-primary text-[12px] text-center mt-3"
          >
            Maximum {MAX_CLUSTERS} selected — deselect one to choose another
          </motion.p>
        )}
      </AnimatePresence>

      {/* Clear selections button */}
      <AnimatePresence>
        {selected.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3 text-center"
          >
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onClear}
              className="text-muted-foreground text-[13px] hover:text-foreground transition-colors"
            >
              Clear selections
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom spacer */}
      <div className="h-4" />
    </div>
  );
}
