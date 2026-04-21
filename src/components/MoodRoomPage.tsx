import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';

import { ContentCard, type ContentItem } from './ContentCard';
import type { ServiceId } from './platformLogos';
import {
  getMoodRoomById,
  type MoodRoomDetail,
} from '@/lib/api/supabaseMoodRooms';
import type { FilterSets } from '@/lib/recommendations-v2/hardFilters';
import { buildFilterSets } from '@/lib/recommendations-v2/hardFilters';
import { providerIdToServiceId } from '@/lib/adapters/platformAdapter';
import { recordImpression } from '@/lib/instrumentation/impressionBatcher';
import { getCurrentSessionId, onSessionReset } from '@/lib/instrumentation/sessionId';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';


const GRID_PAGE_SIZE = 30;


interface MoodRoomPageProps {
  roomId: string;
  providerIds: number[];
  connectedServiceIds: ServiceId[];
  sharedFilters: FilterSets | null;
  filterWatched: (items: ContentItem[]) => ContentItem[];
  filterLanguage: (items: ContentItem[]) => ContentItem[];
  bookmarkedIds: Set<string>;
  watchedIds: Set<string>;
  onItemSelect: (item: ContentItem) => void;
  onToggleBookmark: (item: ContentItem) => void;
  onBack: () => void;
}


/**
 * Per-room view. Reached via a card tap on the For You mood-rooms row.
 *
 * Layout: header (room name + description + total title count) followed
 * by a grid of titles ordered by centrality ascending (most central
 * first), filtered to titles available on the user's services.
 *
 * Pagination: lazy-load in batches of 30 when the room has > 50 titles.
 *
 * Impressions: every visible title emits a card_impression with
 * source_surface='mood_room'. Same dedup pattern as ContentRow
 * (tmdb_id + session_id), session reset clears the dedup set.
 */
export function MoodRoomPage({
  roomId,
  providerIds,
  connectedServiceIds,
  sharedFilters,
  filterWatched,
  filterLanguage,
  bookmarkedIds,
  watchedIds,
  onItemSelect,
  onToggleBookmark,
  onBack,
}: MoodRoomPageProps) {
  const [detail, setDetail] = useState<MoodRoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(GRID_PAGE_SIZE);

  const impressionDedupRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        let filterSets = sharedFilters;
        if (!filterSets) {
          const serviceIds = providerIds
            .map((id) => providerIdToServiceId(id))
            .filter(Boolean) as string[];
          filterSets = await buildFilterSets(serviceIds);
        }
        const result = await getMoodRoomById(roomId, filterSets.availableTmdbIds);
        if (cancelled) return;
        setDetail(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [roomId, providerIds, sharedFilters]);

  useEffect(() => {
    const unsubscribe = onSessionReset(() => {
      impressionDedupRef.current.clear();
    });
    return unsubscribe;
  }, []);

  const items = detail?.items ?? [];
  const filtered = filterLanguage(filterWatched(items));
  const visible = filtered.slice(0, visibleCount);

  // Record impressions for the currently-visible window. Runs whenever
  // the slice changes (initial load, pagination).
  useEffect(() => {
    if (visible.length === 0) return;
    const sessionId = getCurrentSessionId();
    visible.forEach((item, position) => {
      const { tmdbId } = parseContentItemId(item.id);
      if (Number.isNaN(tmdbId)) return;
      const key = `${tmdbId}:${sessionId}`;
      if (impressionDedupRef.current.has(key)) return;
      impressionDedupRef.current.add(key);
      recordImpression({
        contentId: tmdbId,
        sourceSurface: 'mood_room',
        position,
      });
    });
  }, [visible]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + GRID_PAGE_SIZE, filtered.length));
  }, [filtered.length]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="min-h-screen"
    >
      {/* Header */}
      <header className="flex items-start gap-3 px-5 pt-5 pb-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to For You"
          className="w-10 h-10 rounded-full flex items-center justify-center text-foreground bg-surface-elevated shrink-0 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0 pt-1">
          <h1
            className="text-foreground text-[22px] leading-tight"
            style={{ fontWeight: 700 }}
          >
            {detail?.room.label ?? 'Mood Room'}
          </h1>
          {detail?.room.description ? (
            <p className="text-muted-foreground text-[14px] mt-1 leading-snug">
              {detail.room.description}
            </p>
          ) : null}
          {detail ? (
            <p className="text-muted-foreground text-[12px] mt-2">
              {filtered.length} of {detail.totalTitleCount} on your services
            </p>
          ) : null}
        </div>
      </header>

      {loading ? (
        <p className="text-muted-foreground text-[14px] text-center px-5 py-12">
          Loading room…
        </p>
      ) : error ? (
        <p className="text-muted-foreground text-[14px] text-center px-5 py-12">
          Could not load this room.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-[14px] text-center px-5 py-12">
          Nothing here is on your services right now.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 px-5 pb-6">
            {visible.map((item) => (
              <ContentCard
                key={item.id}
                item={item}
                variant="wide"
                onSelect={onItemSelect}
                bookmarked={bookmarkedIds.has(item.id)}
                onToggleBookmark={onToggleBookmark}
                userServices={connectedServiceIds}
                watched={watchedIds.has(item.id)}
              />
            ))}
          </div>

          {visibleCount < filtered.length ? (
            <div className="flex justify-center pb-8">
              <button
                type="button"
                onClick={handleLoadMore}
                className="px-4 py-2 rounded-lg bg-surface-elevated text-foreground text-[14px] focus:outline-none focus:ring-2 focus:ring-primary"
                style={{ fontWeight: 500 }}
              >
                Show more
              </button>
            </div>
          ) : null}
        </>
      )}
    </motion.div>
  );
}
