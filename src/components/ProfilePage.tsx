import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Pencil,
  Sun,
  Moon,
  Monitor,
  LogOut,
  Eye,
  Bookmark,
  Check,
  X,
  Film,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

// ── Onboarding Data ─────────────────────────────────────────────────────
import { OnboardingData } from "./OnboardingFlow";
import { useTheme, ThemeMode } from "./ThemeContext";
import { PLATFORMS, getPlatform } from "./platformLogos";
import { SpendDashboard } from "./SpendDashboard";
import { TasteQuiz } from "./quiz/TasteQuiz";
import { getTasteProfile, saveQuizResults, retakeQuiz } from "@/lib/storage/tasteProfile";
import { invalidateRecommendationCache } from "@/lib/storage/recommendations";
import storage from "@/lib/storage";
import type { TasteProfile, QuizAnswer } from "@/lib/storage/tasteProfile";
import type { TasteVector } from "@/lib/taste/tasteVector";
import { getGenresFromVector, genreKeyToName } from "@/lib/taste/tasteVector";
import { TASTE_CLUSTERS } from "@/lib/taste/tasteClusters";

// ── Service definitions ─────────────────────────────────────────────────────
const allServices = PLATFORMS;


interface ProfilePageProps {
  watchlistCount: number;
  watchedCount: number;
  userProfile?: OnboardingData | null;
  onSignOut?: () => void;
  onUpdateServices?: (services: string[]) => Promise<void>;
  onUpdateClusters?: (clusters: string[]) => Promise<void>;
  onUpdateProfile?: (name: string, email: string) => Promise<void>;
}

