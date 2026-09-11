import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { reacted, touched } from '@/components/debug/TouchProbe';
import { useIsBookmarked, useWatchlistMutations } from '@/hooks/useWatchlist';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import { setCardClickContext } from '@/lib/instrumentation/clickContext';
import {
  recordImpression,
  type ImpressionSurface,
  type RecordImpressionInput,
} from '@/lib/instrumentation/impressionBatcher';
import type { ContentItem } from '@/lib/types/content';
import { cardMeta, PosterOverlays } from './PosterOverlays';

// Flexible-width 2:3 poster card for 2-column grids (Browse, Watchlist).
// Same ContentCard anatomy as PosterCard (via PosterOverlays); differs only
// in sizing — fills its grid column instead of a fixed 160px.
//
// It now also records impressions and stashes click context, the same way
// PosterCard does on the rail surfaces. That closes IN-SL-001: Browse
// rendered every result set through this card and never called
// `recordImpression`, so `card_impressions` held nothing for search or
// filter results. A `search` row gives `result_count` and a later
// `detail_view` gives the click, but with no impressions there was no
// denominator for *which* results were actually seen — so search CTR, the
// headline number of the presets measurement plan (§6), could not be
// computed at all.
//
// Both are opt-in via `surface`: Watchlist passes none and behaves exactly
// as before. A saved list is not a ranked surface, and impressions from one
// would dilute the CTR of the surfaces that are.

interface PosterGridCardProps {
  item: ContentItem;
  onPress: (item: ContentItem) => void;
  /** Omit to record nothing — the card stays a plain grid tile. */
  surface?: ImpressionSurface;
  /** Rank within the grid, 0-based. Meaningless without `surface`. */
  position?: number;
  /**
   * Extra context for `card_impressions.metadata`. Browse passes the route
   * and the active refine chips, so a refined result set can be told apart
   * from an unrefined one — without which CTR would silently mix the two
   * populations, which is the same mistake the quick-filter session avoided
   * on New and For You with `metadata.filter`.
   */
  impressionMetadata?: RecordImpressionInput['metadata'];
}

export function PosterGridCard({
  item,
  onPress,
  surface,
  position,
  impressionMetadata,
}: PosterGridCardProps) {
  const bookmarked = useIsBookmarked(item.id);
  const { toggle } = useWatchlistMutations();

  // Serialised for the dep array: `metadata` is a fresh object literal on
  // every render at the call site, so depending on it directly would
  // re-record an impression for every card on every render.
  const metadataKey = impressionMetadata ? JSON.stringify(impressionMetadata) : '';
  useEffect(() => {
    if (!surface) return;
    const { tmdbId } = parseContentItemId(item.id);
    recordImpression({
      contentId: tmdbId,
      sourceSurface: surface,
      position: position ?? 0,
      metadata: metadataKey ? (JSON.parse(metadataKey) as RecordImpressionInput['metadata']) : null,
    });
  }, [item.id, surface, position, metadataKey]);

  const press = () => {
    if (surface) {
      const { tmdbId } = parseContentItemId(item.id);
      setCardClickContext({ contentId: tmdbId, position: position ?? 0, surface });
    }
    onPress(item);
  };

  return (
    <Pressable
      onTouchStart={() => touched('Poster card')}
      onPressIn={() => reacted('Poster card')}
      onPress={press}
      className="flex-1 p-1.5 active:opacity-80">
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
