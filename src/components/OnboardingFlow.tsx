import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  Tv,
  RefreshCw,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Popcorn,
  User,
  X,
  Loader2,
} from "lucide-react";
import { PLATFORMS, type PlatformDef } from "./platformLogos";
import { TASTE_CLUSTERS, MIN_CLUSTERS, MAX_CLUSTERS } from "@/lib/taste-v2/tasteClusters";
import { logOnboardingEvent } from "@/lib/analytics/logger";
import { ONBOARDING_EVENTS } from "@/lib/analytics/events";
import { supabase } from "@/lib/supabase";
import type { SliderState } from "@/lib/taste-v2/types";
import { DEFAULT_SLIDERS } from "@/lib/taste-v2/types";
import { useAuth } from "./AuthContext";

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
  /** If true, skip Step 1 (account creation) — user already authenticated */
  skipAuth?: boolean;
}

const TOTAL_STEPS = 5;

/**
 * Magazine-layout step heading per Phase 4 PR-U: kicker
 * (uppercase tracked, --primary) → Fraunces title → italic Fraunces
 * standfirst. Used by every step inside the flow.
 */
function StepHeader({
  kicker,
  title,
  standfirst,
}: {
  kicker: string;
  title: string;
  standfirst?: string;
}) {
  return (
    <div className="mb-2">
      <span
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "1.6px",
          color: "var(--primary)",
        }}
      >
        {kicker}
      </span>
      <h2
        className="mt-2"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-headline)",
          fontWeight: 600,
          fontVariationSettings: '"opsz" 48',
          letterSpacing: "-0.01em",
          color: "var(--fg)",
          lineHeight: 1.15,
          margin: 0,
        }}
      >
        {title}
      </h2>
      {standfirst && (
        <p
          className="mt-2"
          style={{
            fontFamily: "var(--font-display)",
            fontStyle: "italic",
            fontSize: "var(--t-body)",
            color: "var(--fg-soft)",
            lineHeight: 1.4,
            margin: 0,
          }}
        >
          {standfirst}
        </p>
      )}
    </div>
  );
}

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

