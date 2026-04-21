/**
 * Mood rooms data access.
 *
 * Reads the current generation of mood_rooms / mood_room_titles produced
 * by the monthly Python clustering job (scripts/mood_rooms/recluster.py).
 *
 * Every query filters by `version = (SELECT MAX(version) FROM mood_rooms)`
 * via inline subquery. We do not cache the max version in a module-level
 * variable: it survives hot-reload confusingly in dev and goes stale if a
 * re-clustering run completes while a client session is open.
 *
 * Service availability is applied client-side against FilterSets.availableTmdbIds
 * (see IN-458 in the Parking Lot for the media_type-imprecision caveat
 * that mood rooms inherit from the rest of the app).
 */

import { supabase } from '../supabase';
import { titleRowToContentItem } from '../recommendations-v2/titleAdapter';
import { EXTENDED_TITLE_SELECT, type ExtendedTitleRow } from '../recommendations-v2/types';
import type { ContentItem } from '@/components/ContentCard';


const ROOM_METADATA_SELECT =
  'id, label, description, centroid, title_count, version, is_curated';

/** Core mood room metadata used for scoring and card rendering. */
export interface MoodRoom {
  id: string;
  label: string;
  description: string | null;
  /** 1536D unit-normalised centroid; used for taste-fit scoring. */
  centroid: number[];
  titleCount: number;
  version: number;
  isCurated: boolean;
}

/** Mood room preview: metadata + 3-4 thumbnails for the For You card. */
export interface MoodRoomPreview {
  room: MoodRoom;
  thumbnails: ContentItem[];
}

/** Full mood room page payload: metadata + ordered title grid. */
export interface MoodRoomDetail {
  room: MoodRoom;
  /** Titles available on the user's services, sorted by centrality ascending. */
  items: ContentItem[];
  /** Total titles in the room regardless of availability. */
  totalTitleCount: number;
}


type RoomRow = {
  id: string;
  label: string;
  description: string | null;
  centroid: unknown;   // pgvector text form '[v1,v2,...]' or number[]
  title_count: number;
  version: number;
  is_curated: boolean;
};


function parseCentroid(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw.map(Number);
  if (typeof raw === 'string') {
    return JSON.parse(raw);
  }
  return [];
}


function rowToRoom(row: RoomRow): MoodRoom {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    centroid: parseCentroid(row.centroid),
    titleCount: row.title_count,
    version: row.version,
    isCurated: row.is_curated,
  };
}


/**
 * Fetch all mood rooms at the latest version that have at least
 * `minAvailableTitles` titles playable on the user's services.
 *
 * Two-query design (Option A from plan §A7): pull all rooms, then
 * prune by availability client-side. At 68 rooms this is cheap and
 * avoids an RPC surface-expansion for filtering. availableTmdbIds is
 * tmdb_id-only (see IN-458); we inherit the imprecision.
 */
export async function getLatestMoodRooms(
  availableTmdbIds: Set<number>,
  minAvailableTitles = 10,
): Promise<MoodRoom[]> {
  const latestVersion = await getLatestVersion();
  if (latestVersion == null) return [];

  const { data: rooms, error } = await supabase
    .from('mood_rooms')
    .select(ROOM_METADATA_SELECT)
    .eq('version', latestVersion)
    .returns<RoomRow[]>();

  if (error || !rooms || rooms.length === 0) return [];

  const availabilityByRoom = await getAvailabilityCountsByRoom(
    rooms.map((r) => r.id),
    availableTmdbIds,
  );

  return rooms
    .filter((r) => (availabilityByRoom.get(r.id) ?? 0) >= minAvailableTitles)
    .map(rowToRoom);
}


/**
 * Fetch one mood room plus every title in it, filtered by availability
 * and sorted by centrality ascending (most central first).
 */
