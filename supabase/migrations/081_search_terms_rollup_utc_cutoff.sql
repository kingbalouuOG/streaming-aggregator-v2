-- ══════════════════════════════════════════════════════════════════
-- 081 — search_terms_rollup: make the 30-day cutoff explicitly UTC
-- ══════════════════════════════════════════════════════════════════
--
-- Migration 079 shipped the retention job with a cutoff of
--
--     ((now() - interval '30 days')::date)::timestamp AT TIME ZONE 'UTC'
--
-- The `::date` cast there truncates in the SESSION's time zone, while every
-- other date in the job — the `day` column it groups by — is truncated in UTC
-- (`(i.created_at AT TIME ZONE 'UTC')::date`). The two agree only because
-- pg_cron happens to run with the database default of UTC. Nothing in the job
-- says so, and nothing fails loudly if that ever changes: the cutoff would
-- simply move by up to a day, so a day's rows would be split across two runs
-- and its aggregate written twice from two partial halves. That makes the
-- median un-mergeable, which is exactly the property 079 chose a whole-day
-- boundary to protect.
--
-- Same value today, verified live before writing this (2026-09-09, remote
-- `schema_migrations` is NOT authoritative — see the Supabase migration-history
-- caveat, and note 080 has no row there either):
--   to_regclass('public.search_terms_daily')      → search_terms_daily
--   cron.job WHERE jobname='search_terms_rollup'  → jobid 24, '0 3 * * *', active
--   current_setting('TimeZone')                   → UTC
--   old cutoff = new cutoff                       → 2026-08-10 00:00:00+00
--
-- Two changes, and nothing else about the job moves — same name, same 03:00
-- UTC schedule, same one-transaction ordering (aggregate, THEN strip):
--
--   1. The cutoff is derived from `now() AT TIME ZONE 'UTC'`, so the boundary
--      is a UTC day whatever the session is set to.
--   2. `ON CONFLICT … DO UPDATE` ADDS rather than overwrites. 079 wrote
--      `count = EXCLUDED.count`, which is correct only because a day is
--      always consumed whole in a single run — the same run's UPDATE strips
--      the rows it just counted, so a second run sees none of them. A
--      re-run over a PARTIALLY stripped day (a manual invocation, an
--      interrupted job) would have replaced the day's total with the
--      remainder. Adding is right in that case and identical in every other,
--      because there is no other case where the same (day, term, mode) is
--      inserted twice.
--
--      `median_result_count` cannot be merged this way — a median of a median
--      is not a median — so a partial re-run still leaves that column
--      describing only the last batch. Accepted: it is a diagnostic for
--      spotting terms that routinely return nothing (§6), not a number
--      anything is computed from, and the count beside it stays honest.
--
-- `cron.schedule` UPSERTS on job name, so this replaces job 24 in place
-- rather than adding a second one.
--
-- Rollback: re-run the `SELECT cron.schedule(...)` block from migration 079.
--   Nothing is dropped and no data is touched by this migration itself.

SELECT cron.schedule(
  'search_terms_rollup',
  '0 3 * * *',
  $job$
  DO $rollup$
  DECLARE
    -- Whole UTC days, matching the `day` column below. See the header.
    v_cutoff timestamptz := (((now() AT TIME ZONE 'UTC')::date - interval '30 days'))::timestamp AT TIME ZONE 'UTC';
  BEGIN
    INSERT INTO public.search_terms_daily (day, term_normalised, mode, count, median_result_count)
    SELECT
      (i.created_at AT TIME ZONE 'UTC')::date,
      lower(btrim(regexp_replace(i.metadata->>'query', '\s+', ' ', 'g'))),
      COALESCE(i.metadata->>'mode', 'lookup'),
      count(*)::int,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY (i.metadata->>'result_count')::double precision
      )
    FROM public.user_interactions i
    WHERE i.event_type = 'search'
      AND i.created_at < v_cutoff
      -- Preset taps, filter applies and refine-chip toggles carry
      -- `query: null` — they have no term, so they contribute nothing here
      -- and nothing is stripped from them below.
      AND i.metadata->>'query' IS NOT NULL
      AND btrim(i.metadata->>'query') <> ''
    GROUP BY 1, 2, 3
    ON CONFLICT (day, term_normalised, mode) DO UPDATE
      SET count               = public.search_terms_daily.count + EXCLUDED.count,
          median_result_count = COALESCE(EXCLUDED.median_result_count,
                                         public.search_terms_daily.median_result_count);

    UPDATE public.user_interactions
       SET metadata = jsonb_set(metadata, '{query}', 'null'::jsonb, true)
     WHERE event_type = 'search'
       AND created_at < v_cutoff
       AND metadata->>'query' IS NOT NULL;
  END;
  $rollup$;
  $job$
);

COMMENT ON COLUMN public.search_terms_daily.count IS
  'Number of searches for this (day, term, mode). Accumulated: a re-run over '
  'a partially stripped day adds to the existing total rather than replacing '
  'it (migration 081). A day consumed whole in one run — the normal case — '
  'writes this once.';
