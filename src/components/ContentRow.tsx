import React, { useRef, useCallback } from "react";
import { ContentCard, ContentItem } from "./ContentCard";
import type { ServiceId } from "./platformLogos";

interface ContentRowProps {
  title: string;
  items: ContentItem[];
  variant?: "default" | "wide";
  onItemSelect?: (item: ContentItem) => void;
  bookmarkedIds?: Set<string>;
  onToggleBookmark?: (item: ContentItem) => void;
  userServices?: ServiceId[];
  watchedIds?: Set<string>;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
}

export function ContentRow({ title, items, variant = "default", onItemSelect, bookmarkedIds, onToggleBookmark, userServices, watchedIds, onLoadMore, loadingMore, hasMore }: ContentRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreCalledRef = useRef(false);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !onLoadMore || !hasMore || loadingMore) return;

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

  const skeletonWidth = variant === "wide" ? "w-[200px] h-[280px]" : "w-[165px] h-[240px]";

  return (
    <section className="mb-6">
      {/* Section header */}
      <div className="flex items-center justify-between px-5 mb-3">
        <h2 className="text-foreground text-[17px]" style={{ fontWeight: 700 }}>
          {title}
        </h2>
      </div>

      {/* Horizontal scroll */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-3 px-5 overflow-x-auto no-scrollbar scroll-smooth pb-1"
      >
        {items.map((item) => (
          <ContentCard
            key={item.id}
            item={item}
            variant={variant}
            onSelect={onItemSelect}
            bookmarked={bookmarkedIds?.has(item.id)}
            onToggleBookmark={onToggleBookmark}
            userServices={userServices}
            watched={watchedIds?.has(item.id)}
          />
        ))}
        {loadingMore && (
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={`skeleton-${i}`}
                className={`shrink-0 rounded-xl bg-secondary animate-pulse ${skeletonWidth}`}
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}
