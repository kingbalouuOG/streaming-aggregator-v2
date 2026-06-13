import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import type { ContentItem } from '@/lib/types/content';

// Flexible-width 2:3 poster card for 2-column grids (Browse, Watchlist).
// Differs from PosterCard (fixed 160px, horizontal rows) by filling its
// grid column.

export function PosterGridCard({
  item,
  onPress,
}: {
  item: ContentItem;
  onPress: (item: ContentItem) => void;
}) {
  return (
    <Pressable onPress={() => onPress(item)} className="flex-1 p-1.5 active:opacity-80">
      <View className="overflow-hidden rounded-card bg-card">
        <Image
          source={item.image ? { uri: item.image } : undefined}
          style={{ width: '100%', aspectRatio: 2 / 3 }}
          contentFit="cover"
          transition={200}
          recyclingKey={item.id}
        />
      </View>
      <Text numberOfLines={1} className="mt-2 font-sans-bold text-body text-foreground">
        {item.title}
      </Text>
      <Text numberOfLines={1} className="mt-0.5 font-sans text-meta text-muted-foreground">
        {[item.year, item.type === 'tv' ? 'TV' : item.type === 'doc' ? 'Doc' : 'Film']
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Pressable>
  );
}
