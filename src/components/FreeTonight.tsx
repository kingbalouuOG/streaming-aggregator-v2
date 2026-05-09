import { ContentCard, type ContentItem } from "./ContentCard";
import type { ServiceId } from "./platformLogos";

interface FreeTonightProps {
  items: ContentItem[];
  userServices: ServiceId[];
  onSelect: (item: ContentItem) => void;
  bookmarkedIds: Set<string>;
  onToggleBookmark: (item: ContentItem) => void;
  watchedIds: Set<string>;
}

const FREE_SERVICES: ServiceId[] = ["bbc", "itvx", "channel4"];

/**
 * FreeTonight — green-framed editorial row for items watchable for
 * free tonight on the user's connected free services. Skipped
 * entirely when the user has none of BBC iPlayer / ITVX / Channel 4.
 */
export function FreeTonight({
  items,
  userServices,
  onSelect,
  bookmarkedIds,
  onToggleBookmark,
  watchedIds,
}: FreeTonightProps) {
  const userFreeServices = userServices.filter((s) => FREE_SERVICES.includes(s));
  if (userFreeServices.length === 0) return null;

  const visible = items
    .filter((item) => item.services.some((s) => userFreeServices.includes(s)))
    .slice(0, 8);

  if (visible.length === 0) return null;

  const lime = "#7cb342";

  return (
    <section
      className="editorial mb-8"
      style={{
        background: `color-mix(in srgb, ${lime} 8%, var(--surface))`,
        border: `0.5px solid color-mix(in srgb, ${lime} 35%, transparent)`,
        borderRadius: "var(--r-card)",
        padding: "16px 0",
      }}
    >
      <div className="flex items-center justify-between px-5 mb-3">
        <div className="flex flex-col gap-1">
          <span
            className="inline-flex items-center px-2.5 py-1 self-start"
            style={{
              background: `color-mix(in srgb, ${lime} 22%, transparent)`,
              color: lime,
              borderRadius: "var(--r-pill)",
              fontFamily: "var(--font-ui)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            FREE TONIGHT
          </span>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--t-title)",
              fontWeight: 700,
              fontVariationSettings: '"opsz" 36',
              letterSpacing: "-0.01em",
              color: "var(--fg)",
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            No subscription needed.
          </h2>
        </div>
      </div>
      <div
        className="flex gap-4 overflow-x-auto no-scrollbar px-5"
        style={{ scrollbarWidth: "none" }}
      >
        {visible.map((item) => (
          <ContentCard
            key={item.id}
            item={item}
            variant="default"
            userServices={userFreeServices}
            onSelect={onSelect}
            bookmarked={bookmarkedIds.has(item.id)}
            onToggleBookmark={onToggleBookmark}
            watched={watchedIds.has(item.id)}
          />
        ))}
      </div>
    </section>
  );
}
