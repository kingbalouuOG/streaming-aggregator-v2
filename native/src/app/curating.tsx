import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ONBOARDING_EVENTS } from '@/lib/analytics/events';
import { logOnboardingEvent } from '@/lib/analytics/logger';
import { useForYou } from '@/hooks/useForYou';
import { consumeJustOnboarded } from '@/onboardingSignal';

// Post-onboarding interstitial (beta feedback 2026-07-09). After
// completing onboarding we now land on For You (not Home/New), so this
// screen bridges the gap: it holds an on-brand editorial "curating"
// moment until the first For You payload resolves, then replaces to the
// For You tab. Restrained motion — a single slow kicker fade that respects
// reduce-motion; no bare spinner.
//
// It also owns the `first_home_view` funnel event: onboarding now hands the
// "just onboarded" bit here (via onboardingSignal), we fire the event once
// the payload lands, then hand OFF to For You. The event NAME is unchanged
// for funnel continuity even though the landing surface moved Home → For You
// (documented in the PR + wiki).

const AnimatedView = Animated.View;

// Safety valve: never trap the user on the interstitial. If the Worker is
// slow or errors, proceed to For You after this — the tab shows its own
// skeleton / retry state, which is a better place to wait than here.
const MAX_HOLD_MS = 6000;

export default function CuratingScreen() {
  const router = useRouter();
  const { data, isLoading, isError } = useForYou();
  const [reduceMotion, setReduceMotion] = useState(false);
  const navigatedRef = useRef(false);
  const firstViewLoggedRef = useRef(false);
  const justOnboardedRef = useRef<boolean | null>(null);

  // Snapshot the one-shot "just onboarded" bit exactly once on mount, before
  // any consumer downstream can take it. Deciding whether first_home_view
  // should fire is our job now (landing moved off Home).
  if (justOnboardedRef.current === null) {
    justOnboardedRef.current = consumeJustOnboarded();
  }

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => mounted && setReduceMotion(v))
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Slow breathing fade on the kicker. Skipped entirely under reduce-motion
  // (opacity pinned to full).
  const pulse = useSharedValue(reduceMotion ? 1 : 0.45);
  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [reduceMotion, pulse]);

  const kickerStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const goToForYou = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    // Fire first_home_view once, if this session came straight from
    // onboarding. Kept the event name for funnel continuity.
    if (justOnboardedRef.current && !firstViewLoggedRef.current) {
      firstViewLoggedRef.current = true;
      const sectionCount = data
        ? [
            (data.recommendedForYou?.length ?? 0) > 0,
            (data.hiddenGems?.length ?? 0) > 0,
            (data.becauseYouWatched?.length ?? 0) > 0,
            (data.fromYourWatchlist?.length ?? 0) > 0,
            (data.outsideYourUsual?.length ?? 0) > 0,
          ].filter(Boolean).length
        : 0;
      void logOnboardingEvent(ONBOARDING_EVENTS.FIRST_HOME_VIEW, {
        has_taste_vector: true,
        section_count: sectionCount,
      });
    }
    router.replace('/(tabs)/foryou');
  };

  // Advance as soon as the payload resolves (data present, or a definitive
  // error — For You's own retry state handles the error case).
  useEffect(() => {
    if (isLoading) return;
    if (data || isError) goToForYou();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, data, isError]);

  // Absolute backstop so a hung Worker can't strand the user here.
  useEffect(() => {
    const t = setTimeout(goToForYou, MAX_HOLD_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-background px-10">
      <AnimatedView entering={reduceMotion ? undefined : FadeIn.duration(320)} className="items-center">
        <AnimatedView style={kickerStyle}>
          <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">
            One moment
          </Text>
        </AnimatedView>
        <Text className="mt-3 text-center font-display text-headline text-foreground">
          Curating your Videx.
        </Text>
        <View className="mt-3 h-px w-10 bg-border" />
        <Text className="mt-3 text-center font-sans text-body text-muted-foreground">
          Setting up recommendations from everything you told us.
        </Text>
      </AnimatedView>
    </SafeAreaView>
  );
}
