import React, { useRef } from "react";
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
}

export function ContentRow({ title, items, variant = "default", onItemSelect, bookmarkedIds, onToggleBookmark, userServices }: ContentRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <section className="mb-6">
      {/* Section header */}
      <div className="flex items-center justify-between px-4 mb-3">
        <h2 className="text-foreground text-[17px]" style={{ fontWeight: 700 }}>
          {title}
        </h2>
      </div>

      {/* Horizontal scroll */}
      <div
        ref={scrollRef}
        className="flex gap-3 px-4 overflow-x-auto no-scrollbar scroll-smooth pb-1"
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
          />
        ))}
      </div>
    </section>
  );
}