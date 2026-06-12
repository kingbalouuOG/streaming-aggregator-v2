import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';

import type { ContentItem } from '@/lib/types/content';

// Poster card — the "default" 160px variant from the web ContentCard
// (design-system.md §4), minus bookmark/impression wiring (NATIVE-2).
// expo-image gives memory+disk caching and a 200ms cross-fade in place
// of the web LQIP/ImageSkeleton pipeline.

interface PosterCardProps {
  item: ContentItem;
  onPress?: (item: ContentItem) => void;
}

export function PosterCard({ item, onPress }: PosterCardProps) {
  return (
    <Pressable
      onPress={onPress ? () => onPress(item) : undefined}
      className="w-[160px] active:opacity-80">
      <View className="overflow-hidden rounded-card bg-card">
        <Image
          source={item.image ? { uri: item.image } : undefined}
          style={{ width: 160, aspectRatio: 2 / 3 }}
          contentFit="cover"
          transition={200}
          recyclingKey={item.id}
        />
      </View>
      <Text numberOfLines={1} className="mt-2 text-body font-bold text-foreground">
        {item.title}
      </Text>
      <Text numberOfLines={1} className="mt-0.5 text-meta text-muted-foreground">
        {[item.year, item.genre].filter(Boolean).join(' · ')}
      </Text>
    </Pressable>
  );
}
