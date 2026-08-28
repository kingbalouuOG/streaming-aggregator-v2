-- 078 — record billable SA (RapidAPI) requests per sync run (A2 cost control)
--
-- Joe has hit the RapidAPI quota. Fixing the pg_net timeout is WHY: runs
-- that used to die partway now finish, so availability changes went from
-- ~600/day to ~4,200/day. That coverage is correct and wanted — the volume
-- of REQUESTS behind it is what needs trimming.
--
-- Nothing currently records how many requests a run makes, so any proposed
-- optimisation would be argued from inference. This column exists so the
-- tuning that follows is measured against a real baseline. INSTRUMENT
-- FIRST, tune second.
--
-- Counted where requests leave (`fetchWithRetry`), so retries provoked by
-- 429/5xx are included — RapidAPI bills those, and they are most frequent
-- exactly when spend spikes.
--
-- Accumulates across a chained run: the counter rides in
-- `sync_log.chain_state.stats`, so this is the whole chain's total rather
-- than the last slice's.

ALTER TABLE public.sync_log
  ADD COLUMN IF NOT EXISTS sa_requests integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.sync_log.sa_requests IS
  'Billable Streaming Availability (RapidAPI) requests made by this run, '
  'including retries. Accumulated across all slices of a chained run. '
  'Added by migration 078 for A2 cost control.';

-- ── Surface it in the run history view ─────────────────────────────
-- sync_history is what actually gets read when judging a run, so leaving
-- the column out would mean the baseline is recorded but invisible.
--
-- DROP + CREATE rather than REPLACE: a replace cannot insert a column into
-- the middle of the list. The definition below is the LIVE one, reproduced
-- verbatim from pg_get_viewdef — including `source`, `stalled_for` and the
-- LIMIT 20 — with only the two new columns added. An earlier draft of this
-- migration rebuilt the view from memory and silently dropped `source` and
-- `stalled_for`; recreating a view means owning every column it had.
--
-- `security_invoker = on` is re-declared for the same reason: it is set on
-- the live view (confirmed via pg_class.reloptions) and a plain recreate
-- drops it, which is the trap migration 066 hit.

DROP VIEW IF EXISTS public.sync_history;

CREATE VIEW public.sync_history
WITH (security_invoker = on) AS
SELECT
  sync_type,
  source,
  status,
  titles_processed,
  titles_added,
  availability_added,
  availability_updated,
  availability_removed,
  sa_requests,
  -- Requests spent per availability change actually recorded. The RATIO,
  -- not the raw count, is what says whether tuning worked — a run covering
  -- a busier day should legitimately cost more requests.
  CASE
    WHEN (COALESCE(availability_added, 0)
        + COALESCE(availability_updated, 0)
        + COALESCE(availability_removed, 0)) > 0
    THEN round(
      sa_requests::numeric
      / (COALESCE(availability_added, 0)
       + COALESCE(availability_updated, 0)
       + COALESCE(availability_removed, 0)), 3)
  END AS sa_requests_per_change,
  errors,
  error_details,
  started_at,
  completed_at,
  EXTRACT(epoch FROM completed_at - started_at)::integer AS duration_seconds,
  CASE
    WHEN status = 'running'::text THEN now() - COALESCE(heartbeat_at, started_at)
    ELSE NULL::interval
  END AS stalled_for
FROM public.sync_log
ORDER BY started_at DESC
LIMIT 20;

COMMENT ON VIEW public.sync_history IS
  'Recent sync runs, newest first. security_invoker so RLS applies to the '
  'caller. sa_requests + sa_requests_per_change added by migration 078.';
