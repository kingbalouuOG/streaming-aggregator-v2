import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { useIsBookmarked, useWatchlistMutations } from '@/hooks/useWatchlist';
import type { ContentItem } from '@/lib/types/content';
import { cardMeta, PosterOverlays } from './PosterOverlays';

// Flexible-width 2:3 poster card for 2-column grids (Browse, Watchlist).
// Same ContentCard anatomy as PosterCard (via PosterOverlays); differs only
// in sizing — fills its grid column instead of a fixed 160px.

export function PosterGridCard({
  item,
  onPress,
}: {
  item: ContentItem;
  onPress: (item: ContentItem) => void;
}) {
  const bookmarked = useIsBookmarked(item.id);
  const { toggle } = useWatchlistMutations();

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
        <PosterOverlays
          item={item}
          bookmarked={bookmarked}
          onToggleBookmark={() => toggle.mutate(item)}
        />
      </View>
      <Text numberOfLines={1} className="mt-2 font-card text-body text-foreground">
        {item.title}
      </Text>
      <Text
        numberOfLines={1}
        className="mt-0.5 font-sans-medium text-[11px] uppercase tracking-[0.3px] text-muted-foreground">
        {cardMeta(item)}
      </Text>
    </Pressable>
  );
}
