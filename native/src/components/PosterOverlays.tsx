import { Bookmark, Star } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useItemServices } from '@/hooks/useItemServices';
import type { ContentItem } from '@/lib/types/content';
import { ServiceStack } from './ServiceBadge';

// Shared poster-card anatomy (design system ContentCard contract): a
// ServiceStack top-left, a glass bookmark top-right (outline → filled on
// save), and a gold ★ rating pill bottom-left. Deliberately NO cost/plan
// pill — "one rating, one platform, one bookmark" (restraint principle).
// Rendered as absolute overlays inside the card's clipped image wrapper.

const GOLD = '#e3b04b'; // --vx-gold: ratings

export function PosterOverlays({
  item,
  bookmarked,
  onToggleBookmark,
}: {
  item: ContentItem;
  bookmarked: boolean;
  onToggleBookmark?: () => void;
}) {
  const rating = item.rating && item.rating > 0 ? item.rating : null;
  const services = useItemServices(item);
  return (
    <>
      {services.length > 0 ? (
        <View className="absolute left-1.5 top-1.5">
          <ServiceStack services={services} size="xs" max={3} />
        </View>
      ) : null}

      {onToggleBookmark ? (
        <Pressable
          onPress={onToggleBookmark}
          hitSlop={12}
          className="absolute right-1.5 top-1.5 h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Bookmark
            size={17}
            color="#f5f1e8"
            fill={bookmarked ? '#f5f1e8' : 'transparent'}
            strokeWidth={2}
          />
        </Pressable>
      ) : null}

      {rating ? (
        <View
          className="absolute bottom-1.5 left-1.5 flex-row items-center gap-1 rounded-pill px-1.5 py-0.5"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <Star size={10} color={GOLD} fill={GOLD} strokeWidth={0} />
          <Text className="font-sans-bold text-[10px]" style={{ color: GOLD }}>
            {rating.toFixed(1)}
          </Text>
        </View>
      ) : null}
    </>
  );
}

/** Card meta line — "GENRE · YEAR" (uppercase applied by the caller). Falls
 *  back to the media-type label when no genre string is present (e.g.
 *  watchlist items, which carry genreIds not a resolved genre). */
export function cardMeta(item: ContentItem): string {
  const kind =
    item.genre ??
    (item.type === 'tv' ? 'TV' : item.type === 'doc' ? 'Doc' : item.type === 'movie' ? 'Film' : undefined);
  return [kind, item.year].filter(Boolean).join(' · ');
}
