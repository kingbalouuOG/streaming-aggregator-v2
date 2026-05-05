/**
 * useAnchorMoodRooms
 *
 * Title-anchored "Mood Rooms for Tonight" row on For You.
 *
 * Replaces the global-rooms-on-For-You ranking (`useMoodRoomsRow`) with
 * a per-user weekly anchor selection from the Phase 4 tiered ladder.
 * Each anchor produces one room via `buildAnchoredRoom`, named "If you
 * love {anchor_title}". Up to 5 rooms per row.
 *
 * Caching strategy mirrors `useMoodRoomsRow`:
 *   - Anchor selection is cached in localStorage by (userId, weekBucket).
 *     Cache hit means we skip the Tier 1/2/3 query work for the week.
 *   - The anchor's underlying room contents (the 30 titles per room)
 *     are NOT cached: services and availability shift across the week,
 *     so contents are recomputed every render. This matches the
 *     useMoodRoomsRow pattern (cache room ids, refetch thumbnails).
 *   - `featuredLastWeek` exclusion: anchors selected in the previous
 *     week are excluded from this week's selection so the row feels
 *     fresh week-on-week.
 *
 * Latency budget (probe Section 5): residential WAN saw 2.5–3.7s per
 * `match_titles_by_vector` call; production server-side runs 50–300ms.
 * All anchor calls run via `Promise.all`, so wallclock = max latency.
 *
 * Tier 3 fallback (top-finalScore from the existing pipeline) requires
 * a CandidatePool. The parent ForYouPage shares its pool via the
 * `pool` prop. If pool is null, anchor selection stops at Tier 1+2 and
 * may return < 5 anchors — acceptable; the row simply renders fewer
 * rooms.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getAuthUserId } from '@/lib/storage';
import { getV2TasteProfile } from '@/lib/taste-v2/tasteProfileV2';
import { buildFilterSets, type FilterSets } from '@/lib/recommendations-v2/hardFilters';
import { providerIdToServiceId } from '@/lib/adapters/platformAdapter';
import {
  selectAnchors,
  type SelectedAnchor,
  type AnchorSelectionResult,
} from '@/lib/recommendations-v2/anchorSelection';
import { buildAnchoredRoom } from '@/lib/recommendations-v2/anchoredRoom';
import {
  getCachedAnchorLabels,
  requestAnchorLabel,
  type AnchorRoomLabel,
} from '@/lib/recommendations-v2/anchorRoomLabels';
import { supabase } from '@/lib/supabase';
import { EXTENDED_TITLE_SELECT } from '@/lib/recommendations-v2/types';
import type { ExtendedTitleRow, CandidatePool } from '@/lib/recommendations-v2/types';
import type { ContentItem } from '@/components/ContentCard';
import type { SliderState } from '@/lib/taste-v2/types';


const WEEKLY_CACHE_PREFIX = 'videx.anchor_rooms.weekly.v1';
const WEEKLY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EPOCH_MONDAY_MS = Date.UTC(2024, 0, 1);
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Per-room title cap from brief §1.4 step 6. */
const ROOM_LIMIT = 30;
/** Raw NN over-fetch from match_titles_by_vector — brief §1.4 step 2. */
const ROOM_MATCH_LIMIT = 200;
/** Thumbnails shown on the row card (matches MoodRoomCard's 2x2 grid). */
const THUMBNAIL_LIMIT = 4;


export interface AnchorRoomPreview {
  /** Composite id, stable across the week: "anchor:{media_type}-{tmdb_id}". */
  id: string;
  /** Selection metadata — flows into impression metadata on detail. */
  anchor: SelectedAnchor;
  /** Title of the anchor. Used as the v1 fallback "If you love {title}" label. */
  anchorTitle: string;
  /** Anchor's release year — used for label disambiguation if needed. */
  anchorYear: number | null;
  /** Anchor's media type. */
  anchorMediaType: 'movie' | 'tv';
  /** Up to 4 ContentItems for the 2×2 card grid. */
  thumbnails: ContentItem[];
  /** Total titles in the room post-filter (for "X titles" copy if shown). */
  titleCount: number;
  /**
   * LLM-generated thematic label (IN-463). Populated asynchronously
   * after the room renders — cards initially show "If you love {anchor}"
   * and swap to the thematic label when the cache read or Edge
   * Function call resolves. Null while loading or on failure.
   */
  llmLabel: AnchorRoomLabel | null;
  /** Top room titles passed to the Edge Function for label generation. */
  topTitlesForLabel: { title: string; year: number | null }[];
}


