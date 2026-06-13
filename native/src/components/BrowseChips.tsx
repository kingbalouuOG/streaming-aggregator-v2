import { ScrollView, Pressable, Text, View } from 'react-native';

// "Browse by" chip strip — category pills matching the web Home.
// Taps route to Browse (filter wiring lands with the Browse screen).

const CATEGORIES = ['All', 'Movies', 'TV Shows', 'Docs', 'Anime'] as const;

interface BrowseChipsProps {
  active?: (typeof CATEGORIES)[number];
  onSelect?: (category: (typeof CATEGORIES)[number]) => void;
}

export function BrowseChips({ active = 'All', onSelect }: BrowseChipsProps) {
  return (
    <View className="mt-7">
      <Text className="px-5 font-sans-bold text-kicker uppercase tracking-[1.6px] text-muted-foreground">
        Browse by
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, gap: 8 }}>
        {CATEGORIES.map((cat) => {
          const isActive = cat === active;
          return (
            <Pressable
              key={cat}
              onPress={onSelect ? () => onSelect(cat) : undefined}
              className={
                isActive
                  ? 'rounded-pill bg-foreground px-4 py-2'
                  : 'rounded-pill border border-border bg-card px-4 py-2 active:bg-secondary'
              }>
              <Text
                className={
                  isActive
                    ? 'font-sans-bold text-body text-background'
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
