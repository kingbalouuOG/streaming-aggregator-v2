-- ============================================
-- Fix #1: NULL quality in unique constraint
-- PostgreSQL treats NULL != NULL, so rows with quality=NULL
-- bypass the unique constraint, causing duplicate entries.
-- Solution: Replace the unique constraint with a unique index
-- using COALESCE to treat NULL quality as 'default'.
-- ============================================

-- Drop the old constraint
ALTER TABLE streaming_availability
  DROP CONSTRAINT IF EXISTS streaming_availability_tmdb_id_media_type_service_id_stream_key;

-- Clean up duplicates BEFORE creating new index (keeps later row per group)
DELETE FROM streaming_availability a
USING streaming_availability b
WHERE a.tmdb_id = b.tmdb_id
  AND a.media_type = b.media_type
  AND a.service_id = b.service_id
  AND a.stream_type = b.stream_type
  AND COALESCE(a.quality, 'default') = COALESCE(b.quality, 'default')
  AND a.id < b.id;

-- Now create the unique index (safe — no duplicates remain)
CREATE UNIQUE INDEX idx_sa_unique_entry
  ON streaming_availability (tmdb_id, media_type, service_id, stream_type, COALESCE(quality, 'default'));

-- ============================================
-- Fix #2: vote_average too narrow for 10.0
-- NUMERIC(3,1) max is 9.9 — can't store 10.0
-- ============================================

ALTER TABLE titles
  ALTER COLUMN vote_average TYPE NUMERIC(4,1);