export interface UseAnchorMoodRoomsResult {
  rooms: AnchorRoomPreview[];
  loading: boolean;
  error: string | null;
  /**
   * Latency for each per-anchor `buildAnchoredRoom` call (ms). Empty
   * until the first load completes. Surfaced for telemetry — Phase 4
   * end-of-phase summary needs the production wallclock numbers.
   */
  perAnchorLatencyMs: number[];
}


interface AnchorCacheEntry {
  anchors: SelectedAnchor[];
  computedAt: string;
  /**
   * LLM thematic labels indexed by anchorKey ("{mediaType}-{tmdbId}").
   * Persisted alongside the anchor selection so repeat opens within
   * the week render with thematic labels immediately, no flicker. New
   * labels resolved during the current session are persisted back here.
   */
  labels?: Record<string, AnchorRoomLabel>;
}


export function useAnchorMoodRooms(
  providerIds: number[],
  sharedFilters: FilterSets | null,
  pool: CandidatePool | null,
  sliders: SliderState | null,
  /**
   * IN-466: anchor rooms pre-built by the render-foryou-rows Edge Function.
   * When provided, the hook skips the entire selectAnchors +
   * buildAnchoredRoom × 5 chain and renders these directly. Label
   * resolution still fires for any anchors without a cached label.
   * Pass null on the client-fallback path (or when the parent hasn't
   * loaded yet) to run the full client-side flow.
   */
  prebuiltRooms?: AnchorRoomPreview[] | null,
): UseAnchorMoodRoomsResult {
  const [rooms, setRooms] = useState<AnchorRoomPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [perAnchorLatencyMs, setPerAnchorLatencyMs] = useState<number[]>([]);

  // ── IN-466 fast path ──
  // If the parent hook (useForYouContent) got rooms back from the Edge
  // Function, render those instead of doing any work here. Label
  // resolution still fires for anchors without a cached label.
  useEffect(() => {
    if (!prebuiltRooms) return;
    setRooms(prebuiltRooms);
    setPerAnchorLatencyMs([]);
    setLoading(false);
    setError(null);

    // Resolve missing labels in the background — same flow as the
    // client path, just starting from prebuilt previews.
    const stale = { current: false };
    const isStale = () => stale.current;
    void resolveMissingLabels(prebuiltRooms, isStale, (updated) => {
      if (isStale()) return;
      setRooms(updated);
    });
    return () => { stale.current = true; };
  }, [prebuiltRooms]);

  const providerKey = useMemo(
    () => [...providerIds].sort().join(','),
    [providerIds],
  );
  const filterKey = sharedFilters ? sharedFilters.availableTmdbIds.size : 0;
  // We don't need the pool's identity to gate the load — once anchors
  // are selected, the room generation depends only on the filter sets.
  // But we do want a re-load when the pool transitions from null →
  // available, so cold-start renders without Tier 3 don't get stuck.
  // Use `pool != null` (not `pool.matched.length > 0`) so an empty
  // candidate pool still flips the gate and lets the memo cache hit.
  const poolReady = pool != null;

  // In-memory cache keyed on inputs so re-renders don't refetch rooms.
  const memoCacheRef = useRef<{
    providerKey: string;
    filterKey: number;
    weekBucket: number;
    poolReady: boolean;
    rooms: AnchorRoomPreview[];
    latency: number[];
  } | null>(null);

  // Generation counter increments on each load() entry. Each load
  // captures its own number; if a newer load has fired before the
  // current one's awaits resolve, the stale completion is dropped at
  // every state-write site. Without this, a provider change followed
  // by a pool transition can land out of order and ship stale rooms.
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    const myGen = ++loadGenRef.current;
    const isStale = () => loadGenRef.current !== myGen;

    setLoading(true);
    setError(null);

    try {
      const weekBucket = getCurrentWeekBucket();

      const memo = memoCacheRef.current;
      if (
        memo
        && memo.providerKey === providerKey
        && memo.filterKey === filterKey
        && memo.weekBucket === weekBucket
        && memo.poolReady === poolReady
      ) {
        if (isStale()) return;
        setRooms(memo.rooms);
        setPerAnchorLatencyMs(memo.latency);
        setLoading(false);
        return;
      }

      // Filter sets — reuse the shared one or build our own.
      let filterSets = sharedFilters;
      if (!filterSets) {
        const serviceIds = providerIds
          .map((id) => providerIdToServiceId(id))
          .filter(Boolean) as string[];
        if (serviceIds.length === 0) {
          if (isStale()) return;
          setRooms([]);
          setLoading(false);
          return;
        }
        filterSets = await buildFilterSets(serviceIds);
        if (isStale()) return;
      }
      if (filterSets.availableTmdbIds.size === 0) {
        if (isStale()) return;
        setRooms([]);
        setLoading(false);
        return;
      }

      const profile = await getV2TasteProfile();
      if (isStale()) return;
      if (!profile?.tasteVector) {
        setRooms([]);
        setLoading(false);
        return;
      }

      const userId = getAuthUserId();
      const currentKey = buildWeekKey(userId, weekBucket);
      const previousKey = buildWeekKey(userId, weekBucket - 1);
      const cachedThisWeek = readCache(currentKey);
      const cachedLastWeek = readCache(previousKey);
      const featuredLastWeek = new Set(
        (cachedLastWeek?.anchors ?? []).map(anchorKey),
      );

      // ── 1. Pick anchors (cached or fresh) ────────────────────────
      let anchors: SelectedAnchor[];
      let cachedLabels: Record<string, AnchorRoomLabel> = {};
      if (cachedThisWeek) {
        anchors = cachedThisWeek.anchors;
        // Pull labels persisted from a prior session — repeat opens
        // within the week render with thematic labels instantly.
        cachedLabels = cachedThisWeek.labels ?? {};
      } else {
        const selection: AnchorSelectionResult = await selectAnchors({
          userId: userId ?? '',
          tasteVector: profile.tasteVector,
          selectedClusterIds: profile.selectedClusters,
          interactionCount: profile.interactionCount,
          pool,
          sliders: sliders ?? profile.sliders,
        });
        if (isStale()) return;
        // Apply featuredLastWeek exclusion. If the exclusion empties
        // the row, fall back to the original selection — variety
        // penalty gives way to "something is better than nothing".
        const excluded = selection.anchors.filter(
          (a) => !featuredLastWeek.has(anchorKey(a)),
        );
        anchors = excluded.length > 0 ? excluded : selection.anchors;

        if (anchors.length > 0) {
          writeCache(currentKey, {
            anchors,
            computedAt: new Date().toISOString(),
          });
        }
      }

      if (anchors.length === 0) {
        if (isStale()) return;
        setRooms([]);
        setLoading(false);
        return;
      }

      // ── 2. Batch-fetch anchor title metadata + DB label cache ───
      // Both reads are blocking and run in parallel. The label cache
      // read is short (~50-200ms) and lets the initial render show
      // thematic labels without flicker for any anchor that's been
      // labelled by another user previously.
      const [anchorMetaMap, dbCachedLabels] = await Promise.all([
        fetchAnchorMetadata(anchors),
        getCachedAnchorLabels(
          anchors.map((a) => ({ tmdbId: a.tmdbId, mediaType: a.mediaType })),
        ),
      ]);
      if (isStale()) return;

      // Merge: localStorage takes precedence over DB cache (it's the
      // freshest copy seen by this client; DB cache is the canonical
      // shared source).
      const knownLabels: Record<string, AnchorRoomLabel> = { ...cachedLabels };
      for (const [key, label] of dbCachedLabels) {
        if (!knownLabels[key]) knownLabels[key] = label;
      }

      // ── 3. Build rooms in parallel ───────────────────────────────
      const built = await Promise.all(
        anchors.map(async (anchor) => {
          const t0 = Date.now();
          const result = await buildAnchoredRoom({
            anchorTmdbId: anchor.tmdbId,
            anchorMediaType: anchor.mediaType,
            filterSets: filterSets!,
            limit: ROOM_LIMIT,
            matchLimit: ROOM_MATCH_LIMIT,
            // Anchored mood rooms include watchlist titles — see
            // anchoredRoom.ts for the rationale.
            excludeWatchlist: false,
          });
          const elapsed = Date.now() - t0;

          const meta = anchorMetaMap.get(anchorKey(anchor));
          if (!meta || result.items.length === 0) {
            return { preview: null, latency: elapsed };
          }

          // Pull top titles for the LLM prompt — pass titles + years
          // only, the Edge Function doesn't need ContentItem shape.
          const topTitlesForLabel = result.items.slice(0, 8).map((item) => ({
            title: item.title,
            year: item.year ?? null,
          }));

          const preview: AnchorRoomPreview = {
            id: `anchor:${anchor.mediaType}-${anchor.tmdbId}`,
            anchor,
            anchorTitle: meta.title,
            anchorYear: meta.release_year,
            anchorMediaType: anchor.mediaType,
            thumbnails: result.items.slice(0, THUMBNAIL_LIMIT),
            titleCount: result.items.length,
            // Initial render uses any known label (localStorage or DB
            // cache). Anchors with no known label render with the
            // literal "If you love {anchor}" fallback until the
            // Edge Function resolves them in step 4.
            llmLabel: knownLabels[anchorKey(anchor)] ?? null,
            topTitlesForLabel,
          };
          return { preview, latency: elapsed };
        }),
      );

      const previews = built
        .map((b) => b.preview)
        .filter((p): p is AnchorRoomPreview => p != null);
      const latencies = built.map((b) => b.latency);

      if (isStale()) return;
      memoCacheRef.current = {
        providerKey,
        filterKey,
        weekBucket,
        poolReady,
        rooms: previews,
        latency: latencies,
      };
      setRooms(previews);
      setPerAnchorLatencyMs(latencies);

      // ── 4. Generate labels for any cache misses via Edge Function ─
      // Only fires for anchors no user has labelled before (true cold
      // path). When labels resolve, swap the cards in-place AND persist
      // back to localStorage so the next session for this user is also
      // flicker-free.
      void resolveMissingLabels(previews, isStale, (updated) => {
        if (isStale()) return;
        memoCacheRef.current = memoCacheRef.current && {
          ...memoCacheRef.current,
          rooms: updated,
        };
        setRooms(updated);
        // Persist resolved labels back to localStorage.
        const labelsByKey: Record<string, AnchorRoomLabel> = {};
        for (const p of updated) {
          if (p.llmLabel) labelsByKey[anchorKey(p.anchor)] = p.llmLabel;
        }
        if (Object.keys(labelsByKey).length > 0 && anchors.length > 0) {
          writeCache(currentKey, {
            anchors,
            computedAt: new Date().toISOString(),
            labels: labelsByKey,
          });
        }
      });
    } catch (e) {
      if (isStale()) return;
      setError(e instanceof Error ? e.message : String(e));
      setRooms([]);
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [providerKey, filterKey, providerIds, sharedFilters, pool, sliders, poolReady]);

  useEffect(() => {
    // IN-466: skip the client-side anchor selection + room generation
    // when the Edge Function has already pre-built them. The fast-path
    // useEffect above takes over.
    if (prebuiltRooms) return;
    void load();
  }, [load, prebuiltRooms]);

  return { rooms, loading, error, perAnchorLatencyMs };
}


