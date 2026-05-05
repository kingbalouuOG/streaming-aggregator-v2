-- ============================================
-- Phase 4.5 fix - Mood rooms server-side RPCs
-- Migration 031
-- ============================================
--
-- Fixes a latency + correctness bug surfaced during Gate 4 smoke:
-- the previous client-side data access path for mood_rooms did the
-- availability-count work in JS, which required pulling all 10K
-- mood_room_titles rows to the browser. PostgREST caps responses at
-- 1000 rows, so the counts were computed against an arbitrary sampled
-- subset and only the 2 biggest rooms reliably passed the >=10-
-- available-titles threshold. All other rooms were silently filtered
-- out before taste-fit scoring even ran.
--
-- These three RPCs move the availability filter, taste-fit scoring,
-- preview-thumbnail selection, and per-room hydration into Postgres,
-- returning fully-ranked results in bounded payloads. The client-side
-- code path collapses from ~13 round trips to 2 (row + details).
--
-- Depends on: pgvector (migration 018), pgcrypto (migration 029).
--
-- Security: all three are SECURITY INVOKER (default) and inherit the
-- `authenticated SELECT` RLS policies on mood_rooms and
-- mood_room_titles. No service_role elevation.

-- ----------------------------------------------
-- get_mood_rooms_for_user
-- ----------------------------------------------
-- Ranks the full current generation of mood rooms by cosine distance
-- to a user's taste vector, filters to rooms with at least
-- `min_available_titles` titles on the user's services, and returns
-- the top `result_limit` ranked ascending by distance (most similar
-- first).
--
-- Inputs:
--   user_taste_vector     - 1536D L2-normalised taste vector
--   available_tmdb_ids    - array of tmdb_ids on the user's services
--   min_available_titles  - eligibility threshold (default 10)
--   result_limit          - how many rooms to return (default 5)

CREATE OR REPLACE FUNCTION get_mood_rooms_for_user(
  user_taste_vector vector(1536),
  available_tmdb_ids integer[],
  min_available_titles integer DEFAULT 10,
  result_limit integer DEFAULT 5
) RETURNS TABLE (
  room_id uuid,
  label text,
  description text,
  title_count integer,
  available_count integer,
  taste_distance real
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH latest AS (
    SELECT MAX(version) AS v FROM mood_rooms
  ),
  room_avail AS (
    SELECT
      mrt.mood_room_id,
      COUNT(*)::integer AS available_count
    FROM mood_room_titles mrt
    JOIN mood_rooms m ON m.id = mrt.mood_room_id
    JOIN latest ON m.version = latest.v
    WHERE mrt.tmdb_id = ANY(available_tmdb_ids)
    GROUP BY mrt.mood_room_id
  )
  SELECT
    m.id AS room_id,
    m.label,
    m.description,
    m.title_count,
    ra.available_count,
    (m.centroid <=> user_taste_vector)::real AS taste_distance
  FROM mood_rooms m
  JOIN room_avail ra ON ra.mood_room_id = m.id
  JOIN latest ON m.version = latest.v
  WHERE ra.available_count >= min_available_titles
  ORDER BY taste_distance ASC
  LIMIT result_limit;
$$;


-- ----------------------------------------------
-- get_mood_room_thumbnails
-- ----------------------------------------------
-- For a set of rooms, returns the `per_room_limit` most-central titles
-- on the user's services (rank by centrality ascending). Used by the
-- For You card previews — hydrates all 5 rooms' thumbnails in one
-- round trip instead of 5.
--
-- Returns minimal title metadata (just what the card needs).
-- Centrality is in the original 1536D embedding space.

CREATE OR REPLACE FUNCTION get_mood_room_thumbnails(
  room_ids uuid[],
  available_tmdb_ids integer[],
  per_room_limit integer DEFAULT 4
) RETURNS TABLE (
  mood_room_id uuid,
  tmdb_id integer,
  media_type text,
  title text,
  poster_path text,
  release_year integer,
  genre_ids integer[],
  centrality real
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH ranked AS (
    SELECT
      mrt.mood_room_id,
      mrt.tmdb_id,
      mrt.media_type,
      mrt.centrality,
      ROW_NUMBER() OVER (
        PARTITION BY mrt.mood_room_id
        ORDER BY mrt.centrality ASC
      ) AS rn
    FROM mood_room_titles mrt
    WHERE mrt.mood_room_id = ANY(room_ids)
      AND mrt.tmdb_id = ANY(available_tmdb_ids)
  )
  SELECT
    r.mood_room_id,
    r.tmdb_id,
    r.media_type,
    t.title,
    t.poster_path,
    t.release_year,
    t.genre_ids,
    r.centrality
  FROM ranked r
  JOIN titles t
    ON t.tmdb_id = r.tmdb_id AND t.media_type = r.media_type
  WHERE r.rn <= per_room_limit
  ORDER BY r.mood_room_id, r.centrality ASC;
$$;


-- ----------------------------------------------
-- get_mood_room_detail
-- ----------------------------------------------
-- For the per-room page (MoodRoomPage). Returns one room's full title
-- list, availability-filtered, centrality-sorted, with the extended
-- title metadata the ContentCard grid needs. Denormalises the room's
-- label/description/title_count onto every row - simpler than two
-- RPCs, and the size overhead is bounded (room up to ~800 titles x
-- label+description ~200 bytes = 160KB).

CREATE OR REPLACE FUNCTION get_mood_room_detail(
  room_id uuid,
  available_tmdb_ids integer[]
) RETURNS TABLE (
  label text,
  description text,
  total_title_count integer,
  tmdb_id integer,
  media_type text,
  title text,
  poster_path text,
  release_year integer,
  overview text,
  genre_ids integer[],
  vote_average numeric,
  vote_count integer,
  popularity numeric,
  original_language text,
  runtime integer,
  centrality real
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    m.label,
    m.description,
    m.title_count AS total_title_count,
    t.tmdb_id,
    t.media_type,
    t.title,
    t.poster_path,
    t.release_year,
    t.overview,
    t.genre_ids,
    t.vote_average,
    t.vote_count,
    t.popularity,
    t.original_language,
    t.runtime,
    mrt.centrality
  FROM mood_room_titles mrt
  JOIN mood_rooms m ON m.id = mrt.mood_room_id
  JOIN titles t ON t.tmdb_id = mrt.tmdb_id AND t.media_type = mrt.media_type
  WHERE mrt.mood_room_id = room_id
    AND mrt.tmdb_id = ANY(available_tmdb_ids)
  ORDER BY mrt.centrality ASC;
$$;
