import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCompleteOnboarding } from '@/hooks/useCompleteOnboarding';
import { useMarkOnboardingComplete } from '@/hooks/useOnboardingStatus';
import { fetchUsernameChosen } from '@/hooks/useUsernameChosen';
import { useWatchedGrid, TITLES_PER_ROUND, type WatchedGridTitle } from '@/hooks/useWatchedGrid';
import { ONBOARDING_EVENTS } from '@/lib/analytics/events';
import { logOnboardingEvent } from '@/lib/analytics/logger';
import { supabase } from '@/lib/supabase';
import { ALL_SERVICE_IDS } from '@/constants/serviceCatalog';
import type { ServiceId } from '@/lib/types/content';
import { DEFAULT_SLIDERS, type SliderState } from '@/lib/taste-v2/types';
import { useAuth } from '@/providers/auth';
import { markJustOnboarded } from '@/onboardingSignal';
import {
  clearOnboardingDraft,
  readOnboardingDraft,
  writeOnboardingDraft,
} from '@/onboardingDraft';
import { StepAccount } from './StepAccount';
import { StepClusters } from './StepClusters';
import { StepServices } from './StepServices';
import { StepTasteSummary } from './StepTasteSummary';
import { StepWatchedGrid, watchedKey } from './StepWatchedGrid';

// Onboarding container (NATIVE-3) — 5-step flow matching the
// V2 Onboarding screenshots. Holds all collected data; each step owns
// its own scroll + CTA. Steps 3–5 are placeholders here; W3–W5 fill
// them, W6 wires completion (taste bootstrap) + analytics.

const STEP_TITLES = [
  'Create Account',
  'Connect Services',
  'Your Watch History',
  'Your Tastes',
  'Fine-Tune',
] as const;
const TOTAL = STEP_TITLES.length;
const TOTAL_ROUNDS = 3;

