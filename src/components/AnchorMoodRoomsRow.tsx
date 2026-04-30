import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import { AnchorMoodRoomCard } from './AnchorMoodRoomCard';
import { getScrollPosition, setScrollPosition } from '@/lib/sectionSessionCache';
import type { AnchorRoomPreview } from '@/hooks/useAnchorMoodRooms';


interface AnchorMoodRoomsRowProps {
  rooms: AnchorRoomPreview[];
  onSelectRoom: (preview: AnchorRoomPreview) => void;
}


/**
 * "Mood Rooms for Tonight" — horizontal row of anchored mood-room cards
 * on For You, at position 2 (between Recommended For You and Hidden
 * Gems). Replaces the global-rooms-on-For-You row from Phase 4.5
 * Gates 1–4; global rooms persist for v2.5 browse + Phase 7
 * conversational discovery (Strategy v1.7 §5.3).
 *
 * Structurally parallel to MoodRoomsRow. Scroll position preserved
 * per-session under sectionSessionCache key "foryou-anchor-rooms".
 *
 * Impression semantics: per-card impressions are NOT emitted from this
 * row — the cards represent navigational affordances into rooms, not
 * titles. Per-title impressions land inside MoodRoomPage with
 * source_surface='anchor_room' + metadata { anchor_tier,
 * anchor_source_cluster_id, tier_1_inside_stated_cluster }.
 *
 * If product later wants "user viewed the anchored rooms row" as a
 * distinct analytics event, that's a separate impression type, not a
 * card_impressions row. Deferred — same posture as MoodRoomsRow.
 */
export function AnchorMoodRoomsRow({ rooms, onSelectRoom }: AnchorMoodRoomsRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollLeftRef = useRef(0);
  const sectionKey = 'foryou-anchor-rooms';

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
          <AnchorMoodRoomCard
            key={preview.id}
            preview={preview}
            onSelect={onSelectRoom}
          />
        ))}
      </div>
    </section>
  );
}
