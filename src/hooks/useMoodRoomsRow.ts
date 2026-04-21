/**
 * useMoodRoomsRow
 *
 * Sister hook to useForYouContent. Produces the "Mood Rooms for
 * Tonight" row (position 2 on For You) via server-side RPCs.
 *
 * Data flow:
 *   - Weekly pool roomIds cached in localStorage, keyed on
 *     (userId, weekBucket). TTL 7 days. Cache hit means we skip the
 *     taste-fit ranking RPC for the week.
 *   - Cache miss: call get_mood_rooms_for_user with an over-fetch
 *     (result_limit = pool size + variety buffer), exclude any rooms
 *     featured last week, pick top N, cache the roomIds.
 *   - Hydrate the selected rooms' thumbnails via
 *     get_mood_room_thumbnails in a single RPC call.
 *   - Time-of-day reorder applied on every render (not cached).
 *
 * Independent of useForYouContent: different data source, different
 * cache semantics, no shared pool.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getAuthUserId } from '@/lib/storage';
import { getV2TasteProfile } from '@/lib/taste-v2/tasteProfileV2';
import { buildFilterSets, type FilterSets } from '@/lib/recommendations-v2/hardFilters';
import { providerIdToServiceId } from '@/lib/adapters/platformAdapter';
import {
  MOOD_ROOM_BUCKET_GENRE_AFFINITY,
  MOOD_ROOM_WEEKLY_POOL_SIZE,
  getCurrentTimeBucket,
} from '@/lib/recommendations-v2/weights';
import {
  getRankedMoodRoomsWithThumbnails,
  type MoodRoomPreview,
} from '@/lib/api/supabaseMoodRooms';


const WEEKLY_POOL_CACHE_PREFIX = 'videx.mood_rooms.weekly_pool.v1';
const WEEKLY_POOL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EPOCH_MONDAY_MS = Date.UTC(2024, 0, 1);
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * When computing a fresh weekly pool, over-fetch by this buffer so we
 * have room to exclude previously-featured rooms before slicing to
 * MOOD_ROOM_WEEKLY_POOL_SIZE. If every one of the top (pool+buffer)
 * rooms was also featured last week, we fall back to using them anyway
 * — variety penalty gives way to "something is better than nothing".
 */
const WEEKLY_POOL_OVERFETCH_BUFFER = MOOD_ROOM_WEEKLY_POOL_SIZE;


interface WeeklyPoolCacheEntry {
  roomIds: string[];
  computedAt: string;
}


export interface UseMoodRoomsRowResult {
  rooms: MoodRoomPreview[];
  loading: boolean;
  error: string | null;
}


