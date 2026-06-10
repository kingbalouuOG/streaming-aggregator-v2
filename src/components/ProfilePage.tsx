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
  Sparkles,
  Shield,
  Bookmark,
  Eye,
  Film,
  FileText,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import { OnboardingData } from "./OnboardingFlow";
import { useTheme } from "./ThemeContext";
import { PLATFORMS, type ServiceId } from "./platformLogos";
import { ServiceStack } from "./ServiceBadge";
import { Kicker } from "./Kicker";

/** React.CSSProperties + the --slider-fill custom property used by .videx-slider */
type SliderFillStyle = React.CSSProperties & { '--slider-fill': string };
import { TASTE_CLUSTERS, MIN_CLUSTERS, MAX_CLUSTERS } from "@/lib/taste-v2/tasteClusters";
import { GenreIconTile, CLUSTER_GLYPHS, PROFILE_GLYPHS, type GlyphName } from "./genreIcons";
import { getSliderState, saveSliderState } from "@/lib/taste-v2/tasteProfileV2";
import { DEFAULT_SLIDERS, type SliderState } from "@/lib/taste-v2/types";
import { SpendDashboard } from "./SpendDashboard";
import { PrivacyPolicyPage } from "./PrivacyPolicyPage";
import { TermsPage } from "./TermsPage";
import { exportUserData } from "@/lib/storage/userExport";

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
          <PrivacyDataPage
            onBack={goBack}
            username={props.username || props.userProfile?.name || null}
            onDeleteAccount={props.onDeleteAccount}
          />
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
      <div
        className="sticky top-0 z-20 backdrop-blur-xl -mx-5 px-5 pb-3"
        style={{
          background: "color-mix(in srgb, var(--surface) 88%, transparent)",
          paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))",
        }}
      >
        <span className="t-kicker">YOU</span>
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
          Profile.
        </h1>
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
          <StatBadge icon={<Bookmark className="w-3.5 h-3.5" style={{ color: "var(--primary)" }} />} count={watchlistCount} label="Watchlist" />
          <StatBadge icon={<Eye className="w-3.5 h-3.5" style={{ color: "var(--fg-soft)" }} />} count={watchedCount} label="Watched" />
          <StatBadge icon={<Film className="w-3.5 h-3.5" style={{ color: "var(--fg-soft)" }} />} count={connectedCount} label="Services" />
        </div>
      </div>

      {/* Action Rows. Icon tiles use the editorial monochrome treatment:
          neutral surface-tint background + fg-soft glyph. The orange
          accent is reserved for the brand mark + active states. */}
      <SectionLabel label="ACCOUNT" />
      <ActionRow glyph={PROFILE_GLYPHS.account} title="Account Details" subtitle={displayEmail} onClick={() => onNavigate('account')} />

      <SectionLabel label="SUBSCRIPTIONS" />
      <ActionRow
        glyph={PROFILE_GLYPHS.streaming}
        title="Streaming Services"
        subtitle={connectedCount === 0 ? "None connected" : undefined}
        trailing={
          connectedCount > 0 ? (
            <ServiceStack
              services={(userProfile?.services ?? []) as ServiceId[]}
              size="sm"
              max={4}
            />
          ) : undefined
        }
        onClick={() => onNavigate('services')}
      />

      <SectionLabel label="INSIGHTS" />
      <ActionRow glyph={PROFILE_GLYPHS.spend} title="Monthly Spend" subtitle={`£${connectedCount > 0 ? '—' : '0'}/month`} onClick={() => onNavigate('spend')} />

      <SectionLabel label="PERSONALISATION" />
      <ActionRow glyph={PROFILE_GLYPHS.taste} title="Your Taste" subtitle={topClusterNames || 'Set up your taste profile'} onClick={() => onNavigate('taste')} />
      <ActionRow glyph={PROFILE_GLYPHS.tune} title="Tune Recommendations" subtitle="Balanced across all sliders" onClick={() => onNavigate('tune')} />

      <SectionLabel label="SETTINGS" />
      <ActionRow glyph={PROFILE_GLYPHS.appearance} title="Appearance" subtitle="Dark" onClick={() => onNavigate('appearance')} />
      <ActionRow glyph={PROFILE_GLYPHS.privacy} title="Privacy & Data" subtitle="Manage your data" onClick={() => onNavigate('privacy')} />

      {/* Sign Out */}
      <div className="mt-6">
        <button
          type="button"
          onClick={onSignOut}
          className="w-full flex items-center justify-center gap-2 py-3 transition-colors"
          style={{
            background: "var(--primary-soft)",
            color: "var(--primary)",
            border: "0.5px solid color-mix(in srgb, var(--primary) 35%, transparent)",
            borderRadius: "var(--r-pill)",
            fontFamily: "var(--font-ui)",
            fontSize: 13,
            fontWeight: 600,
          }}
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
    <SubPageShell kicker="ACCOUNT" title="Your details." onBack={onBack}>
      <div className="space-y-3 mb-6">
        <InputField label="Name" value={name} onChange={setName} />
        <InputField label="Email" value={email} onChange={setEmail} type="email" />
      </div>
      <button
        type="button"
        onClick={handleSave}
        disabled={!isDirty}
        className="w-full flex items-center justify-center gap-2 py-3.5 transition-colors"
        style={{
          background: isDirty ? "var(--primary)" : "var(--surface-tint)",
          color: isDirty ? "#fff" : "var(--fg-faint)",
          borderRadius: "var(--r-pill)",
          fontFamily: "var(--font-ui)",
          fontSize: 14,
          fontWeight: 600,
          cursor: isDirty ? "pointer" : "not-allowed",
        }}
      >
        {isDirty ? <Check className="w-4 h-4" /> : null}
        Save changes
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
    <SubPageShell kicker="SUBSCRIPTIONS" title="Streaming services." onBack={onBack}>
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
              {isConnected ? <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div> : null}
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
    <SubPageShell kicker="APPEARANCE" title="How it looks." onBack={onBack}>
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
              {isActive ? <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div> : null}
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
    <SubPageShell kicker="PERSONALISATION" title="Your taste." onBack={onBack}>
      <h3 className="text-foreground text-[16px] mb-1" style={{ fontWeight: 700 }}>Your taste profile</h3>
      {summaryText ? <p className="text-muted-foreground text-[13px] mb-4 leading-relaxed">{summaryText}</p> : null}

      {/* Cluster chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {resolvedClusters.map(c => (
          <span key={c.id} className="inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-full bg-primary/15 text-foreground text-[13px]" style={{ fontWeight: 500 }}>
            <GenreIconTile glyph={CLUSTER_GLYPHS[c.id]} size={22} />
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
        {showRetakeConfirm ? <motion.div
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
              className="w-full rounded-t-2xl mb-0"
              style={{ backgroundColor: 'var(--card)', maxWidth: 'calc(100% - 3rem)', padding: '1.5rem' }}
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
          </motion.div> : null}
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
    <SubPageShell kicker="PERSONALISATION" title="Refine preferences." onBack={onBack}>
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
              <GenreIconTile glyph={CLUSTER_GLYPHS[cluster.id]} size={32} />
              <span className={`text-[13px] ${isSelected ? "text-foreground" : "text-muted-foreground"}`}
                style={{ fontWeight: isSelected ? 600 : 500 }}>
                {cluster.name}
              </span>
              {isSelected ? <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div> : null}
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

  // Lowercase the first word only, preserving acronyms like "TV"
  const softLower = (s: string): string => {
    if (s.length === 0 || /^[A-Z]{2}/.test(s)) return s;
    return s[0].toLowerCase() + s.slice(1);
  };

  // Dynamic slider position label. "Balanced" = the midpoint POSITION,
  // not the default — comfortZone defaults to 0.25 by design and must
  // not be labelled Balanced there.
  const getSliderLabel = (key: keyof SliderState, value: number): string => {
    const cfg = sliderConfig.find(s => s.key === key);
    if (!cfg) return '';
    if (Math.abs(value - 0.5) < 0.04) return 'Balanced';
    if (value < 0.25) return `Strongly prefer ${softLower(cfg.left)}`;
    if (value < 0.5) return `Slightly prefer ${softLower(cfg.left)}`;
    if (value < 0.75) return `Slightly prefer ${softLower(cfg.right)}`;
    return `Strongly prefer ${softLower(cfg.right)}`;
  };

  return (
    <SubPageShell kicker="TUNE" title="Recommendations." onBack={onBack}>
      <p className="text-muted-foreground text-[13px]" style={{ marginBottom: '2rem' }}>
        Adjust how Videx serves your recommendations. Changes take effect immediately.
      </p>

      {!loaded ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-xl bg-secondary animate-pulse" />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
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
                style={{ '--slider-fill': `${Math.round(sliders[key] * 100)}%` } as SliderFillStyle}
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
    <SubPageShell kicker="INSIGHTS" title="Monthly spend." onBack={onBack}>
      <SpendDashboard connectedServices={connectedServices} />
    </SubPageShell>
  );
}

// ═════════════════════════════════════════════════════════
// ── Privacy & Data Sub-Page ─────────────────────────────
// ═════════════════════════════════════════════════════════
interface PrivacyDataPageProps {
  onBack: () => void;
  username: string | null;
  onDeleteAccount?: () => Promise<{ error?: string }>;
}

function PrivacyDataPage({ onBack, username, onDeleteAccount }: PrivacyDataPageProps) {
  const [showLearnMore, setShowLearnMore] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  // Phase 5.5 C12 — type-username-to-confirm. Case-insensitive trimmed
  // match; `profiles.username` is a plain TEXT UNIQUE (no citext) so
  // the user's stored case may differ from what they type — comparing
  // lowercased on both sides handles that without forcing exact casing.
  const [confirmUsername, setConfirmUsername] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const normalisedTarget = (username ?? '').trim().toLowerCase();
  const canDelete =
    onDeleteAccount != null &&
    normalisedTarget.length > 0 &&
    confirmUsername.trim().toLowerCase() === normalisedTarget;

  // Phase 5.5 C16 — wire "Download my data" to export_user_data RPC.
  const handleExport = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const result = await exportUserData();
      toast.success('Download ready', { description: result.destination });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      toast.error('Export failed', { description: msg });
    } finally {
      setIsExporting(false);
    }
  }, [isExporting]);

  // Phase 5.5 C12 — wire the delete CTA to the auth.deleteAccount path.
  const handleDelete = useCallback(async () => {
    if (!canDelete || isDeleting || !onDeleteAccount) return;
    setIsDeleting(true);
    const result = await onDeleteAccount();
    if (result.error) {
      toast.error('Could not delete account', { description: result.error });
      setIsDeleting(false);
      return;
    }
    // Success: AuthContext.deleteAccount also signs the user out, which
    // unmounts ProfilePage. No local navigation needed — App.tsx routes
    // back to the auth flow on session change.
    toast.success('Your account has been deleted.');
  }, [canDelete, isDeleting, onDeleteAccount]);

  return (
    <SubPageShell kicker="SETTINGS" title="Privacy & data." onBack={onBack}>
      <p className="text-muted-foreground text-[13px] mb-5 leading-relaxed">
        Videx learns from what you watch, rate, and explore in the app to recommend content that matches your taste. We never sell this data or share it with other services.
      </p>

      {/* What Videx learns about you */}
      <button
        onClick={() => setShowLearnMore(true)}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-secondary/60 hover:bg-secondary/80 transition-colors mb-2"
      >
        <Eye className="w-5 h-5 shrink-0" style={{ color: "var(--fg-soft)" }} />
        <span className="text-foreground text-[14px] flex-1 text-left" style={{ fontWeight: 500 }}>
          What Videx learns about you
        </span>
      </button>

      {/* Privacy Policy (Phase 5.5 C14) */}
      <button
        onClick={() => setShowPrivacy(true)}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-secondary/60 hover:bg-secondary/80 transition-colors mb-2"
      >
        <FileText className="w-5 h-5 shrink-0" style={{ color: "var(--fg-soft)" }} />
        <span className="text-foreground text-[14px] flex-1 text-left" style={{ fontWeight: 500 }}>
          Privacy Policy
        </span>
      </button>

      {/* Terms of Service (Phase 5.5 C14) */}
      <button
        onClick={() => setShowTerms(true)}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-secondary/60 hover:bg-secondary/80 transition-colors mb-2"
      >
        <FileText className="w-5 h-5 shrink-0" style={{ color: "var(--fg-soft)" }} />
        <span className="text-foreground text-[14px] flex-1 text-left" style={{ fontWeight: 500 }}>
          Terms of Service
        </span>
      </button>

      {/* Download my data (Phase 5.5 C16) */}
      <button
        onClick={handleExport}
        disabled={isExporting}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-secondary/60 hover:bg-secondary/80 transition-colors mb-2 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <ArrowLeft className="w-5 h-5 shrink-0 rotate-[-90deg]" style={{ color: "var(--fg-soft)" }} />
        <span className="text-foreground text-[14px] flex-1 text-left" style={{ fontWeight: 500 }}>
          {isExporting ? 'Preparing your data…' : 'Download my data'}
        </span>
      </button>

      {/* Delete my account */}
      <button
        type="button"
        onClick={() => setShowDeleteConfirm(true)}
        className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors"
        style={{
          borderRadius: "var(--r-md)",
          background: "color-mix(in srgb, var(--danger) 10%, transparent)",
          color: "var(--danger)",
        }}
      >
        <Shield className="w-5 h-5 shrink-0" />
        <span className="text-[14px] flex-1 text-left" style={{ fontWeight: 500 }}>
          Delete my account
        </span>
      </button>

      {/* Phase 5.5 C14 — legal overlays */}
      <AnimatePresence>
        {showPrivacy ? <PrivacyPolicyPage onClose={() => setShowPrivacy(false)} /> : null}
        {showTerms ? <TermsPage onClose={() => setShowTerms(false)} /> : null}
      </AnimatePresence>

      {/* "What Videx learns" info modal */}
      <AnimatePresence>
        {showLearnMore ? <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setShowLearnMore(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full rounded-2xl max-h-[80vh] overflow-y-auto"
              style={{ backgroundColor: 'var(--card)', maxWidth: 'calc(100% - 3rem)', padding: '1.5rem' }}
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
          </motion.div> : null}
      </AnimatePresence>

      {/* Delete account confirmation modal */}
      <AnimatePresence>
        {showDeleteConfirm ? <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full rounded-2xl"
              style={{ backgroundColor: 'var(--card)', maxWidth: 'calc(100% - 3rem)', padding: '1.5rem' }}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-foreground text-[18px] mb-2" style={{ fontWeight: 700 }}>
                Delete account?
              </h3>
              <p className="text-muted-foreground text-[14px] mb-4 leading-relaxed">
                This will permanently delete your account, all your preferences, watchlist, and ratings. This action cannot be undone.
              </p>

              {/* Phase 5.5 C12 — type-username-to-confirm UX */}
              <label className="block text-foreground text-[13px] mb-1.5" style={{ fontWeight: 500 }}>
                Type your username to confirm
              </label>
              <input
                type="text"
                value={confirmUsername}
                onChange={e => setConfirmUsername(e.target.value)}
                placeholder={username ?? ''}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={isDeleting}
                className="w-full px-3 py-2.5 rounded-xl bg-secondary/60 text-foreground text-[14px] mb-3 focus:outline-none focus:ring-2 disabled:opacity-60"
                style={{ ['--tw-ring-color' as never]: 'var(--danger)' }}
              />
              <p className="text-muted-foreground text-[12px] mb-5">
                This action cannot be undone.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setConfirmUsername(''); }}
                  disabled={isDeleting}
                  className="flex-1 py-3 rounded-xl bg-secondary text-foreground text-[14px] transition-colors hover:bg-secondary/80 disabled:opacity-60"
                  style={{ fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={!canDelete || isDeleting}
                  className={canDelete && !isDeleting
                    ? "flex-1 py-3 rounded-xl bg-red-500 text-white text-[14px] transition-colors hover:bg-red-600"
                    : "flex-1 py-3 rounded-xl bg-red-500/30 text-red-400/50 text-[14px] cursor-not-allowed"}
                  style={{ fontWeight: 600 }}
                >
                  {isDeleting ? 'Deleting…' : 'Delete Account'}
                </button>
              </div>
            </motion.div>
          </motion.div> : null}
      </AnimatePresence>
    </SubPageShell>
  );
}

