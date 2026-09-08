import { Pressable, Text, View } from 'react-native';

import { THIN_RAIL_MIN, type QuickFilterCategory } from '@/state/quickFilter';

// The two things a filtered page has to say for itself
// (recommendation 2026-09-08-002 §1.2).
//
// Filtering in place means rails vanish. Silently shrinking the page is the
// version that generates "where did my rows go?", so when rails hide we say
// which and why, and when EVERY rail hides we say so and offer a way out.
// Neither is decoration: they are what makes "the page is never blank" true.

/** Plural noun for the filtered thing, for use mid-sentence. */
const PLURAL: Record<Exclude<QuickFilterCategory, 'All'>, string> = {
  Movies: 'films',
  TV: 'series',
  Documentaries: 'documentaries',
};

/** How the empty state names the category. Written out so each reads naturally. */
const EMPTY_COPY: Record<Exclude<QuickFilterCategory, 'All'>, { headline: string; cta: string }> = {
  Movies: { headline: 'Not many films on your services this week', cta: 'Browse all films' },
  TV: { headline: 'Not much TV on your services this week', cta: 'Browse all TV' },
  Documentaries: {
    headline: 'Not many documentaries on your services this week',
    cta: 'Browse all documentaries',
  },
};

/**
 * The rule divider: "Upcoming · Free tonight hidden — fewer than 4 films".
 *
 * Names the rails rather than counting them, because "2 rows hidden" tells
 * you nothing about whether you are missing something you wanted.
 */
export function HiddenRailsNote({
  names,
  category,
}: {
  names: readonly string[];
  category: QuickFilterCategory;
}) {
  if (names.length === 0 || category === 'All') return null;

  return (
    <View className="mt-6 flex-row items-center gap-2.5 px-5">
      <View className="h-px flex-1 bg-border" />
      <Text
        numberOfLines={2}
        className="shrink font-sans-medium text-[11px] text-muted-foreground/60">
        {names.join(' · ')} hidden — fewer than {THIN_RAIL_MIN} {PLURAL[category]}
      </Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}

/**
 * Shown when every rail hides. One card, one action.
 *
 * The button is the ONLY place a chip is allowed to navigate, and only as an
 * explicit second tap (§1.2) — the chip itself always filters in place.
 */
export function QuickFilterEmptyState({
  category,
  onBrowse,
}: {
  category: QuickFilterCategory;
  onBrowse: () => void;
}) {
  if (category === 'All') return null;
  const copy = EMPTY_COPY[category];

  return (
    <View className="mx-5 mt-8 items-center rounded-card border border-border bg-card px-6 py-8">
      <Text className="text-center font-display text-section text-foreground">
        {copy.headline}
      </Text>
      <Text className="mt-2 text-center font-sans text-body text-muted-foreground">
        Try another category, or look beyond the shelf.
      </Text>
      <Pressable
        onPress={onBrowse}
        accessibilityRole="button"
        className="mt-5 rounded-card bg-primary px-5 py-3 active:opacity-90">
        <Text className="font-sans-bold text-body text-white">{copy.cta}</Text>
      </Pressable>
    </View>
  );
}
