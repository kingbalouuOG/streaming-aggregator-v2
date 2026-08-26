-- ============================================
-- 071: pipeline health-check heartbeat (R-010)
-- ============================================
--
-- Supports `scripts/health/pipeline-health.ts`, run daily by the
-- `pipeline-health` GitHub Actions workflow.
--
-- WHY THE CHECK LIVES OUTSIDE SUPABASE:
-- the failure this exists to catch is "the system reported itself
-- healthy while doing nothing" — 79 days of `cron.job_run_details` =
-- 'succeeded' over a dead TMDb key. We also watched pg_net sever calls at
-- 30s and the Edge Runtime refuse invocations with a 502. A monitor built
-- as an Edge Function invoked by pg_cron inherits every one of those
-- failure modes, so in exactly the scenarios worth alerting on, the alarm
-- itself would be the broken component. The checker therefore runs on
-- GitHub Actions and only *writes* here.
--
-- THIS TABLE IS THE WATCHMAN'S WATCHMAN. Scheduled Actions runs can be
-- delayed or dropped, and a run that never happens raises no alarm. Each
-- run records itself here, and one of the checker's own assertions is
-- "the previous heartbeat is younger than 48h" — so a skipped run is
-- reported by the following one. Only a sustained Actions outage escapes,
-- which is a far smaller residual than the zero coverage it replaces.
--
-- Deliberately not a general events table: one row per health-check run,
-- nothing else writes to it.
--
-- Reversibility: DROP TABLE public.pipeline_health;

CREATE TABLE IF NOT EXISTS public.pipeline_health (
  id          bigserial PRIMARY KEY,
  ran_at      timestamptz NOT NULL DEFAULT now(),
  ok          boolean     NOT NULL,
  -- Failed assertion names, so a glance at the row says what broke
  -- without opening the Actions log. Empty array on a healthy run.
  failures    text[]      NOT NULL DEFAULT '{}',
  -- Full per-assertion detail: name, ok, actual vs threshold.
  detail      jsonb,
  -- Where it ran, for when someone wonders why heartbeats stopped.
  source      text        NOT NULL DEFAULT 'github-actions'
);

COMMENT ON TABLE public.pipeline_health IS
  'R-010: one row per pipeline health-check run (GitHub Actions, daily '
  '09:00 UTC). Its own freshness is asserted by the next run, so a '
  'skipped check is caught rather than silently missed.';

CREATE INDEX IF NOT EXISTS idx_pipeline_health_ran_at
  ON public.pipeline_health (ran_at DESC);

-- Service-role only: enable RLS with no policies (service_role bypasses).
-- Nothing in the app reads this; it is purely operational.
ALTER TABLE public.pipeline_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pipeline_health FROM anon, authenticated;

-- ── Convenience view for a human spot-check ────────────────────────
-- `SELECT * FROM pipeline_health_recent;` answers "is the pipeline OK,
-- and when did anyone last actually check?" in one query.
DROP VIEW IF EXISTS public.pipeline_health_recent;
CREATE VIEW public.pipeline_health_recent
WITH (security_invoker = on) AS
SELECT ran_at,
       ok,
       failures,
       now() - ran_at AS age,
       source
FROM public.pipeline_health
ORDER BY ran_at DESC
LIMIT 30;

-- ── Verification (run after apply) ─────────────────────────────────
--   SELECT to_regclass('public.pipeline_health');          -- not null
--   SELECT * FROM public.pipeline_health_recent;           -- empty until the
--                                                          -- first Actions run
--   -- After the first run (or a manual workflow_dispatch):
--   SELECT ran_at, ok, failures FROM public.pipeline_health_recent LIMIT 1;
