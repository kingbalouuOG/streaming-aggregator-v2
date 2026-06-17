import { Sparkles } from 'lucide-react-native';
import { Text, View } from 'react-native';

import type { SliderState } from '@/lib/taste-v2/types';

// "Your taste fingerprint" — a read-only display of the four taste sliders
// (web For You §2). The sliders themselves are edited in Profile → Tune;
// here they visualise the current fingerprint.

const SLIDERS: { key: keyof SliderState; label: string; left: string; right: string }[] = [
  { key: 'catalogueAge', label: 'Catalogue age', left: 'New', right: 'Any era' },
  { key: 'comfortZone', label: 'Comfort zone', left: 'Cosy', right: 'Surprise' },
  { key: 'contentMix', label: 'Content mix', left: 'Film', right: 'TV' },
  { key: 'variety', label: 'Variety', left: 'Focused', right: 'Lots' },
];

export function TasteFingerprint({ sliders }: { sliders: SliderState }) {
  return (
    <View className="mx-5 mt-6 rounded-card border border-border bg-card p-4">
      <View className="flex-row items-center gap-2.5">
        <View className="h-9 w-9 items-center justify-center rounded-md bg-primary-soft">
          <Sparkles size={18} color="#e85d25" />
        </View>
        <View className="flex-1">
          <Text className="font-title text-section text-foreground">Your taste fingerprint</Text>
          <Text className="mt-0.5 font-sans text-meta text-muted-foreground">
            Tune it in Profile → Recommendations.
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row flex-wrap">
        {SLIDERS.map((s) => {
          const pct = Math.max(0, Math.min(100, Math.round(sliders[s.key] * 100)));
          return (
            <View key={s.key} className="w-1/2 p-1.5">
              <View className="flex-row items-center justify-between">
                <Text className="font-sans-medium text-[10px] uppercase tracking-[0.4px] text-faint-foreground">
                  {s.left}
                </Text>
                <Text className="font-sans-medium text-[10px] uppercase tracking-[0.4px] text-faint-foreground">
                  {s.right}
                </Text>
              </View>
              <View className="mt-2 h-1 rounded-full bg-secondary">
                <View className="h-1 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                <View
                  className="absolute h-3 w-3 rounded-full bg-primary"
                  style={{ left: `${pct}%`, top: -4, marginLeft: -6 }}
                />
              </View>
              <Text className="mt-2 font-sans-medium text-meta text-muted-foreground">{s.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
