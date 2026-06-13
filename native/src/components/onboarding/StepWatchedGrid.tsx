import { Image } from 'expo-image';
import { ArrowRight, Check, RefreshCw } from 'lucide-react-native';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import type { WatchedGridTitle } from '@/hooks/useWatchedGrid';

// Onboarding Step 3 — "What have you watched?" (matches Step 3.png).
// 3-col × 2-row poster grid, orange-ring selection, "See different
// titles" + skip, Next round / Continue.

export function watchedKey(t: { mediaType: string; tmdbId: number }) {
  return `${t.mediaType}-${t.tmdbId}`;
}

interface StepWatchedGridProps {
  titles: WatchedGridTitle[];
  selectedKeys: Set<string>;
  onToggle: (t: WatchedGridTitle) => void;
  onSeeDifferent: () => void;
  onSkip: () => void;
  onNext: () => void;
  round: number; // 0-based
  totalRounds: number;
  loading: boolean;
}

export function StepWatchedGrid({
  titles,
  selectedKeys,
  onToggle,
  onSeeDifferent,
  onSkip,
  onNext,
  round,
  totalRounds,
  loading,
}: StepWatchedGridProps) {
  const selectedThisView = titles.filter((t) => selectedKeys.has(watchedKey(t))).length;
  const isLastRound = round >= totalRounds - 1;

  return (
    <View className="flex-1 px-5 pt-3">
      <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary-on-soft">
        Round {round + 1} of {totalRounds}
      </Text>
      <Text className="mt-1 font-display-black text-headline text-foreground">
        What have you watched?
      </Text>
      <Text className="mt-1 font-sans text-body text-muted-foreground">
        Tick the ones you&apos;ve seen
      </Text>

      {/* Grid */}
      <View className="mt-4 flex-1">
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#e85d25" />
          </View>
        ) : (
          <View className="flex-row flex-wrap">
            {titles.map((t) => {
              const sel = selectedKeys.has(watchedKey(t));
              return (
                <View key={watchedKey(t)} className="w-1/3 p-1.5">
                  <Pressable onPress={() => onToggle(t)} className="active:opacity-80">
                    <View
                      className={
                        sel
                          ? 'overflow-hidden rounded-card border-2 border-primary'
                          : 'overflow-hidden rounded-card border-2 border-transparent'
                      }>
                      <Image
                        source={t.poster ? { uri: t.poster } : undefined}
                        style={{ width: '100%', aspectRatio: 2 / 3 }}
                        contentFit="cover"
                        transition={150}
                        recyclingKey={watchedKey(t)}
                      />
                      {sel ? (
                        <View className="absolute right-1.5 top-1.5 h-6 w-6 items-center justify-center rounded-full bg-primary">
                          <Check size={14} color="#ffffff" strokeWidth={3} />
                        </View>
                      ) : null}
                    </View>
                    <Text
                      numberOfLines={1}
                      className={
                        sel
                          ? 'mt-1.5 font-sans-medium text-[11px] text-primary-on-soft'
                          : 'mt-1.5 font-sans text-[11px] text-muted-foreground'
                      }>
                      {t.title}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Controls */}
      <View className="flex-row gap-2 pt-1">
        <Pressable
          onPress={onSeeDifferent}
          className="flex-1 flex-row items-center justify-center gap-2 rounded-card border border-border bg-card py-3 active:bg-secondary">
          <RefreshCw size={15} color="rgba(245,241,232,0.62)" />
          <Text className="font-sans-medium text-body text-muted-foreground">See different titles</Text>
        </Pressable>
        {selectedThisView > 0 ? (
          <View className="h-11 min-w-11 items-center justify-center rounded-card bg-primary-soft px-3">
            <Text className="font-sans-bold text-body text-primary-on-soft">{selectedThisView}</Text>
          </View>
        ) : null}
      </View>

      <Pressable onPress={onSkip} className="items-center py-2.5">
        <Text className="font-sans text-meta text-muted-foreground">
          None of these — skip this round
        </Text>
      </Pressable>

      <Pressable
        onPress={onNext}
        className="mb-2 h-14 flex-row items-center justify-center gap-2 rounded-card bg-primary active:opacity-90">
        <Text className="font-sans-bold text-section text-white">
          {isLastRound ? 'Continue' : 'Next round'}
        </Text>
        <ArrowRight size={20} color="#ffffff" />
      </Pressable>
    </View>
  );
}
