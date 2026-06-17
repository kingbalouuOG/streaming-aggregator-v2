import { Image } from 'expo-image';
import { Play } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useItemServices } from '@/hooks/useItemServices';
import type { ContentItem } from '@/lib/types/content';
import { cardMeta } from './PosterOverlays';
import { ServiceBadge } from './ServiceBadge';

// List-style row — poster thumb + title + meta + Play affordance. Used by
// the For You "From your watchlist" section and the Watchlist list view
// (web WatchlistListRow).

export function WatchlistListRow({
  item,
  onPress,
}: {
  item: ContentItem;
  onPress: (item: ContentItem) => void;
}) {
  const services = useItemServices(item);
  return (
    <Pressable onPress={() => onPress(item)} className="flex-row items-center gap-3 px-5 py-2.5 active:opacity-70">
      <View className="overflow-hidden rounded-md bg-card" style={{ width: 48 }}>
        <Image
          source={item.image ? { uri: item.image } : undefined}
          style={{ width: 48, aspectRatio: 2 / 3 }}
          contentFit="cover"
          transition={150}
          recyclingKey={item.id}
        />
      </View>
      <View className="flex-1">
        <Text numberOfLines={1} className="font-title text-section text-foreground">
          {item.title}
        </Text>
        <View className="mt-1 flex-row items-center gap-1.5">
          {services[0] ? <ServiceBadge service={services[0]} size="xs" /> : null}
          <Text
            numberOfLines={1}
            className="flex-1 font-sans-medium text-[11px] uppercase tracking-[0.3px] text-faint-foreground">
            {cardMeta(item)}
          </Text>
        </View>
      </View>
      <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-soft">
        <Play size={15} color="#e85d25" fill="#e85d25" />
      </View>
    </Pressable>
  );
}
