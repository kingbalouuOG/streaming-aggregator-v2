import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Check,
  Sun,
  Moon,
  Monitor,
  LogOut,
  ChevronRight,
  User,
  Tv2,
  Wallet,
  Sparkles,
  SlidersHorizontal,
  Palette,
  Shield,
  Bookmark,
  Eye,
  Film,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import { OnboardingData } from "./OnboardingFlow";
import { useTheme } from "./ThemeContext";
import { PLATFORMS } from "./platformLogos";
import { TASTE_CLUSTERS, MIN_CLUSTERS, MAX_CLUSTERS } from "@/lib/taste/tasteClusters";
import { getSliderState, saveSliderState } from "@/lib/taste-v2/tasteProfileV2";
import { DEFAULT_SLIDERS, type SliderState } from "@/lib/taste-v2/types";
import { SpendDashboard } from "./SpendDashboard";

const allServices = PLATFORMS;

// ── Sub-page routing ─────────────────────────────────
type ProfileSubPage =
  | 'landing'
  | 'account'
  | 'services'
  | 'spend'
  | 'taste'
  | 'tune'
  | 'appearance'
  | 'privacy';

interface ProfilePageProps {
  watchlistCount: number;
  watchedCount: number;
  userProfile?: OnboardingData | null;
  onSignOut?: () => void;
  onUpdateServices?: (services: string[]) => Promise<void>;
  onUpdateClusters?: (clusters: string[]) => Promise<void>;
  onUpdateProfile?: (name: string, email: string) => Promise<void>;
  onNavigateHome?: () => void;
  isAuthenticated?: boolean;
  username?: string | null;
  email?: string | null;
  onDeleteAccount?: () => Promise<{ error?: string }>;
}

