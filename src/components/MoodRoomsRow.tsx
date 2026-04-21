import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import { MoodRoomCard } from './MoodRoomCard';
import { getScrollPosition, setScrollPosition } from '@/lib/sectionSessionCache';
import type { MoodRoomPreview } from '@/lib/api/supabaseMoodRooms';


interface MoodRoomsRowProps {
  rooms: MoodRoomPreview[];
  onSelectRoom: (roomId: string) => void;
}


/**
 * "Mood Rooms for Tonight" — horizontal row of mood-room cards on
 * For You, at position 2 (between Recommended For You and Hidden Gems).
 *
 * Scroll position is preserved per-session via sectionSessionCache under
 * the key "foryou-mood-rooms", matching the ContentRow pattern.
 *
 * Impression semantics differ from ContentRow. Mood-room cards are not
 * titles — they're navigational affordances into a sub-surface. We
 * don't emit per-card card_impressions rows because the surface
 * attribution for per-title impressions will happen inside MoodRoomPage
 * itself (with source_surface='mood_room'). What gets logged for THIS
 * row is the preview-thumbnail titles that render inside each card, and
 * that happens lazily inside the card's ImageSkeleton (which only
 * triggers a card_impression if any other surface re-uses the same
 * title later — mood-rooms row thumbnails are not explicitly logged).
 *
 * If product later wants "user viewed the mood-rooms row" as a distinct
 * analytics event, that's a dedicated impression type, not a
 * card_impressions row. Deferred.
 */
export function MoodRoomsRow({ rooms, onSelectRoom }: MoodRoomsRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollLeftRef = useRef(0);
  const sectionKey = 'foryou-mood-rooms';

  useLayoutEffect(() => {
    if (scrollRef.current && rooms.length > 0) {
      const saved = getScrollPosition(sectionKey);
      if (saved > 0) scrollRef.current.scrollLeft = saved;
    }
  }, [rooms.length > 0]);

  useEffect(() => {
    return () => setScrollPosition(sectionKey, scrollLeftRef.current);
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) scrollLeftRef.current = scrollRef.current.scrollLeft;
  }, []);

  if (rooms.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between px-5 mb-3">
        <h2
          className="text-foreground text-[17px]"
          style={{ fontWeight: 700 }}
        >
          Mood Rooms for Tonight
        </h2>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-3 px-5 overflow-x-auto no-scrollbar scroll-smooth pb-1"
      >
        {rooms.map((preview) => (
          <MoodRoomCard
            key={preview.room.id}
            preview={preview}
            onSelect={onSelectRoom}
          />
        ))}
      </div>
    </section>
  );
}