// ═════════════════════════════════════════════════════════
// ── Shared Sub-Components ───────────────────────────────
// ═════════════════════════════════════════════════════════

function SubPageShell({
  title,
  kicker = "SETTINGS",
  onBack,
  children,
}: {
  title: string;
  kicker?: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-full px-5 pb-8">
      <div
        className="sticky top-0 z-20 backdrop-blur-xl -mx-5 px-5 flex items-start gap-3 pb-4"
        style={{
          background: "color-mix(in srgb, var(--surface) 88%, transparent)",
          paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 inline-flex items-center justify-center shrink-0 mt-1"
          style={{
            borderRadius: "var(--r-md)",
            background: "var(--surface-tint)",
            color: "var(--fg-soft)",
          }}
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <span className="t-kicker">{kicker}</span>
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
            {title}
          </h1>
        </div>
      </div>
      <div className="pt-4">{children}</div>
    </div>
  );
}

/**
 * Editorial settings list row — hairline-bordered, no rounded chip
 * background. Optional `trailing` slot lets specific rows surface
 * richer visuals (e.g. a ServiceStack on the Streaming Services row)
 * in place of the default subtitle text.
 */
function ActionRow({ glyph, title, subtitle, trailing, onClick }: {
  glyph: GlyphName;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 py-3.5 transition-colors"
      style={{
        borderBottom: "0.5px solid var(--hairline)",
      }}
    >
      <GenreIconTile glyph={glyph} size={36} />
      <div className="flex-1 text-left min-w-0">
        <p style={{
          fontFamily: "var(--font-ui)",
          fontSize: 14,
          fontWeight: 600,
          color: "var(--fg)",
          lineHeight: 1.3,
        }}>{title}</p>
        {subtitle ? <p
            className="truncate"
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 12,
              color: "var(--fg-soft)",
              marginTop: 2,
            }}
          >
            {subtitle}
          </p> : null}
      </div>
      {trailing ? <div className="shrink-0 flex items-center">{trailing}</div> : null}
      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--fg-faint)" }} />
    </button>
  );
}

/** Editorial section divider — uses the canonical Kicker primitive
 *  in place of the previous bespoke "tracking-widest uppercase" span. */
function SectionLabel({ label }: { label: string }) {
  return (
    <div className="mt-6 mb-2 px-0">
      <Kicker>{label}</Kicker>
    </div>
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
    <div
      className="relative"
      style={{
        borderRadius: "var(--r-card)",
        border: "0.5px solid var(--hairline)",
        background: "var(--surface-elev)",
      }}
    >
      <label
        className="absolute top-2 left-3"
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "1.4px",
          color: "var(--fg-faint)",
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent px-3 pt-6 pb-2 outline-none"
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 14,
          color: "var(--fg)",
        }}
      />
    </div>
  );
}
