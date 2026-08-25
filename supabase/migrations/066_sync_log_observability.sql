-- ============================================
-- 066: sync_log observability repair (Workstream A1)
-- ============================================
--
-- The catalogue froze on 2026-06-07 and nothing in our telemetry said so.
-- Three defects, all confirmed against the live DB on 2026-08-25:
--
--  1. `titles_added` NEVER meant titles. sync-incremental/index.ts:332
--     increments `stats.added` on a new *streaming option*, and :423 writes
--     that into `titles_added`. Worked example — the 2026-08-18 run logged
--     `titles_processed=925, titles_added=925` on a day when zero rows were
--     created in `titles`. The one job that really does insert titles
--     (backfill-missing-titles) writes no sync_log row at all.
--
--  2. `error_details` is always NULL. Runs on 2026-08-12..15 each recorded
--     `titles_processed=0, errors=17` with no detail — four consecutive
--     days of total failure and not one recoverable fact. The actual cause
--     (TMDb returning 401 to every call) was only ever visible in Edge
--     Function logs, which nothing monitors.
--
--  3. Killed runs are invisible. 4 of the last 14 sync-incremental runs sit
--     at `status='running'` with `completed_at` NULL forever (2026-08-16,
--     -17, -19, -25) — the Edge Function hit its wall-clock limit
--     mid-pagination and never came back to close its own row. Nothing
--     distinguishes "running right now" from "died 9 days ago".
--
-- Fixes, in order:
--   A. Add `availability_*` columns that honestly name what the SA sync
--      counts, and relabel history so past rows stop lying.
--   B. Add `heartbeat_at` + `reap_stale_sync_runs()` so a killed run gets
--      marked failed with a reason instead of lingering as 'running'.
--   C. Allow sync_type='backfill' so backfill-missing-titles can log the
--      one count that genuinely IS titles_added.
--
-- NOTE ON SCOPE: the approved plan names only `titles_added`. `titles_updated`
-- and `titles_removed` carry exactly the same defect (they count streaming
-- options too), so they get the same treatment here — fixing one of three
-- identically-broken columns would leave the table more confusing, not less.
--
-- ADDITIVE, NOT A RENAME: `titles_added` survives and is repurposed to mean
-- actual `titles` rows. `sync_history` (migration 003), supabase/queries/
-- dashboard.sql and scripts/sync-content.ts keep working unchanged.
--
-- Reversibility:
--   ALTER TABLE public.sync_log
--     DROP COLUMN availability_added, DROP COLUMN availability_updated,
--     DROP COLUMN availability_removed, DROP COLUMN heartbeat_at;
--   DROP FUNCTION public.reap_stale_sync_runs(interval);
--   -- then re-apply migration 003's sync_history body.
--   (The sync_type CHECK widening and the history relabel are not reverted
--    by the above; see the relabel block for its inverse.)

-- ── A. Honest column names ─────────────────────────────────────────

ALTER TABLE public.sync_log
  ADD COLUMN IF NOT EXISTS availability_added   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS availability_updated integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS availability_removed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heartbeat_at         timestamptz;

COMMENT ON COLUMN public.sync_log.availability_added IS
  'streaming_availability rows inserted (SA API change_type=new). This is '
  'what titles_added used to hold on incremental runs — it is NOT a title count.';
COMMENT ON COLUMN public.sync_log.availability_updated IS
  'streaming_availability rows replaced (change_type=updated/expiring).';
COMMENT ON COLUMN public.sync_log.availability_removed IS
  'streaming_availability rows deleted (change_type=removed).';
COMMENT ON COLUMN public.sync_log.titles_added IS
  'Rows inserted into public.titles. Only the backfill path and '
  'scripts/sync-content.ts can move this; sync-incremental writes 0. '
  'Before migration 066 this column held the availability count on '
  'incremental runs (see the 066 docstring).';
COMMENT ON COLUMN public.sync_log.heartbeat_at IS
  'Last time the owning job proved it was alive. Stale + status=running '
  'means the job was killed — see reap_stale_sync_runs().';

-- Relabel history so the archive stops misreporting. Scoped to the rows the
-- Edge Function wrote (sa_api + incremental); `full` runs from
-- scripts/sync-content.ts really did add titles and are left alone.
--
-- Inverse, if this ever needs undoing:
--   UPDATE public.sync_log SET titles_added = availability_added,
--     titles_updated = availability_updated, titles_removed = availability_removed
--   WHERE source = 'sa_api' AND sync_type = 'incremental';
UPDATE public.sync_log
SET availability_added   = COALESCE(titles_added, 0),
    availability_updated = COALESCE(titles_updated, 0),
    availability_removed = COALESCE(titles_removed, 0),
    titles_added   = 0,
    titles_updated = 0,
    titles_removed = 0
