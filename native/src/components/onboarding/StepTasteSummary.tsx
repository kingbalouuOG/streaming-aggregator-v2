import Slider from '@react-native-community/slider';
import { Sparkles, Star } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { TASTE_CLUSTERS } from '@/lib/taste-v2/tasteClusters';
import type { SliderState } from '@/lib/taste-v2/types';

// Onboarding Step 5 — "Almost there 🎉" (matches Step 5.png). Summary
// card (prose + Genres/Titles/Services stats) + 4 sliders with
// "Leaning X" captions. Logic ported from web StepTasteSummary.

const SLIDER_CONFIG: { key: keyof SliderState; left: string; right: string }[] = [
  { key: 'catalogueAge', left: 'New releases', right: 'Best match, any age' },
  { key: 'comfortZone', left: 'Stick with what I like', right: 'Surprise me' },
  { key: 'contentMix', left: 'Films', right: 'TV Series' },
  { key: 'variety', left: 'Finish what I start', right: 'Try lots of things' },
];

const softLower = (s: string) => (s.length === 0 || /^[A-Z]{2}/.test(s) ? s : s[0].toLowerCase() + s.slice(1));

function caption(left: string, right: string, value: number) {
  if (Math.abs(value - 0.5) < 0.02) return 'Balanced';
  if (value < 0.3) return `Leaning ${softLower(left)}`;
  if (value > 0.7) return `Leaning ${softLower(right)}`;
  if (value < 0.5) return `Slightly prefer ${softLower(left)}`;
  return `Slightly prefer ${softLower(right)}`;
}

interface StepTasteSummaryProps {
  selectedClusters: string[];
  watchedCount: number;
  serviceCount: number;
  sliders: SliderState;
  onSlidersChange: (s: SliderState) => void;
  onComplete: () => void;
  submitting: boolean;
}

export function StepTasteSummary({
  selectedClusters,
  watchedCount,
  serviceCount,
  sliders,
  onSlidersChange,
  onComplete,
  submitting,
}: StepTasteSummaryProps) {
  const clusters = selectedClusters
    .map((id) => TASTE_CLUSTERS.find((c) => c.id === id))
    .filter(Boolean) as typeof TASTE_CLUSTERS;
  const top = clusters.slice(0, 3);
  const summary =
    top.length >= 2
      ? `Your taste skews towards ${top.map((c) => c.name.toLowerCase()).join(', ')}, with ${top[0].adjective} preferences. We'll spread picks across your ${serviceCount} service${serviceCount !== 1 ? 's' : ''}.`
      : top.length === 1
        ? `Your taste skews towards ${top[0].name.toLowerCase()}, with ${top[0].adjective} preferences.`
        : 'Your taste profile is being built from your service selections.';

  return (
    <View className="flex-1">
      <ScrollView contentContainerClassName="px-5 pt-3 pb-4" showsVerticalScrollIndicator={false}>
        <Text className="font-display-black text-headline text-foreground">Almost there 🎉</Text>
        <Text className="mt-1 font-sans text-body text-muted-foreground">
          Tune how we serve your recommendations.
        </Text>

        {/* Summary card */}
        <View className="mt-4 rounded-card border border-primary-edge bg-primary-soft p-4">
          <View className="mb-2 flex-row items-start gap-3">
            <View className="h-8 w-8 items-center justify-center rounded-md bg-primary">
              <Sparkles size={16} color="#ffffff" />
            </View>
            <Text className="flex-1 font-sans text-body leading-relaxed text-foreground">{summary}</Text>
          </View>
          <View className="mt-2 flex-row justify-around">
            <Stat value={selectedClusters.length} label="Genres" />
            <Stat value={watchedCount} label="Titles" />
            <Stat value={serviceCount} label="Services" />
          </View>
        </View>

        {/* Sliders */}
        <Text className="mt-6 font-sans-bold text-section text-foreground">
          How should we pick for you?
        </Text>
        <View className="mt-3 gap-5">
          {SLIDER_CONFIG.map(({ key, left, right }) => (
            <View key={key}>
              <View className="mb-1 flex-row justify-between">
                <Text className="font-sans text-meta text-muted-foreground">{left}</Text>
                <Text className="font-sans text-meta text-muted-foreground">{right}</Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={1}
                value={sliders[key]}
                onValueChange={(v) => onSlidersChange({ ...sliders, [key]: v })}
                minimumTrackTintColor="#e85d25"
                maximumTrackTintColor="rgba(245,241,232,0.12)"
                thumbTintColor="#e85d25"
              />
              <Text className="mt-0.5 text-center font-sans-medium text-meta text-primary-on-soft">
                {caption(left, right, sliders[key])}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* CTA */}
      <View className="px-5 pb-2 pt-2">
        <Pressable
          onPress={onComplete}
          disabled={submitting}
          className="h-14 flex-row items-center justify-center gap-2 rounded-card bg-primary active:opacity-90">
          <Sparkles size={18} color="#ffffff" />
          <Text className="font-sans-bold text-section text-white">
            {submitting ? 'Setting up…' : 'Start exploring VIDEX'}
          </Text>
          {!submitting ? <Star size={16} color="#ffffff" fill="#ffffff" /> : null}
        </Pressable>
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View className="items-center">
      <Text className="font-display-bold text-title text-primary-on-soft">{value}</Text>
      <Text className="font-sans text-kicker text-muted-foreground">{label}</Text>
    </View>
  );
}
