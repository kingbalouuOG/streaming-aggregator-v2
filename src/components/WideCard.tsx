import { ImageSkeleton } from "./ImageSkeleton";
import { ServiceBadge } from "./ServiceBadge";
import type { ContentItem } from "./ContentCard";
import type { ServiceId } from "./platformLogos";

/**
 * @deprecated Use `ContentItem` directly. Kept as an alias so the
 * WideCardDebug surface keeps compiling. Will be removed once the
 * debug surface migrates to ContentItem.
 */
export type WideCardItem = ContentItem;

interface WideCardProps {
  item: ContentItem;
  /** Filter the displayed service to only the user's connected stack. */
  userServices?: ServiceId[];
  onSelect?: (item: ContentItem) => void;
  /** Variant width control. Defaults to "default" (272px). */
  size?: "default" | "lead";
}

/**
 * WideCard — landscape (16:9) editorial card. Uses TMDb backdrop art
 * with a bottom gradient + overlaid title and meta. Pairs well with
 * "Critics' picks" / "Free tonight" / "Long view" rows.
 */
export function WideCard({ item, userServices, onSelect, size = "default" }: WideCardProps) {
  const visibleServices = userServices?.length
    ? item.services.filter((s) => userServices.includes(s))
    : item.services;
  const primary = visibleServices[0];

  const widthClass = size === "lead" ? "w-[358px]" : "w-[272px]";

  return (
    <button
      type="button"
      onClick={() => onSelect?.(item)}
      className={`shrink-0 ${widthClass} text-left cursor-pointer relative overflow-hidden`}
      style={{
        aspectRatio: "16 / 9",
        borderRadius: "var(--r-card)",
        background: "var(--surface-elev)",
        color: "#fff",
      }}
    >
      <ImageSkeleton
        src={item.backdrop || item.image}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(10,10,15,0.92) 0%, rgba(10,10,15,0.4) 50%, rgba(10,10,15,0) 75%)",
        }}
      />
      {primary ? <div
          className="absolute top-2 left-2 inline-flex"
          style={{ filter: "var(--badge-glow)" }}
        >
          <ServiceBadge service={primary} size="md" />
        </div> : null}
      <div className="absolute left-0 right-0 bottom-0 p-3">
        <h3
          className="line-clamp-2"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            fontWeight: 800,
            fontVariationSettings: '"opsz" 36',
            letterSpacing: "-0.01em",
            lineHeight: 1.15,
            color: "#fff",
            margin: 0,
            textShadow: "0 1px 4px rgba(0,0,0,0.45)",
          }}
        >
          {item.title}
        </h3>
        <div
          className="flex items-center gap-2 mt-1 flex-wrap"
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.78)",
            textShadow: "0 1px 3px rgba(0,0,0,0.45)",
          }}
        >
          {item.genre ? <span>{item.genre}</span> : null}
          {item.year ? <span>· {item.year}</span> : null}
          {item.rating != null && item.rating > 0 && (
            <span>· <span style={{ color: "var(--star)" }}>★</span> {item.rating.toFixed(1)}</span>
          )}
        </div>
      </div>
    </button>
  );
}
