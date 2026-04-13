-- Migration 022 — service_fingerprints variant column + match_titles_by_vector RPC
--
-- match_titles_by_vector is built for Phase 2.6 synthetic cold-start evaluation but is
-- designed to be reusable by Phase 3 hook rewrites. Do not delete when Phase 2.6
-- concludes. If Phase 3 needs a different signature (filtered retrieval, genre
-- constraints), create match_titles_by_vector_v2 rather than modifying this one.

BEGIN;

-- 1. Add variant column with default to backfill existing 13 rows
ALTER TABLE service_fingerprints
  ADD COLUMN variant TEXT NOT NULL DEFAULT 'v1_popularity';

-- 1.5. Drop the default immediately — future inserts must specify variant explicitly
ALTER TABLE service_fingerprints ALTER COLUMN variant DROP DEFAULT;

-- 2. CHECK constraint limits values to known variants
ALTER TABLE service_fingerprints
  ADD CONSTRAINT chk_variant CHECK (variant IN ('v1_popularity', 'v2_exclusivity'));

-- 3. Drop old PK, add new PK including variant
--    (constraint name 'service_fingerprints_pkey' verified via pg_constraint query)
ALTER TABLE service_fingerprints DROP CONSTRAINT service_fingerprints_pkey;
ALTER TABLE service_fingerprints ADD PRIMARY KEY (service_id, region, variant);

-- 4. RPC function for pgvector cosine similarity search (Phase 3 inheritance)
CREATE OR REPLACE FUNCTION match_titles_by_vector(
  query_vector vector(1536),
  match_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id INTEGER,
  tmdb_id INTEGER,
  title TEXT,
  media_type TEXT,
  distance FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT id, tmdb_id, title, media_type,
         embedding <=> query_vector AS distance
  FROM titles
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> query_vector ASC
  LIMIT match_limit;
$$;

COMMIT;
