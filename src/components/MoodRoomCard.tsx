import { ImageSkeleton } from './ImageSkeleton';
import type { MoodRoomPreview } from '@/lib/api/supabaseMoodRooms';


interface MoodRoomCardProps {
  preview: MoodRoomPreview;
  onSelect: (roomId: string) => void;
}


/**
 * Card for the "Mood Rooms for Tonight" row on For You.
 *
 * Visually distinct from ContentCard: a 2x2 thumbnail grid in the top
 * portion, room name + description below. Sized comparably to a "wide"
 * ContentCard so the two components interleave cleanly on the same row
 * if we ever need that (we don't in Phase 4.5).
 *
 * Impression tracking lives on the parent MoodRoomsRow — each mounted
 * card's tmdb_id isn't meaningful here (cards represent rooms, not
 * titles) so we don't fire per-card recordImpression. Row-level logging
 * is how we answer "how many people saw the mood rooms row".
 */
export function MoodRoomCard({ preview, onSelect }: MoodRoomCardProps) {
  const { room, thumbnails } = preview;
  const tiles = thumbnails.slice(0, 4);
  const hasTiles = tiles.length > 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(room.id)}
      className="shrink-0 w-[200px] h-[280px] rounded-xl overflow-hidden bg-surface-elevated text-left flex flex-col focus:outline-none focus:ring-2 focus:ring-primary"
    >
      {/* Thumbnail area (top 60%) */}
      <div className="relative w-full h-[168px] bg-black/40">
        {hasTiles ? (
          <div className="grid grid-cols-2 grid-rows-2 gap-px w-full h-full">
            {tiles.map((t) => (
              <div key={t.id} className="relative overflow-hidden">
                <ImageSkeleton
                  src={t.image}
                  alt={t.title}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
            ))}
            {/* Fill any empty cells so the grid doesn't collapse */}
            {Array.from({ length: Math.max(0, 4 - tiles.length) }).map((_, i) => (
              <div key={`filler-${i}`} className="bg-black/60" />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-[12px]">
            No previews
          </div>
        )}
      </div>

      {/* Label + description (bottom 40%) */}
      <div className="flex-1 flex flex-col gap-1 px-3 py-3">
        <h3
          className="text-foreground text-[14px] leading-tight line-clamp-1"
          style={{ fontWeight: 600 }}
        >
          {room.label}
        </h3>
        {room.description ? (
          <p className="text-muted-foreground text-[12px] leading-snug line-clamp-2">
            {room.description}
          </p>
        ) : null}
      </div>
    </button>
  );
}
