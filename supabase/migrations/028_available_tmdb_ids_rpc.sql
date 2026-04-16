-- Phase 3 performance fix: single-query availability lookup
-- Replaces 42 sequential paginated HTTP requests with 1 RPC call.
-- Returns a JSON array of distinct tmdb_ids in a single row
-- (bypasses PostgREST row limit which caps TABLE returns at 1000).

CREATE OR REPLACE FUNCTION get_available_tmdb_ids(service_ids TEXT[])
RETURNS JSON
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(json_agg(DISTINCT sa.tmdb_id), '[]'::json)
  FROM streaming_availability sa
  WHERE sa.service_id = ANY(service_ids);
$$;
