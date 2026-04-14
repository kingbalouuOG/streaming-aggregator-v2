-- Phase 3 fix: match_titles_by_vector RPC was capped at 40 results
-- by pgvector's HNSW ef_search default (40). This prevented the ranker
-- from finding enough titles that overlap with the user's services.
--
-- Fix: set hnsw.ef_search dynamically to match the requested limit,
-- with a minimum of 100 for quality. Changed from LANGUAGE sql to
-- LANGUAGE plpgsql to support set_config.

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
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  -- Increase HNSW search breadth to match the requested limit
  PERFORM set_config('hnsw.ef_search', GREATEST(match_limit, 100)::TEXT, true);
  RETURN QUERY
    SELECT t.id, t.tmdb_id, t.title, t.media_type,
           (t.embedding <=> query_vector)::FLOAT AS distance
    FROM titles t
    WHERE t.embedding IS NOT NULL
    ORDER BY t.embedding <=> query_vector ASC
    LIMIT match_limit;
END;
$$;
