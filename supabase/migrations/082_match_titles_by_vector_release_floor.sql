-- ============================================
-- 082: push the `released` floor into match_titles_by_vector
-- ============================================
--
-- Review 2026-09-09-001, "Engine follow-up".
--
-- The *Newer* refinement was a post-filter: retrieve 150 candidates by
-- vector distance, fetch their metadata, then drop everything released
-- before last year. Whatever the pool happened to contain was the whole
-- answer, and measured on the eval fixture's sixteen queries
-- (scripts/search/eval-released-pushdown.ts, 2026-09-09) it contained
-- very little:
--
--   mean survivors 7.4 of 150 retrieved   every query under 20
--
-- So a semantic query with *Newer* lit thinned the grid to single
-- figures. Not because the catalogue lacks recent titles (1,690 are
-- embedded and recent) — because the filter was applied to a pool
-- chosen without knowing about it.
--
-- -- MEASURED AFTER APPLY (2026-09-09) --------------------------------
--
--   mean survivors 150.0 of 150   0 of 16 queries short   p50 95ms p95 193ms
--
-- The filter is EXACT, and not for the reason this comment first gave.
--
-- ── THE HNSW POST-FILTER CAVEAT, AND WHY IT DOES NOT BITE HERE ─────
--
-- pgvector applies a WHERE clause AFTER the HNSW graph traversal, not
-- during it, unless `hnsw.iterative_scan` is enabled. It is not set
-- anywhere in this database. So the usual expectation is that a
-- selective predicate under-returns: the index hands back its ef_search
-- nearest neighbours and the predicate then removes most of them.
--
-- That is not what the planner does with this predicate. Only 1,690 of
-- 34,563 embedded titles are release_year >= 2025 — 4.89% — and at that
-- selectivity Postgres judges a sequential scan cheaper than the index.
-- EXPLAIN ANALYZE, ef_search 1000, floor 2025:
--
--   Seq Scan on titles  (rows=1690, Rows Removed by Filter: 32881)
--     -> Sort (quicksort, 250kB)                    67 ms
--
-- No index scan at all. Every qualifying row is distance-computed and
-- sorted exactly, so the answer is brute-force correct and a full 150
-- comes back every time. That is where the ~25 ms of extra p50 went.
--
-- The caveat is still true; it just attaches to the OTHER branch. With
-- a less selective floor the planner keeps the index and post-filters —
-- measured at floor 2010 (17,730 rows, 51%):
--
--   Index Scan using idx_titles_embedding_hnsw_half   35 ms
--     Filter: release_year >= 2010   (Rows Removed by Filter: 22)
--
-- In that regime a selective predicate WOULD return short, and that is
-- what `v_ef := c_max_ef` below exists for. It does nothing on the
-- sequential path, which is the path *Newer* actually takes today.
--
-- ── WHAT WOULD CHANGE THIS ─────────────────────────────────────────
--
-- Today's exactness is a property of catalogue size, not a guarantee.
-- The sequential path is O(embedded rows): 67 ms over 34,563 of them.
-- Grow the catalogue an order of magnitude and that path stops being
-- the cheap one, the planner returns to the index, and recall degrades
-- to the post-filter behaviour described above. The fix at that point
-- is `hnsw.iterative_scan = 'relaxed_order'` (pgvector 0.8+, a
-- per-session GUC), which re-enters the graph until the LIMIT is
-- satisfied. It has its own latency profile and its own measurement,
-- and it is deliberately not bundled here.
--
-- The unfiltered path is untouched and still uses the index: 16 ms,
-- Index Scan using idx_titles_embedding_hnsw_half.
--
-- ── Signature change ───────────────────────────────────────────────
--
-- The 2-arg function is DROPped rather than left beside a 3-arg one:
-- two overloads that both accept (vector, integer) make every existing
-- 2-arg call ambiguous (42725). Callers are unaffected — the new
-- parameter defaults to NULL, so `match_titles_by_vector(v, 200)` in
-- public.warm_recommendation_caches and the named-argument PostgREST
-- calls from the engine resolve exactly as before.
--
-- With min_release_year NULL the body is byte-for-byte migration 076's.
--
-- Reversibility: re-apply 076 (drop the 3-arg form first).

DROP FUNCTION IF EXISTS public.match_titles_by_vector(vector, integer);

CREATE OR REPLACE FUNCTION public.match_titles_by_vector(
  query_vector     vector,
  match_limit      integer DEFAULT 50,
  min_release_year integer DEFAULT NULL
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

  IF min_release_year IS NULL THEN
    -- Breadth: 2x the request for re-rank headroom, floored at 100 so small
    -- limits still traverse enough graph, capped at what pgvector allows.
    v_ef := LEAST(GREATEST(match_limit * 2, 100), c_max_ef);
    v_candidates := LEAST(match_limit * 2, v_ef);
  ELSE
    -- Filtered: IF the planner picks the index, the predicate runs after
    -- the traversal, so the only lever is how much graph to cover. Take
    -- all of it. At *Newer*'s selectivity the planner picks a sequential
    -- scan instead and this does nothing — see the caveat above.
    v_ef := c_max_ef;
    v_candidates := c_max_ef;
  END IF;

  PERFORM set_config('hnsw.ef_search', v_ef::text, true);

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT t.id, t.tmdb_id, t.title, t.media_type, t.embedding
    FROM public.titles t
    WHERE t.embedding IS NOT NULL
      -- A NULL release_year fails the floor. "Newer" promising a date is
      -- a claim, and a row with no year cannot support it — same rule as
      -- the post-filter in semanticCore, which stays in place behind this.
      AND (min_release_year IS NULL OR t.release_year >= min_release_year)
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

COMMENT ON FUNCTION public.match_titles_by_vector(vector, integer, integer) IS
  'Retrieves candidates through the halfvec HNSW index, then re-ranks at '
  'full precision so returned distances stay exact. match_limit is capped '
  'at 1000 by pgvector hnsw.ef_search and RAISES above that rather than '
  'silently returning short. min_release_year is an OPTIONAL floor '
  'applied inside the scan. A highly selective floor makes the planner '
  'choose a sequential scan over the HNSW index, which is exact; a less '
  'selective one keeps the index, and because hnsw.iterative_scan is not '
  'enabled pgvector then filters AFTER the traversal and can return fewer '
  'than match_limit rows. Migrations 074 + 076 + 082.';

-- ── Verification (run after apply) ─────────────────────────────────
--   -- 1. Unfiltered behaviour is unchanged.
--   SELECT count(*) FROM public.match_titles_by_vector(
--     (SELECT embedding FROM public.titles WHERE embedding IS NOT NULL LIMIT 1), 200);
--   -- expect 200
--
--   -- 2. The floor is honoured — no row below it, and no NULL year.
--   SELECT count(*) FILTER (WHERE t.release_year < 2025 OR t.release_year IS NULL)
--   FROM public.match_titles_by_vector(
--     (SELECT embedding FROM public.titles WHERE embedding IS NOT NULL LIMIT 1),
--     150, 2025) m
--   JOIN public.titles t ON t.tmdb_id = m.tmdb_id AND t.media_type = m.media_type;
--   -- expect 0
--
--   -- 3. The positional 2-arg call inside warm_recommendation_caches still
--   --    resolves against the 3-arg signature.
--   SELECT public.warm_recommendation_caches();
--   SELECT ok, error, matched FROM public.cache_warm_status WHERE id = 1;
--   -- expect ok = true, matched = 200