// ── Internals ──────────────────────────────────────────────────────

/**
 * Fire the label-anchor-room Edge Function for any anchor without a
 * cached label, in parallel. Each label commit updates state and
 * persists back to localStorage immediately so the swap is visible
 * mid-session and survives cold starts.
 *
 * The DB cache + localStorage are checked BEFORE this runs (in the
 * main load function), so this only fires for true cold-cache anchors
 * — typically once per anchor across the user base.
 */
async function resolveMissingLabels(
  initial: AnchorRoomPreview[],
  isStale: () => boolean,
  commit: (next: AnchorRoomPreview[]) => void,
): Promise<void> {
  const misses = initial.filter((p) => p.llmLabel == null);
  if (misses.length === 0) return;

  let working = initial;
  await Promise.all(
    misses.map(async (preview) => {
      const result = await requestAnchorLabel(
        {
          ...preview.anchor,
          title: preview.anchorTitle,
          year: preview.anchorYear,
        },
        preview.topTitlesForLabel,
      );
      if (isStale() || !result) return;
      working = working.map((p) =>
        p.id === preview.id ? { ...p, llmLabel: result } : p,
      );
      commit(working);
    }),
  );
}

function getCurrentWeekBucket(): number {
  return Math.floor((Date.now() - EPOCH_MONDAY_MS) / MS_PER_WEEK);
}

