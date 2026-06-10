import React, { useEffect, useState } from "react";
import { SectionHead } from "./SectionHead";
import { ImageSkeleton } from "./ImageSkeleton";
import { ServiceBadge } from "./ServiceBadge";
import { PlayFillIcon } from "./icons";
import { ContentItem } from "./ContentCard";
import type { ServiceId } from "./platformLogos";
import { getCachedServices } from "@/lib/utils/serviceCache";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";

interface NumberedChartProps {
  items: ContentItem[];
  /** Rows rendered. Defaults to 5. */
  limit?: number;
  kicker?: string;
  title?: string;
  standfirst?: string;
  right?: React.ReactNode;
  userServices?: ServiceId[];
  onSelect: (item: ContentItem) => void;
  /**
   * Show the rank numeral on the left of each row. Defaults to true
   * for the canonical "Top N" chart treatment. Set false when reusing
   * the row anatomy for unranked vertical lists (e.g. watchlist
   * preview on For You).
   */
  numbered?: boolean;
  /**
   * Override the default genre · year · ★ rating meta line. Return a
   * string per item (e.g. "Saved 2 days ago"); when undefined the
   * row falls back to the default meta.
   */
  subtitleFor?: (item: ContentItem) => string | undefined;
}

/**
 * NumberedChart — editorial Top-N row. Each entry is a large rank
 * numeral, poster thumb, title + service, and a play affordance.
 * Replaces the horizontal ContentRow on Home's "THE CHARTS" surface.
 *
 * The same anatomy is reused for unranked watchlist-preview lists —
 * pass `numbered={false}` and a `subtitleFor` to swap the meta.
 */
export function NumberedChart({
  items,
  limit = 5,
  kicker = "THE CHARTS",
  title = "Trending across your stack.",
  standfirst,
  right,
  userServices,
  onSelect,
  numbered = true,
  subtitleFor,
}: NumberedChartProps) {
  const visible = items.slice(0, limit);
  if (visible.length === 0) return null;

  return (
    <section className="editorial mt-3 mb-9">
      <SectionHead kicker={kicker} title={title} standfirst={standfirst} right={right} />
      <ol className="flex flex-col list-none m-0 p-0">
        {visible.map((item, idx) => (
          <NumberedChartRow
            key={item.id}
            item={item}
            rank={numbered ? idx + 1 : null}
            userServices={userServices}
            onSelect={onSelect}
            subtitle={subtitleFor?.(item)}
          />
        ))}
      </ol>
    </section>
  );
}

/**
 * NumberedChartRow — one entry in the chart. Owns its own service
 * lazy-load (discover-list items arrive with empty `services`; we
 * fetch via the per-title cache once mounted) so the badge always
 * renders even on cold cards.
 */
function NumberedChartRow({
  item,
  rank,
  userServices,
  onSelect,
  subtitle,
}: {
  item: ContentItem;
  /** Numeric rank to render in the leftmost column; `null` hides it. */
  rank: number | null;
  userServices?: ServiceId[];
  onSelect: (item: ContentItem) => void;
  /** When set, replaces the default genre · year · ★ rating meta. */
  subtitle?: string;
}) {
  const [allServices, setAllServices] = useState<ServiceId[]>(item.services);

  useEffect(() => {
    if (item.services.length > 0) {
      setAllServices(item.services);
      return;
    }
    const { tmdbId, mediaType } = parseContentItemId(item.id);
    getCachedServices(String(tmdbId), mediaType).then(setAllServices);
  }, [item.id, item.services]);

  // Surface the user's service when one matches; fall back to the
  // title's first listed service so the row never renders without a
  // service mark.
  const filtered = userServices?.length
    ? allServices.filter((s) => userServices.includes(s))
    : allServices;
  const primaryService = filtered[0] ?? allServices[0];

  // Build the meta segments first so the leading `·` only appears
  // when the badge is missing — avoids the dangling-separator gotcha.
  const metaParts: React.ReactNode[] = [];
  if (subtitle) {
    metaParts.push(<span key="s">{subtitle}</span>);
  } else {
    if (item.genre) metaParts.push(<span key="g">{item.genre}</span>);
    if (item.year) metaParts.push(<span key="y">{item.year}</span>);
    if (item.rating != null && item.rating > 0) {
      metaParts.push(
        <span key="r">
          <span style={{ color: "var(--star)" }}>★</span> {item.rating.toFixed(1)}
        </span>,
      );
    }
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="w-full flex items-center gap-3 py-3 text-left cursor-pointer"
        style={{
          borderTop: "0.5px solid var(--hairline)",
          background: "transparent",
          color: "var(--fg)",
        }}
      >
        {rank !== null && (
          <span
            aria-hidden
            className="shrink-0 text-center"
            style={{
              width: 28,
              fontFamily: "var(--font-display)",
              fontSize: 30,
              fontWeight: 700,
              fontVariationSettings: '"opsz" 48',
              letterSpacing: "-0.03em",
              color: "var(--fg-faint)",
              lineHeight: 1,
            }}
          >
            {rank}
          </span>
        )}
        <div
          className="shrink-0 overflow-hidden"
          style={{
            width: 56,
            height: 78,
            borderRadius: "var(--r-sm)",
            background: "var(--surface-elev)",
          }}
        >
          <ImageSkeleton
            src={item.image}
            alt={item.title}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <span
            className="line-clamp-1"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontWeight: 700,
              fontVariationSettings: '"opsz" 24',
              letterSpacing: "-0.01em",
              lineHeight: 1.2,
              color: "var(--fg)",
            }}
          >
            {item.title}
          </span>
          <span
            className="inline-flex items-center gap-2"
            style={{
              fontFamily: "var(--font-ui)",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--fg-faint)",
            }}
          >
            {primaryService ? <span style={{ filter: "var(--badge-glow)" }}>
                <ServiceBadge service={primaryService} size="sm" />
              </span> : null}
            {metaParts.map((part, i) => (
              <React.Fragment key={i}>
                {(i > 0 || primaryService) ? <span>·</span> : null}
                {part}
              </React.Fragment>
            ))}
          </span>
        </div>
        <span
          aria-hidden
          className="shrink-0 inline-flex items-center justify-center w-9 h-9"
          style={{
            background: "var(--overlay-medium)",
            color: "var(--fg)",
            border: "0.5px solid var(--hairline)",
            borderRadius: "var(--r-pill)",
          }}
        >
          <PlayFillIcon className="w-4 h-4" />
        </span>
      </button>
    </li>
  );
}
