-- ============================================
-- 073: keep the HNSW index warm (Workstream B1)
-- ============================================
--
-- MEASURED 2026-08-26, back-to-back on the live database:
--
--   cold  match_titles_by_vector(<real embedding>, 200)
--         Execution Time: 4155.679 ms   Buffers: shared hit=3546 read=508
--   warm  same query, immediately after
--         Execution Time:   12.365 ms   Buffers: shared hit=4054  (read=0)
--
-- 336x. The entire difference is those 508 index pages: cold they come
-- off disk, warm they are already in shared_buffers. Nothing about the
-- query, the plan, or the data changed between the two runs.
--
-- The HNSW index is evicted whenever the database sits idle, and a
-- pre-launch app with intermittent traffic is idle almost all the time —
-- so in practice it is ALWAYS cold when a real user opens the app. That
-- is the 5s+ cold open. `warmup-foryou` used to cover this and was
-- retired in the Worker migration with no replacement.
--
-- Fix: touch the index every 5 minutes so those pages never age out.
--
-- WHY pg_cron AND NOT A WORKER CRON:
-- the thing being kept warm is Postgres's own buffer cache. Running the
-- query inside Postgres warms it directly, with no network, no auth, no
-- Edge Runtime, and nothing that can 502. (This is the opposite call to
-- the health check in migration 071, which deliberately runs OUTSIDE
-- Supabase — but that is monitoring, where independence is the whole
-- point. This is just work, and the closer to the buffer cache the
-- better.)
--
-- Cost: 288 runs/day at ~12ms warm. Negligible, and the first run after
-- an idle spell pays the 4s itself so that a user never does.
--
-- Reversibility:
--   SELECT cron.unschedule('warm-recommendation-caches');
--   DROP FUNCTION public.warm_recommendation_caches();
--   DROP TABLE public.cache_warm_status;

-- ── Marker so a silently-stopped warmer is detectable ──────────────
--
-- A warmer that quietly stops does not fail anything: it just returns
-- cold-open latency to 4s and waits for a user to complain. That is the
-- exact silent-degradation shape this project spent a week removing, so
-- the job records itself and pipeline-health.ts asserts on it.
CREATE TABLE IF NOT EXISTS public.cache_warm_status (
  id            smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- single row
  ran_at        timestamptz NOT NULL DEFAULT now(),
  duration_ms   integer,
  matched       integer,
  available_ids integer,
  ok            boolean NOT NULL DEFAULT true,
  error         text
);

COMMENT ON TABLE public.cache_warm_status IS
  'B1: last run of warm_recommendation_caches(). Single row. Asserted by '
  'the daily pipeline health check — a stale ran_at means cold-start '
  'latency has silently regressed to ~4s.';

ALTER TABLE public.cache_warm_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cache_warm_status FROM anon, authenticated;

-- ── The warmer ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.warm_recommendation_caches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_vec     vector;
  v_matched integer := 0;
  v_ids     integer := 0;
BEGIN
  -- A genuinely cold index takes ~4s; the default timeout would kill the
  -- very first (and most valuable) run after an idle spell.
  SET LOCAL statement_timeout = '30s';

  -- Use a REAL embedding, not a synthetic zero vector: HNSW traversal
  -- depends on the query point, and a degenerate vector would walk a
  -- different, unrepresentative part of the graph.
  SELECT embedding INTO v_vec
  FROM public.titles WHERE embedding IS NOT NULL LIMIT 1;

  IF v_vec IS NULL THEN
    INSERT INTO public.cache_warm_status AS c (id, ran_at, ok, error)
    VALUES (1, now(), false, 'no embeddings in titles to warm with')
    ON CONFLICT (id) DO UPDATE
      SET ran_at = EXCLUDED.ran_at, ok = false, error = EXCLUDED.error,
          duration_ms = NULL, matched = NULL, available_ids = NULL;
    RETURN;
  END IF;

  -- 200 is enough to traverse the graph and touch the pages that matter.
  -- The point is residency, not doing useful work.
  SELECT count(*) INTO v_matched
  FROM public.match_titles_by_vector(v_vec, 200);

  -- The other half of a cold open: the availability filter. Warmed for
  -- the six services that carry essentially all UK rows, which is what
  -- almost every real query asks for.
  SELECT COALESCE(jsonb_array_length(
           public.get_available_tmdb_ids(
             ARRAY['netflix','prime','disney','apple','now','paramount'])), 0)
  INTO v_ids;

  INSERT INTO public.cache_warm_status AS c
    (id, ran_at, duration_ms, matched, available_ids, ok, error)
  VALUES (1, now(),
          (EXTRACT(epoch FROM (clock_timestamp() - v_started)) * 1000)::integer,
          v_matched, v_ids, true, NULL)
  ON CONFLICT (id) DO UPDATE
    SET ran_at = EXCLUDED.ran_at, duration_ms = EXCLUDED.duration_ms,
        matched = EXCLUDED.matched, available_ids = EXCLUDED.available_ids,
        ok = true, error = NULL;

EXCEPTION WHEN OTHERS THEN
  -- A warm failure must never abort the cron or raise noise. Record it;
  -- the health check turns a persistent failure into an email.
  INSERT INTO public.cache_warm_status AS c (id, ran_at, ok, error)
  VALUES (1, now(), false, left(SQLERRM, 500))
  ON CONFLICT (id) DO UPDATE
    SET ran_at = EXCLUDED.ran_at, ok = false, error = EXCLUDED.error;
END;
$function$;

COMMENT ON FUNCTION public.warm_recommendation_caches() IS
  'B1: touches the HNSW index and the availability path every 5 minutes '
  'so their pages stay in shared_buffers. Measured 2026-08-26: 4,156ms '
  'cold vs 12ms warm on the same query. service_role only.';

REVOKE ALL ON FUNCTION public.warm_recommendation_caches() FROM public;
REVOKE ALL ON FUNCTION public.warm_recommendation_caches() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.warm_recommendation_caches() TO service_role;

-- ── Every 5 minutes ────────────────────────────────────────────────
-- Pure SQL, so unlike the Edge Function crons this cannot be severed by
-- pg_net or refused by the Edge Runtime.
SELECT cron.unschedule('warm-recommendation-caches')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'warm-recommendation-caches');

SELECT cron.schedule(
  'warm-recommendation-caches',
  '*/5 * * * *',
  $cron$ SELECT public.warm_recommendation_caches(); $cron$
);

-- ── Verification (run after apply) ─────────────────────────────────
--   -- 1. Run it by hand once; the first run may take ~4s (cold).
--   SELECT public.warm_recommendation_caches();
--   SELECT * FROM public.cache_warm_status;   -- ok=true, matched=200
--
--   -- 2. Prove it is working: this should now be ~12ms, not ~4,000ms.
--   EXPLAIN (ANALYZE, BUFFERS)
--   SELECT * FROM public.match_titles_by_vector(
--     (SELECT embedding FROM public.titles WHERE embedding IS NOT NULL LIMIT 1), 200);
--   -- Buffers: read=0 is the tell. Any non-zero `read=` means pages had
--   -- been evicted and the warmer is not keeping up.
--
--   -- 3. Cron registered.
--   SELECT jobname, schedule, active FROM cron.job
--   WHERE jobname = 'warm-recommendation-caches';
--
--   -- 4. After ~15 minutes, ran_at should never be older than ~5 min.
--   SELECT ran_at, now() - ran_at AS age, duration_ms, ok, error
--   FROM public.cache_warm_status;