function buildWeekKey(userId: string | null, weekBucket: number): string {
  const userPart = userId ?? 'anon';
  return `${WEEKLY_CACHE_PREFIX}.${userPart}.${weekBucket}`;
}

function readCache(key: string): AnchorCacheEntry | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AnchorCacheEntry;
    if (!Array.isArray(parsed.anchors) || typeof parsed.computedAt !== 'string') {
      return null;
    }
    const age = Date.now() - new Date(parsed.computedAt).getTime();
    if (age > WEEKLY_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, entry: AnchorCacheEntry): void {
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Quota or storage disabled. Drop silently.
  }
}

function anchorKey(a: { tmdbId: number; mediaType: 'movie' | 'tv' }): string {
  return `${a.mediaType}-${a.tmdbId}`;
}

async function fetchAnchorMetadata(
  anchors: SelectedAnchor[],
): Promise<Map<string, ExtendedTitleRow>> {
  const map = new Map<string, ExtendedTitleRow>();
  if (anchors.length === 0) return map;

  const ids = [...new Set(anchors.map((a) => a.tmdbId))];
  const { data, error } = await supabase
    .from('titles')
    .select(EXTENDED_TITLE_SELECT)
    .in('tmdb_id', ids);
  if (error || !data) return map;

  for (const row of data) {
    const typed = row as unknown as ExtendedTitleRow;
    map.set(`${typed.media_type}-${typed.tmdb_id}`, typed);
  }
  return map;
}


export const __testables = {
  getCurrentWeekBucket,
  buildWeekKey,
};
