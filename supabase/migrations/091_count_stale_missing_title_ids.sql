-- ============================================
-- 091: count_stale_missing_title_ids() — the gap the backfill should
--      already have closed (IN-SY-002, R-010)
-- ============================================
--
-- WHY: pipeline-health's `gap-not-growing` check compared the WHOLE gap
-- (count_missing_title_ids(), migration 067) against the oldest heartbeat
-- in the last 7 days, and went red on any increase. The cron order makes
-- that a coin toss:
--
--   05:00  backfill-missing-titles   closes the gap as it stood at 05:00
--   06:00  daily-content-sync        adds this morning's new titles
--   09:00+ pipeline-health           (Actions often starts it 13:00-14:00)
--
-- Every title new to the catalogue at 06:00 sits in the gap until TOMORROW's
-- 05:00 backfill, so the check always sees it and passes only on mornings
-- that brought fewer new titles than the baseline day. 15 Sept (2,323 vs
-- 31) and 16 Sept (39 vs 31) were false alarms: on 16 Sept all 39 gap
-- titles had their first availability row between 06:00:47 and 06:01:50.
--
-- This function counts only gap titles that have been sitting in
-- streaming_availability for longer than p_min_age — i.e. titles a daily
-- backfill has already had a chance at. That number is ~0 when the backfill
-- works, and grows by one day's arrivals for each day it stalls or skips
-- (the original 22,260 -> 22,729/day failure under weekly cadence).
--
-- A sibling, not a change to count_missing_title_ids(): the backfill Edge
-- Function and scripts/sync/drain-title-queue.ts call that one and want
-- the whole gap.
--
-- ── The age signal, and why it is created_at despite being reset ────
--
-- Every writer of streaming_availability (sync-incremental, sync-content.ts
-- stage `sa`, backfill-service-catalogue.ts walks) replaces a row with
-- DELETE + INSERT, so a row's created_at is "last rewritten", not "first
-- seen". It is still the right signal here, for two reasons:
--
--   1. The reset only ever moves the time FORWARD. min(created_at) per title
--      can make a stale title look fresh (a missed count for a day), never
--      make a fresh title look stale — so it cannot produce the false alarm
--      this migration exists to remove. Measured 2026-09-16: 207 of 77,179
--      titles had min(created_at) inside the last 24h, which includes that
--      morning's real arrivals — the undercount is under 0.3% a day.
--   2. The "true first-seen" alternatives answer the wrong question.
--      sa_show_map.first_seen_at and the earliest streaming_history event
--      date a title's history, not its current stint in the gap: 25 of the
--      16 Sept 39 had been removed on 13 Sept and re-added that morning, so
--      both would have called them 3-5 days stale and rebuilt the alarm.
--
-- min(), not max() or any(): a title is as old as its OLDEST surviving row.
--
-- ── Cost ────────────────────────────────────────────────────────────
--
-- EXPLAIN ANALYZE on production 2026-09-16 (241,861 availability rows,
-- 48,919 titles, 44,499 skips): 178ms, all shared hits — parallel hash
-- anti-joins then a HashAggregate over the ~40 surviving gap titles. The
-- HAVING filter runs after the anti-join, so it costs nothing extra over
-- count_missing_title_ids(). Called once per health-check run (the heartbeat
-- reuses the check's number), never in a loop.
--
-- Reversibility: DROP FUNCTION public.count_stale_missing_title_ids(interval);
--
-- Apply: Joe, in the Studio SQL editor (never db push). Then regenerate
-- src/lib/database.types.ts — this PR already carries the expected entry.

CREATE OR REPLACE FUNCTION public.count_stale_missing_title_ids(
  p_min_age interval DEFAULT interval '24 hours'
)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $function$
  SELECT count(*) FROM (
    SELECT sa.tmdb_id, sa.media_type
    FROM public.streaming_availability sa
    LEFT JOIN public.titles t
      ON t.tmdb_id = sa.tmdb_id AND t.media_type = sa.media_type
    LEFT JOIN public.backfill_skips s
      ON s.tmdb_id = sa.tmdb_id AND s.media_type = sa.media_type
    WHERE t.tmdb_id IS NULL
      AND s.tmdb_id IS NULL
      AND sa.media_type IN ('movie', 'tv')
    GROUP BY sa.tmdb_id, sa.media_type
    HAVING min(sa.created_at) < now() - p_min_age
  ) q;
$function$;

COMMENT ON FUNCTION public.count_stale_missing_title_ids(interval) IS
  'IN-SY-002: titles gap restricted to titles whose oldest availability row '
  'is older than p_min_age (default 24h) — what the daily backfill should '
  'already have closed. created_at is reset by delete+insert writers, so '
  'this can undercount, never overcount. ~180ms. service_role only.';

REVOKE ALL ON FUNCTION public.count_stale_missing_title_ids(interval) FROM public;
REVOKE ALL ON FUNCTION public.count_stale_missing_title_ids(interval) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_stale_missing_title_ids(interval) TO service_role;

-- ── Verification (run after apply) ─────────────────────────────────
--   -- 1. Exists, with the expected signature.
--   SELECT to_regprocedure('public.count_stale_missing_title_ids(interval)');  -- not null
--
--   -- 2. Not callable by client roles.
--   SELECT has_function_privilege('anon',          'public.count_stale_missing_title_ids(interval)', 'EXECUTE'),  -- false
--          has_function_privilege('authenticated', 'public.count_stale_missing_title_ids(interval)', 'EXECUTE'),  -- false
--          has_function_privilege('service_role',  'public.count_stale_missing_title_ids(interval)', 'EXECUTE');  -- true
--
--   -- 3. Bounded by the whole gap, and ~0 on a healthy day.
--   SELECT public.count_missing_title_ids()                          AS whole_gap,
--          public.count_stale_missing_title_ids()                    AS stale_24h,
--          public.count_stale_missing_title_ids(interval '0 seconds') AS stale_0s;
--   -- expect: stale_24h <= stale_0s = whole_gap (16 Sept: 39 / 0 / 39)
--
--   -- 4. Then trigger the health check and confirm it goes green:
--   --    gh workflow run "Pipeline health"
