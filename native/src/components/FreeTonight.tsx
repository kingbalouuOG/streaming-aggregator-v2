import { ScrollView, Text, View } from 'react-native';

import type { ContentItem } from '@/lib/types/content';
import { PosterCard } from './PosterCard';

// "Free Tonight" — a small editorial strip of titles on the UK free
// services (iPlayer / ITVX / Channel 4), lime-tinted. Only renders when the
// popular pool actually contains free-service titles. Web FreeTonight.

function isFree(item: ContentItem): boolean {
  return item.services.some((s) => s === 'bbc' || s === 'itvx' || s === 'channel4');
}

export function FreeTonight({
  items,
  onItemPress,
}: {
  items: ContentItem[];
  onItemPress: (item: ContentItem) => void;
}) {
  const free = items.filter(isFree).slice(0, 10);
  if (free.length === 0) return null;

  return (
    <View
      className="mx-5 mt-7 rounded-card py-4"
      style={{ backgroundColor: 'rgba(170,255,0,0.06)', borderWidth: 0.5, borderColor: 'rgba(170,255,0,0.28)' }}>
      <View className="px-4">
        <Text className="font-sans-bold text-kicker uppercase tracking-[1.6px]" style={{ color: '#cdfb46' }}>
          Free tonight
        </Text>
        <Text className="mt-0.5 font-title text-title text-foreground">No subscription needed.</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
        {free.map((item, i) => (
          <PosterCard key={item.id} item={item} onPress={onItemPress} surface="home" position={i} />
        ))}
      </ScrollView>
    </View>
  );
}
