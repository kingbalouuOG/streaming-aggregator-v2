import { Image } from 'expo-image';
import { Popcorn, ThumbsDown, ThumbsUp } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { buildPosterUrl } from '@/lib/api/imageUrls';
import type { Reaction, SharedItem } from '@/lib/household/items';

// One title on a shared list (Growth G2, H2): poster, title, who added it,
// and the three reactions as toggles with counts (the caller's own one
// highlighted). Long-press removes, when the caller may (adder or owner).
// Used by the list screen and inline by the Watchlist tab's shared segment.

const ACCENT = '#e85d25';
const MUTED = 'rgba(245,241,232,0.62)';

export function addedByLabel(addedBy: string | null, userId: string | null, names: Map<string, string>): string {
  if (!addedBy) return 'Added by a former member';
  if (addedBy === userId) return 'Added by you';
  const name = names.get(addedBy);
  return name ? `Added by ${name}` : 'Added by a member';
}

export function SharedListItemRow({
  item,
  addedBy,
  onPress,
  onReact,
  onLongPress,
}: {
  item: SharedItem;
  addedBy: string;
  onPress: (item: SharedItem) => void;
  onReact: (item: SharedItem, reaction: Reaction) => void;
  /** Present only when the caller may remove the item. */
  onLongPress?: (item: SharedItem) => void;
}) {
  const poster = buildPosterUrl(item.posterPath) ?? '';
  const { counts, mine } = item.reactions;
  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={onLongPress ? () => onLongPress(item) : undefined}
      delayLongPress={350}
      accessibilityHint={onLongPress ? 'Long press to remove' : undefined}
      className="flex-row gap-3 px-5 py-3 active:opacity-80">
      <View className="overflow-hidden rounded-md bg-card" style={{ width: 56 }}>
        <Image
          source={poster ? { uri: poster } : undefined}
          style={{ width: 56, aspectRatio: 2 / 3 }}
          contentFit="cover"
          transition={150}
          recyclingKey={item.id}
        />
      </View>
      <View className="flex-1 justify-center">
        <Text numberOfLines={2} className="font-title text-section text-foreground">
          {item.title}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 font-sans text-meta text-muted-foreground">
          {addedBy}
        </Text>
        <View className="mt-2 flex-row gap-2">
          <ReactionPill
            label="Up"
            active={mine === 'up'}
            count={counts.up}
            onPress={() => onReact(item, 'up')}
            icon={<ThumbsUp size={14} color={mine === 'up' ? ACCENT : MUTED} />}
          />
          <ReactionPill
            label="Down"
            active={mine === 'down'}
            count={counts.down}
            onPress={() => onReact(item, 'down')}
            icon={<ThumbsDown size={14} color={mine === 'down' ? ACCENT : MUTED} />}
          />
          <ReactionPill
            label="Tonight?"
            text="Tonight?"
            active={mine === 'tonight'}
            count={counts.tonight}
            onPress={() => onReact(item, 'tonight')}
            icon={<Popcorn size={14} color={mine === 'tonight' ? ACCENT : MUTED} />}
          />
        </View>
      </View>
    </Pressable>
  );
}

function ReactionPill({
  label,
  text,
  active,
  count,
  icon,
  onPress,
}: {
  label: string;
  text?: string;
  active: boolean;
  count: number;
  icon: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${count}`}
      className={
        active
          ? 'h-8 flex-row items-center gap-1.5 rounded-pill border border-primary-edge bg-primary-soft px-3'
          : 'h-8 flex-row items-center gap-1.5 rounded-pill border border-border bg-card px-3 active:bg-secondary'
      }>
      {icon}
      {text ? (
        <Text className={active ? 'font-sans-bold text-meta text-primary' : 'font-sans-medium text-meta text-muted-foreground'}>
          {text}
        </Text>
      ) : null}
      {count > 0 ? (
        <Text className={active ? 'font-sans-bold text-meta text-primary' : 'font-sans-medium text-meta text-muted-foreground'}>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}
