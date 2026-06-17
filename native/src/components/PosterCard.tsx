import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import { useIsBookmarked, useWatchlistMutations } from '@/hooks/useWatchlist';
import { setCardClickContext } from '@/lib/instrumentation/clickContext';
import {
  recordImpression,
  type ImpressionSurface,
} from '@/lib/instrumentation/impressionBatcher';
import type { ContentItem } from '@/lib/types/content';
import { cardMeta, PosterOverlays } from './PosterOverlays';

// Poster card — the "default" 160px variant from the web ContentCard
// (design-system.md §4). Carries the full ContentCard anatomy (service
// stack / glass bookmark / gold rating pill) via PosterOverlays. expo-image
// gives memory+disk caching + a 200ms cross-fade. NATIVE-POLISH W2: records
// an impression when shown on a ranked surface and stashes click-context on
// tap (positional-bias training data) — both no-op for guests / no surface.

interface PosterCardProps {
  item: ContentItem;
  onPress?: (item: ContentItem) => void;
  surface?: ImpressionSurface;
  position?: number;
}

export function PosterCard({ item, onPress, surface, position }: PosterCardProps) {
  const bookmarked = useIsBookmarked(item.id);
  const { toggle } = useWatchlistMutations();

  useEffect(() => {
    if (!surface) return;
    const { tmdbId } = parseContentItemId(item.id);
    recordImpression({ contentId: tmdbId, sourceSurface: surface, position: position ?? 0 });
  }, [item.id, surface, position]);

  const press = () => {
    if (surface) {
      const { tmdbId } = parseContentItemId(item.id);
      setCardClickContext({ contentId: tmdbId, position: position ?? 0, surface });
    }
    onPress?.(item);
  };

  return (
    <Pressable onPress={onPress ? press : undefined} className="w-[160px] active:opacity-80">
      <View className="overflow-hidden rounded-card bg-card">
        <Image
          source={item.image ? { uri: item.image } : undefined}
          style={{ width: 160, aspectRatio: 2 / 3 }}
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
