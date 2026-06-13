import { ArrowRight, Check } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { GenreIconTile } from '@/components/GenreIconTile';
import { CLUSTER_GLYPHS } from '@/lib/constants/genreGlyphs';
import { MIN_CLUSTERS, TASTE_CLUSTERS } from '@/lib/taste-v2/tasteClusters';

// Onboarding Step 4 — "What do you love to watch?" (matches Step 4.png).
// 16 cluster cards (2-col) using the same custom GenreIconTile glyphs as
// the live app, orange-selected, "N selected" badge, pick ≥3.

interface StepClustersProps {
  selected: string[];
  onToggle: (id: string) => void;
  onContinue: () => void;
}

export function StepClusters({ selected, onToggle, onContinue }: StepClustersProps) {
  const selectedSet = new Set(selected);
  const canContinue = selected.length >= MIN_CLUSTERS;

  return (
    <View className="flex-1">
      <ScrollView contentContainerClassName="px-5 pt-3 pb-4" showsVerticalScrollIndicator={false}>
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="font-display-black text-headline text-foreground">
              What do you love to watch?
            </Text>
            <Text className="mt-1 font-sans text-body text-muted-foreground">
              Pick at least {MIN_CLUSTERS} genres.
            </Text>
          </View>
          {selected.length > 0 ? (
            <View className="mt-1 rounded-pill bg-primary px-2.5 py-1">
              <Text className="font-sans-bold text-meta text-white">{selected.length} selected</Text>
            </View>
          ) : null}
        </View>

        <View className="mt-4 flex-row flex-wrap">
          {TASTE_CLUSTERS.map((c) => {
            const isSel = selectedSet.has(c.id);
            return (
              <View key={c.id} className="w-1/2 p-1.5">
                <Pressable
                  onPress={() => onToggle(c.id)}
                  className={
                    isSel
                      ? 'flex-row items-center gap-2.5 rounded-card border border-primary bg-primary-soft p-3'
                      : 'flex-row items-center gap-2.5 rounded-card border border-border bg-card p-3 active:bg-secondary'
                  }>
                  <GenreIconTile glyph={CLUSTER_GLYPHS[c.id]} size={36} />
                  <Text
                    numberOfLines={2}
                    className={
                      isSel
                        ? 'flex-1 font-sans-bold text-meta text-primary-on-soft'
                        : 'flex-1 font-sans-medium text-meta text-muted-foreground'
                    }>
                    {c.name}
                  </Text>
                  {isSel ? (
                    <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
                      <Check size={12} color="#ffffff" strokeWidth={3} />
                    </View>
                  ) : (
                    <View className="h-5 w-5 rounded-full border-2 border-border" />
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* CTA */}
      <View className="px-5 pb-2 pt-2">
        <Pressable
          onPress={onContinue}
          disabled={!canContinue}
          className={
            canContinue
              ? 'h-14 flex-row items-center justify-center gap-2 rounded-card bg-primary active:opacity-90'
              : 'h-14 flex-row items-center justify-center gap-2 rounded-card bg-primary/40'
          }>
          <Text className="font-sans-bold text-section text-white">Continue</Text>
          <ArrowRight size={20} color="#ffffff" />
        </Pressable>
      </View>
    </View>
  );
}
