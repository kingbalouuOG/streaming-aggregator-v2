import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCompleteOnboarding } from '@/hooks/useCompleteOnboarding';
import { useInvalidateOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { useWatchedGrid, TITLES_PER_ROUND, type WatchedGridTitle } from '@/hooks/useWatchedGrid';
import { ONBOARDING_EVENTS } from '@/lib/analytics/events';
import { logOnboardingEvent } from '@/lib/analytics/logger';
import type { ServiceId } from '@/lib/types/content';
import { DEFAULT_SLIDERS, type SliderState } from '@/lib/taste-v2/types';
import { useAuth } from '@/providers/auth';
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
  const { session } = useAuth();

  const startStep = session ? 1 : 0;
  const [step, setStep] = useState(startStep);

  // Collected data (consumed by completion).
  const [ageRange, setAgeRange] = useState<string | null>(null);
  const [viewingContext, setViewingContext] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceId[]>([]);
  const [watchedKeys, setWatchedKeys] = useState<Set<string>>(new Set());
  const [watchedRound, setWatchedRound] = useState(0);
  const [watchedOffset, setWatchedOffset] = useState(0);
  const [selectedClusters, setSelectedClusters] = useState<string[]>([]);
  const [sliders, setSliders] = useState<SliderState>(DEFAULT_SLIDERS);

  const { complete, submitting } = useCompleteOnboarding();
  const invalidateOnboarding = useInvalidateOnboardingStatus();

  useEffect(() => {
    void logOnboardingEvent(ONBOARDING_EVENTS.ONBOARDING_STARTED, {});
  }, []);

  const toggleCluster = (id: string) =>
    setSelectedClusters((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const onFinish = async () => {
    const watchedTitles = [...watchedKeys].map((key) => {
      const [mt, id] = key.split('-');
      return { tmdbId: parseInt(id, 10), mediaType: mt as 'movie' | 'tv' };
    });
    const ok = await complete({ services, clusters: selectedClusters, watchedTitles, sliders, ageRange, viewingContext });
    if (ok) {
      void logOnboardingEvent(ONBOARDING_EVENTS.ONBOARDING_COMPLETED, { total_duration_seconds: 0 });
      await invalidateOnboarding();
      router.replace('/(tabs)');
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

  const canGoBack = step > startStep;
  const goBack = () => {
    if (canGoBack) setStep((s) => s - 1);
    else router.replace('/auth');
  };
  const next = useCallback(() => setStep((s) => Math.min(s + 1, TOTAL - 1)), []);

  const onAccountCreated = (ageRange: string | null, viewingContext: string | null) => {
    setAgeRange(ageRange);
    setViewingContext(viewingContext);
    next();
  };

  const toggleService = (id: ServiceId) =>
    setServices((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  const selectAllServices = () =>
    setServices((prev) =>
      prev.length === ALL_SERVICES.length ? [] : [...ALL_SERVICES],
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
          <StepAccount onAccountCreated={onAccountCreated} />
        ) : step === 1 ? (
          <StepServices
            selected={services}
            onToggle={toggleService}
            onSelectAll={selectAllServices}
            onContinue={next}
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
          <StepClusters selected={selectedClusters} onToggle={toggleCluster} onContinue={next} />
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

const ALL_SERVICES: ServiceId[] = [
  'netflix',
  'prime',
  'disney',
  'bbc',
  'itvx',
  'channel4',
  'now',
  'skygo',
  'apple',
  'paramount',
];
