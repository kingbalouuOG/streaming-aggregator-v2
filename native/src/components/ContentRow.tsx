import { Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import type { ContentItem } from '@/lib/types/content';
import { PosterCard } from './PosterCard';

// Horizontal poster carousel — native counterpart of the web
// ContentRow. FlashList v2 recycles native views; the web version's
// IntersectionObserver/scroll-restoration machinery has no equivalent
// here because recycling IS the optimisation.

interface ContentRowProps {
  title: string;
  kicker?: string;
  items: ContentItem[];
  onItemPress?: (item: ContentItem) => void;
}

export function ContentRow({ title, kicker, items, onItemPress }: ContentRowProps) {
  if (items.length === 0) return null;

  return (
    <View className="mt-7">
      {kicker ? (
        <Text className="px-5 font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary-on-soft">
          {kicker}
        </Text>
      ) : null}
      <Text className="mt-0.5 px-5 font-display-bold text-title text-foreground">{title}</Text>
      <FlashList
        horizontal
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PosterCard item={item} onPress={onItemPress} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12 }}
        ItemSeparatorComponent={Spacer}
      />
    </View>
  );
}

function Spacer() {
  return <View className="w-3" />;
}
