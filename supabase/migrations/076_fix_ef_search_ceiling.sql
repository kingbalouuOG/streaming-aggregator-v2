-- ============================================
-- 076: fix the ef_search ceiling in match_titles_by_vector (C2)
-- ============================================
--
-- A BUG INTRODUCED BY MIGRATION 074, found while measuring for C2.
--
-- 074 rewrote match_titles_by_vector to over-fetch 2x candidates through
-- the halfvec index and re-rank them at full precision. It sets search
-- breadth to match:
--
--   v_candidates := LEAST(GREATEST(match_limit * 2, 100), 4000);
--   PERFORM set_config('hnsw.ef_search', v_candidates::text, true);
--
-- but `hnsw.ef_search` has a hard valid range of 1..1000. So for any
-- match_limit above 500, the function does not degrade — it THROWS:
--
--   match_limit 500  ->  ef_search 1000  ->  500 rows, 38 ms
--   match_limit 501  ->  ef_search 1002  ->  ERROR 22023:
--       "1002 is outside the valid range for parameter hnsw.ef_search"
--
-- It has been invisible because every caller happens to use 200
-- (PER_CENTROID_CANDIDATE_LIMIT) or 500 (DEFAULT_CANDIDATE_LIMIT). C2
-- exists specifically to retrieve deeper, so it would have hit this on
-- the first request.
--
-- Worth noting how it slipped through: `SELECT set_config('hnsw.ef_search',
-- '3000', true)` at the top level returns '3000' quite happily — the
-- range check fires when the value is actually used by the index scan
-- inside the function. Probing the GUC directly is not a valid test of
-- what the function will do.
--
-- ── The fix ────────────────────────────────────────────────────────
--
-- Clamp search breadth to the 1000 the extension actually allows, and
-- never ask for more candidates than that breadth can deliver.
--
-- Above match_limit 1000 the index genuinely cannot serve the request:
-- HNSW returns at most ef_search results, so a limit of 1500 would
-- silently come back with ~1000. This RAISES instead of quietly
-- returning short — a function that reports success while delivering
-- less than asked is the exact failure mode this project has spent a
-- week removing.
--
-- Reversibility: re-apply migration 074's match_titles_by_vector body
-- (and re-introduce the bug).

CREATE OR REPLACE FUNCTION public.match_titles_by_vector(
  query_vector vector,
  match_limit  integer DEFAULT 50
)
RETURNS TABLE (id integer, tmdb_id integer, title text, media_type text, distance double precision)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- pgvector's hard ceiling. Not ours to raise.
  c_max_ef     constant integer := 1000;
  v_ef         integer;
  v_candidates integer;
BEGIN
  IF match_limit > c_max_ef THEN
    RAISE EXCEPTION
      'match_titles_by_vector: match_limit % exceeds the HNSW search ceiling of %. '
      'ef_search cannot go higher, so the index would return roughly % rows '
      'while reporting success. Retrieve in slices, or widen the pool with '
      'more interest centroids instead of a deeper single query.',
      match_limit, c_max_ef, c_max_ef;
  END IF;

  -- Breadth: 2x the request for re-rank headroom, floored at 100 so small
  -- limits still traverse enough graph, capped at what pgvector allows.
  v_ef := LEAST(GREATEST(match_limit * 2, 100), c_max_ef);
  PERFORM set_config('hnsw.ef_search', v_ef::text, true);

  -- Never ask for more candidates than the breadth can actually return.
  -- At match_limit 1000 this collapses the re-rank margin to zero, which
  -- is correct-but-degraded: ordering falls back to halfvec precision.
  v_candidates := LEAST(match_limit * 2, v_ef);

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT t.id, t.tmdb_id, t.title, t.media_type, t.embedding
    FROM public.titles t
    WHERE t.embedding IS NOT NULL
    ORDER BY (t.embedding::halfvec(1536)) <=> (query_vector::halfvec(1536))
    LIMIT v_candidates
  )
  SELECT c.id, c.tmdb_id, c.title, c.media_type,
         (c.embedding <=> query_vector)::float AS distance
  FROM candidates c
  ORDER BY c.embedding <=> query_vector ASC
  LIMIT match_limit;
END;
$function$;

COMMENT ON FUNCTION public.match_titles_by_vector(vector, integer) IS
  'Retrieves 2x candidates through the halfvec HNSW index, then re-ranks '
  'at full precision so returned distances stay exact. match_limit is '
  'capped at 1000 by pgvector hnsw.ef_search and RAISES above that rather '
  'than silently returning short. Migrations 074 + 076.';

-- ── Verification (run after apply) ─────────────────────────────────
--   -- 1. The boundary that used to throw now works.
--   SELECT count(*) FROM public.match_titles_by_vector(
--     (SELECT embedding FROM public.titles WHERE embedding IS NOT NULL LIMIT 1), 800);
--   -- expect 800
--
--   -- 2. Above the ceiling raises a clear error rather than returning ~1000.
--   SELECT count(*) FROM public.match_titles_by_vector(
--     (SELECT embedding FROM public.titles WHERE embedding IS NOT NULL LIMIT 1), 1500);
--   -- expect: exceeds the HNSW search ceiling of 1000
--
--   -- 3. Existing call sites are unaffected.
--   SELECT count(*) FROM public.match_titles_by_vector(
--     (SELECT embedding FROM public.titles WHERE embedding IS NOT NULL LIMIT 1), 200);
--   -- expect 200