export function useMoodRoomsRow(
  providerIds: number[],
  sharedFilters: FilterSets | null,
): UseMoodRoomsRowResult {
  const [rooms, setRooms] = useState<MoodRoomPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const providerKey = useMemo(
    () => [...providerIds].sort().join(','),
    [providerIds],
  );
  const filterKey = sharedFilters ? sharedFilters.availableTmdbIds.size : 0;

  // In-memory cache keyed on inputs so re-renders pass through the
  // time-of-day reorder without re-fetching.
  const poolCacheRef = useRef<{
    providerKey: string;
    filterKey: number;
    weekBucket: number;
    rooms: MoodRoomPreview[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const weekBucket = getCurrentWeekBucket();

      const cached = poolCacheRef.current;
      if (
        cached
        && cached.providerKey === providerKey
        && cached.filterKey === filterKey
        && cached.weekBucket === weekBucket
      ) {
        setRooms(reorderByTimeOfDay(cached.rooms));
        setLoading(false);
        return;
      }

      let filterSets = sharedFilters;
      if (!filterSets) {
        const serviceIds = providerIds
          .map((id) => providerIdToServiceId(id))
          .filter(Boolean) as string[];
        if (serviceIds.length === 0) {
          setRooms([]);
          setLoading(false);
          return;
        }
        filterSets = await buildFilterSets(serviceIds);
      }

      if (filterSets.availableTmdbIds.size === 0) {
        setRooms([]);
        setLoading(false);
        return;
      }

      const userId = getAuthUserId();
      const currentWeekKey = buildWeeklyPoolKey(userId, weekBucket);
      const previousWeekKey = buildWeeklyPoolKey(userId, weekBucket - 1);

      const cachedPool = readWeeklyPoolFromStorage(currentWeekKey);
      const previousWeekPool = readWeeklyPoolFromStorage(previousWeekKey);
      const featuredLastWeek = new Set(previousWeekPool?.roomIds ?? []);

      const taste = await getV2TasteProfile().catch(() => null);
      const tasteVector = taste?.tasteVector ?? null;

      let previews: MoodRoomPreview[];

      if (cachedPool && cachedPool.roomIds.length > 0) {
        // Re-hydrate the cached roomIds with fresh thumbnails. We over-
        // fetch from the RPC and match by id so we pick up any label /
        // description changes (e.g. after the April 2026 relabel).
        const fresh = await getRankedMoodRoomsWithThumbnails(
          tasteVector,
          filterSets.availableTmdbIds,
          MOOD_ROOM_WEEKLY_POOL_SIZE + WEEKLY_POOL_OVERFETCH_BUFFER,
        );
        const byId = new Map(fresh.map((p) => [p.room.id, p]));
        previews = cachedPool.roomIds
          .map((id) => byId.get(id))
          .filter((p): p is MoodRoomPreview => p != null);
      } else {
        // Fresh pool: fetch more than we need, exclude last-week rooms,
        // then take top N. If the exclusion empties us out, fall back.
        const overfetched = await getRankedMoodRoomsWithThumbnails(
          tasteVector,
          filterSets.availableTmdbIds,
          MOOD_ROOM_WEEKLY_POOL_SIZE + WEEKLY_POOL_OVERFETCH_BUFFER,
        );
        const excluded = overfetched.filter(
          (p) => !featuredLastWeek.has(p.room.id),
        );
        previews = (
          excluded.length >= MOOD_ROOM_WEEKLY_POOL_SIZE ? excluded : overfetched
        ).slice(0, MOOD_ROOM_WEEKLY_POOL_SIZE);

        if (previews.length > 0) {
          writeWeeklyPoolToStorage(currentWeekKey, {
            roomIds: previews.map((p) => p.room.id),
            computedAt: new Date().toISOString(),
          });
        }
      }

      poolCacheRef.current = {
        providerKey, filterKey, weekBucket, rooms: previews,
      };
      setRooms(reorderByTimeOfDay(previews));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, [providerKey, filterKey, providerIds, sharedFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rooms, loading, error };
}


// ── internals ──────────────────────────────────────────────────────

function getCurrentWeekBucket(): number {
  return Math.floor((Date.now() - EPOCH_MONDAY_MS) / MS_PER_WEEK);
}


function buildWeeklyPoolKey(userId: string | null, weekBucket: number): string {
  const userPart = userId ?? 'anon';
  return `${WEEKLY_POOL_CACHE_PREFIX}.${userPart}.${weekBucket}`;
}


function readWeeklyPoolFromStorage(key: string): WeeklyPoolCacheEntry | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeeklyPoolCacheEntry;
    if (!Array.isArray(parsed.roomIds) || typeof parsed.computedAt !== 'string') {
      return null;
    }
    const age = Date.now() - new Date(parsed.computedAt).getTime();
    if (age > WEEKLY_POOL_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}


function writeWeeklyPoolToStorage(key: string, entry: WeeklyPoolCacheEntry): void {
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Quota exhausted or storage disabled. Silently drop.
  }
}


function reorderByTimeOfDay(previews: MoodRoomPreview[]): MoodRoomPreview[] {
  if (previews.length <= 1) return previews;
  const bucket = getCurrentTimeBucket();
  const affinityGenres = new Set(MOOD_ROOM_BUCKET_GENRE_AFFINITY[bucket]);

  if (bucket === 'default' || affinityGenres.size === 0) {
    return previews;
  }

  const scored = previews.map((p) => {
    let score = 0;
    for (const t of p.thumbnails) {
      for (const g of t.genreIds ?? []) {
        if (affinityGenres.has(g)) score += 1;
      }
    }
    return { preview: p, score };
  });

  scored.sort((x, y) => y.score - x.score);
  return scored.map((w) => w.preview);
}


export const __testables = {
  getCurrentWeekBucket,
  buildWeeklyPoolKey,
  reorderByTimeOfDay,
};
