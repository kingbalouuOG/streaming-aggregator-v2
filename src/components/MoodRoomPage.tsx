import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';

import { ContentCard, type ContentItem } from './ContentCard';
import type { ServiceId } from './platformLogos';
import {
  getMoodRoomDetail,
  type MoodRoomDetail,
} from '@/lib/api/supabaseMoodRooms';
import type { FilterSets } from '@/lib/recommendations-v2/hardFilters';
import { buildFilterSets } from '@/lib/recommendations-v2/hardFilters';
import { providerIdToServiceId } from '@/lib/adapters/platformAdapter';
import { recordImpression } from '@/lib/instrumentation/impressionBatcher';
import type { ImpressionSurface } from '@/lib/instrumentation/impressionBatcher';
import { getCurrentSessionId, onSessionReset } from '@/lib/instrumentation/sessionId';
import { parseContentItemId } from '@/lib/adapters/contentAdapter';
import { buildAnchoredRoom } from '@/lib/recommendations-v2/anchoredRoom';
import type { SelectedAnchor } from '@/lib/recommendations-v2/anchorSelection';
import type { AnchorRoomLabel } from '@/lib/recommendations-v2/anchorRoomLabels';


const GRID_PAGE_SIZE = 30;
const ANCHOR_ROOM_LIMIT = 30;
const ANCHOR_ROOM_MATCH_LIMIT = 200;


/**
 * Discriminator for the two room sources:
 *   - 'global': HDBSCAN-clustered mood rooms (`mood_rooms` / `mood_room_titles`,
 *               served via `get_mood_room_detail` RPC). Reached via tap on
 *               the global Mood Rooms surface (v2.5 browse, deferred).
 *   - 'anchor': Title-anchored "If you love {anchor}" rooms generated on
 *               demand from the user's taste vector + the anchor's
 *               embedding. Reached via tap on the For You anchored mood
 *               rooms row.
 *
 * Per Phase 4 Title-Anchored Mood Rooms kick-off §1.5: parameterise the
 * detail page with a swappable detail-fetcher rather than fork it.
 * Impression batching, scroll preservation, and pagination logic stay
 * shared; only the data fetch and the impression source_surface differ.
 */
type GlobalRoomProps = {
  kind: 'global';
  roomId: string;
};

type AnchorRoomProps = {
  kind: 'anchor';
  anchor: SelectedAnchor;
  anchorTitle: string;
  anchorYear: number | null;
  /**
   * LLM-generated thematic label (IN-463). When present, the detail
   * page header shows the thematic name + description; otherwise it
   * falls back to "If you love {anchor}". Resolved by the parent hook
   * before navigation; null while loading or on hard failure.
   */
  llmLabel: AnchorRoomLabel | null;
};

type MoodRoomPageProps = (GlobalRoomProps | AnchorRoomProps) & {
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
};


/**
 * Per-room detail view. Reached via card tap on either the global mood
 * rooms surface (v2.5) or the For You anchored mood rooms row.
 *
 * Layout: header (room name + description + total title count) followed
 * by a grid of titles. Global rooms are ordered by centrality
 * ascending (most central first); anchored rooms by cosine distance to
 * the anchor (most similar first). Both filtered to titles available on
 * the user's services.
 *
 * Pagination: lazy-load in batches of 30 when the room has > 30 titles.
 *
 * Impressions: every visible title emits a card_impressions row.
 * source_surface is 'mood_room' for global rooms, 'anchor_room' for
 * anchored rooms. Anchored rooms carry metadata
 * { anchor_tmdb_id, anchor_tier, anchor_source_cluster_id,
 *   tier_1_inside_stated_cluster } in `card_impressions.metadata`
 * (jsonb, migration 033). Same dedup pattern as ContentRow
 * (tmdb_id + session_id), session reset clears the dedup set.
 */
