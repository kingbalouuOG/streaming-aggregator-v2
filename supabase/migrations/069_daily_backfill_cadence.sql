-- ============================================
-- 069: daily backfill cadence (Workstream A5) + bulk embedding writes
-- ============================================
--
-- WHY NOW: the catalogue gap is GROWING, not shrinking.
--
--   2026-08-25   list_missing_title_ids  22,260
--   2026-08-26   list_missing_title_ids  22,729   (+469)
--
-- and that is *after* a chain removed 595 entries from the queue, so the
-- daily SA sync is adding roughly 1,000 new (tmdb_id, media_type) gaps per
-- day. A weekly chain delivers 3,000/week — about 428/day. Inflow beats
-- drain, so at the current cadence the gap never closes; it widens
-- indefinitely and the plan's "74 weeks to drain" was optimistic rather
-- than pessimistic.
--
-- Daily cadence delivers 3,000/day against ~1,000/day of inflow, i.e.
-- ~2,000/day of net drain: the 22,729 backlog clears in roughly 11 days
-- and then stays clear, with each subsequent run finishing in one or two
-- slices because there is almost nothing to do.
--
-- This is what makes A4 (the one-off ~22k bulk burst) unnecessary.
--
-- Contains three changes:
--   A. backfill-missing-titles: weekly -> daily
--   B. embed-new-titles: 06:45 -> 07:15, so it cannot start while a
--      now-much-longer enrich chain is still running
--   C. bulk_set_title_embeddings(): one round trip per chunk instead of
--      one per row, because B alone does not give embed enough headroom

-- ── A. Daily backfill ──────────────────────────────────────────────
--
-- 05:00 UTC, one hour ahead of the sync. A full 12-slice chain is ~16
-- minutes (12 x ~78s), so 05:00-05:16, comfortably clear of the 06:00
-- sync. cron.schedule() upserts by jobname, so this rewrites the existing
-- weekly job in place.
--
-- Ordering note (deliberately unchanged): a title whose availability
-- arrives in today's 06:00 sync is picked up by TOMORROW's 05:00 backfill,
-- so new titles carry a one-day lag. Reordering backfill after the sync
-- would close that but leaves no room before enrich at 06:30. Not worth it
-- while a 22k backlog dominates; revisit once the gap is steady-state.
SELECT cron.schedule('backfill-missing-titles', '0 5 * * *', $$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/backfill-missing-titles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$);

-- ── B. Move embed clear of enrich ──────────────────────────────────
--
-- Daily backfill means enrich now has real work every day rather than the
-- ~100 rows it used to see. A full enrich chain is 12 x ~78s = ~16 min,
-- so 06:30 -> ~06:46 — which overlapped the old 06:45 embed slot.
--
-- Nothing breaks on overlap (embed only selects rows where keywords IS NOT
-- NULL, so it would simply miss the tail and correctly report the queue
-- drained), but the missed stragglers would then wait a whole day for the
-- next run. 07:15 removes the hazard for free.
SELECT cron.schedule('embed-new-titles', '15 7 * * *', $$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/embed-new-titles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$);

-- ── C. One round trip per chunk, not per row ───────────────────────
--
-- MEASURED 2026-08-26, two live embed chains:
--   200 rows / 78s  and  171 rows / 70s   =>  ~400 ms per row
--
-- That is not OpenAI — the embeddings themselves are already batched 100
-- to a request. It is one PostgREST UPDATE round trip per row. At ~200
-- rows per 75s slice and a depth cap of 12, embed tops out near 2,400
-- rows/day, against the ~1,900 rows/day that daily backfill will produce.
-- A 25% margin is too thin to build a cadence change on: one truncated
-- slice and the queue starts accumulating.
--
-- Zipping the ids and vectors into a single statement turns a 100-row
-- chunk from ~40s of sequential round trips into one call.
--
-- Vectors arrive as their text form ('[0.1,0.2,...]') and are cast to
-- `vector` here, which is what the supabase-js client would have sent per
-- row anyway.
CREATE OR REPLACE FUNCTION public.bulk_set_title_embeddings(
  p_ids        integer[],
  p_embeddings text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_updated integer;
BEGIN
  -- unnest(a, b) zips positionally, so a length mismatch would silently
  -- pad with NULL and write NULL embeddings over good rows. Refuse instead.
  IF COALESCE(array_length(p_ids, 1), 0)
     IS DISTINCT FROM COALESCE(array_length(p_embeddings, 1), 0) THEN
    RAISE EXCEPTION
      'bulk_set_title_embeddings: array length mismatch (ids=%, embeddings=%)',
      COALESCE(array_length(p_ids, 1), 0),
      COALESCE(array_length(p_embeddings, 1), 0);
  END IF;

  UPDATE public.titles t
  SET embedding = v.emb::vector
  FROM unnest(p_ids, p_embeddings) AS v(id, emb)
  WHERE t.id = v.id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$;

COMMENT ON FUNCTION public.bulk_set_title_embeddings(integer[], text[]) IS
  'A5: writes a chunk of embeddings in one statement. Replaces one '
  'PostgREST round trip per row (~400ms each, measured 2026-08-26), which '
  'was the binding constraint on embed-new-titles. Returns rows updated; '
  'a count below the input length means those ids no longer exist. '
  'service_role only.';

REVOKE ALL ON FUNCTION public.bulk_set_title_embeddings(integer[], text[]) FROM public;
REVOKE ALL ON FUNCTION public.bulk_set_title_embeddings(integer[], text[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_set_title_embeddings(integer[], text[]) TO service_role;

-- ── Verification (run after apply) ─────────────────────────────────
--   -- 1. Schedules.
--   SELECT jobname, schedule FROM cron.job
--   WHERE jobname IN ('backfill-missing-titles', 'embed-new-titles');
--   -- expect '0 5 * * *' and '15 7 * * *'
--
--   -- 2. The bulk writer exists and rejects a mismatch.
--   SELECT to_regprocedure('public.bulk_set_title_embeddings(integer[],text[])');
--   SELECT public.bulk_set_title_embeddings(ARRAY[1,2], ARRAY['[0]']);  -- expect: mismatch
--
--   -- 3. Watch the gap actually close over the next fortnight. This is
--   --    workstream A's exit criterion — it should fall ~2,000/day and
--   --    then flatten near zero. If it climbs, inflow has outgrown the
--   --    chain and MAX_CHAIN_DEPTH needs raising.
--   SELECT count_missing_title_ids();
--
--   -- 4. Daily health, one row per job.
--   SELECT sync_type, status, titles_added, titles_processed, errors,
--          chain_state->>'slices' AS slices,
--          chain_state->>'stopped_because' AS stopped_because
--   FROM public.sync_log
--   WHERE started_at > now() - interval '25 hours'
--   ORDER BY started_at DESC;
