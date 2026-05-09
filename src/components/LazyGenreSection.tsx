import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { useSectionData } from '@/hooks/useSectionData';
import { ContentRow } from './ContentRow';
import { GENRE_NAMES, VALID_TV_GENRE_IDS, MOVIE_TO_TV_GENRE } from '@/lib/constants/genres';
import type { ContentItem } from './ContentCard';
import type { ServiceId } from './platformLogos';

interface LazyGenreSectionProps {
  genreId: number;
  baseParams: Record<string, unknown>;
  sectionKeyBase: string;
  filterGenreIds: number[];
  fetchMovies: boolean;
  fetchTV: boolean;
  excludeIds: Set<string>;
  onNewIds: (ids: string[]) => void;
  /** @deprecated Phase 3: genre affinities no longer used */
  genreAffinities?: Record<string, number>;
  /** @deprecated Phase 3: v1 taste vector no longer used */
  tasteVector?: unknown;
  onItemSelect?: (item: ContentItem) => void;
  bookmarkedIds?: Set<string>;
  onToggleBookmark?: (item: ContentItem) => void;
  userServices?: ServiceId[];
  watchedIds?: Set<string>;
  filterWatched: (items: ContentItem[]) => ContentItem[];
  immediate?: boolean;
}

function SectionSkeleton({ genreId }: { genreId: number }) {
  const name = GENRE_NAMES[genreId] || 'Loading…';
  return (
    <section className="mb-6">
      <div className="px-5 mb-3">
        <span className="t-kicker">GENRE</span>
        <h2
          className="mt-1"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--t-title)',
            fontWeight: 700,
            fontVariationSettings: '"opsz" 36',
            letterSpacing: '-0.01em',
            color: 'var(--fg)',
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          {name}.
        </h2>
      </div>
      <div className="flex gap-3 px-5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-[160px] h-[268px] animate-pulse shrink-0"
            style={{
              borderRadius: 'var(--r-card)',
              background: 'var(--surface-elev)',
            }}
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
  filterGenreIds: _filterGenreIds,
  fetchMovies,
  fetchTV,
  excludeIds,
  onNewIds,
  onItemSelect,
  bookmarkedIds,
  onToggleBookmark,
  userServices,
  watchedIds,
  filterWatched,
  immediate,
}: LazyGenreSectionProps) {
  const { ref, isVisible } = useIntersectionObserver({ rootMargin: '200px 0px', triggerOnce: true });
  const effectivelyVisible = immediate || isVisible;

  // TV compatibility: check if this genre has a valid TV discover equivalent
  const hasValidTVGenre = VALID_TV_GENRE_IDS.has(genreId) || !!MOVIE_TO_TV_GENRE[genreId];
  const effectiveFetchTV = fetchTV && hasValidTVGenre;

  // Strip with_genres from baseParams — genre sections set their own genre, not inherited filter genres
  const { with_genres: _strip, ...cleanBaseParams } = baseParams as Record<string, unknown> & { with_genres?: unknown };
  const genreBaseParams = { ...cleanBaseParams, with_genres: String(genreId) };

  const section = useSectionData({
    sectionKey: `genre-${genreId}|${sectionKeyBase}`,
    baseParams: genreBaseParams,
    movieParams: { sort_by: 'popularity.desc' },
    tvParams: { sort_by: 'popularity.desc' },
    fetchMovies,
    fetchTV: effectiveFetchTV,
    enabled: effectivelyVisible,
    excludeIds,
    onNewIds,
    isGenreSection: true,
  });

  const genreName = GENRE_NAMES[genreId] || 'Unknown';
  const filteredItems = filterWatched(section.items);

  // Not yet visible — show skeleton placeholder
  if (!effectivelyVisible || section.loading) {
    return (
      <div ref={ref}>
        <SectionSkeleton genreId={genreId} />
      </div>
    );
  }

  return (
    <div ref={ref}>
      <AnimatePresence initial={false}>
        {filteredItems.length > 0 && (
          <motion.div
            key={genreId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <ContentRow
              kicker="GENRE"
              title={`${genreName}.`}
              sectionKey={`genre-${genreId}`}
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