export function ProfilePage({ watchlistCount, watchedCount, userProfile, onSignOut, onUpdateServices, onUpdateClusters, onUpdateProfile }: ProfilePageProps) {
  // ── Profile state ─��───────────────────────────────
  const [name, setName] = useState(userProfile?.name || "Joe");
  const [email, setEmail] = useState(userProfile?.email || "joegreenwas@gmail.com");
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editName, setEditName] = useState(userProfile?.name || "Joe");
  const [editEmail, setEditEmail] = useState(userProfile?.email || "joegreenwas@gmail.com");

  // ── Services state ─────────────────────────────────
  const [connectedServices, setConnectedServices] = useState<string[]>(
    userProfile?.services || PLATFORMS.map((p) => p.id)
  );
  const [isEditingServices, setIsEditingServices] = useState(false);

  // ── Clusters state ─────────────────────────────────
  const [selectedClusters, setSelectedClusters] = useState<string[]>(
    userProfile?.clusters || []
  );

  // ── Taste profile / quiz state ──────────────────
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);

  useEffect(() => {
    getTasteProfile().then(setTasteProfile);
  }, []);

  const topTastePills = selectedClusters.length > 0
    ? selectedClusters
        .map(id => TASTE_CLUSTERS.find(c => c.id === id))
        .filter((c): c is NonNullable<typeof c> => c != null)
        .map(c => `${c.emoji} ${c.name}`)
    : tasteProfile?.quizCompleted && tasteProfile.vector
      ? getGenresFromVector(tasteProfile.vector).slice(0, 5).map(genreKeyToName)
      : [];

  const handleQuizComplete = useCallback(async (answers: QuizAnswer[], vector: TasteVector) => {
    try {
      if (tasteProfile?.quizCompleted) {
        // Retake: preserve interaction history
        const updated = await retakeQuiz(answers, vector);
        if (updated) setTasteProfile(updated);
      } else {
        const updated = await saveQuizResults(answers, vector);
        setTasteProfile(updated);
      }
      // Invalidate caches so recommendations use new vector
      await Promise.all([
        invalidateRecommendationCache(),
        storage.removeItem('@app_hidden_gems'),
      ]).catch(() => {});
      toast.success("Taste profile updated", { icon: "✨" });
    } catch {
      toast.error("Failed to save quiz results");
    }
    setShowQuiz(false);
  }, [tasteProfile]);

  const handleQuizSkip = useCallback(() => {
    setShowQuiz(false);
  }, []);

  // ── Theme state ─────────────────────────────────
  const { theme, setTheme } = useTheme();

  // ── Track initial state for dirty detection ─────────────────
  const initialServices = useRef(connectedServices.slice().sort().join(','));

  // ── Dirty check (services only — genres no longer manually editable) ─────────────────
  const servicesChanged = connectedServices.slice().sort().join(',') !== initialServices.current;
  const detailsChanged = name !== editName || email !== editEmail || isEditingDetails;
  const hasUnsavedChanges = detailsChanged || servicesChanged;

  // ── Handlers ─────────────────────────────────
  const handleSaveDetails = async () => {
    setName(editName);
    setEmail(editEmail);
    setIsEditingDetails(false);
    await onUpdateProfile?.(editName, editEmail);
    toast.success("Profile updated", { icon: "👤", description: "Your details have been saved." });
  };

  const handleCancelDetails = () => {
    setEditName(name);
    setEditEmail(email);
    setIsEditingDetails(false);
  };

  const toggleService = (id: string) => {
    setConnectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleSaveChanges = async () => {
    try {
      if (detailsChanged && !isEditingDetails) {
        await onUpdateProfile?.(name, email);
      }
      if (servicesChanged) {
        await onUpdateServices?.(connectedServices);
      }
      initialServices.current = connectedServices.slice().sort().join(',');
      toast.success("Settings saved", { icon: "✅", description: "Your preferences have been updated." });
    } catch {
      toast.error("Failed to save", { description: "Please try again." });
    }
  };

  const handleSignOut = () => {
    onSignOut?.();
  };

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Full-screen quiz overlay
  if (showQuiz) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <TasteQuiz
          onComplete={handleQuizComplete}
          onSkip={handleQuizSkip}
          showSkip={false}
          userClusters={selectedClusters}
          showClusterSelect={true}
          onClustersUpdated={async (clusters) => {
            setSelectedClusters(clusters);
            await onUpdateClusters?.(clusters);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full px-4 pb-8">
      {/* Safe area spacer */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl -mx-4 px-4" style={{ backgroundColor: "var(--background)", paddingTop: "env(safe-area-inset-top, 0px)" }} />

      {/* ── Avatar & Info ─────────────────────────────────── */}
      <div className="flex flex-col items-center mb-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 18, stiffness: 200 }}
          className="relative mb-3"
        >
          <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center ring-2 ring-primary/30 ring-offset-2 ring-offset-background">
            <span className="text-white text-[28px]" style={{ fontWeight: 700 }}>
              {initials}
            </span>
          </div>
        </motion.div>
        <h2 className="text-foreground text-[18px] mb-0.5" style={{ fontWeight: 600 }}>
          {name}
        </h2>
        <p className="text-primary text-[13px] mb-0.5">{email}</p>
        <p className="text-muted-foreground text-[12px]">Member since January 2026</p>

        {/* Quick stats */}
        <div className="flex items-center gap-4 mt-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary">
            <Bookmark className="w-3.5 h-3.5 text-primary" />
            <span className="text-foreground text-[12px]" style={{ fontWeight: 600 }}>
              {watchlistCount}
            </span>
            <span className="text-muted-foreground text-[11px]">Watchlist</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary">
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-foreground text-[12px]" style={{ fontWeight: 600 }}>
              {watchedCount}
            </span>
            <span className="text-muted-foreground text-[11px]">Watched</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary">
            <Film className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-foreground text-[12px]" style={{ fontWeight: 600 }}>
              {connectedServices.length}
            </span>
            <span className="text-muted-foreground text-[11px]">Services</span>
          </div>
        </div>
      </div>

      {/* ── Personal Details ─────────────────────────────── */}
      <SectionHeader title="Personal Details" />
      <div className="space-y-2.5 mb-3">
        <InputField
          label="Name"
          value={isEditingDetails ? editName : name}
          onChange={(v) => setEditName(v)}
          disabled={!isEditingDetails}
        />
        <InputField
          label="Email"
          value={isEditingDetails ? editEmail : email}
          onChange={(v) => setEditEmail(v)}
          disabled={!isEditingDetails}
          type="email"
        />
      </div>

      <AnimatePresence mode="wait">
        {isEditingDetails ? (
          <motion.div
            key="save-cancel"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex gap-2 mb-6"
          >
            <button
              onClick={handleSaveDetails}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-[13px] transition-colors hover:bg-primary/90"
              style={{ fontWeight: 600 }}
            >
              <Check className="w-4 h-4" />
              Save Details
            </button>
            <button
              onClick={handleCancelDetails}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-muted-foreground text-[13px] transition-colors hover:bg-secondary/80"
              style={{ fontWeight: 600 }}
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="edit"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            onClick={() => setIsEditingDetails(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-primary/40 text-primary text-[13px] mb-6 transition-colors hover:bg-primary/10"
            style={{ fontWeight: 600 }}
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit Details
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Streaming Services ────────────────────────────── */}
      <SectionHeader
        title="Streaming Services"
        action={
          <button
            onClick={() => setIsEditingServices(!isEditingServices)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              isEditingServices
                ? "bg-primary text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {isEditingServices ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          </button>
        }
      />

      <AnimatePresence mode="wait">
        {isEditingServices ? (
          <motion.div
            key="services-grid"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", damping: 22, stiffness: 300 }}
            className="overflow-hidden mb-6"
          >
            <div className="grid grid-cols-2 gap-2">
              {allServices.map((service) => {
                const isConnected = connectedServices.includes(service.id);
                return (
                  <button
                    key={service.id}
                    onClick={() => toggleService(service.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all duration-200 ${
                      isConnected
                        ? "border-primary/40 bg-primary/8"
                        : "bg-secondary/50 opacity-50"
                    }`}
                    style={{ borderColor: isConnected ? undefined : "var(--border-subtle)" }}
                  >
                    <img src={service.logo} alt={service.name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                    <div className="flex flex-col items-start flex-1 min-w-0">
                      <span className="text-foreground text-[12px] truncate w-full text-left" style={{ fontWeight: 600 }}>
                        {service.name}
                      </span>
                      <span className={`text-[10px] ${isConnected ? "text-emerald-400" : "text-muted-foreground"}`}>
                        {isConnected ? "Connected" : "Not connected"}
                      </span>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 shrink-0 ${
                        isConnected
                          ? "border-primary bg-primary"
                          : "bg-transparent"
                      }`}
                      style={{ borderColor: isConnected ? undefined : "var(--check-border)" }}
                    >
                      {isConnected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="services-row"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar"
          >
            {connectedServices.map((id) => {
              const service = allServices.find((s) => s.id === id);
              if (!service) return null;
              return (
                <motion.img
                  key={id}
                  layout
                  src={service.logo}
                  alt={service.name}
                  className="w-10 h-10 rounded-xl object-cover shrink-0"
                  style={{ boxShadow: "0 0 0 1px var(--border-subtle)" }}
                />
              );
            })}
            {connectedServices.length === 0 && (
              <span className="text-muted-foreground text-[12px]">No services connected</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Monthly Spend Dashboard ────────────────────────────── */}
      <SpendDashboard connectedServices={connectedServices} />

      {/* ── Taste Profile ────────────────────────────── */}
      <SectionHeader title="Taste Profile" />

      {tasteProfile?.quizCompleted ? (
        <div className="mb-6">
          {/* Top genres */}
          {topTastePills.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-muted-foreground text-[12px] whitespace-nowrap">Top tastes:</span>
              {topTastePills.map((genre) => (
                <span
                  key={genre}
                  className="px-2.5 py-1 rounded-full bg-primary/15 text-primary text-[11px] whitespace-nowrap"
                  style={{ fontWeight: 600 }}
                >
                  {genre}
                </span>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowQuiz(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border bg-secondary/40 text-muted-foreground text-[13px] transition-colors hover:bg-secondary/60 hover:text-foreground"
            style={{ fontWeight: 600, borderColor: "var(--border-subtle)" }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retake Taste Quiz
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowQuiz(true)}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-primary/30 bg-primary/5 mb-6 transition-colors hover:bg-primary/10"
          style={{ borderColor: undefined }}
        >
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-foreground text-[14px]" style={{ fontWeight: 600 }}>
              Take Taste Quiz
            </p>
            <p className="text-muted-foreground text-[12px]">
              Answer 10 questions to personalise your recommendations
            </p>
          </div>
        </button>
      )}

      {/* ── Appearance ────────────────────────────── */}
      <SectionHeader title="Appearance" />

      <div className="space-y-2 mb-6">
        {/* Theme toggle row */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/60 border" style={{ borderColor: "var(--border-subtle-2)" }}>
          <Moon className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1">
            <p className="text-foreground text-[13px]" style={{ fontWeight: 600 }}>
              Theme
            </p>
            <p className="text-muted-foreground text-[11px] capitalize">{theme}</p>
          </div>
          {/* Mini toggle */}
          <div className="flex items-center gap-1 bg-background rounded-lg p-0.5">
            {(["dark", "light"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setTheme(mode)}
                className={`p-1.5 rounded-md transition-all duration-200 ${
                  theme === mode
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "dark" ? (
                  <Moon className="w-3.5 h-3.5" />
                ) : (
                  <Sun className="w-3.5 h-3.5" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* System preference */}
        <button
          onClick={() => setTheme("system")}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[13px] transition-colors ${
            theme === "system"
              ? "border-primary/40 bg-primary/10 text-primary"
              : "bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          }`}
          style={{ fontWeight: 600, borderColor: theme === "system" ? undefined : "var(--border-subtle)" }}
        >
          <Monitor className="w-4 h-4" />
          Use System Preference
        </button>
      </div>

      {/* ── Save Changes ────────────────────────────── */}
      <button
        onClick={handleSaveChanges}
        disabled={!hasUnsavedChanges}
        className={`w-full py-3 rounded-xl text-[13px] mb-3 transition-colors border ${
          hasUnsavedChanges
            ? "bg-primary text-white border-primary/40 hover:bg-primary/90"
            : "bg-secondary/60 text-muted-foreground border-transparent hover:bg-secondary/80"
        }`}
        style={{ fontWeight: 600, borderColor: hasUnsavedChanges ? undefined : "var(--border-subtle-2)" }}
      >
        {hasUnsavedChanges ? "Save Changes" : "No Changes"}
      </button>

      {/* ── Sign Out ────────────────────────────── */}
      <button
        onClick={handleSignOut}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 text-red-400 text-[13px] border border-red-500/20 transition-colors hover:bg-red-500/20"
        style={{ fontWeight: 600 }}
      >
        <LogOut className="w-4 h-4" />
        Sign Out
      </button>
    </div>
  );
}

// ── Section Header sub-component ───────────────────────────
function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <h3
        className="text-muted-foreground text-[11px] tracking-widest uppercase"
        style={{ fontWeight: 600 }}
      >
        {title}
      </h3>
      {action}
    </div>
  );
}

// ── Input Field sub-component ──────────────────────────────
function InputField({
  label,
  value,
  onChange,
  disabled,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  type?: string;
}) {
  return (
    <div
      className={`relative rounded-xl border transition-all duration-200 ${
        disabled
          ? "bg-secondary/40"
          : "border-primary/40 bg-secondary/60 ring-1 ring-primary/20"
      }`}
      style={{ borderColor: disabled ? "var(--border-subtle)" : undefined }}
    >
      <label className="absolute top-2 left-3 text-muted-foreground text-[10px]">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full bg-transparent px-3 pt-6 pb-2 text-foreground text-[14px] outline-none disabled:text-foreground/70"
      />
    </div>
  );
}