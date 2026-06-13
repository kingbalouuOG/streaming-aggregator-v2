import { useRouter } from 'expo-router';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/providers/auth';
import { StepAccount } from './StepAccount';

// Onboarding container (NATIVE-3 W1) — 5-step flow matching the
// V2 Onboarding screenshots: progress bar chrome + per-step content.
// Owns all collected data so the completion orchestration (W6) can run
// the taste bootstrap. Steps 2–5 are placeholders here; W2–W5 fill them.

const STEP_TITLES = [
  'Create Account',
  'Connect Services',
  'Your Watch History',
  'Your Tastes',
  'Fine-Tune',
] as const;
const TOTAL = STEP_TITLES.length;

export function OnboardingFlow() {
  const router = useRouter();
  const { session } = useAuth();

  // Already-signed-in users (resumed via the guard) skip account creation.
  const startStep = session ? 1 : 0;
  const [step, setStep] = useState(startStep);

  // Collected onboarding data (filled as steps are built).
  const [, setAgeRange] = useState<string | null>(null);
  const [, setViewingContext] = useState<string | null>(null);

  const canGoBack = step > startStep;
  const goBack = () => {
    if (canGoBack) setStep((s) => s - 1);
    else router.replace('/auth');
  };

  const next = () => setStep((s) => Math.min(s + 1, TOTAL - 1));

  const onAccountCreated = (ageRange: string | null, viewingContext: string | null) => {
    setAgeRange(ageRange);
    setViewingContext(viewingContext);
    next();
  };

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

      {/* Step content */}
      <Animated.View key={step} entering={FadeIn.duration(220)} className="flex-1">
        {step === 0 ? (
          <StepAccount onAccountCreated={onAccountCreated} />
        ) : (
          <PlaceholderStep title={STEP_TITLES[step]} onNext={next} isLast={step === TOTAL - 1} />
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

// Temporary stand-in for steps 2–5 until W2–W5 land. Keeps the flow
// navigable on device so Step 1 can be verified end-to-end.
function PlaceholderStep({
  title,
  onNext,
  isLast,
}: {
  title: string;
  onNext: () => void;
  isLast: boolean;
}) {
  const router = useRouter();
  return (
    <View className="flex-1 px-6">
      <View className="flex-1 items-center justify-center">
        <Text className="text-center font-display text-section text-foreground">{title}</Text>
        <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
          Coming in the next work item.
        </Text>
      </View>
      <Pressable
        onPress={isLast ? () => router.replace('/(tabs)') : onNext}
        className="mb-2 h-14 flex-row items-center justify-center gap-2 rounded-card bg-primary active:opacity-90">
        <Text className="font-sans-bold text-section text-white">
          {isLast ? 'Start exploring VIDEX' : 'Continue'}
        </Text>
        <ArrowRight size={20} color="#ffffff" />
      </Pressable>
    </View>
  );
}