export async function getMoodRoomById(
  roomId: string,
  availableTmdbIds: Set<number>,
): Promise<MoodRoomDetail | null> {
  const { data: roomData, error: roomError } = await supabase
    .from('mood_rooms')
    .select(ROOM_METADATA_SELECT)
    .eq('id', roomId)
    .maybeSingle<RoomRow>();

  if (roomError || !roomData) return null;

  const { data: memberships, error: membershipError } = await supabase
    .from('mood_room_titles')
    .select('tmdb_id, media_type, centrality')
    .eq('mood_room_id', roomId)
    .order('centrality', { ascending: true })
    .returns<Array<{ tmdb_id: number; media_type: 'movie' | 'tv'; centrality: number }>>();

  if (membershipError || !memberships) {
    return {
      room: rowToRoom(roomData),
      items: [],
      totalTitleCount: roomData.title_count,
    };
  }

  const available = memberships.filter((m) => availableTmdbIds.has(m.tmdb_id));
  const items = await hydrateTitles(available);

  return {
    room: rowToRoom(roomData),
    items,
    totalTitleCount: roomData.title_count,
  };
}


/**
 * Fetch the N most-central available titles for one room, for use as
 * preview thumbnails on the For You card.
 */
export async function getMoodRoomPreviewThumbnails(
  roomId: string,
  availableTmdbIds: Set<number>,
  limit = 4,
): Promise<ContentItem[]> {
  // Over-fetch to account for availability filtering. The most central
  // title may not be on the user's services.
  const fetchLimit = Math.max(limit * 4, 16);

  const { data, error } = await supabase
    .from('mood_room_titles')
    .select('tmdb_id, media_type, centrality')
    .eq('mood_room_id', roomId)
    .order('centrality', { ascending: true })
    .limit(fetchLimit)
    .returns<Array<{ tmdb_id: number; media_type: 'movie' | 'tv'; centrality: number }>>();

  if (error || !data) return [];

  const available = data.filter((m) => availableTmdbIds.has(m.tmdb_id)).slice(0, limit);
  return hydrateTitles(available);
}


async function getLatestVersion(): Promise<number | null> {
  const { data, error } = await supabase
    .from('mood_rooms')
    .select('version')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number }>();

  if (error || !data) return null;
  return data.version;
}


async function getAvailabilityCountsByRoom(
  roomIds: string[],
  availableTmdbIds: Set<number>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (roomIds.length === 0) return counts;

  const { data, error } = await supabase
    .from('mood_room_titles')
    .select('mood_room_id, tmdb_id')
    .in('mood_room_id', roomIds)
    .returns<Array<{ mood_room_id: string; tmdb_id: number }>>();

  if (error || !data) return counts;

  for (const row of data) {
    if (!availableTmdbIds.has(row.tmdb_id)) continue;
    counts.set(row.mood_room_id, (counts.get(row.mood_room_id) ?? 0) + 1);
  }
  return counts;
}


/**
 * Hydrate a list of (tmdb_id, media_type) pairs into ContentItem objects.
 *
 * Uses a single `tmdb_id = ANY(...)` query and client-side joins on
 * (tmdb_id, media_type) to pick the correct row when the same tmdb_id
 * exists as both a movie and a TV show. Preserves input order.
 */
async function hydrateTitles(
  rows: Array<{ tmdb_id: number; media_type: 'movie' | 'tv' }>,
): Promise<ContentItem[]> {
  if (rows.length === 0) return [];

  const tmdbIds = Array.from(new Set(rows.map((r) => r.tmdb_id)));

  const { data, error } = await supabase
    .from('titles')
    .select(EXTENDED_TITLE_SELECT)
    .in('tmdb_id', tmdbIds)
    .returns<ExtendedTitleRow[]>();

  if (error || !data) return [];

  const byKey = new Map<string, ExtendedTitleRow>();
  for (const row of data) {
    byKey.set(`${row.media_type}-${row.tmdb_id}`, row);
  }

  const items: ContentItem[] = [];
  for (const r of rows) {
    const meta = byKey.get(`${r.media_type}-${r.tmdb_id}`);
    if (meta) items.push(titleRowToContentItem(meta));
  }
  return items;
}
