import { ScrollView, Pressable, Text, View } from 'react-native';

import {
  QUICK_FILTER_CATEGORIES,
  type QuickFilterCategory,
} from '@/state/quickFilter';

// "Browse by" chip strip — the quick filter on New and For You
// (recommendation 2026-09-08-002 §1.5).
//
// It used to be a set of five decorative pills that all routed to Browse.
// Now it filters the page in place, and its vocabulary changed with the
// meaning behind it: "Docs" became "Documentaries" (a genre on either media
// type, §1.1) and "Anime" was dropped, being a taste cluster and a mood room
// rather than a content type — it needs `original_language` + genre 16, and
// original_language is only populated on the Supabase path.
//
// `visible` is the data-driven visibility rule: the caller passes the
// categories its current payload can actually honour (≥ 8 matches), and
// anything else is not rendered. So a user whose taste vector never
// surfaces documentaries sees no Documentaries chip on For You but still
// sees one on New. "All" is always present. Omitting `visible` shows the
// full strip, which is the right behaviour before a payload has arrived.

interface BrowseChipsProps {
  active?: QuickFilterCategory;
  onSelect?: (category: QuickFilterCategory) => void;
  /** Categories worth offering. Omit to show them all. */
  visible?: readonly QuickFilterCategory[];
}

export function BrowseChips({ active = 'All', onSelect, visible }: BrowseChipsProps) {
  // The ACTIVE chip always renders, even when the payload no longer clears
  // the bar. A background refetch can drop a category below the threshold
  // while it is selected, and a chip disappearing out from under the filter
  // it is applying leaves the page filtered by an invisible control.
  const categories = QUICK_FILTER_CATEGORIES.filter(
    (cat) => !visible || cat === 'All' || cat === active || visible.includes(cat),
  );

  // A strip offering only "All" offers nothing — there is no second state
  // to move to, so it is a control that cannot be used.
  if (categories.length < 2) return null;

  return (
    <View className="mt-7">
      <Text className="px-5 font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
        Browse by
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, gap: 8 }}>
        {categories.map((cat) => {
          const isActive = cat === active;
          return (
            <Pressable
              key={cat}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`Filter by ${cat}`}
              onPress={onSelect ? () => onSelect(cat) : undefined}
              className={
                isActive
                  ? 'rounded-pill border border-primary-edge bg-primary-soft px-4 py-2'
                  : 'rounded-pill border border-border bg-card px-4 py-2 active:bg-secondary'
              }>
              <Text
                className={
                  isActive
                    ? 'font-sans-bold text-body text-primary'
                    : 'font-sans-medium text-body text-muted-foreground'
                }>
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