export function OnboardingFlow({ onComplete, skipAuth }: OnboardingFlowProps) {
  // If auth is already done, start at Step 2 (Services)
  const [step, setStep] = useState(skipAuth ? 1 : 0);
  const [direction, setDirection] = useState(0);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [watchedSelections, setWatchedSelections] = useState<Set<string>>(new Set());
  const [sliders, setSliders] = useState<SliderState>({ ...DEFAULT_SLIDERS });

  // Step 1 (Account) state
  const [accountCreated, setAccountCreated] = useState(!!skipAuth);

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

  // Fetch watched grid candidates — uses popular titles from user's services
  const fetchWatchedGridCandidates = useCallback(async () => {
    if (selectedServices.length === 0) return;
    setWatchedLoading(true);

    try {
      // Skip the centroid RPC entirely — just query popular titles on user's services directly.
      // This is faster (2 parallel queries vs 4 sequential) and gives better-known titles.
      const [titleRes, availRes] = await Promise.all([
        supabase.from('titles' as any)
          .select('tmdb_id, media_type, title, poster_path, release_year, popularity')
          .gte('popularity', 30)
          .gte('vote_count', 200)
          .not('poster_path', 'is', null)
          .not('embedding', 'is', null)
          .order('popularity', { ascending: false })
          .limit(500),
        // Migration 035: RPC returns a JSONB array of IDs in a single
        // row, not a paginated table.
        supabase.rpc('get_available_tmdb_ids', { service_ids: selectedServices }),
      ]);

      const availSet = new Set<number>(
        Array.isArray(availRes.data) ? (availRes.data as unknown as number[]) : []
      );

      const seenIds = new Set<number>();
      const movies: WatchedGridTitle[] = [];
      const tvShows: WatchedGridTitle[] = [];

      for (const t of ((titleRes.data as any[]) || [])) {
        if (seenIds.has(t.tmdb_id) || !availSet.has(t.tmdb_id)) continue;
        seenIds.add(t.tmdb_id);
        const item: WatchedGridTitle = {
          tmdbId: t.tmdb_id,
          mediaType: t.media_type,
          title: t.title,
          posterPath: t.poster_path,
          year: t.release_year,
        };
        if (t.media_type === 'movie') movies.push(item);
        else tvShows.push(item);
      }

      // Interleave movies and TV for balance, then shuffle within groups
      const balanced: WatchedGridTitle[] = [];
      const maxLen = Math.max(movies.length, tvShows.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < movies.length) balanced.push(movies[i]);
        if (i < tvShows.length) balanced.push(tvShows[i]);
      }

      // Light shuffle (within groups of 6 for round variety, not full random)
      for (let g = 0; g < balanced.length; g += TITLES_PER_ROUND) {
        const end = Math.min(g + TITLES_PER_ROUND, balanced.length);
        for (let i = end - 1; i > g; i--) {
          const j = g + Math.floor(Math.random() * (i - g + 1));
          [balanced[i], balanced[j]] = [balanced[j], balanced[i]];
        }
      }

      setWatchedPool(balanced);
      setWatchedPoolOffset(0);
      setWatchedRound(0);
    } catch (err) {
      console.error('[Onboarding] Failed to fetch watched grid candidates:', err);
    } finally {
      setWatchedLoading(false);
    }
  }, [selectedServices]);

  // Pre-fetch watched grid as soon as first service is selected (background)
  const prefetchTriggeredRef = useRef(false);
  useEffect(() => {
    if (step === 0 && selectedServices.length > 0 && !prefetchTriggeredRef.current) {
      prefetchTriggeredRef.current = true;
      fetchWatchedGridCandidates();
    }
  }, [selectedServices.length, step, fetchWatchedGridCandidates]);

  // Current round's visible titles
  const roundStartIdx = watchedRound * TITLES_PER_ROUND + watchedPoolOffset;
  const currentRoundTitles = watchedPool.slice(roundStartIdx, roundStartIdx + TITLES_PER_ROUND);

  const canContinue = [
    accountCreated,                                   // Step 1: Account (handled by StepAccount callback)
    selectedServices.length > 0,                      // Step 2: Services
    true,                                             // Step 3: Watched grid (optional)
    selectedClusters.length >= MIN_CLUSTERS,           // Step 4: Clusters
    true,                                             // Step 5: Summary + sliders
  ];

  // Called by StepAccount when auth sign-up succeeds
  const handleAccountCreated = useCallback((age: string | null, context: string | null) => {
    setAccountCreated(true);
    // Save age_range and viewing_context to profiles
    if (age || context) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (age) updates.age_range = age;
      if (context) updates.viewing_context = context;
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          supabase.from('profiles' as any).update(updates).eq('id', data.user.id)
            .then(({ error }: any) => {
              if (error) console.error('[Onboarding] Failed to save demographics:', error.message);
            });
        }
      });
    }
    // Advance to Step 2 (Services)
    setDirection(1);
    setStep(1);
  }, []);

  const goNext = async () => {
    // Step 1 (Account) is handled by handleAccountCreated callback, not goNext
    if (step === 1) {
      void logOnboardingEvent(ONBOARDING_EVENTS.SERVICES_COMPLETED, {
        service_count: selectedServices.length,
        services: selectedServices,
      });
      // Pre-fetch watched grid titles for Step 3
      fetchWatchedGridCandidates();
    }
    if (step === 2 && watchedRound < TOTAL_ROUNDS - 1) {
      // Advance to next round within Step 3
      setWatchedRound(r => r + 1);
      return;
    }
    if (step === 3) {
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
    if (step === 2 && watchedRound > 0) {
      setWatchedRound(r => r - 1);
      return;
    }
    // Don't go back to Step 1 (account creation) — account already created
    if (step <= 1) return;
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
    if (step === 0) return 'Continue'; // Step 1 has its own CTA inside StepAccount
    if (step === 2 && watchedRound < TOTAL_ROUNDS - 1) return `Next round (${watchedRound + 1}/${TOTAL_ROUNDS})`;
    if (step === TOTAL_STEPS - 1) return 'Start exploring Videx';
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
              key={step === 2 ? `step2-round${watchedRound}` : `step${step}`}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className="absolute inset-0 flex flex-col"
            >
              {step === 0 && (
                <StepAccount onAccountCreated={handleAccountCreated} />
              )}
              {step === 1 && (
                <StepServices
                  selected={selectedServices}
                  onToggle={toggleService}
                  onSelectAll={selectAllServices}
                />
              )}
              {step === 2 && (
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
              {step === 3 && (
                <StepClusters
                  selected={selectedClusters}
                  onToggle={toggleCluster}
                  onClear={clearClusters}
                />
              )}
              {step === 4 && (
                <StepTasteSummary
                  selectedClusters={selectedClusters}
                  watchedCount={watchedSelections.size}
                  serviceCount={selectedServices.length}
                  sliders={sliders}
                  onSlidersChange={setSliders}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Bottom CTA (hidden on Step 1 — StepAccount has its own) ───────────────────── */}
        {step === 0 ? null : (
        <div className="px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
          {step === 1 && selectedServices.length === 0 && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              Select at least one service to continue
            </p>
          )}
          {step === 1 && selectedServices.length > 0 && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              {selectedServices.length} service{selectedServices.length !== 1 ? "s" : ""} selected
            </p>
          )}
          {step === 2 && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              {watchedSelections.size > 0
                ? `${watchedSelections.size} title${watchedSelections.size !== 1 ? 's' : ''} selected`
                : 'Tap titles you\'ve watched and enjoyed'}
            </p>
          )}
          {step === 3 && selectedClusters.length < MIN_CLUSTERS && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              Pick at least {MIN_CLUSTERS} that match your vibe
            </p>
          )}
          {step === 3 && selectedClusters.length >= MIN_CLUSTERS && (
            <p className="text-muted-foreground text-[12px] text-center mb-2">
              {selectedClusters.length} selected
            </p>
          )}

          <motion.button
            type="button"
            onClick={goNext}
            disabled={!canContinue[step] && step < TOTAL_STEPS - 1}
            whileTap={canContinue[step] || step === TOTAL_STEPS - 1 ? { scale: 0.97 } : undefined}
            className="w-full flex items-center justify-center gap-2 py-3.5 transition-all"
            style={{
              borderRadius: "var(--r-pill)",
              background: canContinue[step] || step === TOTAL_STEPS - 1
                ? "var(--primary)"
                : "var(--surface-tint)",
              color: canContinue[step] || step === TOTAL_STEPS - 1
                ? "#fff"
                : "var(--fg-faint)",
              fontFamily: "var(--font-ui)",
              fontSize: 15,
              fontWeight: 600,
              cursor: canContinue[step] || step === TOTAL_STEPS - 1 ? "pointer" : "not-allowed",
            }}
          >
            <span>{getCtaText()}</span>
            {step < TOTAL_STEPS - 1 && <ArrowRight className="w-4 h-4" />}
          </motion.button>
        </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
// ── Step 1: Create Account ──────────────────────────────
// ═════════════════════════════════════════════════════════
const AGE_RANGES = ['Under 18', '18-24', '25-34', '35-44', '45-54', '55+'];
const VIEWING_CONTEXTS = [
  { id: 'solo', label: 'Solo', icon: '👤' },
  { id: 'partner', label: 'With a partner', icon: '👥' },
  { id: 'family', label: 'With family', icon: '👨‍👩‍👧‍👦' },
  { id: 'mix', label: 'Mix', icon: '🔀' },
];

function StepAccount({
  onAccountCreated,
}: {
  onAccountCreated: (ageRange: string | null, viewingContext: string | null) => void;
}) {
  const { signUp, checkUsernameAvailable } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'too-short' | 'invalid' | 'checking' | 'available' | 'taken'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ageRange, setAgeRange] = useState<string | null>(null);
  const [viewingCtx, setViewingCtx] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const latestUsernameRef = useRef('');

  const handleUsernameChange = useCallback((raw: string) => {
    const cleaned = raw.toLowerCase().replace(/\s/g, '').slice(0, 20);
    setUsername(cleaned);
    setError(null);
    latestUsernameRef.current = cleaned;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (cleaned.length === 0) { setUsernameStatus('idle'); return; }
    if (cleaned.length < 3) { setUsernameStatus('too-short'); return; }
    if (!/^[a-z0-9]([a-z0-9_.]*[a-z0-9])?$/.test(cleaned) || /[_.]{2}/.test(cleaned)) {
      setUsernameStatus('invalid'); return;
    }
    setUsernameStatus('checking');
    debounceRef.current = setTimeout(async () => {
      const available = await checkUsernameAvailable(cleaned);
      if (latestUsernameRef.current === cleaned) {
        setUsernameStatus(available ? 'available' : 'taken');
      }
    }, 600);
  }, [checkUsernameAvailable]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const pwValid = password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[^a-zA-Z0-9]/.test(password);
  const confirmValid = confirmPassword.length > 0 && confirmPassword === password;
  const canSubmit = emailValid && usernameStatus === 'available' && pwValid && confirmValid;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await signUp(email, password, username);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else {
      onAccountCreated(ageRange, viewingCtx);
    }
  };

  const usernameBorderColor =
    usernameStatus === 'available' ? 'rgba(34, 197, 94, 0.5)'
    : usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'rgba(239, 68, 68, 0.6)'
    : undefined;

  return (
    <div className="flex flex-col h-full px-6 overflow-y-auto no-scrollbar">
      {/* Hero */}
      <div className="flex flex-col items-center pt-4 pb-4">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.1 }}
          className="w-16 h-16 rounded-[20px] mb-3 shadow-xl shadow-primary/30 bg-gradient-to-br from-primary to-orange-400 flex items-center justify-center aspect-square"
        >
          <Popcorn className="text-white" style={{ width: 30, height: 30 }} />
        </motion.div>
        <span className="t-kicker" style={{ marginBottom: 8 }}>STEP 1 OF 5 · ACCOUNT</span>
        <h2 style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--t-headline)",
          fontWeight: 600,
          fontVariationSettings: '"opsz" 48',
          letterSpacing: "-0.01em",
          color: "var(--fg)",
          lineHeight: 1.15,
          margin: 0,
          marginBottom: 8,
        }}>Join Videx.</h2>
        <p style={{
          fontFamily: "var(--font-display)",
          fontStyle: "italic",
          fontSize: "var(--t-body)",
          color: "var(--fg-soft)",
          lineHeight: 1.4,
          margin: 0,
          textAlign: "center",
        }}>A unified streaming companion across your stack.</p>
      </div>

      {/* Form fields */}
      <div className="space-y-2.5 mb-4">
        {/* Email */}
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"><Mail className="w-4.5 h-4.5" /></div>
          <input type="email" placeholder="Email address" value={email}
            onChange={e => { setEmail(e.target.value); setError(null); }}
            className="w-full bg-secondary/60 border rounded-xl pl-11 pr-4 py-3 text-foreground text-[14px] placeholder:text-muted-foreground/50 outline-none focus:ring-1 transition-all"
            style={{ borderColor: email.length > 0 ? (emailValid ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.6)') : 'var(--border-subtle)' }}
          />
        </div>

        {/* Username */}
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"><User className="w-4.5 h-4.5" /></div>
          <input type="text" placeholder="Username" value={username}
            onChange={e => handleUsernameChange(e.target.value)}
            className="w-full bg-secondary/60 border rounded-xl pl-11 pr-10 py-3 text-foreground text-[14px] placeholder:text-muted-foreground/50 outline-none focus:ring-1 transition-all"
            style={{ borderColor: usernameBorderColor || 'var(--border-subtle)' }}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {usernameStatus === 'checking' && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
            {usernameStatus === 'available' && <Check className="w-4 h-4 text-emerald-400" />}
            {(usernameStatus === 'taken' || usernameStatus === 'invalid') && <X className="w-4 h-4 text-red-400" />}
          </div>
        </div>

        {/* Password */}
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"><Lock className="w-4.5 h-4.5" /></div>
          <input type={showPassword ? 'text' : 'password'} placeholder="Password" value={password}
            onChange={e => { setPassword(e.target.value); setError(null); }}
            className="w-full bg-secondary/60 border rounded-xl pl-11 pr-10 py-3 text-foreground text-[14px] placeholder:text-muted-foreground/50 outline-none focus:ring-1 transition-all"
            style={{ borderColor: password.length > 0 && pwValid ? 'rgba(34,197,94,0.5)' : 'var(--border-subtle)' }}
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
          </button>
        </div>

        {/* Confirm password */}
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"><Lock className="w-4.5 h-4.5" /></div>
          <input type={showConfirm ? 'text' : 'password'} placeholder="Confirm password" value={confirmPassword}
            onChange={e => { setConfirmPassword(e.target.value); setError(null); }}
            className="w-full bg-secondary/60 border rounded-xl pl-11 pr-10 py-3 text-foreground text-[14px] placeholder:text-muted-foreground/50 outline-none focus:ring-1 transition-all"
            style={{ borderColor: confirmPassword.length > 0 ? (confirmValid ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.6)') : 'var(--border-subtle)' }}
          />
          <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {showConfirm ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
          </button>
        </div>
      </div>

      {/* A little about you — Optional */}
      <div className="mb-4">
        <span className="t-kicker">A LITTLE ABOUT YOU</span>
        <p className="text-muted-foreground text-[12px] mt-1.5 mb-3">Optional — helps us recommend the right content from day one.</p>

        <span className="t-kicker" style={{ display: "block", marginBottom: 8 }}>AGE RANGE</span>
        <div className="flex flex-wrap gap-2 mb-3">
          {AGE_RANGES.map(age => (
            <button key={age} onClick={() => setAgeRange(ageRange === age ? null : age)}
              className={`px-3 py-1.5 rounded-full text-[12px] border transition-all ${
                ageRange === age
                  ? 'border-primary bg-primary/15 text-foreground'
                  : 'border-transparent bg-secondary/60 text-muted-foreground'
              }`}
              style={{ fontWeight: ageRange === age ? 600 : 500 }}
            >
              {age}
            </button>
          ))}
        </div>

        <span className="t-kicker" style={{ display: "block", marginTop: 8, marginBottom: 8 }}>HOW DO YOU USUALLY WATCH?</span>
        <div className="flex flex-wrap gap-2">
          {VIEWING_CONTEXTS.map(ctx => (
            <button key={ctx.id} onClick={() => setViewingCtx(viewingCtx === ctx.id ? null : ctx.id)}
              className={`px-3 py-1.5 rounded-full text-[12px] border transition-all ${
                viewingCtx === ctx.id
                  ? 'border-primary bg-primary/15 text-foreground'
                  : 'border-transparent bg-secondary/60 text-muted-foreground'
              }`}
              style={{ fontWeight: viewingCtx === ctx.id ? 600 : 500 }}
            >
              {ctx.icon} {ctx.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legal */}
      <p className="text-muted-foreground text-[11px] text-center mb-3">
        By creating an account, you agree to our{' '}
        <span className="text-primary">Terms of Service</span> and{' '}
        <span className="text-primary">Privacy Policy</span>
      </p>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-red-400 text-[13px] text-center mb-2">{error}</motion.p>
        )}
      </AnimatePresence>

      {/* CTA */}
      <div className="pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <motion.button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          whileTap={canSubmit && !submitting ? { scale: 0.97 } : undefined}
          className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-[15px] transition-all duration-300 ${
            canSubmit && !submitting
              ? 'bg-primary text-white shadow-lg shadow-primary/25'
              : 'bg-secondary text-muted-foreground cursor-not-allowed'
          }`}
          style={{ fontWeight: 600 }}
        >
          {submitting ? 'Creating account…' : 'Continue'}
          {!submitting && <ArrowRight className="w-4.5 h-4.5" />}
        </motion.button>
      </div>
    </div>
  );
}

// UK services ordered by approximate market size
const SERVICE_DISPLAY_ORDER = [
  'netflix', 'prime', 'disney', 'bbc', 'itvx', 'channel4', 'now', 'skygo', 'apple', 'paramount',
];
const orderedServices = [...allServices].sort((a, b) => {
  const ai = SERVICE_DISPLAY_ORDER.indexOf(a.id);
  const bi = SERVICE_DISPLAY_ORDER.indexOf(b.id);
  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
});

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
            <StepHeader
              kicker="STEP 2 OF 5 · YOUR STACK"
              title="Your streaming services."
              standfirst="Which platforms are you subscribed to?"
            />
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {orderedServices.map((service, idx) => {
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
          <StepHeader
            kicker={`STEP 3 OF 5 · ROUND ${round + 1}/${totalRounds}`}
            title="What have you seen?"
            standfirst="Tap the titles you've watched and enjoyed."
          />
        </motion.div>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-xl bg-secondary animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
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
              <StepHeader
                kicker="STEP 4 OF 5 · YOUR TASTE"
                title="What do you love?"
                standfirst={`Pick at least ${MIN_CLUSTERS} that match your vibe.`}
              />
            </div>
          </div>
          <span
            className="bg-primary text-white text-[12px] px-2 py-0.5 rounded-full tabular-nums transition-opacity"
            style={{ fontWeight: 600, opacity: selected.length > 0 ? 1 : 0 }}
          >
            {selected.length || 0} selected
          </span>
        </motion.div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {TASTE_CLUSTERS.map((cluster, idx) => {
          const isSelected = selected.includes(cluster.id);
          return (
            <motion.button
              key={cluster.id}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.03 * idx, type: "spring", damping: 20, stiffness: 300 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => onToggle(cluster.id)}
              className={`relative flex items-center gap-4 py-3 rounded-2xl border text-left transition-all duration-250 ${
                isSelected
                  ? "border-primary/50 bg-primary/10"
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
  watchedCount,
  serviceCount,
  sliders,
  onSlidersChange,
}: {
  selectedClusters: string[];
  watchedCount: number;
  serviceCount: number;
  sliders: SliderState;
  onSlidersChange: (s: SliderState) => void;
}) {
  const clusters = selectedClusters
    .map(id => TASTE_CLUSTERS.find(c => c.id === id))
    .filter(Boolean) as typeof TASTE_CLUSTERS;

  // Build prose summary from cluster adjectives/moods
  const topClusters = clusters.slice(0, 3);
  const summaryText = topClusters.length >= 2
    ? `Your taste skews towards ${topClusters.map(c => c.name.toLowerCase()).join(', ')}, with ${topClusters[0].adjective} preferences. We'll spread picks across your ${serviceCount} service${serviceCount !== 1 ? 's' : ''}.`
    : topClusters.length === 1
      ? `Your taste skews towards ${topClusters[0].name.toLowerCase()}, with ${topClusters[0].adjective} preferences.`
      : 'Your taste profile is being built from your service selections.';

  const sliderConfig = [
    { key: 'catalogueAge' as const, left: 'New releases', right: 'Best match, any age' },
    { key: 'comfortZone' as const, left: 'Stick with what I like', right: 'Surprise me' },
    { key: 'contentMix' as const, left: 'Films', right: 'TV Series' },
    { key: 'variety' as const, left: 'Finish what I start', right: 'Try lots of things' },
  ];

  // Slider position labels
  const softLower = (s: string): string => s.length === 0 ? s : s[0].toLowerCase() + s.slice(1);

  const getSliderLabel = (key: keyof SliderState, value: number) => {
    const defaultVal = key === 'comfortZone' ? DEFAULT_SLIDERS.comfortZone : 0.5;
    const cfg = sliderConfig.find(s => s.key === key);
    if (!cfg) return '';
    if (Math.abs(value - defaultVal) < 0.02) return 'Balanced';
    if (value < 0.3) return `Leaning ${softLower(cfg.left)}`;
    if (value > 0.7) return `Leaning ${softLower(cfg.right)}`;
    if (value < 0.5) return `Slightly prefer ${softLower(cfg.left)}`;
    return `Slightly prefer ${softLower(cfg.right)}`;
  };

  const resetSliders = () => onSlidersChange({ ...DEFAULT_SLIDERS });

  return (
    <div className="flex flex-col h-full px-6 overflow-y-auto no-scrollbar">
      <div className="pt-4 pb-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-4">
            <StepHeader
              kicker="STEP 5 OF 5 · TUNING"
              title="Almost there."
              standfirst="One more pass — tune how we serve your recommendations."
            />
          </div>
        </motion.div>

        {/* Taste summary card with stats */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-primary/10 border border-primary/20 rounded-2xl p-4 mb-5"
        >
          <p className="text-foreground text-[13px] leading-relaxed mb-3">
            {summaryText}
          </p>
          {/* Stats row */}
          <div className="flex items-center justify-around">
            <div className="text-center">
              <p className="text-primary text-[20px]" style={{ fontWeight: 700 }}>{selectedClusters.length}</p>
              <p className="text-muted-foreground text-[11px]">Genres</p>
            </div>
            <div className="text-center">
              <p className="text-primary text-[20px]" style={{ fontWeight: 700 }}>{watchedCount}</p>
              <p className="text-muted-foreground text-[11px]">Titles</p>
            </div>
            <div className="text-center">
              <p className="text-primary text-[20px]" style={{ fontWeight: 700 }}>{serviceCount}</p>
              <p className="text-muted-foreground text-[11px]">Services</p>
            </div>
          </div>
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
                <div
                  className="flex justify-between"
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 11,
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--fg-faint)",
                    marginBottom: 8,
                  }}
                >
                  <span>{left}</span>
                  <span>{right}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(sliders[key] * 100)}
                  onChange={e => onSlidersChange({ ...sliders, [key]: parseInt(e.target.value, 10) / 100 })}
                  className="videx-slider"
                  style={{ ['--slider-fill' as any]: `${Math.round(sliders[key] * 100)}%` }}
                />
                <p
                  className="text-center"
                  style={{
                    fontFamily: "var(--font-ui)",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    color: "var(--primary)",
                    marginTop: 6,
                  }}
                >
                  {getSliderLabel(key, sliders[key])}
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
