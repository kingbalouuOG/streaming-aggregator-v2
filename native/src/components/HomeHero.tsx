import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';

import type { ContentItem } from '@/lib/types/content';

// Editorial hero — 16:9 backdrop with a bottom scrim. Plain rgba
// overlay stands in for the web's CSS gradient until a gradient dep
// earns its place (NATIVE-2 polish).

interface HomeHeroProps {
  item: ContentItem;
  onPress?: (item: ContentItem) => void;
}

export function HomeHero({ item, onPress }: HomeHeroProps) {
  return (
    <Pressable onPress={onPress ? () => onPress(item) : undefined} className="active:opacity-90">
      <View className="overflow-hidden rounded-b-xl bg-card">
        <Image
          source={{ uri: item.backdrop || item.image }}
          style={{ width: '100%', aspectRatio: 16 / 9 }}
          contentFit="cover"
          transition={300}
        />
        <View className="absolute inset-x-0 bottom-0 bg-background/80 px-5 pb-4 pt-3">
          <Text className="text-kicker font-bold uppercase tracking-widest text-primary-on-soft">
            Tonight&apos;s pick
          </Text>
          <Text numberOfLines={1} className="mt-1 font-display text-title text-foreground">
            {item.title}
          </Text>
          <Text numberOfLines={1} className="mt-1 text-meta text-muted-foreground">
            {[item.year, item.genre, item.rating ? `★ ${item.rating.toFixed(1)}` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
