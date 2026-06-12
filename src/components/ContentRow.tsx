import React, { useRef, useCallback, useLayoutEffect, useEffect } from "react";
import { ContentCard, ContentItem } from "./ContentCard";
import { SectionHead } from "./SectionHead";
import type { ServiceId } from "./platformLogos";
import { getScrollPosition, setScrollPosition } from "@/lib/sectionSessionCache";
import { recordImpression, type ImpressionSurface } from "@/lib/instrumentation/impressionBatcher";
import { getCurrentSessionId, onSessionReset } from "@/lib/instrumentation/sessionId";
import { parseContentItemId } from "@/lib/adapters/contentAdapter";
import { setCardClickContext } from "@/lib/instrumentation/clickContext";

interface ContentRowProps {
  title: string;
  items: ContentItem[];
  /** Optional taxonomic kicker (uppercase tracked) above the title. */
  kicker?: string;
  /** Override the default orange kicker — typically a service tint. */
  kickerColor?: string;
  /** Optional Fraunces italic standfirst under the title. */
  standfirst?: string;
  /** Optional trailing slot — typically a "See all →" link. */
  right?: React.ReactNode;
  variant?: "default" | "wide" | "lead" | "mosaic" | "grid";
  sectionKey?: string;
  sourceSurface?: ImpressionSurface;
  onItemSelect?: (item: ContentItem) => void;
  bookmarkedIds?: Set<string>;
  onToggleBookmark?: (item: ContentItem) => void;
  userServices?: ServiceId[];
  watchedIds?: Set<string>;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
}

function ContentRowImpl({ title, items, kicker, kickerColor, standfirst, right, variant = "default", sectionKey, sourceSurface, onItemSelect, bookmarkedIds, onToggleBookmark, userServices, watchedIds, onLoadMore, loadingMore, hasMore }: ContentRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreCalledRef = useRef(false);
  const scrollLeftRef = useRef(0);

  // Impression tracking (Task 7 / IN-010).
  //
  // Dedup on (content_id, session_id) so remounts within the same
  // session don't double-log. Session rollover (>= 5 minutes of
  // background time) fires onSessionReset, which clears the set
  // and allows the same card to log again in the new session.
  //
  // The ref's key format "{content_id}:{session_id}" matches the
  // plan. We use content_id (the numeric TMDb id) rather than
  // item.id (the "{type}-{id}" string) so the dedup key is stable
  // against any future id-format changes.
  const impressionDedupRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = onSessionReset(() => {
      impressionDedupRef.current.clear();
    });
    return unsubscribe;
  }, []);

  // Fire recordImpression for each item that hasn't been logged
  // in the current session yet. Runs whenever `items` or
  // `sourceSurface` changes — typically after the data load
  // resolves and the row first renders its cards.
  useEffect(() => {
    if (!sourceSurface) return;
    if (items.length === 0) return;
    const sessionId = getCurrentSessionId();
    items.forEach((item, position) => {
      const { tmdbId } = parseContentItemId(item.id);
      if (Number.isNaN(tmdbId)) return;
      const key = `${tmdbId}:${sessionId}`;
      if (impressionDedupRef.current.has(key)) return;
      impressionDedupRef.current.add(key);
      recordImpression({
        contentId: tmdbId,
        sourceSurface,
        position,
        // ENG-1 Workstream C: exploration-slot picks tagged so ENG-2 can
        // measure exploration CTR separately (brief §3.4).
        metadata: item.exploration ? { exploration: true } : undefined,
      });
    });
  }, [items, sourceSurface]);

  // Restore horizontal scroll position on mount
  useLayoutEffect(() => {
    if (sectionKey && scrollRef.current && items.length > 0) {
      const saved = getScrollPosition(sectionKey);
      if (saved > 0) {
        scrollRef.current.scrollLeft = saved;
      }
    }
  }, [sectionKey, items.length > 0]);

  // Save scroll position on unmount
  useEffect(() => {
    const key = sectionKey;
    return () => {
      if (key) setScrollPosition(key, scrollLeftRef.current);
    };
  }, [sectionKey]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    scrollLeftRef.current = scrollRef.current.scrollLeft;

    if (!onLoadMore || !hasMore || loadingMore) return;

    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    const distanceFromEnd = scrollWidth - scrollLeft - clientWidth;

    // Trigger when within ~2 card widths of the end
    if (distanceFromEnd < 350) {
      if (!loadMoreCalledRef.current) {
        loadMoreCalledRef.current = true;
        onLoadMore();
        // Reset after a short delay to allow the next batch
        setTimeout(() => { loadMoreCalledRef.current = false; }, 500);
      }
    }
  }, [onLoadMore, hasMore, loadingMore]);

  // Skeleton size approximates the card's poster + title block height
  // (poster aspect 5:7 + ~44px title/meta block).
  const skeletonWidth =
    variant === "lead" ? "w-[358px] h-[545px]" :
    variant === "wide" ? "w-[220px] h-[352px]" :
    "w-[160px] h-[268px]";

  return (
    // UX-1 W5: below-fold rows skip render/layout work until scrolled
    // near (research: web.dev/articles/content-visibility). The
    // intrinsic-size reservation prevents scroll-anchor jumps.
    <section
      className="mb-6"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 290px' }}
    >
      {/* Section header */}
      <div className="px-5">
        <SectionHead
          kicker={kicker}
          kickerColor={kickerColor}
          title={title}
          standfirst={standfirst}
          right={right}
        />
      </div>

      {/* Horizontal scroll */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-3 px-5 overflow-x-auto no-scrollbar scroll-smooth pb-1"
      >
        {items.map((item, index) => (
          <ContentCard
            key={item.id}
            item={item}
            variant={variant}
            onSelect={onItemSelect ? (selected) => {
              // ENG-1 Workstream D: stash the ranked origin so the
              // outcome events that follow carry position-at-click.
              const { tmdbId } = parseContentItemId(selected.id);
              if (!Number.isNaN(tmdbId) && sourceSurface) {
                setCardClickContext({ contentId: tmdbId, position: index, surface: sourceSurface });
              }
              onItemSelect(selected);
            } : undefined}
            bookmarked={bookmarkedIds?.has(item.id)}
            onToggleBookmark={onToggleBookmark}
            userServices={userServices}
            watched={watchedIds?.has(item.id)}
          />
        ))}
        {loadingMore ? <>
            {[0, 1, 2].map((i) => (
              <div
                key={`skeleton-${i}`}
                className={`shrink-0 rounded-xl bg-secondary animate-pulse ${skeletonWidth}`}
              />
            ))}
          </> : null}
      </div>
    </section>
  );
}

// PLAT-1 Workstream E: memo'd — App re-renders on every scroll pixel
// (scrollY is state); with store-backed stable props this stops the
// per-frame re-render cascade through the card/row primitives.
export const ContentRow = React.memo(ContentRowImpl);
