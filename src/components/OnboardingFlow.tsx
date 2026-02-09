import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  Tv,
  Mail,
  User,
} from "lucide-react";
import videxLogo from "@/assets/videx-logos/videx-icon-192.png";
import { PLATFORMS, type PlatformDef } from "./platformLogos";

// ── Service definitions ──────────────────────────────────
export type { PlatformDef as StreamingServiceDef };

export const allServices = PLATFORMS;

export const allGenres = [
  "Action", "Adventure", "Animation", "Comedy", "Crime",
  "Documentary", "Drama", "Family", "Fantasy", "History",
  "Horror", "Music", "Mystery", "Romance", "Sci-Fi",
  "Thriller", "War", "Western",
];

const genreIcons: Record<string, string> = {
  Action: "💥", Adventure: "🗺️", Animation: "✨", Comedy: "😂",
  Crime: "🔍", Documentary: "🎬", Drama: "🎭", Family: "👨‍👩‍👧‍👦",
  Fantasy: "🐉", History: "📜", Horror: "👻", Music: "🎵",
  Mystery: "🕵️", Romance: "❤️", "Sci-Fi": "🚀", Thriller: "😱",
  War: "⚔️", Western: "🤠",
};

// ── Types ──────────────────────────────────
export interface OnboardingData {
  name: string;
  email: string;
  services: string[];
  genres: string[];
}

interface OnboardingFlowProps {
  onComplete: (data: OnboardingData) => void;
}

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
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  const canContinue = [
    name.trim().length > 0 && email.trim().length > 0,
    selectedServices.length > 0,
    selectedGenres.length > 0,
  ];

  const goNext = () => {
    if (step === 2) {
      onComplete({ name: name.trim(), email: email.trim(), services: selectedServices, genres: selectedGenres });
      return;
    }
    setDirection(1);
    setStep((s) => s + 1);
  };

  const goBack = () => {
    setDirection(-1);
    setStep((s) => s - 1);
  };

  const toggleService = (id: string) => {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const selectAllServices = () => {
    if (selectedServices.length === allServices.length) {
      setSelectedServices([]);
    } else {
      setSelectedServices(allServices.map((s) => s.id));
    }
  };

  const selectAllGenres = () => {
    if (selectedGenres.length === allGenres.length) {
      setSelectedGenres([]);
    } else {
      setSelectedGenres([...allGenres]);
    }
  };

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
            {[0, 1, 2].map((i) => (
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
            {step + 1}/3
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
                <StepWelcome
                  name={name}
                  email={email}
                  onNameChange={setName}
                  onEmailChange={setEmail}
                />
              )}
              {step === 1 && (
                <StepServices
                  selected={selectedServices}
                  onToggle={toggleService}
                  onSelectAll={selectAllServices}
                />
              )}
              {step === 2 && (
                <StepGenres
                  selected={selectedGenres}
                  onToggle={toggleGenre}
                  onSelectAll={selectAllGenres}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Bottom CTA ───────────────────── */}
        <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
          {/* Helper text */}
          {step === 1 && selectedServices.length === 0 && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              Select at least one service to continue
            </p>
          )}
          {step === 2 && selectedGenres.length === 0 && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              Pick at least one genre you enjoy
            </p>
          )}
          {step === 1 && selectedServices.length > 0 && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              {selectedServices.length} service{selectedServices.length !== 1 ? "s" : ""} selected
            </p>
          )}
          {step === 2 && selectedGenres.length > 0 && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              {selectedGenres.length} genre{selectedGenres.length !== 1 ? "s" : ""} selected
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
            {step === 2 ? (
              <>
                <Sparkles className="w-4.5 h-4.5" />
                Get Started
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="w-4.5 h-4.5" />
              </>
            )}
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
// ── Step 1: Welcome & Details ───────────────────────────
// ═════════════════════════════════════════════════════════
function StepWelcome({
  name,
  email,
  onNameChange,
  onEmailChange,
}: {
  name: string;
  email: string;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col h-full px-6 overflow-y-auto no-scrollbar">
      {/* Hero area */}
      <div className="flex flex-col items-center pt-6 pb-8">
        <motion.img
          src={videxLogo}
          alt="Videx"
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.15 }}
          className="w-20 h-20 rounded-3xl mb-5 shadow-xl shadow-primary/30"
        />

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="text-foreground text-[26px] text-center mb-2"
          style={{ fontWeight: 700 }}
        >
          Welcome to Videx
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="text-muted-foreground text-[14px] text-center max-w-[280px]"
        >
          Your personal guide to everything streaming. Let's set up your profile.
        </motion.p>
      </div>

      {/* Form fields */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="space-y-3"
      >
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            <User className="w-4.5 h-4.5" />
          </div>
          <input
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="w-full bg-secondary/60 border rounded-xl pl-11 pr-4 py-3.5 text-foreground text-[14px] placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            style={{ borderColor: "var(--border-subtle)" }}
          />
        </div>

        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Mail className="w-4.5 h-4.5" />
          </div>
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            className="w-full bg-secondary/60 border rounded-xl pl-11 pr-4 py-3.5 text-foreground text-[14px] placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            style={{ borderColor: "var(--border-subtle)" }}
          />
        </div>
      </motion.div>

      {/* Trust notice */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-muted-foreground/50 text-[11px] text-center mt-4 px-4"
      >
        We'll use this to personalize your experience. No spam, ever.
      </motion.p>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// ── Step 2: Select Services ─────────────────────────────
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
// ── Step 3: Select Genres ───────────────────────────────
// ═════════════════════════════════════════════════════════
function StepGenres({
  selected,
  onToggle,
  onSelectAll,
}: {
  selected: string[];
  onToggle: (genre: string) => void;
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
          <div className="w-10 h-10 rounded-2xl bg-primary/15 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-foreground text-[20px]" style={{ fontWeight: 700 }}>
              Your Taste
            </h2>
            <p className="text-muted-foreground text-[13px]">
              Pick genres you enjoy watching
            </p>
          </div>
        </motion.div>
      </div>

      {/* Genre grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {allGenres.map((genre, idx) => {
          const isSelected = selected.includes(genre);
          const emoji = genreIcons[genre] || "🎬";
          return (
            <motion.button
              key={genre}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.03 * idx, type: "spring", damping: 20, stiffness: 300 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => onToggle(genre)}
              className={`relative flex items-center gap-3 px-3.5 py-3 rounded-2xl border transition-all duration-250 ${
                isSelected
                  ? "border-primary/50 bg-primary/10"
                  : "bg-secondary/40 hover:bg-secondary/60"
              }`}
              style={{ borderColor: isSelected ? undefined : "var(--border-subtle)" }}
            >
              <span className={`text-[22px] transition-transform duration-200 ${isSelected ? "scale-115" : ""}`}>
                {emoji}
              </span>
              <span
                className={`text-[13px] transition-colors duration-200 ${
                  isSelected ? "text-foreground" : "text-muted-foreground"
                }`}
                style={{ fontWeight: isSelected ? 600 : 400 }}
              >
                {genre}
              </span>

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

      {/* Select all button */}
      <div className="mt-4 text-center">
        <button
          onClick={onSelectAll}
          className="text-primary text-[13px] hover:underline transition-colors"
        >
          {selected.length === allGenres.length ? "Deselect All" : "Select All"}
        </button>
      </div>

      {/* Bottom spacer */}
      <div className="h-4" />
    </div>
  );
}