export function MoodRoomPage(props: MoodRoomPageProps) {
  const {
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
  } = props;

  const [detail, setDetail] = useState<MoodRoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(GRID_PAGE_SIZE);

  const impressionDedupRef = useRef<Set<string>>(new Set());

  // Stabilise effect deps. The App.tsx parent re-renders on every
  // scroll pixel (scrollY is state), which produces new identities for
  // `providerIds` (array) and `sharedFilters` (object) on every render.
  // If those leak into the data-fetch useEffect's dependency array, the
  // fetch re-fires on every scroll pixel — setLoading flashes, re-fetch
  // flickers the cards, and the user sees a visible "reload" on scroll.
  // Collapse both to primitive signatures so React's Object.is can
  // correctly memoise.
  const providerKey = useMemo(
    () => [...providerIds].sort().join(','),
    [providerIds],
  );
  const availableIdsSize = sharedFilters?.availableTmdbIds.size ?? 0;

  // Keyed identity of the room being viewed. Used as the effect dep so
  // we re-fetch when the user navigates between rooms (global ↔ anchor
  // or anchor ↔ different anchor).
  const detailKey = props.kind === 'global'
    ? `global:${props.roomId}`
    : `anchor:${props.anchor.mediaType}-${props.anchor.tmdbId}`;

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

        const result = props.kind === 'global'
          ? await fetchGlobalRoomDetail(props.roomId, filterSets.availableTmdbIds)
          : await fetchAnchoredRoomDetail(props, filterSets);

        if (cancelled) return;
        setDetail(result);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailKey, providerKey, availableIdsSize]);

  useEffect(() => {
    const unsubscribe = onSessionReset(() => {
      impressionDedupRef.current.clear();
    });
    return unsubscribe;
  }, []);

  const items = detail?.items ?? [];
  const filtered = filterLanguage(filterWatched(items));
  const visible = filtered.slice(0, visibleCount);

  // Stable signature of the current visible set. `visible` is a new
  // array identity on every render (recomputed from props + state), so
  // using it directly in the effect dep array re-runs the effect on
  // every render even when the actual set hasn't changed. The joined
  // id string collapses to a primitive that React's Object.is can
  // correctly compare.
  const visibleIdsKey = visible.map((v) => v.id).join(',');

  // Compute the impression payload once per room — anchor metadata is
  // stable across the session.
  const sourceSurface: ImpressionSurface =
    props.kind === 'anchor' ? 'anchor_room' : 'mood_room';
  const impressionMetadata = props.kind === 'anchor'
    ? buildAnchorImpressionMetadata(props.anchor)
    : null;

  // Record impressions for the currently-visible window. Runs whenever
  // the visible set actually changes (initial load, pagination, filter
  // change) — not on every parent re-render.
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
        sourceSurface,
        position,
        metadata: impressionMetadata,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIdsKey]);

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
            {detail?.label ?? 'Mood Room'}
          </h1>
          {detail?.description ? (
            <p className="text-muted-foreground text-[14px] mt-1 leading-snug">
              {detail.description}
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
                variant="grid"
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


// ── Detail fetchers ────────────────────────────────────────────────

async function fetchGlobalRoomDetail(
  roomId: string,
  availableTmdbIds: Set<number>,
): Promise<MoodRoomDetail | null> {
  return getMoodRoomDetail(roomId, availableTmdbIds);
}

async function fetchAnchoredRoomDetail(
  props: AnchorRoomProps,
  filterSets: FilterSets,
): Promise<MoodRoomDetail | null> {
  const result = await buildAnchoredRoom({
    anchorTmdbId: props.anchor.tmdbId,
    anchorMediaType: props.anchor.mediaType,
    filterSets,
    limit: ANCHOR_ROOM_LIMIT,
    matchLimit: ANCHOR_ROOM_MATCH_LIMIT,
    excludeWatchlist: false,
  });

  if (result.items.length === 0) return null;

  // Prefer the LLM thematic label if the parent hook resolved it before
  // navigation. Falls back to the v1 literal pattern.
  const label = props.llmLabel?.label ?? `If you love ${props.anchorTitle}`;
  const description = props.llmLabel?.description ?? null;

  return {
    label,
    description,
    totalTitleCount: result.filteredCount,
    items: result.items,
  };
}


function buildAnchorImpressionMetadata(
  anchor: SelectedAnchor,
): Record<string, unknown> {
  // Snake_case keys to match the SQL convention; Postgres jsonb is
  // case-sensitive and analytics queries on `metadata->>'anchor_tier'`
  // will read these as written.
  return {
    anchor_tmdb_id: anchor.tmdbId,
    anchor_media_type: anchor.mediaType,
    anchor_tier: anchor.tier,
    anchor_source_cluster_id: anchor.sourceClusterId,
    tier_1_inside_stated_cluster: anchor.insideStatedCluster,
  };
}
