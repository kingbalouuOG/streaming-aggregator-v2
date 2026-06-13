import { Check, Eye, Plus } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import { useWatchlist, useWatchlistMutations } from '@/hooks/useWatchlist';
import type { ContentItem } from '@/lib/types/content';

// Detail-page dual action buttons (NATIVE-2 W5a): Add to / In Watchlist
// + Mark as Watched / Watched, wired to the shared watchlist storage via
// useWatchlistMutations. State derives from the shared watchlist query so
// it stays in sync with the Watchlist tab.

export function WatchlistActions({ item }: { item: ContentItem }) {
  const { data: items } = useWatchlist();
  const { toggle, setStatus } = useWatchlistMutations();

  const { tmdbId, mediaType } = parseContentItemId(item.id);
  const entry = items?.find((i) => i.id === tmdbId && i.type === mediaType);
  const bookmarked = !!entry;
  const watched = entry?.status === 'watched';

  return (
    <View className="mt-4 flex-row gap-2.5">
      <Pressable
        onPress={() => toggle.mutate(item)}
        className={
          bookmarked
            ? 'flex-1 flex-row items-center justify-center gap-2 rounded-card bg-primary py-3 active:opacity-90'
            : 'flex-1 flex-row items-center justify-center gap-2 rounded-card border border-border bg-card py-3 active:bg-secondary'
        }>
        {bookmarked ? (
          <Check size={16} color="#ffffff" />
        ) : (
          <Plus size={16} color="#f5f1e8" />
        )}
        <Text
          className={
            bookmarked
              ? 'font-sans-bold text-body text-white'
              : 'font-sans-medium text-body text-foreground'
          }>
          {bookmarked ? 'In Watchlist' : 'Add to Watchlist'}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          // Marking watched implies it's in the list — add first if needed.
          if (!bookmarked) toggle.mutate(item);
          setStatus.mutate({ id: item.id, status: watched ? 'want_to_watch' : 'watched' });
        }}
        className={
          watched
            ? 'flex-1 flex-row items-center justify-center gap-2 rounded-card bg-success py-3 active:opacity-90'
            : 'flex-1 flex-row items-center justify-center gap-2 rounded-card border border-border bg-card py-3 active:bg-secondary'
        }>
        <Eye size={16} color={watched ? '#ffffff' : '#f5f1e8'} />
        <Text
          className={
            watched
              ? 'font-sans-bold text-body text-white'
              : 'font-sans-medium text-body text-foreground'
          }>
          {watched ? 'Watched' : 'Mark as Watched'}
        </Text>
      </Pressable>
    </View>
  );
}
