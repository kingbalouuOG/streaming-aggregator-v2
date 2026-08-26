-- ============================================
-- 075: denormalise availability onto titles (Workstream B3)
-- ============================================
--
-- THE PROBLEM. Every Home load calls get_available_tmdb_ids and pulls back
-- a flat list of every tmdb_id available on the user's services:
--
--   43,234 distinct titles  ->  328,790 bytes of JSON  (~321 KB)
--
-- The client transfers that, parses it, and rebuilds a 43k-entry Set in
-- memory purely to answer "is this one title available?" for the ~100
-- titles it actually renders. On cellular that is the single largest
-- payload the app moves.
--
-- Worse, the mood-room RPCs take `available_tmdb_ids` as a PARAMETER
-- (src/lib/api/supabaseMoodRooms.ts) — so the same 321 KB is UPLOADED as
-- well. Down and up, on every Home load.
--
-- THE OBSERVATION THAT MAKES THIS EASY. Availability is only enormous as
-- a flat id list. Per title it is tiny — measured 2026-08-26, titles carry
-- an average of 1.26 services each (max 7). Attached to the title row it
-- is a handful of short strings.
--
-- So: denormalise it onto `titles` and every existing query can filter in
-- SQL with one added predicate, fetching nothing extra:
--
--   .overlaps('available_services', ['netflix','prime'])
--
-- No new RPC surface, no id list over the wire in either direction, and
-- the client-side Set disappears entirely.
--
-- THE TRADEOFF, STATED PLAINLY. A denormalised column can drift from its
-- source. Three things guard that:
--   1. A row-level trigger on streaming_availability keeps it exact for
--      the incremental path (the only writer in normal operation).
--   2. refresh_title_available_services() rebuilds everything from source,
--      for bulk loads and for repair.
--   3. count_available_services_drift() returns the number of mismatched
--      titles, so the daily health check can assert it stays 0 instead of
--      us hoping.
--
-- ⚠ BULK LOADS: the trigger fires per row. scripts/sync-content.ts stage
-- 'sa' writes tens of thousands of rows and would fire it for each. For a
-- bulk load, disable the trigger, load, then call the refresh:
--
--   ALTER TABLE public.streaming_availability DISABLE TRIGGER trg_sync_title_available_services;
--   -- ... bulk load ...
--   ALTER TABLE public.streaming_availability ENABLE TRIGGER trg_sync_title_available_services;
--   SELECT public.refresh_title_available_services();
--
-- The daily incremental sync (~600-3,500 rows) is well within trigger
-- territory and needs no special handling.
--
-- Reversibility:
--   DROP TRIGGER trg_sync_title_available_services ON public.streaming_availability;
--   DROP FUNCTION public.sync_title_available_services();
--   DROP FUNCTION public.refresh_title_available_services();
--   DROP FUNCTION public.count_available_services_drift();
--   ALTER TABLE public.titles DROP COLUMN available_services;

-- ── The column ─────────────────────────────────────────────────────
-- Defaults to '{}' rather than NULL so `&&` behaves consistently for
-- titles with no availability: an empty array overlaps nothing, which is
-- the correct answer, whereas NULL && anything is NULL.
ALTER TABLE public.titles
  ADD COLUMN IF NOT EXISTS available_services text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.titles.available_services IS
  'B3: denormalised from streaming_availability, kept exact by '
  'trg_sync_title_available_services. Lets every query filter availability '
  'in SQL instead of shipping a 321KB id list to the client. Rebuild with '
  'refresh_title_available_services(); verify with '
  'count_available_services_drift().';

-- GIN for the `&&` (overlaps) predicate every caller will use.
CREATE INDEX IF NOT EXISTS idx_titles_available_services
  ON public.titles USING gin (available_services);

-- ── Full rebuild from source ───────────────────────────────────────
-- Authoritative. Used for the initial backfill, after bulk loads, and to
-- repair drift.
CREATE OR REPLACE FUNCTION public.refresh_title_available_services()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_updated integer;
BEGIN
  WITH agg AS (
    SELECT sa.tmdb_id, sa.media_type,
           array_agg(DISTINCT sa.service_id ORDER BY sa.service_id) AS svcs
    FROM public.streaming_availability sa
    GROUP BY sa.tmdb_id, sa.media_type
  )
  UPDATE public.titles t
  SET available_services = COALESCE(a.svcs, '{}')
  FROM agg a
  WHERE t.tmdb_id = a.tmdb_id
    AND t.media_type = a.media_type
    AND t.available_services IS DISTINCT FROM COALESCE(a.svcs, '{}');
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Titles whose availability disappeared entirely still need clearing;
  -- the join above cannot reach them.
  UPDATE public.titles t
  SET available_services = '{}'
  WHERE t.available_services <> '{}'
    AND NOT EXISTS (
      SELECT 1 FROM public.streaming_availability sa
      WHERE sa.tmdb_id = t.tmdb_id AND sa.media_type = t.media_type
    );

  RETURN v_updated;
