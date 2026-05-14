/**
 * Mood rooms data access.
 *
 * Thin wrapper over three server-side RPCs introduced in migration 031:
 *   - get_mood_rooms_for_user: availability-filtered, taste-ranked rooms
 *   - get_mood_room_thumbnails: preview thumbnails for the For You cards
 *   - get_mood_room_detail: full per-room title list for MoodRoomPage
 *
 * Earlier versions of this module did the availability counting and
 * taste-fit scoring client-side, which tripped over PostgREST's
 * 1000-row cap on the mood_room_titles read and silently filtered most
 * rooms out. The RPCs do everything server-side in bounded payloads.
 *
 * Availability IDs are still `Set<number>` (tmdb_id only, no
 * media_type). See IN-458 for the cross-type imprecision this inherits
 * from the rest of the app.
 */

import { supabase } from '../supabase';
import { buildPosterUrl } from './tmdb';
import { GENRE_NAMES } from '../constants/genres';
import { titleRowToContentItem } from '../recommendations-v2/titleAdapter';
import type { ExtendedTitleRow } from '../recommendations-v2/types';
import type { ContentItem } from '@/components/ContentCard';


/** Ranked mood room with preview thumbnails, for the For You row. */
export interface MoodRoomPreview {
  room: {
    id: string;
    label: string;
    description: string | null;
    titleCount: number;
    availableCount: number;
    /** Cosine distance to user's taste vector; lower = closer. */
    tasteDistance: number;
  };
  /** Up to 4 most-central available titles. */
  thumbnails: ContentItem[];
}


/** Full detail payload for the per-room page. */
export interface MoodRoomDetail {
  label: string;
  description: string | null;
  totalTitleCount: number;
  /** Availability-filtered, centrality-ordered (most central first). */
  items: ContentItem[];
}


type RankedRoomRow = {
  room_id: string;
  label: string;
  description: string | null;
  title_count: number;
  available_count: number;
  taste_distance: number;
};


type ThumbnailRow = {
  mood_room_id: string;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  release_year: number | null;
  genre_ids: number[] | null;
  centrality: number;
};


type DetailRow = {
  label: string;
  description: string | null;
  total_title_count: number;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  release_year: number | null;
  overview: string | null;
  genre_ids: number[] | null;
  vote_average: number | null;
  vote_count: number | null;
  popularity: number | null;
  original_language: string | null;
  runtime: number | null;
  centrality: number;
};


/**
 * Fetch the taste-ranked mood rooms for a user, each with their preview
 * thumbnails. Two round trips: one for ranking, one for thumbnails.
 *
 * `tasteVector` is expected to be 1536D and L2-normalised (matches the
 * room centroids). Pass null only if taste is unavailable — the RPC
 * signature requires a vector, so we synthesise a neutral zero vector
 * in that case and the scoring produces a coverage-ranked fallback.
 */
export async function getRankedMoodRoomsWithThumbnails(
  tasteVector: number[] | null,
  availableTmdbIds: Set<number>,
  limit = 5,
  minAvailableTitles = 10,
): Promise<MoodRoomPreview[]> {
  if (availableTmdbIds.size === 0) return [];

  // The RPC requires a non-null vector. For cold-start users without a
  // taste vector yet, a zero vector makes every room equidistant and
  // the LIMIT clause slices essentially at random — acceptable fallback
  // until interactions populate the vector.
  const vector = tasteVector ?? new Array(1536).fill(0);
  const vectorStr = `[${vector.join(',')}]`;

  const { data: rankedRaw, error: rankErr } = await supabase.rpc('get_mood_rooms_for_user', {
    user_taste_vector: vectorStr,
    available_tmdb_ids: Array.from(availableTmdbIds),
    min_available_titles: minAvailableTitles,
    result_limit: limit,
  });

  if (rankErr || !rankedRaw) return [];
  const ranked = rankedRaw as unknown as RankedRoomRow[];
  if (ranked.length === 0) return [];

  const { data: thumbsRaw, error: thumbsErr } = await supabase.rpc('get_mood_room_thumbnails', {
    room_ids: ranked.map((r) => r.room_id),
    available_tmdb_ids: Array.from(availableTmdbIds),
    per_room_limit: 4,
  });

  if (thumbsErr) {
    // Thumbnails are non-essential — we can still return rooms with
    // empty thumbnail arrays rather than fail the whole row.
    console.error('[moodRooms] thumbnails RPC failed:', thumbsErr.message);
  }

  const thumbs = (thumbsRaw ?? []) as ThumbnailRow[];
  const thumbsByRoom = new Map<string, ThumbnailRow[]>();
  for (const t of thumbs) {
    const list = thumbsByRoom.get(t.mood_room_id) ?? [];
    list.push(t);
    thumbsByRoom.set(t.mood_room_id, list);
  }

  return ranked.map((r) => ({
    room: {
      id: r.room_id,
      label: r.label,
      description: r.description,
      titleCount: r.title_count,
      availableCount: r.available_count,
      tasteDistance: r.taste_distance,
    },
    thumbnails: (thumbsByRoom.get(r.room_id) ?? []).map(thumbnailRowToContentItem),
  }));
}


/**
 * Fetch one mood room's full title list for MoodRoomPage.
 * Availability-filtered, centrality-sorted.
 */
export async function getMoodRoomDetail(
  roomId: string,
  availableTmdbIds: Set<number>,
): Promise<MoodRoomDetail | null> {
  if (availableTmdbIds.size === 0) return null;

  const { data: dataRaw, error } = await supabase.rpc('get_mood_room_detail', {
    room_id: roomId,
    available_tmdb_ids: Array.from(availableTmdbIds),
  });

  if (error || !dataRaw) return null;
  const data = dataRaw as unknown as DetailRow[];
  if (data.length === 0) return null;

  // Every row carries the same label/description/total. Pull from first.
  const first = data[0];
  const items = data.map(detailRowToContentItem);

  return {
    label: first.label,
    description: first.description,
    totalTitleCount: first.total_title_count,
    items,
  };
}


function thumbnailRowToContentItem(row: ThumbnailRow): ContentItem {
  const genreIds = row.genre_ids ?? [];
  const primaryGenreId = genreIds[0];
  return {
    id: `${row.media_type}-${row.tmdb_id}`,
    title: row.title,
    image: buildPosterUrl(row.poster_path) || '',
    services: [],
    year: row.release_year ?? undefined,
    type: row.media_type,
    genre: primaryGenreId ? GENRE_NAMES[primaryGenreId] : undefined,
    genreIds,
  };
}


function detailRowToContentItem(row: DetailRow): ContentItem {
  // Project onto the ExtendedTitleRow shape the existing adapter expects.
  const titleLike: ExtendedTitleRow = {
    tmdb_id: row.tmdb_id,
    media_type: row.media_type,
    title: row.title,
    poster_path: row.poster_path,
    backdrop_path: null,
    overview: row.overview,
    release_date: null,
    release_year: row.release_year,
    genre_ids: row.genre_ids,
    vote_average: row.vote_average,
    vote_count: row.vote_count,
    popularity: row.popularity,
    original_language: row.original_language,
    runtime: row.runtime,
    cast_top_5: null,
    director: null,
    rt_score: null,
    imdb_rating: null,
  };
  return titleRowToContentItem(titleLike);
}
