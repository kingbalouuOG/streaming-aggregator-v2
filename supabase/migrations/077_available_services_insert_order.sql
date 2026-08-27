-- 077 — close the write-ordering hole in titles.available_services (B3 / R-027)
--
-- THE BUG, measured live 2026-08-27. `count_available_services_drift()`
-- returned 821. Every one of the 821 had the same shape:
--
--     stored = '{}'   actual = (one or more services)
--
-- and every one was a title created between 05:00:06 and 05:15:40 — the
-- daily backfill window. Drilling in: for 821 of 821, the
-- `streaming_availability` rows were written BEFORE the `titles` row
-- existed.
--
-- 075 put the trigger only on `streaming_availability`. Its recompute is:
--
--     UPDATE public.titles t SET available_services = (...)
--     WHERE t.tmdb_id = p_tmdb_id AND t.media_type = p_media_type;
--
-- With no matching title row that UPDATE affects zero rows and raises
-- nothing. The title is then inserted with the column defaulting to '{}',
-- and no later event ever recomputes it.
--
-- WHY IT MATTERS MORE AFTER B3. Home's genre spotlights and the
-- critically-acclaimed row now filter with
-- `available_services @> / && '{...}'` in SQL. A title with an empty
-- column is invisible to every one of those queries however healthy its
-- `streaming_availability` rows look. The effect is that the newest
-- titles — precisely the ones a freshly-unfrozen catalogue exists to
-- surface — silently never appear. It compounds daily: this is one
-- backfill run's worth.
--
-- THE FIX. Recompute on `titles` INSERT as well, so the column is correct
-- regardless of which side is written first. Defence in depth rather than
-- a fix to one caller: any writer that lands availability before its
-- title is now covered, including future ones.
--
-- ⚠ Like 075's trigger, this is per-row. It must be disabled around bulk
-- title loads (`sync-content.ts`) with `refresh_title_available_services()`
-- run afterwards — see R-027.

-- ── Recompute on the title side ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_new_title_available_services()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- A writer that already supplied the column is trusted; re-deriving it
  -- would be pure overhead on every bulk insert. Only fill the gap.
  IF NEW.available_services IS NOT NULL
     AND cardinality(NEW.available_services) > 0 THEN
    RETURN NULL;
  END IF;

  PERFORM public.recompute_title_available_services(NEW.tmdb_id, NEW.media_type);
  RETURN NULL;  -- AFTER trigger; return value is ignored
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_new_title_available_services ON public.titles;
CREATE TRIGGER trg_sync_new_title_available_services
  AFTER INSERT ON public.titles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_new_title_available_services();

-- ── Repair the 821 already on disk ─────────────────────────────────
-- 075 ships `refresh_title_available_services()` for exactly this. It
-- recomputes from `streaming_availability`, which is the source of truth,
-- so it is safe to re-run and idempotent.
SELECT public.refresh_title_available_services();

-- ── Prove it worked, in the same transaction ───────────────────────
-- A silent repair that did not repair is the failure mode this whole
-- column needs guarding against, so fail loudly rather than trust it.
DO $$
DECLARE
  v_drift bigint;
BEGIN
  SELECT public.count_available_services_drift() INTO v_drift;
  IF v_drift <> 0 THEN
    RAISE EXCEPTION
      'available_services drift is % after refresh; expected 0', v_drift;
  END IF;
  RAISE NOTICE 'available_services drift: 0 — repaired and consistent';
END $$;