END;
$function$;

COMMENT ON FUNCTION public.refresh_title_available_services() IS
  'B3: rebuild titles.available_services from streaming_availability. '
  'Returns rows changed. Run after any bulk load that bypassed the trigger.';

-- ── Keep it exact on the incremental path ──────────────────────────
--
-- One-key recompute, factored out so the trigger reads plainly and the
-- same logic can be invoked by hand to repair a single title.
CREATE OR REPLACE FUNCTION public.recompute_title_available_services(
  p_tmdb_id    integer,
  p_media_type text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  UPDATE public.titles t
  SET available_services = COALESCE((
        SELECT array_agg(DISTINCT sa.service_id ORDER BY sa.service_id)
        FROM public.streaming_availability sa
        WHERE sa.tmdb_id = p_tmdb_id
          AND sa.media_type = p_media_type
      ), '{}')
  WHERE t.tmdb_id = p_tmdb_id
    AND t.media_type = p_media_type;
$function$;

CREATE OR REPLACE FUNCTION public.sync_title_available_services()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_old_tmdb  integer;
  v_old_media text;
  v_new_tmdb  integer;
  v_new_media text;
BEGIN
  -- Read OLD/NEW only where the operation actually defines them. plpgsql
  -- raises "record 'old' is not assigned yet" if OLD is touched during an
  -- INSERT, even inside a condition that would exclude it — so this has
  -- to be branch-guarded rather than filtered.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_tmdb  := OLD.tmdb_id;
    v_old_media := OLD.media_type;
  END IF;
  IF TG_OP IN ('UPDATE', 'INSERT') THEN
    v_new_tmdb  := NEW.tmdb_id;
    v_new_media := NEW.media_type;
  END IF;

  IF v_old_tmdb IS NOT NULL THEN
    PERFORM public.recompute_title_available_services(v_old_tmdb, v_old_media);
  END IF;

  -- Only recompute NEW separately when it is a different title — an
  -- UPDATE that moved a row between keys affects both sides.
  IF v_new_tmdb IS NOT NULL
     AND (v_new_tmdb, v_new_media) IS DISTINCT FROM (v_old_tmdb, v_old_media) THEN
    PERFORM public.recompute_title_available_services(v_new_tmdb, v_new_media);
  END IF;

  RETURN NULL;  -- AFTER trigger; return value is ignored
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_title_available_services ON public.streaming_availability;
CREATE TRIGGER trg_sync_title_available_services
  AFTER INSERT OR UPDATE OR DELETE ON public.streaming_availability
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_title_available_services();

-- ── Drift detector ─────────────────────────────────────────────────
-- Denormalisation is only safe if something checks it. Returns the number
-- of titles whose column disagrees with the source; the daily health
-- check asserts this is 0.
CREATE OR REPLACE FUNCTION public.count_available_services_drift()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $function$
  SELECT count(*)
  FROM public.titles t
  LEFT JOIN (
    SELECT sa.tmdb_id, sa.media_type,
           array_agg(DISTINCT sa.service_id ORDER BY sa.service_id) AS svcs
    FROM public.streaming_availability sa
    GROUP BY sa.tmdb_id, sa.media_type
  ) a ON a.tmdb_id = t.tmdb_id AND a.media_type = t.media_type
  WHERE t.available_services IS DISTINCT FROM COALESCE(a.svcs, '{}');
$function$;

COMMENT ON FUNCTION public.count_available_services_drift() IS
  'B3: titles whose available_services disagrees with '
  'streaming_availability. Must be 0. Asserted by the daily health check.';

REVOKE ALL ON FUNCTION public.recompute_title_available_services(integer, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_title_available_services(integer, text) TO service_role;
REVOKE ALL ON FUNCTION public.refresh_title_available_services() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_available_services_drift() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_title_available_services() TO service_role;
GRANT EXECUTE ON FUNCTION public.count_available_services_drift() TO service_role;

-- ── Initial backfill ───────────────────────────────────────────────
SELECT public.refresh_title_available_services();

-- ── Verification (run after apply) ─────────────────────────────────
--   -- 1. Backfilled, and no drift.
--   SELECT count(*) FILTER (WHERE available_services <> '{}') AS with_availability,
--          count(*)                                          AS total
--   FROM public.titles;
--   SELECT public.count_available_services_drift();   -- must be 0
--
--   -- 2. The predicate every caller will use, and it should be an index scan.
--   EXPLAIN ANALYZE
--   SELECT id FROM public.titles
--   WHERE available_services && ARRAY['netflix','prime'] LIMIT 50;
--
--   -- 3. The trigger holds. Pick a real row, delete it, check, restore.
--   --    (Do this on a throwaway row, not blind on production data.)
--
--   -- 4. Column size — this is what replaces a 321KB transfer.
--   SELECT pg_size_pretty(pg_relation_size('idx_titles_available_services')) AS gin_index;
