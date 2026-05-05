-- ============================================
-- Phase 4.5 - Mood room membership (titles per cluster)
-- Migration 030
-- ============================================
--
-- Join table mapping each clustered title to its mood room, with a
-- centrality score (cosine distance to cluster centroid; lower = more
-- central). Centrality drives both the per-room ordering (most central
-- first) and the preview-thumbnail selection on the For You row card.
--
-- Schema convention: (tmdb_id, media_type) is stored side-by-side with no
-- formal FK to titles(id). This matches the existing project pattern used
-- by streaming_availability, title_genres, and title_credits. Referential
-- integrity for tmdb_id is enforced at application level. The mood_room_id
-- FK does cascade, so deleting a mood_rooms row cleans its memberships.
--
-- Depends on: migration 029 (mood_rooms).

CREATE TABLE IF NOT EXISTS mood_room_titles (
  mood_room_id UUID NOT NULL REFERENCES mood_rooms(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  centrality REAL NOT NULL,
  PRIMARY KEY (mood_room_id, tmdb_id, media_type)
);

-- Reverse lookup: "which mood rooms does this title appear in?" and, more
-- commonly in the frontend, joining mood_room_titles to titles on
-- (tmdb_id, media_type) when hydrating previews.
CREATE INDEX IF NOT EXISTS idx_mood_room_titles_tmdb
  ON mood_room_titles (tmdb_id, media_type);

-- Per-room ordering by centrality ascending (most central first).
CREATE INDEX IF NOT EXISTS idx_mood_room_titles_centrality
  ON mood_room_titles (mood_room_id, centrality ASC);

ALTER TABLE mood_room_titles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_mood_room_titles" ON mood_room_titles;
CREATE POLICY "authenticated_read_mood_room_titles"
  ON mood_room_titles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service_role_mood_room_titles" ON mood_room_titles;
CREATE POLICY "service_role_mood_room_titles"
  ON mood_room_titles FOR ALL TO service_role USING (true) WITH CHECK (true);
