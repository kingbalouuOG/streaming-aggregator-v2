/**
 * useMoodRoomsRow
 *
 * Sister hook to useForYouContent. Produces the "Mood Rooms for
 * Tonight" row (position 2 on For You) from the mood_rooms /
 * mood_room_titles tables populated by the monthly Python
 * clustering job.
 *
 * Two layers of selection:
 *
 *   1. Weekly pool. Picked once per (user, weekBucket) and cached in
 *      localStorage. Score = cosineSim(tasteVector, centroid) minus
 *      a small variety penalty for rooms featured last week. Size is
 *      MOOD_ROOM_WEEKLY_POOL_SIZE.
 *
 *   2. Within-week ordering. On every render, reorder the weekly
 *      pool by the current time-of-day bucket's genre affinity, then
 *      stable-shuffle the remainder with a session-seeded RNG.
 *
 * The hook is intentionally independent of useForYouContent:
 * different data source, different cache semantics, no shared pool.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getAuthUserId } from '@/lib/storage';
import { getV2TasteProfile } from '@/lib/taste-v2/tasteProfileV2';
import { buildFilterSets, type FilterSets } from '@/lib/recommendations-v2/hardFilters';
import { providerIdToServiceId } from '@/lib/adapters/platformAdapter';
import {
  MOOD_ROOM_BUCKET_GENRE_AFFINITY,
  MOOD_ROOM_VARIETY_PENALTY,
  MOOD_ROOM_WEEKLY_POOL_SIZE,
  getCurrentTimeBucket,
  type MoodRoomTimeBucket,
} from '@/lib/recommendations-v2/weights';
import {
  getLatestMoodRooms,
  getMoodRoomPreviewThumbnails,
  type MoodRoom,
  type MoodRoomPreview,
} from '@/lib/api/supabaseMoodRooms';


const WEEKLY_POOL_CACHE_PREFIX = 'videx.mood_rooms.weekly_pool.v1';
const WEEKLY_POOL_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days
const EPOCH_MONDAY_MS = Date.UTC(2024, 0, 1);        // Mon 1 Jan 2024 UTC
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;


interface WeeklyPoolCacheEntry {
  roomIds: string[];
  computedAt: string;  // ISO8601, for debugging and TTL sanity
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

  // Stabilise providerIds for effect deps — array identity churns on every render.
  const providerKey = useMemo(() => [...providerIds].sort().join(','), [providerIds]);
  const filterKey = sharedFilters ? sharedFilters.availableTmdbIds.size : 0;

  // Latest result keyed by the inputs that produced it. Lets re-renders
  // through the time-of-day reorder without re-fetching.
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

      // Re-use cached pool if inputs match.
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

      // Resolve filter sets — prefer the shared set from the For You pipeline.
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
      const cacheKey = buildWeeklyPoolKey(userId, weekBucket);
      const previousWeekKey = buildWeeklyPoolKey(userId, weekBucket - 1);

      const cachedPool = readWeeklyPoolFromStorage(cacheKey);
      const previousWeekPool = readWeeklyPoolFromStorage(previousWeekKey);
      const featuredLastWeek = new Set(previousWeekPool?.roomIds ?? []);

      // Fetch candidate rooms up front — we need them either to resolve
      // a fresh pool or to hydrate cached ids back into MoodRoom objects.
      const candidates = await getLatestMoodRooms(filterSets.availableTmdbIds);

      let selectedRoomIds: string[];

      if (cachedPool) {
        // Prune cached ids that no longer exist (re-clustering could have
        // retired some). The row will silently shrink rather than error.
        const existing = new Set(candidates.map((c) => c.id));
        selectedRoomIds = cachedPool.roomIds.filter((id) => existing.has(id));
      } else {
        const taste = await getV2TasteProfile().catch(() => null);
        const tasteVector = taste?.tasteVector ?? null;
        selectedRoomIds = pickWeeklyPool(
          candidates, tasteVector, featuredLastWeek, MOOD_ROOM_WEEKLY_POOL_SIZE,
        );
        writeWeeklyPoolToStorage(cacheKey, {
          roomIds: selectedRoomIds,
          computedAt: new Date().toISOString(),
        });
      }

      // Hydrate selected rooms + preview thumbnails in parallel.
      const byId = new Map(candidates.map((c) => [c.id, c]));
      const previews = await Promise.all(
        selectedRoomIds
          .map((id) => byId.get(id))
          .filter((room): room is MoodRoom => room != null)
          .map(async (room) => {
            const thumbnails = await getMoodRoomPreviewThumbnails(
              room.id, filterSets!.availableTmdbIds, 4,
            );
            return { room, thumbnails };
          }),
      );

      poolCacheRef.current = { providerKey, filterKey, weekBucket, rooms: previews };
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
    // Defence against clocks-back-in-time: if the cached entry is older
    // than the TTL window, treat it as absent.
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


function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}


function pickWeeklyPool(
  candidates: MoodRoom[],
  tasteVector: number[] | null,
  featuredLastWeek: Set<string>,
  size: number,
): string[] {
  if (candidates.length === 0) return [];

  // If no taste vector, fall back to descending title_count — bigger,
  // more representative rooms surface first. This is the cold-start
  // path before the user has enough interactions for a trained vector.
  const scored = candidates.map((room) => {
    const fit = tasteVector ? cosineSim(tasteVector, room.centroid) : room.titleCount / 1000;
    const penalty = featuredLastWeek.has(room.id) ? MOOD_ROOM_VARIETY_PENALTY : 0;
    return { room, score: fit - penalty };
  });

  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, size).map((s) => s.room.id);
}


function reorderByTimeOfDay(previews: MoodRoomPreview[]): MoodRoomPreview[] {
  if (previews.length <= 1) return previews;
  const bucket = getCurrentTimeBucket();
  const affinityGenres = new Set(MOOD_ROOM_BUCKET_GENRE_AFFINITY[bucket]);

  if (bucket === 'default' || affinityGenres.size === 0) {
    return previews;
  }

  // Score each preview by how many preview-thumbnail genres overlap the
  // bucket's preferred set. Using the preview thumbnails as a genre
  // proxy avoids needing to fetch genres for every room in the pool.
  const withScores = previews.map((p) => {
    let score = 0;
    for (const t of p.thumbnails) {
      for (const g of t.genreIds ?? []) {
        if (affinityGenres.has(g)) score += 1;
      }
    }
    return { preview: p, score };
  });

  // Stable sort: ties preserve original order.
  withScores.sort((x, y) => y.score - x.score);
  return withScores.map((w) => w.preview);
}


// ── exports for tests / debugging ─────────────────────────────────

export const __testables = {
  getCurrentWeekBucket,
  buildWeeklyPoolKey,
  pickWeeklyPool,
  reorderByTimeOfDay,
};
