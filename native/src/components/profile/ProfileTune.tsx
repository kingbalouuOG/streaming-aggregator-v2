import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSliderState, saveSliderState } from '@/lib/taste-v2/tasteProfileV2';
import type { SliderState } from '@/lib/taste-v2/types';
import { SubScreenHeader } from './SubScreenHeader';

// Profile → Tune Recommendations (NATIVE-4 W2). Loads the saved sliders,
// edits them, Save → saveSliderState. Same config/captions as onboarding
// Step 5.
const CONFIG: { key: keyof SliderState; left: string; right: string }[] = [
  { key: 'catalogueAge', left: 'New releases', right: 'Best match, any age' },
  { key: 'comfortZone', left: 'Stick with what I like', right: 'Surprise me' },
  { key: 'contentMix', left: 'Films', right: 'TV Series' },
  { key: 'variety', left: 'Finish what I start', right: 'Try lots of things' },
];

const softLower = (s: string) => (s.length === 0 || /^[A-Z]{2}/.test(s) ? s : s[0].toLowerCase() + s.slice(1));
function caption(left: string, right: string, v: number) {
  if (Math.abs(v - 0.5) < 0.02) return 'Balanced';
  if (v < 0.3) return `Leaning ${softLower(left)}`;
  if (v > 0.7) return `Leaning ${softLower(right)}`;
  if (v < 0.5) return `Slightly prefer ${softLower(left)}`;
  return `Slightly prefer ${softLower(right)}`;
}

export function ProfileTune() {
  const router = useRouter();
  const [sliders, setSliders] = useState<SliderState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSliderState().then(setSliders);
  }, []);

  const save = async () => {
    if (!sliders || saving) return;
    setSaving(true);
    try {
      await saveSliderState(sliders);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  if (!sliders) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#e85d25" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <SubScreenHeader title="Tune Recommendations" />
      <ScrollView contentContainerClassName="px-5 pb-4 pt-2" showsVerticalScrollIndicator={false}>
        <Text className="font-sans text-body text-muted-foreground">
          Adjust how we pick for you.
        </Text>
        <View className="mt-5 gap-6">
          {CONFIG.map(({ key, left, right }) => (
            <View key={key}>
              <View className="mb-1 flex-row justify-between">
                <Text className="font-sans text-meta text-muted-foreground">{left}</Text>
                <Text className="font-sans text-meta text-muted-foreground">{right}</Text>
              </View>
              <Slider
                minimumValue={0}
                maximumValue={1}
                value={sliders[key]}
                onValueChange={(v) => setSliders((s) => (s ? { ...s, [key]: v } : s))}
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
      <View className="px-5 pb-2 pt-2">
        <Pressable
          onPress={save}
          disabled={saving}
          className="h-14 flex-row items-center justify-center rounded-card bg-primary active:opacity-90">
          {saving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="font-sans-bold text-section text-white">Save</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
