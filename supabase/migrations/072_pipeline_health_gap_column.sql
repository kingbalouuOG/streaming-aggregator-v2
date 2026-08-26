-- ============================================
-- 072: surface the catalogue gap in pipeline_health_recent
-- ============================================
--
-- Migration 071 stored the gap inside `detail` jsonb but did not expose it
-- on the view, so reading the trend meant knowing to reach past the view
-- into the table and cast the jsonb by hand.
--
-- The gap trend is workstream A's exit criterion — the number to watch
-- daily for the next fortnight (falling ~1,250-2,000/day, flattening near
-- zero). A metric that is checked every day should be one query, not a
-- jsonb extraction someone has to remember the shape of.
--
--   SELECT ran_at, ok, failures, gap FROM pipeline_health_recent;
--
-- `delta` is the day-on-day change, negative while the backlog drains. A
-- sustained positive delta means inflow has outgrown the chain and
-- backfill-missing-titles needs a higher MAX_CHAIN_DEPTH — the same signal
-- that made A5 necessary, when the gap climbed 22,260 -> 22,729 in a day
-- and nothing was watching.
--
-- DROP + CREATE rather than CREATE OR REPLACE: replace can only append
-- columns to the end, and `gap`/`delta` belong next to `failures` where
-- they will actually be read. security_invoker is re-declared because a
-- plain recreate would silently drop back to definer rights (the same trap
-- migration 066 hit with sync_history).
--
-- Reversibility: re-apply migration 071's view body.

DROP VIEW IF EXISTS public.pipeline_health_recent;

CREATE VIEW public.pipeline_health_recent
WITH (security_invoker = on) AS
SELECT ran_at,
       ok,
       failures,
       (detail->>'gap')::bigint AS gap,
       (detail->>'gap')::bigint
         - lag((detail->>'gap')::bigint) OVER (ORDER BY ran_at) AS delta,
       now() - ran_at AS age,
       source
FROM public.pipeline_health
ORDER BY ran_at DESC
LIMIT 30;

COMMENT ON VIEW public.pipeline_health_recent IS
  'R-010: recent health-check runs with the catalogue gap and its '
  'day-on-day delta. Negative delta = backlog draining. A sustained '
  'positive delta means inflow has outgrown the backfill chain.';

-- ── Verification (run after apply) ─────────────────────────────────
--   SELECT ran_at, ok, failures, gap, delta FROM public.pipeline_health_recent;
--   -- one row today, delta NULL (no prior run to compare against);
--   -- from tomorrow, delta should be negative and stay that way until
--   -- the gap flattens near zero.
--
--   -- security_invoker survived the recreate:
--   SELECT reloptions FROM pg_class WHERE relname = 'pipeline_health_recent';
--   -- expect {security_invoker=on}
