import { Heart, Leaf, Moon, SlidersHorizontal, Zap } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DEFAULT_FILTERS, type BrowseFilters } from './browseFilters';

// Browse empty state (web BrowsePage artboard 01) — shown before the user
// types or applies a filter. Two journeys: the orange "Build your search"
// CTA (opens FilterSheet for a filter-only /discover browse) and a 2×2 mood
// grid. On web the moods seed a semantic query; native has no semantic
// search, so each mood maps to a filter PRESET that drives the same
// /discover path. Recents are web-only (no native recent-search store yet).

const ATM = { teal: '#0d9488', amber: '#d97706', violet: '#7c3aed', rose: '#be185d' };

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export interface Mood {
  key: string;
  label: string;
  sub: string;
  hue: string;
  icon: ReactNode;
  /** Filter preset used when the semantic flag is OFF (the fallback). */
  preset: BrowseFilters;
  /** Natural-language phrase fed to vector search when the flag is ON. */
  phrase: string;
}

// Presets build on DEFAULT_FILTERS — genre-led (discover's strength) with
// runtime where it reads honestly. `phrase` is the richer description handed
// to semantic search when the `search_semantic` flag is on (so the embedding
// captures the vibe, not just a two-word label).
const MOODS: Mood[] = [
  {
    key: 'slow',
    label: 'Slow burn',
    sub: 'Long & absorbing',
    hue: ATM.teal,
    icon: <Leaf size={14} color={ATM.teal} strokeWidth={2} />,
    preset: { ...DEFAULT_FILTERS, genres: ['Drama'], runtime: 'over_120' },
    phrase:
      'an understated, meditative drama that unfolds gradually and rewards your attention — thoughtful, restrained, character-driven and emotionally rich',
  },
  {
    key: 'quick',
    label: 'High-energy',
    sub: 'Fast & thrilling',
    hue: ATM.amber,
    icon: <Zap size={14} color={ATM.amber} strokeWidth={2} />,
    preset: { ...DEFAULT_FILTERS, genres: ['Action', 'Comedy'] },
    phrase:
      'an exciting, high-energy crowd-pleaser — thrilling, entertaining and effortless to enjoy, an adrenaline-fuelled popcorn film',
  },
  {
    key: 'late',
    label: 'Late-night',
    sub: 'Strange & dark',
    hue: ATM.violet,
    icon: <Moon size={14} color={ATM.violet} strokeWidth={2} />,
    preset: { ...DEFAULT_FILTERS, genres: ['Horror', 'Mystery', 'Thriller'] },
    phrase:
      'an eerie, unsettling and atmospheric horror or thriller — creepy, ominous, mysterious, tense and haunting',
  },
  {
    key: 'comfort',
    label: 'Comfort',
    sub: 'Easy & warm',
    hue: ATM.rose,
    icon: <Heart size={14} color={ATM.rose} strokeWidth={2} />,
    preset: { ...DEFAULT_FILTERS, genres: ['Comedy', 'Romance', 'Family'] },
    phrase:
      'a heartwarming, gentle and uplifting film — sweet, charming, tender and reassuring, an easy and soothing watch',
  },
];

export function BrowsePresearch({
  onBuild,
  onMood,
}: {
  onBuild: () => void;
  onMood: (mood: Mood) => void;
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

      {/* Mood grid — 2×2, each chip applies a filter preset */}
      <View className="mt-8">
        <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
          Or start with a feeling
        </Text>
        <Text className="mt-1 font-sans-medium text-[11px] text-faint-foreground">Tap to set the mood.</Text>

        <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
          {MOODS.map((m) => (
            <Pressable
              key={m.key}
              onPress={() => onMood(m)}
              className="flex-row items-center gap-2.5 rounded-[14px] active:opacity-80"
              style={{
                width: '48%',
                paddingVertical: 10,
                paddingHorizontal: 14,
                backgroundColor: hexToRgba(m.hue, 0.1),
                borderWidth: 0.5,
                borderColor: hexToRgba(m.hue, 0.44),
              }}>
              <View
                className="items-center justify-center rounded-lg"
                style={{ width: 28, height: 28, backgroundColor: hexToRgba(m.hue, 0.19) }}>
                {m.icon}
              </View>
              <View className="flex-1">
                <Text numberOfLines={1} className="font-sans-bold text-[13px] text-foreground">
                  {m.label}
                </Text>
                <Text numberOfLines={1} className="mt-0.5 font-sans-medium text-[10px]" style={{ color: m.hue }}>
                  {m.sub}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
