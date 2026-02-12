import React, { useState, useRef } from "react";
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
} from "lucide-react";
import { toast } from "sonner";

// ── Onboarding Data ─────────────────────────────────────────────────────
import { OnboardingData } from "./OnboardingFlow";
import { useTheme, ThemeMode } from "./ThemeContext";
import { PLATFORMS, getPlatform } from "./platformLogos";

// ── Service definitions ─────────────────────────────────────────────────────
const allServices = PLATFORMS;

const allGenres = [
  "Action", "Adventure", "Animation", "Comedy", "Crime",
  "Documentary", "Drama", "Family", "Fantasy", "History",
  "Horror", "Music", "Mystery", "Romance", "Sci-Fi",
  "Thriller", "War", "Western",
];

interface ProfilePageProps {
  watchlistCount: number;
  watchedCount: number;
  userProfile?: OnboardingData | null;
  onSignOut?: () => void;
  onUpdateServices?: (services: string[]) => Promise<void>;
  onUpdateGenres?: (genres: string[]) => Promise<void>;
  onUpdateProfile?: (name: string, email: string) => Promise<void>;
}

export function ProfilePage({ watchlistCount, watchedCount, userProfile, onSignOut, onUpdateServices, onUpdateGenres, onUpdateProfile }: ProfilePageProps) {
  // ── Profile state ─��───────────────────────────────
  const [name, setName] = useState(userProfile?.name || "Joe");
  const [email, setEmail] = useState(userProfile?.email || "joegreenwas@gmail.com");
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editName, setEditName] = useState(userProfile?.name || "Joe");
  const [editEmail, setEditEmail] = useState(userProfile?.email || "joegreenwas@gmail.com");

  // ── Services state ─────────────────────────────────
  const [connectedServices, setConnectedServices] = useState<string[]>(
    userProfile?.services || ["netflix", "prime", "apple", "paramount", "now"]
  );
  const [isEditingServices, setIsEditingServices] = useState(false);

  // ── Genres state ─────────────────────────────────
  const [selectedGenres, setSelectedGenres] = useState<string[]>(
    userProfile?.genres || ["Crime", "Fantasy", "Thriller", "Sci-Fi", "History", "Documentary", "Action", "Adventure"]
  );
  const [isEditingGenres, setIsEditingGenres] = useState(false);

  // ── Theme state ─────────────────────────────────
  const { theme, setTheme } = useTheme();

  // ── Track initial state for dirty detection ─────────────────
  const initialServices = useRef(connectedServices.slice().sort().join(','));
  const initialGenres = useRef(selectedGenres.slice().sort().join(','));

  // ── Dirty check (includes services + genres) ─────────────────
  const servicesChanged = connectedServices.slice().sort().join(',') !== initialServices.current;
  const genresChanged = selectedGenres.slice().sort().join(',') !== initialGenres.current;
  const detailsChanged = name !== editName || email !== editEmail || isEditingDetails;
  const hasUnsavedChanges = detailsChanged || servicesChanged || genresChanged;

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

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
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
      if (genresChanged) {
        await onUpdateGenres?.(selectedGenres);
      }
      // Reset initial refs to current values after save
      initialServices.current = connectedServices.slice().sort().join(',');
      initialGenres.current = selectedGenres.slice().sort().join(',');
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

      {/* ── Homepage Genres ────────────────────────────── */}
      <SectionHeader
        title="Homepage Genres"
        action={
          <button
            onClick={() => setIsEditingGenres(!isEditingGenres)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              isEditingGenres
                ? "bg-primary text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {isEditingGenres ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          </button>
        }
      />

      <div className="flex flex-wrap gap-1.5 mb-6">
        {(isEditingGenres ? allGenres : selectedGenres).map((genre) => {
          const isSelected = selectedGenres.includes(genre);
          return (
            <motion.button
              key={genre}
              layout
              onClick={() => isEditingGenres && toggleGenre(genre)}
              disabled={!isEditingGenres}
              className={`px-3 py-1.5 rounded-full text-[12px] transition-all duration-200 border ${
                isSelected
                  ? isEditingGenres
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "bg-secondary text-foreground"
                  : "bg-secondary/40 text-muted-foreground/50"
              } ${isEditingGenres ? "cursor-pointer" : "cursor-default"}`}
              style={{ borderColor: isSelected && isEditingGenres ? undefined : "var(--border-subtle)" }}
            >
              {genre}
            </motion.button>
          );
        })}
      </div>

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