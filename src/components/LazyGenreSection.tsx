import React from 'react';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { useSectionData } from '@/hooks/useSectionData';
import { ContentRow } from './ContentRow';
import { GENRE_NAMES } from '@/lib/constants/genres';
import type { ContentItem } from './ContentCard';
import type { ServiceId } from './platformLogos';
import type { GenreAffinities } from '@/lib/utils/recommendationEngine';

interface LazyGenreSectionProps {
  genreId: number;
  baseParams: Record<string, unknown>;
  sectionKeyBase: string;
  filterGenreIds: number[];
  fetchMovies: boolean;
  fetchTV: boolean;
  excludeIds: Set<string>;
  onNewIds: (ids: string[]) => void;
  genreAffinities: GenreAffinities;
  onItemSelect?: (item: ContentItem) => void;
  bookmarkedIds?: Set<string>;
  onToggleBookmark?: (item: ContentItem) => void;
  userServices?: ServiceId[];
  watchedIds?: Set<string>;
  filterWatched: (items: ContentItem[]) => ContentItem[];
}

function SectionSkeleton({ genreId }: { genreId: number }) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between px-4 mb-3">
        <h2 className="text-foreground text-[17px]" style={{ fontWeight: 700 }}>
          {GENRE_NAMES[genreId] || 'Loading...'}
        </h2>
      </div>
      <div className="flex gap-3 px-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-[165px] h-[240px] rounded-xl bg-secondary animate-pulse shrink-0"
          />
        ))}
      </div>
    </section>
  );
}

export function LazyGenreSection({
  genreId,
  baseParams,
  sectionKeyBase,
  filterGenreIds,
  fetchMovies,
  fetchTV,
  excludeIds,
  onNewIds,
  genreAffinities,
  onItemSelect,
  bookmarkedIds,
  onToggleBookmark,
  userServices,
  watchedIds,
  filterWatched,
}: LazyGenreSectionProps) {
  const { ref, isVisible } = useIntersectionObserver({ rootMargin: '200px 0px', triggerOnce: true });

  // Build genre-specific params: combine row genre with any active genre filter (AND logic)
  const genreParam = filterGenreIds.length > 0
    ? [genreId, ...filterGenreIds].join(',')
    : String(genreId);

  const genreBaseParams = { ...baseParams, with_genres: genreParam };

  const section = useSectionData({
    sectionKey: `genre-${genreId}|${sectionKeyBase}`,
    baseParams: genreBaseParams,
    movieParams: { sort_by: 'popularity.desc' },
    tvParams: { sort_by: 'popularity.desc' },
    fetchMovies,
    fetchTV,
    enabled: isVisible,
    excludeIds,
    onNewIds,
    genreAffinities,
    applyScoring: true,
  });

  const genreName = GENRE_NAMES[genreId] || 'Unknown';
  const filteredItems = filterWatched(section.items);

  // Not yet visible — show skeleton placeholder
  if (!isVisible || section.loading) {
    return (
      <div ref={ref}>
        <SectionSkeleton genreId={genreId} />
      </div>
    );
  }

  // Loaded but empty after filtering — hide section
  if (filteredItems.length === 0) {
    return null;
  }

  return (
    <div ref={ref}>
      <ContentRow
        title={genreName}
        items={filteredItems}
        onItemSelect={onItemSelect}
        bookmarkedIds={bookmarkedIds}
        onToggleBookmark={onToggleBookmark}
        userServices={userServices}
        watchedIds={watchedIds}
        onLoadMore={section.loadMore}
        loadingMore={section.loadingMore}
        hasMore={section.hasMore}
      />
    </div>
  );
}
