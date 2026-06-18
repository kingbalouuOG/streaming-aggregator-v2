import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';

import { useItemServices } from '@/hooks/useItemServices';
import type { ContentItem } from '@/lib/types/content';
import { ServiceBadge } from './ServiceBadge';

// Editorial Spotlight — a single full-bleed feature title between the rows
// to break rhythm (web "Editorial Spotlight"). 16:10 backdrop, bottom
// gradient, kicker + Fraunces title overlay, one-line standfirst below.

export function EditorialSpotlight({
  item,
  onPress,
}: {
  item: ContentItem;
  onPress: (item: ContentItem) => void;
}) {
  const img = item.backdrop || item.image;
  const services = useItemServices(item);
  if (!img) return null;

  return (
    <View className="mt-7 px-5">
      <Pressable onPress={() => onPress(item)} className="overflow-hidden rounded-lg bg-card active:opacity-90">
        <View style={{ width: '100%', aspectRatio: 16 / 10 }}>
          <Image
            source={{ uri: img }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={200}
            recyclingKey={item.id}
          />
          <LinearGradient
            colors={['rgba(10,10,15,0)', 'rgba(10,10,15,0.4)', 'rgba(10,10,15,0.92)']}
            locations={[0.3, 0.55, 1]}
            style={{ position: 'absolute', inset: 0 }}
          />
          {services[0] ? (
            <View className="absolute left-3 top-3">
              <ServiceBadge service={services[0]} size="sm" />
            </View>
          ) : null}
          <View className="absolute inset-x-0 bottom-0 p-4">
            <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px] text-primary">
              The Spotlight
            </Text>
            <Text
              numberOfLines={2}
              className="mt-1 font-display text-headline text-white"
              style={{ textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } }}>
              {item.title}
            </Text>
          </View>
        </View>
      </Pressable>
      {item.overview ? (
        <Text numberOfLines={2} className="mt-2 font-body-serif text-body leading-relaxed text-muted-foreground">
          {item.overview}
        </Text>
      ) : null}
    </View>
  );
}
