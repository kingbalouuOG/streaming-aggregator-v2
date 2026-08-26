-- ============================================
-- 074: halve the HNSW index so it fits in shared_buffers (B1 follow-up)
-- ============================================
--
-- THE PROBLEM MIGRATION 073 COULD NOT SOLVE.
--
-- 073 added a 5-minute warmer for the HNSW index. It runs, it succeeds,
-- and it does not work — because the index does not fit:
--
--   shared_buffers              224 MB
--   idx_titles_embedding_hnsw   191 MB   <- 85% of the entire buffer pool
--   titles heap                  22 MB
--
-- With 85% of the cache needed by one index, ordinary activity —
-- streaming_availability scans, the sync chains' writes, anything at all —
-- evicts it. Measured on the live database, cron runs five minutes apart:
--
--   11:35:00 cron   duration 2,637 ms   (cold)
--   11:35:12 manual duration    87 ms   (warm, 12s later)
--   11:40:00 cron   duration 1,797 ms   (cold again, 5 min later)
--
-- No cron interval fixes a working set larger than the cache. The index
-- has to get smaller.
--
-- ── halfvec ────────────────────────────────────────────────────────
--
-- pgvector 0.8 supports `halfvec` — 16-bit floats instead of 32-bit,
-- halving the index to roughly 95 MB, which fits comfortably alongside
-- the 22 MB heap.
--
-- This is an EXPRESSION index on `(embedding::halfvec(1536))`, so the
-- column stays `vector(1536)` and NO data migration is required. Nothing
-- that reads `titles.embedding` changes.
--
-- Precision cost, measured on two real embeddings from this table:
--   exact  0.69766901055306
--   half   0.697668821958604
--   error  0.00000019          (1.9e-7)
--
-- ── Retrieve approximate, re-rank exact ────────────────────────────
--
-- Even 1.9e-7 could in principle reorder near-ties, and this RPC feeds
-- the whole recommendation pipeline. So the rewritten function does not
-- simply swap the operator: it retrieves 2x the requested candidates via
-- the halfvec index (fast, small, index-accelerated) and then re-ranks
-- them at FULL precision, returning exact distances.
--
-- Net effect: identical `distance` values and identical ordering to the
-- pre-074 function for all but pathological ties, at a fraction of the
-- memory. The re-rank costs 2N exact distance computations — for N=200
-- that is 400, i.e. microseconds.
--
-- ── Applying this ──────────────────────────────────────────────────
--
-- CREATE INDEX takes a SHARE lock on `titles`, which blocks WRITES (reads
-- are unaffected) for the duration of the build. Apply OUTSIDE the
-- 05:00-07:15 UTC pipeline window. Build is ~24.5k vectors; expect a
-- minute or two.
--
-- Reversibility:
--   CREATE INDEX idx_titles_embedding_hnsw ON public.titles
--     USING hnsw (embedding vector_cosine_ops);
--   -- then re-apply migration 025's match_titles_by_vector body, and
--   DROP INDEX public.idx_titles_embedding_hnsw_half;

-- Give the build room; the default here is 32MB, which would force
-- pgvector to build the graph on disk and take considerably longer.
-- Harmless if the role is not permitted to raise it — the build just
-- runs slower.
SET maintenance_work_mem = '128MB';

-- ── The smaller index ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_titles_embedding_hnsw_half
  ON public.titles
  USING hnsw ((embedding::halfvec(1536)) halfvec_cosine_ops);

COMMENT ON INDEX public.idx_titles_embedding_hnsw_half IS
  'B1: halfvec HNSW. ~95MB vs the 191MB full-precision index it replaced, '
  'so it fits in the 224MB shared_buffers and can actually stay warm. '
  'Expression index — titles.embedding is still vector(1536).';

-- ── Retrieve via halfvec, re-rank at full precision ────────────────
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
  -- Over-fetch so the exact re-rank has something to reorder. Capped so a
  -- pathological match_limit cannot ask for an enormous graph traversal.
  v_candidates integer := LEAST(GREATEST(match_limit * 2, 100), 4000);
BEGIN
  -- Search breadth must cover the candidate set, not the final limit.
  PERFORM set_config('hnsw.ef_search', v_candidates::text, true);

  RETURN QUERY
  -- MATERIALIZED so the inner LIMIT is genuinely a separate step: without
  -- it the planner may fold the two ORDER BYs together and lose the
  -- index-accelerated candidate phase entirely.
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
  'at full precision so returned distances stay exact. Migration 074.';

-- ── Drop the oversized index ───────────────────────────────────────
-- Only after the replacement exists and the function targets it —
-- otherwise every vector query falls back to a sequential scan.
-- Verified 2026-08-26 that nothing else uses it: the only other function
-- containing `<=>` is get_mood_rooms_for_user, which distances against
-- mood_rooms.centroid, not titles.embedding.
DROP INDEX IF EXISTS public.idx_titles_embedding_hnsw;

-- ── Verification (run after apply) ─────────────────────────────────
--   -- 1. Size: the whole point. Expect ~95MB, and heap+index well under
--   --    the 224MB shared_buffers.
--   SELECT pg_size_pretty(pg_relation_size('idx_titles_embedding_hnsw_half')) AS idx,
--          pg_size_pretty(pg_relation_size('titles'))                        AS heap,
--          current_setting('shared_buffers')                                 AS buffers;
--
--   -- 2. The index is actually being used — look for an Index Scan on
--   --    idx_titles_embedding_hnsw_half, NOT a Seq Scan.
--   SET hnsw.ef_search = 400;
--   EXPLAIN ANALYZE
--   SELECT t.id FROM public.titles t WHERE t.embedding IS NOT NULL
--   ORDER BY (t.embedding::halfvec(1536))
--            <=> ((SELECT embedding FROM public.titles
--                  WHERE embedding IS NOT NULL LIMIT 1)::halfvec(1536))
--   LIMIT 400;
--
--   -- 3. THE REAL TEST — does it now STAY warm? Wait ~20 minutes for
--   --    several cron ticks, then:
--   SELECT ran_at, duration_ms, ok FROM public.cache_warm_status;
--   -- Before 074 this alternated 87ms / 1,800-2,600ms as the index was
--   -- evicted between runs. It should now sit consistently low. If it is
--   -- still spiking, the index still does not fit and the remaining
--   -- option is more compute.
--
--   -- 4. RANKING GATE — run before trusting this in production:
--   --      npm run eval:eng1
--   --    The re-rank is designed to keep distances exact, so results
--   --    should be unchanged. If they are not, revert (see header).