WHERE source = 'sa_api'
  AND sync_type = 'incremental'
  AND COALESCE(availability_added, 0) = 0
  AND COALESCE(availability_updated, 0) = 0
  AND COALESCE(availability_removed, 0) = 0
  AND (COALESCE(titles_added, 0) > 0
    OR COALESCE(titles_updated, 0) > 0
    OR COALESCE(titles_removed, 0) > 0);

-- ── B. Reap runs that were killed mid-flight ───────────────────────
--
-- Called at the start of every sync/backfill invocation. A 'running' row
-- whose heartbeat has gone cold is a job that died without closing itself;
-- mark it failed and say so, rather than leaving it indistinguishable from
-- a job that is genuinely still working.
--
-- Rows predating this migration have heartbeat_at IS NULL, so they are
-- judged on started_at instead — that is what closes out the four stuck
-- rows from 2026-08-16/17/19/25.
CREATE OR REPLACE FUNCTION public.reap_stale_sync_runs(
  p_stale_after interval DEFAULT interval '10 minutes'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_reaped integer;
BEGIN
  UPDATE public.sync_log
  SET status        = 'failed',
      completed_at  = COALESCE(completed_at, now()),
      errors        = GREATEST(COALESCE(errors, 0), 1),
      error_details = COALESCE(error_details, '{}'::jsonb) || jsonb_build_object(
        'reaped_at', now(),
        'reason', 'no heartbeat for ' || p_stale_after::text ||
                  ' — the job was killed before it could close its own row',
        'last_heartbeat_at', heartbeat_at
      )
  WHERE status = 'running'
    AND COALESCE(heartbeat_at, started_at) < now() - p_stale_after;

  GET DIAGNOSTICS v_reaped = ROW_COUNT;
  RETURN v_reaped;
END;
$function$;

COMMENT ON FUNCTION public.reap_stale_sync_runs(interval) IS
  'A1: close out sync_log rows stuck in status=running because the owning '
  'Edge Function was killed. Returns the number of rows reaped. Called at '
  'the head of each sync/backfill invocation. service_role only.';

REVOKE ALL ON FUNCTION public.reap_stale_sync_runs(interval) FROM public;
REVOKE ALL ON FUNCTION public.reap_stale_sync_runs(interval) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_stale_sync_runs(interval) TO service_role;

-- ── C. Let the backfill log itself ─────────────────────────────────
-- backfill-missing-titles is the only scheduled job that writes `titles`,
-- so it is the only honest source of titles_added — but it had no
-- sync_type it was allowed to use.
ALTER TABLE public.sync_log DROP CONSTRAINT IF EXISTS sync_log_sync_type_check;
ALTER TABLE public.sync_log ADD CONSTRAINT sync_log_sync_type_check
  CHECK (sync_type IN ('full', 'incremental', 'changes', 'backfill'));

-- ── D. Surface all of it in the monitoring view ────────────────────
-- Supersedes migration 003's sync_history. `stalled_for` is the tell: a
-- non-null value on a 'running' row means nobody has heartbeated since.
CREATE OR REPLACE VIEW public.sync_history AS
SELECT
  sync_type,
  source,
  status,
  titles_processed,
  titles_added,
  availability_added,
  availability_updated,
  availability_removed,
  errors,
  error_details,
  started_at,
  completed_at,
  EXTRACT(EPOCH FROM (completed_at - started_at))::INTEGER AS duration_seconds,
  CASE
    WHEN status = 'running'
    THEN now() - COALESCE(heartbeat_at, started_at)
  END AS stalled_for
FROM public.sync_log
ORDER BY started_at DESC
LIMIT 20;

-- ── Verification (run after apply) ─────────────────────────────────
--   -- 1. Columns exist, history relabelled: titles_added must now be 0
--   --    on every incremental row, with the count moved across.
--   SELECT started_at, titles_processed, titles_added, availability_added,
--          availability_updated, availability_removed
--   FROM public.sync_log
--   WHERE sync_type = 'incremental' ORDER BY started_at DESC LIMIT 5;
--
--   -- 2. Reaper closes the four stuck rows (expect 4 on first run, 0 after).
--   SELECT public.reap_stale_sync_runs();
--   SELECT count(*) FROM public.sync_log
--   WHERE status = 'running' AND completed_at IS NULL;   -- expect 0
--
--   -- 3. sync_type='backfill' is now accepted.
--   SELECT 'backfill' = ANY (
--     SELECT unnest(string_to_array(
--       regexp_replace(pg_get_constraintdef(oid), '[^a-z,]', '', 'g'), ','))
--     FROM pg_constraint WHERE conname = 'sync_log_sync_type_check');
--
--   -- 4. View still readable.
--   SELECT * FROM public.sync_history LIMIT 5;
