import { ImageSkeleton } from './ImageSkeleton';
import type { AnchorRoomPreview } from '@/hooks/useAnchorMoodRooms';


interface AnchorMoodRoomCardProps {
  preview: AnchorRoomPreview;
  onSelect: (preview: AnchorRoomPreview) => void;
}


/**
 * Card for the anchored "Mood Rooms for Tonight" row on For You.
 *
 * Phase 5 redesign per the matrix: "Lifts cover-story treatment."
 * Each card now reads as a tiny magazine cover — full-bleed lead
 * thumbnail, dark gradient at the bottom, kicker + Fraunces label
 * overlaid. The 2×2 mosaic has been retired in favour of the
 * editorial direction; the additional thumbnails surface inside the
 * MoodRoomPage detail when the user opens the room.
 *
 * Label rendering:
 *   - When `preview.llmLabel` is present, kicker becomes
 *     "INSPIRED BY {ANCHOR}" and the heading uses the LLM label.
 *   - While the LLM label is loading or after a hard failure, the
 *     kicker is "IF YOU LOVE" and the heading is the anchor title.
 */
export function AnchorMoodRoomCard({ preview, onSelect }: AnchorMoodRoomCardProps) {
  const lead = preview.thumbnails[0];
  const llm = preview.llmLabel;

  const kicker = llm
    ? `INSPIRED BY ${preview.anchorTitle.toUpperCase()}`
    : "IF YOU LOVE";
  const title = llm ? llm.label : `${preview.anchorTitle}.`;

  return (
    <button
      type="button"
      onClick={() => onSelect(preview)}
      className="relative shrink-0 overflow-hidden text-left flex flex-col focus:outline-none active:scale-[0.99] transition-transform"
      style={{
        width: 200,
        height: 280,
        borderRadius: "var(--r-card)",
        background: "var(--surface-elev)",
      }}
      aria-label={title}
    >
      {/* Lead thumbnail — full-bleed */}
      {lead ? (
        <ImageSkeleton
          src={lead.image}
          alt={lead.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{ background: "var(--surface-tint)" }}
        />
      )}

      {/* Bottom gradient — read the title block */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(10,10,15,0.94) 0%, rgba(10,10,15,0.55) 35%, rgba(10,10,15,0.05) 60%, rgba(10,10,15,0) 100%)",
        }}
      />

      {/* Title block — bottom-aligned, magazine-cover style */}
      <div className="absolute inset-x-0 bottom-0 p-4 flex flex-col gap-1">
        <span
          className="line-clamp-1"
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "1.4px",
            color: "var(--primary)",
          }}
        >
          {kicker}
        </span>
        <h3
          className="line-clamp-2"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            fontWeight: 700,
            fontVariationSettings: '"opsz" 36',
            letterSpacing: "-0.01em",
            color: "#fff",
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          {title}
        </h3>
        {preview.titleCount > 0 && (
          <span
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              color: "rgba(255,255,255,0.7)",
              marginTop: 2,
            }}
          >
            {preview.titleCount} titles
          </span>
        )}
      </div>
    </button>
  );
}
