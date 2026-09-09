import {
  Check,
  Clock,
  Heart,
  Leaf,
  Moon,
  SlidersHorizontal,
  Sparkles,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';

// Browse empty state — shown before the user types or applies a filter. Two
// journeys: the orange "Build your search" CTA (opens FilterSheet for a
// filter-only /discover browse) and a 2×2 grid of preset intents.
//
// The grid is four cards drawn from a pool of eight (recommendation
// 2026-09-08-002 §2.3–2.4). Which four is `selectPresets`' decision, in the
// shared tree where it is under test; this file only paints them. Each card
// carries BOTH a semantic `phrase` (used when the `search_semantic` flag is
// on) and a `filters` patch (the flag-off fallback) — see useSemanticSearch +
// browse.tsx.
//
// The card subtitle stays the two-word `sub` rather than the full sentence:
// at 48% of a phone's width a sentence truncates to nothing useful. The
// sentences reach the user through the rotating search placeholder instead,
// which is the always-visible on-ramp §8.2 asks for. Recents are web-only (no
// native recent-search store yet).

export type { Preset, SelectedPreset } from '@/lib/content/presets';
import type { SelectedPreset } from '@/lib/content/presets';

/** Icon name → component. The one part of a preset that cannot live in the
 *  shared tree, since the shared tree must stay importable by the Worker. */
const ICONS: Record<string, LucideIcon> = {
  leaf: Leaf,
  zap: Zap,
  moon: Moon,
  heart: Heart,
  sparkles: Sparkles,
  check: Check,
  clock: Clock,
  users: Users,
};

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function BrowsePresearch({
  presets,
  onBuild,
  onPreset,
}: {
  presets: SelectedPreset[];
  onBuild: () => void;
  onPreset: (preset: SelectedPreset) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}>
      {/* Build-your-search CTA — the larger journey, intentional orange weight */}
      <Pressable
        onPress={onBuild}
        className="rounded-lg bg-primary active:opacity-90"
        style={{ paddingVertical: 20, paddingHorizontal: 22 }}>
        <View className="flex-row items-center gap-3">
          <SlidersHorizontal size={20} color="#ffffff" strokeWidth={2} />
          <Text className="font-display-bold text-white" style={{ fontSize: 19, letterSpacing: -0.2 }}>
            Build your search
          </Text>
        </View>
        <Text className="mt-1.5 font-sans-medium text-[12px] leading-4 text-white/85" style={{ marginLeft: 32 }}>
          Pick service, type, genre, rating, runtime — apply to browse the matches.
        </Text>
      </Pressable>

      {/* Preset grid — 2×2, two vibe cards then two constraint cards */}
      <View className="mt-8">
        <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
          Or just say what you want
        </Text>
        <Text className="mt-1 font-sans-medium text-[11px] text-faint-foreground">
          Four picked for tonight. Tap one, then refine.
        </Text>

        <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
          {presets.map((p) => {
            const Icon = ICONS[p.icon] ?? Sparkles;
            return (
              <Pressable
                key={p.key}
                onPress={() => onPreset(p)}
                accessibilityRole="button"
                accessibilityLabel={p.sentence}
                className="flex-row items-center gap-2.5 rounded-[14px] active:opacity-80"
                style={{
                  width: '48%',
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  backgroundColor: hexToRgba(p.hue, 0.1),
                  borderWidth: 0.5,
                  borderColor: hexToRgba(p.hue, 0.44),
                }}>
                <View
                  className="items-center justify-center rounded-lg"
                  style={{ width: 28, height: 28, backgroundColor: hexToRgba(p.hue, 0.19) }}>
                  <Icon size={14} color={p.hue} strokeWidth={2} />
                </View>
                <View className="flex-1">
                  <Text numberOfLines={1} className="font-sans-bold text-[13px] text-foreground">
                    {p.label}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="mt-0.5 font-sans-medium text-[10px]"
                    style={{ color: p.hue }}>
                    {p.sub}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}
