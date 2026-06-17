import { Image } from 'expo-image';
import { Star } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useItemServices } from '@/hooks/useItemServices';
import type { ContentItem } from '@/lib/types/content';
import { cardMeta } from './PosterOverlays';
import { SectionHead } from './SectionHead';
import { ServiceBadge } from './ServiceBadge';

// "The Charts" — trending ribbon (web NumberedChart). Ranked 1–5 with big
// Fraunces rank numerals, a small poster thumb, title + meta + ★ rating.
// Tap a row to open the title.

const GOLD = '#e3b04b';

// Row extracted so useItemServices runs once per row (hooks can't be called
// inside the .map). Badges resolve lazily for TMDb cards (services: []).
function TrendingRow({
  item,
  rank,
  onItemPress,
}: {
  item: ContentItem;
  rank: number;
  onItemPress: (item: ContentItem) => void;
}) {
  const services = useItemServices(item);
  return (
    <Pressable
      onPress={() => onItemPress(item)}
      className="flex-row items-center gap-3 py-2.5 active:opacity-70"
      style={rank > 0 ? { borderTopWidth: 0.5, borderTopColor: 'rgba(245,241,232,0.10)' } : undefined}>
      <Text className="w-7 text-center font-display text-[28px] text-faint-foreground">{rank + 1}</Text>
      <View className="overflow-hidden rounded-md bg-card" style={{ width: 50 }}>
        <Image
          source={item.image ? { uri: item.image } : undefined}
          style={{ width: 50, aspectRatio: 2 / 3 }}
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
    </Pressable>
  );
}

export function TrendingRibbon({
  items,
  onItemPress,
}: {
  items: ContentItem[];
  onItemPress: (item: ContentItem) => void;
}) {
  const ranked = items.slice(0, 5);
  if (ranked.length === 0) return null;

  return (
    <View className="mt-7 px-5">
      <SectionHead kicker="The Charts" title="Trending across your stack." />
      <View className="mt-1">
        {ranked.map((item, i) => (
          <TrendingRow key={item.id} item={item} rank={i} onItemPress={onItemPress} />
        ))}
      </View>
    </View>
  );
}
