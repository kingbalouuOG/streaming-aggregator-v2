import { ImageSkeleton } from './ImageSkeleton';
import type { AnchorRoomPreview } from '@/hooks/useAnchorMoodRooms';


interface AnchorMoodRoomCardProps {
  preview: AnchorRoomPreview;
  onSelect: (preview: AnchorRoomPreview) => void;
}


/**
 * Card for the anchored "Mood Rooms for Tonight" row on For You.
 *
 * Visual contract is intentionally identical to MoodRoomCard: 200×280
 * frame, 2×2 thumbnail grid in the top portion, label below.
 *
 * Label rendering:
 *   - When `preview.llmLabel` is present (IN-463 thematic label resolved),
 *     show that as the primary line, with the anchor title underneath
 *     as a soft "Inspired by {anchor}" attribution.
 *   - While the LLM label is loading or after a hard failure, show the
 *     v1 fallback "If you love {anchor}".
 */
export function AnchorMoodRoomCard({ preview, onSelect }: AnchorMoodRoomCardProps) {
  const tiles = preview.thumbnails.slice(0, 4);
  const hasTiles = tiles.length > 0;
  const llm = preview.llmLabel;

  return (
    <button
      type="button"
      onClick={() => onSelect(preview)}
      className="shrink-0 w-[200px] h-[280px] rounded-xl overflow-hidden bg-surface-elevated text-left flex flex-col focus:outline-none focus:ring-2 focus:ring-primary"
    >
      {/* Thumbnail area (top 60%) — identical to MoodRoomCard */}
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

      {/* Label area (bottom 40%). */}
      <div className="flex-1 flex flex-col justify-center px-3 py-3">
        {llm ? (
          <>
            <h3
              className="text-foreground text-[14px] leading-tight line-clamp-2"
              style={{ fontWeight: 600 }}
            >
              {llm.label}
            </h3>
            <span className="text-muted-foreground text-[11px] mt-0.5 line-clamp-1">
              Inspired by {preview.anchorTitle}
            </span>
          </>
        ) : (
          <>
            <span className="text-muted-foreground text-[11px] uppercase tracking-wide">
              If you love
            </span>
            <h3
              className="text-foreground text-[14px] leading-tight line-clamp-2 mt-0.5"
              style={{ fontWeight: 600 }}
            >
              {preview.anchorTitle}
            </h3>
          </>
        )}
      </div>
    </button>
  );
}
