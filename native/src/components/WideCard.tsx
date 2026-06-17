import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Star } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useItemServices } from '@/hooks/useItemServices';
import type { ContentItem } from '@/lib/types/content';
import { cardMeta } from './PosterOverlays';
import { ServiceBadge } from './ServiceBadge';

// Wide 16:9 backdrop card (web WideCard) — used in the "Outside your usual"
// / Critics' rows. Backdrop art + bottom gradient + Fraunces title overlay.

const GOLD = '#e3b04b';

export function WideCard({
  item,
  onPress,
}: {
  item: ContentItem;
  onPress: (item: ContentItem) => void;
}) {
  const img = item.backdrop || item.image;
  const services = useItemServices(item);

  return (
    <Pressable
      onPress={() => onPress(item)}
      className="overflow-hidden rounded-lg bg-card active:opacity-90"
      style={{ width: 264 }}>
      <View style={{ width: 264, aspectRatio: 16 / 9 }}>
        <Image
          source={img ? { uri: img } : undefined}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={200}
          recyclingKey={item.id}
        />
        <LinearGradient
          colors={['rgba(10,10,15,0)', 'rgba(10,10,15,0.45)', 'rgba(10,10,15,0.92)']}
          locations={[0.3, 0.6, 1]}
          style={{ position: 'absolute', inset: 0 }}
        />
        {services[0] ? (
          <View className="absolute left-2 top-2">
            <ServiceBadge service={services[0]} size="xs" ring />
          </View>
        ) : null}
        <View className="absolute inset-x-0 bottom-0 p-3">
          <Text numberOfLines={2} className="font-title text-section text-white">
            {item.title}
          </Text>
          <View className="mt-1 flex-row items-center gap-1.5">
            <Text
              numberOfLines={1}
              className="flex-1 font-sans-medium text-[11px] uppercase tracking-[0.3px]"
              style={{ color: 'rgba(255,255,255,0.78)' }}>
              {cardMeta(item)}
            </Text>
            {item.rating && item.rating > 0 ? (
              <View className="flex-row items-center gap-0.5">
                <Star size={10} color={GOLD} fill={GOLD} strokeWidth={0} />
                <Text className="font-sans-bold text-[11px]" style={{ color: GOLD }}>
                  {item.rating.toFixed(1)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}
