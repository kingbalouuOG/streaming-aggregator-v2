import { Check, Eye, Plus } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { trackTasteInteraction } from '@/instrumentation/trackInteraction';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import { setLastAction } from '@/lib/instrumentation/dwellTimer';
import { useWatchlist, useWatchlistMutations } from '@/hooks/useWatchlist';
import type { ContentItem } from '@/lib/types/content';

// Detail-page dual action buttons (NATIVE-2 W5a): Add to / In Watchlist
// + Mark as Watched / Watched, wired to the shared watchlist storage via
// useWatchlistMutations. State derives from the shared watchlist query so
// it stays in sync with the Watchlist tab.

export function WatchlistActions({ item }: { item: ContentItem }) {
  const { data: items } = useWatchlist();
  const { toggle, markWatched } = useWatchlistMutations();

  const { tmdbId, mediaType } = parseContentItemId(item.id);
  const entry = items?.find((i) => i.id === tmdbId && i.type === mediaType);
  const bookmarked = !!entry;
  const watched = entry?.status === 'watched';
  const meta = { contentId: tmdbId, contentType: mediaType, title: item.title, genreIds: item.genreIds };

  return (
    <View className="mt-4 flex-row gap-2.5">
      <Pressable
        onPress={() => {
          if (!bookmarked) {
            setLastAction('added_to_watchlist');
            void trackTasteInteraction(meta, 'watchlist_add');
          }
          toggle.mutate(item);
        }}
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
          if (!watched) {
            setLastAction('marked_watched');
            void trackTasteInteraction(meta, 'watched');
          }
          // Single idempotent write — upserts the row as watched (adding it
          // if unlisted). No second mutation racing an update against a
          // not-yet-inserted row, so the status actually sticks.
          markWatched.mutate({ item, watched });
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