export function ProfilePage(props: ProfilePageProps) {
  const [subPage, setSubPage] = useState<ProfileSubPage>('landing');

  const goTo = (page: ProfileSubPage) => setSubPage(page);
  const goBack = () => setSubPage('landing');

  return (
    <AnimatePresence mode="wait">
      {subPage === 'landing' && (
        <motion.div key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <ProfileLanding {...props} onNavigate={goTo} />
        </motion.div>
      )}
      {subPage === 'account' && (
        <motion.div key="account" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}>
          <AccountDetailsPage
            name={props.username || props.userProfile?.name || ''}
            email={props.email || props.userProfile?.email || ''}
            onSave={props.onUpdateProfile}
            onBack={goBack}
          />
        </motion.div>
      )}
      {subPage === 'services' && (
        <motion.div key="services" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}>
          <StreamingServicesPage
            initialServices={props.userProfile?.services || PLATFORMS.map(p => p.id)}
            onUpdate={props.onUpdateServices}
            onBack={goBack}
          />
        </motion.div>
      )}
      {subPage === 'taste' && (
        <motion.div key="taste" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}>
          <YourTastePage
            selectedClusters={props.userProfile?.clusters || []}
            onUpdateClusters={props.onUpdateClusters}
            onBack={goBack}
          />
        </motion.div>
      )}
      {subPage === 'tune' && (
        <motion.div key="tune" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}>
          <TuneRecommendationsPage onBack={goBack} />
        </motion.div>
      )}
      {subPage === 'appearance' && (
        <motion.div key="appearance" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}>
          <AppearancePage onBack={goBack} />
        </motion.div>
      )}
      {subPage === 'spend' && (
        <motion.div key="spend" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}>
          <MonthlySpendPage connectedServices={props.userProfile?.services || []} onBack={goBack} />
        </motion.div>
      )}
      {subPage === 'privacy' && (
        <motion.div key="privacy" initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}>
          <PrivacyDataPage onBack={goBack} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ═════════════════════════════════════════════════════════
// ── Profile Landing ─────────────────────────────────────
// ═════════════════════════════════════════════════════════
function ProfileLanding({
  watchlistCount,
  watchedCount,
  userProfile,
  onSignOut,
  username,
  email,
  onNavigate,
}: ProfilePageProps & { onNavigate: (page: ProfileSubPage) => void }) {
  const displayName = username || userProfile?.name || 'User';
  const displayEmail = email || userProfile?.email || '';
  const connectedCount = userProfile?.services?.length || 0;
  const selectedClusters = userProfile?.clusters || [];

  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || 'U';

  // Build taste summary for the action row subtitle
  const topClusterNames = selectedClusters
    .slice(0, 3)
    .map(id => TASTE_CLUSTERS.find(c => c.id === id)?.name)
    .filter(Boolean)
    .join(', ');

  return (
    <div className="flex flex-col min-h-full px-5 pb-8">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl -mx-5 px-5"
        style={{ backgroundColor: "var(--background)", paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))" }}>
        <h1 className="text-foreground text-[18px] pb-2" style={{ fontWeight: 700 }}>Profile</h1>
      </div>

      {/* Avatar & Info */}
      <div className="flex flex-col items-center mb-6 pt-2">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 18, stiffness: 200 }}
          className="relative mb-3"
        >
          <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center ring-2 ring-primary/30 ring-offset-2 ring-offset-background">
            <span className="text-white text-[28px]" style={{ fontWeight: 700 }}>{initials}</span>
          </div>
        </motion.div>
        <h2 className="text-foreground text-[18px] mb-0.5" style={{ fontWeight: 600 }}>{displayName}</h2>
        <p className="text-muted-foreground text-[13px] mb-0.5">{displayEmail}</p>
        <p className="text-muted-foreground text-[11px]">
          Member since {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-3">
          <StatBadge icon={<Bookmark className="w-3.5 h-3.5 text-primary" />} count={watchlistCount} label="Watchlist" />
          <StatBadge icon={<Eye className="w-3.5 h-3.5 text-emerald-400" />} count={watchedCount} label="Watched" />
          <StatBadge icon={<Film className="w-3.5 h-3.5 text-blue-400" />} count={connectedCount} label="Services" />
        </div>
      </div>

      {/* Action Rows */}
      <SectionLabel label="ACCOUNT" />
      <ActionRow icon={<User className="w-4 h-4" style={{ color: '#60a5fa' }} />} iconBgColor="rgba(96, 165, 250, 0.15)" title="Account Details" subtitle={displayEmail} onClick={() => onNavigate('account')} />

      <SectionLabel label="SUBSCRIPTIONS" />
      <ActionRow icon={<Tv2 className="w-4 h-4" style={{ color: '#a78bfa' }} />} iconBgColor="rgba(167, 139, 250, 0.15)" title="Streaming Services" subtitle={`${connectedCount} services connected`} onClick={() => onNavigate('services')} />

      <SectionLabel label="INSIGHTS" />
      <ActionRow icon={<Wallet className="w-4 h-4" style={{ color: '#34d399' }} />} iconBgColor="rgba(52, 211, 153, 0.15)" title="Monthly Spend" subtitle={`£${connectedCount > 0 ? '—' : '0'}/month`} onClick={() => onNavigate('spend')} />

      <SectionLabel label="PERSONALISATION" />
      <ActionRow icon={<Sparkles className="w-4 h-4" style={{ color: '#fb923c' }} />} iconBgColor="rgba(251, 146, 60, 0.15)" title="Your Taste" subtitle={topClusterNames || 'Set up your taste profile'} onClick={() => onNavigate('taste')} />
      <ActionRow icon={<SlidersHorizontal className="w-4 h-4" style={{ color: '#facc15' }} />} iconBgColor="rgba(250, 204, 21, 0.15)" title="Tune Recommendations" subtitle="Balanced across all sliders" onClick={() => onNavigate('tune')} />

      <SectionLabel label="SETTINGS" />
      <ActionRow icon={<Palette className="w-4 h-4" style={{ color: '#818cf8' }} />} iconBgColor="rgba(129, 140, 248, 0.15)" title="Appearance" subtitle="Dark" onClick={() => onNavigate('appearance')} />
      <ActionRow icon={<Shield className="w-4 h-4" style={{ color: '#94a3b8' }} />} iconBgColor="rgba(148, 163, 184, 0.15)" title="Privacy & Data" subtitle="Manage your data" onClick={() => onNavigate('privacy')} />

      {/* Sign Out */}
      <div className="mt-6">
        <button
          onClick={onSignOut}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/10 text-primary text-[13px] border border-primary/20 transition-colors hover:bg-primary/20"
          style={{ fontWeight: 600 }}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>

      {/* Data Sources */}
      <p className="text-muted-foreground/40 text-[11px] text-center mt-6 leading-relaxed">
        Streaming availability data provided by{' '}
        <a href="https://www.movieofthenight.com/about/api" target="_blank" rel="noopener noreferrer" className="underline">
          Streaming Availability API by Movie of the Night
        </a>
        . Content data from{' '}
        <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="underline">
          TMDb
        </a>
        .
      </p>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// ── Account Details Sub-Page ────────────────────────────
// ═════════════════════════════════════════════════════════
function AccountDetailsPage({
  name: initialName,
  email: initialEmail,
  onSave,
  onBack,
}: {
  name: string;
  email: string;
  onSave?: (name: string, email: string) => Promise<void>;
  onBack: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const isDirty = name !== initialName || email !== initialEmail;

  const handleSave = async () => {
    await onSave?.(name, email);
    toast.success("Account details updated");
    onBack();
  };

  return (
    <SubPageShell title="Account Details" onBack={onBack}>
      <div className="space-y-3 mb-6">
        <InputField label="Name" value={name} onChange={setName} />
        <InputField label="Email" value={email} onChange={setEmail} type="email" />
      </div>
      <button
        onClick={handleSave}
        disabled={!isDirty}
        className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-[14px] transition-colors ${
          isDirty
            ? "bg-primary text-white shadow-lg shadow-primary/25"
            : "bg-secondary/60 text-muted-foreground"
        }`}
        style={{ fontWeight: 600 }}
      >
        {isDirty && <Check className="w-4 h-4" />}
        Save Changes
      </button>
    </SubPageShell>
  );
}

// ═════════════════════════════════════════════════════════
// ── Streaming Services Sub-Page ─────────────────────────
// ═════════════════════════════════════════════════════════
function StreamingServicesPage({
  initialServices,
  onUpdate,
  onBack,
}: {
  initialServices: string[];
  onUpdate?: (services: string[]) => Promise<void>;
  onBack: () => void;
}) {
  const [connected, setConnected] = useState<string[]>(initialServices);

  const toggleService = async (id: string) => {
    const updated = connected.includes(id)
      ? connected.filter(s => s !== id)
      : [...connected, id];
    setConnected(updated);
    await onUpdate?.(updated);
  };

  return (
    <SubPageShell title="Streaming Services" onBack={onBack}>
      <p className="text-muted-foreground text-[11px] uppercase tracking-widest mb-3" style={{ fontWeight: 600 }}>
        Choose your services
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {allServices.map((service) => {
          const isConnected = connected.includes(service.id);
          return (
            <button
              key={service.id}
              onClick={() => toggleService(service.id)}
              className={`relative flex items-center gap-2.5 px-3 py-3 rounded-xl border transition-all duration-200 ${
                isConnected
                  ? "border-primary/40 bg-primary/8"
                  : "bg-secondary/40 opacity-60"
              }`}
              style={{ borderColor: isConnected ? undefined : "var(--border-subtle)" }}
            >
              <img src={service.logo} alt={service.name} className="w-10 h-10 rounded-xl object-cover shrink-0" />
              <div className="flex flex-col items-start flex-1 min-w-0">
                <span className="text-foreground text-[12px] truncate w-full text-left" style={{ fontWeight: 600 }}>
                  {service.name}
                </span>
                <span className={`text-[10px] ${isConnected ? "text-primary" : "text-muted-foreground"}`}>
                  {isConnected ? "Connected" : "Not connected"}
                </span>
              </div>
              {isConnected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-muted-foreground text-[12px] text-center mt-4">
        Changes save automatically. Select the streaming services you have access to for accurate recommendations.
      </p>
    </SubPageShell>
  );
}

// ═════════════════════════════════════════════════════════
// ── Appearance Sub-Page ─────────────────────────────────
// ═════════════════════════════════════════════════════════
function AppearancePage({ onBack }: { onBack: () => void }) {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: 'light' as const, label: 'Light', icon: <Sun className="w-5 h-5" /> },
    { value: 'dark' as const, label: 'Dark', icon: <Moon className="w-5 h-5" /> },
    { value: 'system' as const, label: 'System', icon: <Monitor className="w-5 h-5" /> },
  ];

  return (
    <SubPageShell title="Appearance" onBack={onBack}>
      <div className="space-y-2.5">
        {options.map(opt => {
          const isActive = theme === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-all duration-200 ${
                isActive
                  ? "border-primary/50 bg-primary/10"
                  : "bg-secondary/40 hover:bg-secondary/60"
              }`}
              style={{ borderColor: isActive ? undefined : "var(--border-subtle)" }}
            >
              <span className={isActive ? "text-primary" : "text-muted-foreground"}>{opt.icon}</span>
              <span className={`text-[14px] flex-1 text-left ${isActive ? "text-foreground" : "text-muted-foreground"}`}
                style={{ fontWeight: isActive ? 600 : 500 }}>
                {opt.label}
              </span>
              {isActive && (
                <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-muted-foreground text-[12px] mt-4">
        Changes apply immediately. System preference will automatically switch between light and dark based on your device settings.
      </p>
    </SubPageShell>
  );
}

// ═════════════════════════════════════════════════════════
// ── Your Taste Sub-Page ─────────────────────────────────
// ═════════════════════════════════════════════════════════
function YourTastePage({
  selectedClusters: initialClusters,
  onUpdateClusters,
  onBack,
}: {
  selectedClusters: string[];
  onUpdateClusters?: (clusters: string[]) => Promise<void>;
  onBack: () => void;
}) {
  const [showRefine, setShowRefine] = useState(false);
  const [showRetakeConfirm, setShowRetakeConfirm] = useState(false);
  const [clusters, setClusters] = useState(initialClusters);

  const resolvedClusters = clusters
    .map(id => TASTE_CLUSTERS.find(c => c.id === id))
    .filter(Boolean) as typeof TASTE_CLUSTERS;

  // Build prose summary
  const top3 = resolvedClusters.slice(0, 3);
  const summaryText = top3.length >= 2
    ? `You tend to enjoy ${top3[0].adjective} ${top3[0].mood}, ${top3[1].adjective} ${top3[1].mood.split(' and ')[0]}, and ${top3[2]?.mood || top3[1].mood}.`
    : top3.length === 1
      ? `You tend to enjoy ${top3[0].adjective} stories with ${top3[0].mood}.`
      : '';

  const handleSaveRefined = async (newClusters: string[]) => {
    setClusters(newClusters);
    setShowRefine(false);
    await onUpdateClusters?.(newClusters);
    toast.success("Preferences updated");
  };

  if (showRefine) {
    return (
      <RefinePreferencesPage
        initialClusters={clusters}
        onSave={handleSaveRefined}
        onBack={() => setShowRefine(false)}
      />
    );
  }

  return (
    <SubPageShell title="Your Taste" onBack={onBack}>
      <h3 className="text-foreground text-[16px] mb-1" style={{ fontWeight: 700 }}>Your taste profile</h3>
      {summaryText && (
        <p className="text-muted-foreground text-[13px] mb-4 leading-relaxed">{summaryText}</p>
      )}

      {/* Cluster chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {resolvedClusters.map(c => (
          <span key={c.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/15 text-foreground text-[13px]" style={{ fontWeight: 500 }}>
            <span className="text-[16px]">{c.emoji}</span>
            {c.name}
          </span>
        ))}
      </div>

      {/* Actions */}
      <button
        onClick={() => setShowRefine(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white text-[14px] mb-3 transition-colors hover:bg-primary/90"
        style={{ fontWeight: 600 }}
      >
        <Sparkles className="w-4 h-4" />
        Refine preferences
      </button>

      <button
        onClick={() => setShowRetakeConfirm(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-secondary text-muted-foreground text-[14px] border transition-colors hover:bg-secondary/80 hover:text-foreground"
        style={{ fontWeight: 600, borderColor: "var(--border-subtle)" }}
      >
        <RotateCcw className="w-4 h-4" />
        Retake taste profile
      </button>

      {/* Retake confirmation modal */}
      <AnimatePresence>
        {showRetakeConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
            onClick={() => setShowRetakeConfirm(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-card rounded-t-2xl p-6 mb-0"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-foreground text-[18px] mb-2" style={{ fontWeight: 700 }}>
                Retake taste profile?
              </h3>
              <p className="text-muted-foreground text-[14px] mb-5">
                Retaking will reset your current taste profile. Are you sure?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRetakeConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-secondary text-muted-foreground text-[14px] transition-colors hover:bg-secondary/80"
                  style={{ fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowRetakeConfirm(false);
                    // Retake = open refine preferences (Steps 3-5 of onboarding in future)
                    setShowRefine(true);
                  }}
                  className="flex-1 py-3 rounded-xl bg-primary text-white text-[14px] transition-colors hover:bg-primary/90"
                  style={{ fontWeight: 600 }}
                >
                  Retake
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </SubPageShell>
  );
}

// ═════════════════════════════════════════════════════════
// ── Refine Preferences (cluster selection grid) ─────────
// ═════════════════════════════════════════════════════════
function RefinePreferencesPage({
  initialClusters,
  onSave,
  onBack,
}: {
  initialClusters: string[];
  onSave: (clusters: string[]) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState(initialClusters);
  const atLimit = selected.length >= MAX_CLUSTERS;

  const toggle = (id: string) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(c => c !== id);
      if (prev.length >= MAX_CLUSTERS) return prev;
      return [...prev, id];
    });
  };

  return (
    <SubPageShell title="Refine Preferences" onBack={onBack}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-muted-foreground text-[13px]">
          Select the genres that best match your taste
        </p>
        {selected.length > 0 && (
          <span className="bg-primary text-white text-[12px] px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>
            {selected.length} selected
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-4">
        {TASTE_CLUSTERS.map(cluster => {
          const isSelected = selected.includes(cluster.id);
          const isDisabled = atLimit && !isSelected;
          return (
            <button
              key={cluster.id}
              onClick={() => !isDisabled && toggle(cluster.id)}
              className={`relative flex items-center gap-3 py-3 rounded-xl border text-left transition-all duration-200 ${
                isSelected
                  ? "border-primary/50 bg-primary/10"
                  : isDisabled
                    ? "bg-secondary/20 opacity-40 cursor-not-allowed"
                    : "bg-secondary/40 hover:bg-secondary/60"
              }`}
              style={{ paddingLeft: '0.75rem', paddingRight: '2.25rem', borderColor: isSelected ? undefined : "var(--border-subtle)" }}
            >
              <span className="text-[20px] shrink-0">{cluster.emoji}</span>
              <span className={`text-[13px] ${isSelected ? "text-foreground" : "text-muted-foreground"}`}
                style={{ fontWeight: isSelected ? 600 : 500 }}>
                {cluster.name}
              </span>
              {isSelected && (
                <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onSave(selected)}
        disabled={selected.length < MIN_CLUSTERS}
        className={`w-full py-3 rounded-xl text-[14px] transition-colors ${
          selected.length >= MIN_CLUSTERS
            ? "bg-primary text-white hover:bg-primary/90"
            : "bg-secondary text-muted-foreground cursor-not-allowed"
        }`}
        style={{ fontWeight: 600 }}
      >
        Save Preferences
      </button>
    </SubPageShell>
  );
}

// ═════════════════════════════════════════════════════════
// ── Tune Recommendations Sub-Page ───────────────────────
// ═════════════════════════════════════════════════════════
function TuneRecommendationsPage({ onBack }: { onBack: () => void }) {
  const [sliders, setSliders] = useState<SliderState>({ ...DEFAULT_SLIDERS });
  const [loaded, setLoaded] = useState(false);
  const saveTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load slider state from DB on mount
  useEffect(() => {
    getSliderState().then(s => {
      setSliders(s);
      setLoaded(true);
    });
  }, []);

  // Debounced save on slider change
  const updateSlider = useCallback((key: keyof SliderState, value: number) => {
    setSliders(prev => {
      const updated = { ...prev, [key]: value };
      // Debounce save by 500ms
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveSliderState(updated).catch(err =>
          console.error('[TuneRecommendations] save failed:', err)
        );
      }, 500);
      return updated;
    });
  }, []);

  const resetSliders = useCallback(() => {
    setSliders({ ...DEFAULT_SLIDERS });
    saveSliderState({ ...DEFAULT_SLIDERS }).catch(() => {});
    toast.success("Sliders reset to defaults");
  }, []);

  const sliderConfig = [
    { key: 'catalogueAge' as const, left: 'New releases', right: 'Best match regardless of age' },
    { key: 'comfortZone' as const, left: 'Stick with what I like', right: 'Surprise me' },
    { key: 'contentMix' as const, left: 'Focus on films', right: 'Focus on TV series' },
    { key: 'variety' as const, left: 'Finish what I start', right: 'Try lots of things' },
  ];

  // Lowercase the first word only, preserving proper nouns like "TV"
  const softLower = (s: string): string => {
    if (s.length === 0) return s;
    return s[0].toLowerCase() + s.slice(1);
  };

  // Dynamic slider position label
  const getSliderLabel = (key: keyof SliderState, value: number): string => {
    const defaultVal = key === 'comfortZone' ? DEFAULT_SLIDERS.comfortZone : 0.5;
    const cfg = sliderConfig.find(s => s.key === key);
    if (!cfg) return '';
    if (Math.abs(value - defaultVal) < 0.04) return 'Balanced';
    if (value < 0.25) return `Strongly prefer ${softLower(cfg.left)}`;
    if (value < 0.5) return `Slightly prefer ${softLower(cfg.left)}`;
    if (value < 0.75) return `Slightly prefer ${softLower(cfg.right)}`;
    return `Strongly prefer ${softLower(cfg.right)}`;
  };

  return (
    <SubPageShell title="Tune Your Recommendations" onBack={onBack}>
      <p className="text-muted-foreground text-[13px] mb-8">
        Adjust how Videx serves your recommendations. Changes take effect immediately.
      </p>

      {!loaded ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-xl bg-secondary animate-pulse" />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          {sliderConfig.map(({ key, left, right }) => (
            <div key={key}>
              <div className="flex justify-between text-[12px] text-muted-foreground" style={{ marginBottom: '0.375rem' }}>
                <span>{left}</span>
                <span className="text-right">{right}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(sliders[key] * 100)}
                onChange={e => updateSlider(key, parseInt(e.target.value, 10) / 100)}
                className="videx-slider"
                style={{ ['--slider-fill' as any]: `${Math.round(sliders[key] * 100)}%` }}
              />
              <p className="text-center text-[11px] text-primary" style={{ fontWeight: 500, marginTop: '0.25rem' }}>
                {getSliderLabel(key, sliders[key])}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 pt-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <button
          onClick={resetSliders}
          className="text-muted-foreground text-[13px] hover:text-foreground transition-colors"
        >
          Reset to defaults
        </button>
      </div>
    </SubPageShell>
  );
}

// ═════════════════════════════════════════════════════════
// ── Monthly Spend Sub-Page ──────────────────────────────
// ═════════════════════════════════════════════════════════
function MonthlySpendPage({ connectedServices, onBack }: { connectedServices: string[]; onBack: () => void }) {
  return (
    <SubPageShell title="Monthly Spend" onBack={onBack}>
      <SpendDashboard connectedServices={connectedServices} />
    </SubPageShell>
  );
}

// ═════════════════════════════════════════════════════════
// ── Privacy & Data Sub-Page ─────────────────────────────
// ═════════════════════════════════════════════════════════
function PrivacyDataPage({ onBack }: { onBack: () => void }) {
  const [showLearnMore, setShowLearnMore] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <SubPageShell title="Privacy & Data" onBack={onBack}>
      <p className="text-muted-foreground text-[13px] mb-5 leading-relaxed">
        Videx learns from what you watch, rate, and explore in the app to recommend content that matches your taste. We never sell this data or share it with other services.
      </p>

      {/* What Videx learns about you */}
      <button
        onClick={() => setShowLearnMore(true)}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-secondary/60 hover:bg-secondary/80 transition-colors mb-2"
      >
        <Eye className="w-5 h-5 text-blue-400 shrink-0" />
        <span className="text-foreground text-[14px] flex-1 text-left" style={{ fontWeight: 500 }}>
          What Videx learns about you
        </span>
      </button>

      {/* Download my data */}
      <button
        onClick={() => toast.success("Download started", { description: "Your data export will be ready shortly." })}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-secondary/60 hover:bg-secondary/80 transition-colors mb-2"
      >
        <ArrowLeft className="w-5 h-5 text-emerald-400 shrink-0 rotate-[-90deg]" />
        <span className="text-foreground text-[14px] flex-1 text-left" style={{ fontWeight: 500 }}>
          Download my data
        </span>
      </button>

      {/* Delete my account */}
      <button
        onClick={() => setShowDeleteConfirm(true)}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-colors"
      >
        <Shield className="w-5 h-5 text-red-400 shrink-0" />
        <span className="text-red-400 text-[14px] flex-1 text-left" style={{ fontWeight: 500 }}>
          Delete my account
        </span>
      </button>

      {/* "What Videx learns" info modal */}
      <AnimatePresence>
        {showLearnMore && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
            onClick={() => setShowLearnMore(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-sm bg-card rounded-2xl p-6 max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-foreground text-[18px] mb-4" style={{ fontWeight: 700 }}>
                What Videx learns about you
              </h3>

              <div className="mb-4">
                <p className="text-foreground text-[13px] mb-2" style={{ fontWeight: 600 }}>We track:</p>
                <ul className="space-y-1.5 text-muted-foreground text-[13px]">
                  <li>What you rate (thumbs up/down)</li>
                  <li>What you add to your watchlist</li>
                  <li>What you mark as watched</li>
                  <li>Titles you mark as not interested</li>
                  <li>Which services you tap to start watching</li>
                  <li>Titles you tap to view details</li>
                  <li>How long you spend looking at title details</li>
                  <li>Your genre and taste preferences</li>
                  <li>Your streaming service subscriptions</li>
                </ul>
              </div>

              <div className="mb-5">
                <p className="text-foreground text-[13px] mb-2" style={{ fontWeight: 600 }}>We don't track:</p>
                <ul className="space-y-1.5 text-muted-foreground text-[13px]">
                  <li>Your location</li>
                  <li>Your other apps</li>
                  <li>Anything outside Videx</li>
                  <li>Your actual viewing on streaming platforms</li>
                </ul>
              </div>

              <button
                onClick={() => setShowLearnMore(false)}
                className="w-full py-3 rounded-xl bg-primary text-white text-[14px] transition-colors hover:bg-primary/90"
                style={{ fontWeight: 600 }}
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete account confirmation modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-sm bg-card rounded-2xl p-6"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-foreground text-[18px] mb-2" style={{ fontWeight: 700 }}>
                Delete account?
              </h3>
              <p className="text-muted-foreground text-[14px] mb-2 leading-relaxed">
                This will permanently delete your account, all your preferences, watchlist, and ratings. This action cannot be undone.
              </p>
              <p className="text-primary text-[13px] mb-5 leading-relaxed bg-primary/10 rounded-xl px-3 py-2">
                Account deletion is not yet available. Contact support to delete your account.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-secondary text-foreground text-[14px] transition-colors hover:bg-secondary/80"
                  style={{ fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  disabled
                  className="flex-1 py-3 rounded-xl bg-red-500/30 text-red-400/50 text-[14px] cursor-not-allowed"
                  style={{ fontWeight: 600 }}
                >
                  Delete Account
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </SubPageShell>
  );
}

// ═════════════════════════════════════════════════════════
// ── Shared Sub-Components ───────────────────────────────
// ═════════════════════════════════════════════════════════

function SubPageShell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-full px-5 pb-8">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl -mx-5 px-5 flex items-center gap-3"
        style={{ backgroundColor: "var(--background)", paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))" }}>
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-foreground text-[18px] py-2" style={{ fontWeight: 700 }}>{title}</h1>
      </div>
      <div className="pt-4">{children}</div>
    </div>
  );
}

function ActionRow({ icon, iconBg, iconBgColor, title, subtitle, onClick }: {
  icon: React.ReactNode;
  iconBg?: string;
  iconBgColor?: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-secondary/40 hover:bg-secondary/60 transition-colors mb-2"
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg || (iconBgColor ? '' : 'bg-secondary')}`}
        style={iconBgColor ? { backgroundColor: iconBgColor } : undefined}
      >
        {icon}
      </div>
      <div className="flex-1 text-left min-w-0">
        <p className="text-foreground text-[14px]" style={{ fontWeight: 600 }}>{title}</p>
        {subtitle && <p className="text-muted-foreground text-[12px] truncate">{subtitle}</p>}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-muted-foreground text-[11px] tracking-widest uppercase mt-4 mb-2 px-1" style={{ fontWeight: 600 }}>
      {label}
    </p>
  );
}

function StatBadge({ icon, count, label }: { icon: React.ReactNode; count: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary">
      {icon}
      <span className="text-foreground text-[12px]" style={{ fontWeight: 600 }}>{count}</span>
      <span className="text-muted-foreground text-[11px]">{label}</span>
    </div>
  );
}

function InputField({ label, value, onChange, type = "text" }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="relative rounded-xl border border-primary/30 bg-secondary/60 ring-1 ring-primary/10">
      <label className="absolute top-2 left-3 text-muted-foreground text-[10px]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent px-3 pt-6 pb-2 text-foreground text-[14px] outline-none"
      />
    </div>
  );
}