export function OnboardingFlow() {
  const router = useRouter();
  const { session, signOut } = useAuth();

  // Restore any in-progress draft synchronously on first render (beta
  // feedback 2026-07-09). The (tabs) guard remounts this flow whenever
  // onboarding isn't complete — e.g. after an auth session restore — and
  // without a draft that remount wiped every selection and reset the step
  // to `session ? 1 : 0`, which is exactly the founder's "back to step 2,
  // services gone" loop. readOnboardingDraft() is sync (MMKV), so restore
  // lands in the initial state with no flash.
  const draftRef = useRef(readOnboardingDraft());
  const draft = draftRef.current;

  // The lowest reachable step: once a session exists, account creation
  // (step 0) is behind us, so back stops at step 1. This is the back-button
  // floor and is independent of the restored current step below.
  const floorStep = session ? 1 : 0;
  // Never below the floor (Growth S3): a provider sign-in on /auth arrives
  // here signed in, and a draft left by a signed-out visit may still point at
  // the account step. Such a person continues from Connect Services.
  const startStep = Math.max(draft?.step ?? floorStep, floorStep);
  const [step, setStep] = useState(startStep);

  // Collected data (consumed by completion) — seeded from the draft if one
  // exists so a resume keeps every prior selection.
  const [ageRange, setAgeRange] = useState<string | null>(draft?.ageRange ?? null);
  const [viewingContext, setViewingContext] = useState<string | null>(draft?.viewingContext ?? null);
  const [services, setServices] = useState<ServiceId[]>(draft?.services ?? []);
  const [channels, setChannels] = useState<string[]>(draft?.channels ?? []);
  const [watchedKeys, setWatchedKeys] = useState<Set<string>>(
    () => new Set(draft?.watchedKeys ?? []),
  );
  const [watchedRound, setWatchedRound] = useState(draft?.watchedRound ?? 0);
  const [watchedOffset, setWatchedOffset] = useState(draft?.watchedOffset ?? 0);
  const [selectedClusters, setSelectedClusters] = useState<string[]>(draft?.selectedClusters ?? []);
  const [sliders, setSliders] = useState<SliderState>(draft?.sliders ?? DEFAULT_SLIDERS);
  // Growth S3 follow-up (IN-GR-011): the address a confirmation email went to,
  // while Step 1 shows "Check your email". Memory only: a person who leaves
  // signs in after confirming and resumes from Connect Services.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const { complete, submitting } = useCompleteOnboarding();
  const markOnboardingComplete = useMarkOnboardingComplete();

  // A1 (roadmap 0.2): stamp the onboarding start time locally so total
  // duration is real, not the hardcoded 0 production has been logging. The
  // draft preserves the ORIGINAL start across resumes so a founder-style
  // exit-and-return doesn't reset the clock and inflate the duration.
  const onboardingStartRef = useRef(draft?.startedAt ?? Date.now());
  const startedLoggedRef = useRef(draft?.startedLogged ?? false);

  // Mirror collected state into the draft on every change so an exit at any
  // point can be resumed. Kept as one effect over the whole snapshot — MMKV
  // writes are cheap and synchronous.
  useEffect(() => {
    writeOnboardingDraft({
      startedAt: onboardingStartRef.current,
      startedLogged: startedLoggedRef.current,
      step,
      ageRange,
      viewingContext,
      services,
      channels,
      watchedKeys: [...watchedKeys],
      watchedRound,
      watchedOffset,
      selectedClusters,
      sliders,
    });
  }, [step, ageRange, viewingContext, services, channels, watchedKeys, watchedRound, watchedOffset, selectedClusters, sliders]);

  // Fire `onboarding_started` once a session exists: immediately for a
  // resumed onboarding (session present at mount) or right after signUp
  // for a fresh account (session flips non-null post-auth). The draft's
  // `startedLogged` flag makes this survive remounts — without it, every
  // resume would re-fire the event and corrupt the funnel's start count.
  useEffect(() => {
    if (startedLoggedRef.current) return;
    if (!session?.user?.id) return;
    startedLoggedRef.current = true;
    writeOnboardingDraft({ startedLogged: true });
    void logOnboardingEvent(ONBOARDING_EVENTS.ONBOARDING_STARTED, {});
  }, [session]);

  // The confirmation link (confirm-email.tsx) signs the person in while
  // "Check your email" is showing: carry on to Connect Services.
  useEffect(() => {
    if (!pendingEmail || !session) return;
    setPendingEmail(null);
    setStep((s) => Math.max(s, 1));
  }, [pendingEmail, session]);

  const toggleCluster = (id: string) =>
    setSelectedClusters((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const onFinish = async () => {
    const watchedTitles = [...watchedKeys].map((key) => {
      const [mt, id] = key.split('-');
      return { tmdbId: parseInt(id, 10), mediaType: mt as 'movie' | 'tv' };
    });
    const completedUserId = await complete({ services, channels, clusters: selectedClusters, watchedTitles, sliders, ageRange, viewingContext });
    if (completedUserId) {
      void logOnboardingEvent(ONBOARDING_EVENTS.ONBOARDING_COMPLETED, {
        total_duration_seconds: Math.round((Date.now() - onboardingStartRef.current) / 1000),
      });
      // Hand the "just onboarded" bit to Home so it fires first_home_view
      // once — the onboarding tree unmounts on the replace() below.
      markJustOnboarded();
      // Draft is done — clear it so a fresh future onboarding starts clean.
      clearOnboardingDraft();
      // Write completion INTO the guard's cache — complete() has already
      // awaited the server write, so this is truth. Invalidating instead
      // loses the race: the guard remounts on the cached/persisted `false`
      // and bounces the user back into onboarding (v2.1.2 device test).
      // Keyed on the id complete() authenticated with, NOT the context
      // session (which can momentarily be null while getUser() succeeds).
      markOnboardingComplete(completedUserId);
      // Route through the Curating interstitial, which holds until the first
      // For You payload resolves and then lands the user on For You (beta
      // feedback 2026-07-09). It also fires first_home_view now.
      // Growth S3: a provider sign-up still holds the 089 placeholder, so it
      // claims a name first and the prompt continues to Curating. Doing it
      // here, not in the (tabs) guard, keeps Curating's pending-link resume
      // from racing the guard's redirect.
      const nameChosen = await fetchUsernameChosen(completedUserId);
      router.replace(nameChosen ? '/curating' : { pathname: '/choose-username', params: { next: 'curating' } });
    } else {
      // complete() already logged the cause; without this the button just
      // silently does nothing on a dead connection (review 2026-07-12).
      Alert.alert(
        "Couldn't finish setup",
        'Check your connection and tap the button again — your answers are saved on this device.',
      );
    }
  };

  const watchedGrid = useWatchedGrid();
  const watchedPool = watchedGrid.data ?? [];
  const roundStart = watchedRound * TITLES_PER_ROUND + watchedOffset;
  const currentRoundTitles = watchedPool.slice(roundStart, roundStart + TITLES_PER_ROUND);

  const toggleWatched = (t: WatchedGridTitle) =>
    setWatchedKeys((prev) => {
      const nextSet = new Set(prev);
      const key = watchedKey(t);
      if (nextSet.has(key)) nextSet.delete(key);
      else nextSet.add(key);
      return nextSet;
    });
  const seeDifferentTitles = () =>
    setWatchedOffset((o) =>
      // Advance a page within the pool; wrap if we'd run past the end.
      roundStart + 2 * TITLES_PER_ROUND <= watchedPool.length ? o + TITLES_PER_ROUND : 0,
    );
  const nextWatchedRound = () => {
    if (watchedRound < TOTAL_ROUNDS - 1) {
      setWatchedRound((r) => r + 1);
      setWatchedOffset(0);
    } else {
      next();
    }
  };

  const canGoBack = step > floorStep;
  const goBack = () => {
    if (canGoBack) {
      setStep((s) => s - 1);
      return;
    }
    if (!session) {
      router.replace('/auth');
      return;
    }
    // Signed in (the account exists, so this is step 2): /auth would redirect
    // straight back here — session → (tabs) guard → not onboarded →
    // /onboarding, draft restores the step — which read as a dead Back
    // button (Joe, 2026-09-15). Offer to leave instead. Signing out wipes the
    // onboarding draft by design (clearLocalUserState — the draft is not
    // per-user, so the next account on the phone must not inherit it), so the
    // copy promises only what holds: the account stays, setup continues from
    // step 2 on the next sign-in.
    Alert.alert('Leave setup?', "You'll be signed out. Your account stays — sign in again any time to finish setting up.", [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          void signOut().then(() => router.replace('/auth'));
        },
      },
    ]);
  };
  const next = useCallback(() => setStep((s) => Math.min(s + 1, TOTAL - 1)), []);

  // A1: mid-funnel step events, mirroring the web flow (src/components/
  // OnboardingFlow.tsx goNext). Fired on the step's own "continue" so
  // the funnel query can measure per-step drop-off, not just completion.
  const onServicesContinue = () => {
    void logOnboardingEvent(ONBOARDING_EVENTS.SERVICES_COMPLETED, {
      service_count: services.length,
      services,
      channel_count: channels.length,
    });
    next();
  };
  const onClustersContinue = () => {
    void logOnboardingEvent(ONBOARDING_EVENTS.CLUSTERS_COMPLETED, {
      cluster_count: selectedClusters.length,
      clusters: selectedClusters,
    });
    next();
  };

  const onAccountCreated = (ageRange: string | null, viewingContext: string | null) => {
    setAgeRange(ageRange);
    setViewingContext(viewingContext);
    next();
  };

  // Keep the Step 1 answers (they persist in the draft) while waiting for the
  // confirmation link.
  const onConfirmationPending = (email: string, ageRange: string | null, viewingContext: string | null) => {
    setAgeRange(ageRange);
    setViewingContext(viewingContext);
    setPendingEmail(email);
  };

  // Growth S3: Apple/Google on Step 1. A new identity continues to Connect
  // Services like an email sign-up (the name prompt comes after onboarding).
  // An account that already finished onboarding (a returning user, or a
  // provider identity auto-linked to an email account) must not go through
  // it again, which would overwrite its taste profile: hand it back to /auth
  // when that is beneath us (its focus effect replaces to / and resumes a
  // pending link), else straight to the tabs.
  const onProviderSignedIn = async (userId: string, ageRange: string | null, viewingContext: string | null) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      // Unknown: let the (tabs) guard decide; it has a retry state.
      router.replace('/');
      return;
    }
    if (data?.onboarding_completed) {
      markOnboardingComplete(userId);
      clearOnboardingDraft();
      if (router.canDismiss()) router.dismissAll();
      else router.replace('/');
      return;
    }
    onAccountCreated(ageRange, viewingContext);
  };

  const toggleService = (id: ServiceId) =>
    setServices((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  const toggleChannel = (id: string) =>
    setChannels((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  const selectAllServices = () =>
    setServices((prev) =>
      prev.length === ALL_SERVICE_IDS.length ? [] : [...ALL_SERVICE_IDS],
    );

  const segments = useMemo(() => Array.from({ length: TOTAL }, (_, i) => i <= step), [step]);

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      {/* Progress chrome */}
      <View className="px-5 pt-2">
        <View className="flex-row gap-1.5">
          {segments.map((filled, i) => (
            <View
              key={i}
              className={filled ? 'h-[3px] flex-1 rounded-full bg-primary' : 'h-[3px] flex-1 rounded-full bg-border'}
            />
          ))}
        </View>
        <View className="mt-2 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={goBack}
              className="h-8 w-8 items-center justify-center rounded-full bg-card active:bg-secondary">
              <ArrowLeft size={16} color="#f5f1e8" />
            </Pressable>
            <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
              Step {step + 1} · {STEP_TITLES[step]}
            </Text>
          </View>
          <Text className="font-sans-medium text-meta text-muted-foreground">
            {step + 1}/{TOTAL}
          </Text>
        </View>
      </View>

      {/* Step content (each step owns its scroll + CTA) */}
      <Animated.View key={step} entering={FadeIn.duration(220)} className="flex-1">
        {step === 0 ? (
          <StepAccount
            onAccountCreated={onAccountCreated}
            onProviderSignedIn={(userId, a, v) => void onProviderSignedIn(userId, a, v)}
            pendingEmail={pendingEmail}
            onConfirmationPending={onConfirmationPending}
            onChangeEmail={() => setPendingEmail(null)}
          />
        ) : step === 1 ? (
          <StepServices
            selected={services}
            channels={channels}
            onToggle={toggleService}
            onToggleChannel={toggleChannel}
            onSelectAll={selectAllServices}
            onContinue={onServicesContinue}
          />
        ) : step === 2 ? (
          <StepWatchedGrid
            titles={currentRoundTitles}
            selectedKeys={watchedKeys}
            onToggle={toggleWatched}
            onSeeDifferent={seeDifferentTitles}
            onSkip={nextWatchedRound}
            onNext={nextWatchedRound}
            round={watchedRound}
            totalRounds={TOTAL_ROUNDS}
            loading={watchedGrid.isLoading}
          />
        ) : step === 3 ? (
          <StepClusters selected={selectedClusters} onToggle={toggleCluster} onContinue={onClustersContinue} />
        ) : (
          <StepTasteSummary
            selectedClusters={selectedClusters}
            watchedCount={watchedKeys.size}
            serviceCount={services.length}
            sliders={sliders}
            onSlidersChange={setSliders}
            onComplete={onFinish}
            submitting={submitting}
          />
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

