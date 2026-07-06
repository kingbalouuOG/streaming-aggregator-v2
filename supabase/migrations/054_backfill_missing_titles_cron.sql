-- ============================================
-- H0 Stream D — scheduled catalogue-gap backfill (IN-PX-50)
-- Migration 054
-- ============================================
--
-- Automates the recurring half of IN-465. Two parts:
--   1. list_missing_title_ids(p_limit) — the SA-minus-titles anti-join,
--      run in-DB so the Edge Function never pulls both tables into memory.
--   2. A weekly pg_cron job that POSTs the backfill-missing-titles Edge
--      Function with a Vault-sourced service-role bearer (pattern of
--      migration 039).
--
-- DEPLOY ORDER (important — the cron calls a function that must exist):
--   1. Deploy the Edge Function FIRST:
--        npx supabase functions deploy backfill-missing-titles \
--          --project-ref fmusugdcnnwiuzkbjquo
--   2. Then apply this migration.
--   The Vault entry `service_role_key` already exists (migration 039); the
--   sanity check below refuses to apply if it has gone missing.
--
-- TMDb key: the Edge Function reads TMDB_API_KEY from its own env secret
-- (already provisioned for enrich-new-titles) — NOT from Vault. Only the
-- Authorization bearer comes from Vault, exactly as migration 039 does for
-- the other cron-called functions.
--
-- Reversibility: SELECT cron.unschedule('backfill-missing-titles');
--                DROP FUNCTION public.list_missing_title_ids(integer);

-- ── Anti-join RPC ──────────────────────────────────────────────────
-- Distinct (tmdb_id, media_type) pairs present in streaming_availability
-- but absent from titles. STABLE, service_role-only. Ordered so repeated
-- capped runs make deterministic forward progress.
CREATE OR REPLACE FUNCTION public.list_missing_title_ids(p_limit integer DEFAULT 300)
RETURNS TABLE (tmdb_id integer, media_type text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $function$
  SELECT DISTINCT sa.tmdb_id, sa.media_type
  FROM public.streaming_availability sa
  LEFT JOIN public.titles t
    ON t.tmdb_id = sa.tmdb_id
   AND t.media_type = sa.media_type
  WHERE t.tmdb_id IS NULL
    AND sa.media_type IN ('movie', 'tv')
  ORDER BY sa.tmdb_id
  LIMIT GREATEST(p_limit, 0);
$function$;

COMMENT ON FUNCTION public.list_missing_title_ids(integer) IS
  'IN-PX-50: (tmdb_id, media_type) pairs in streaming_availability with no '
  'joining titles row, capped to p_limit. Feeds the backfill-missing-titles '
  'Edge Function. service_role only.';

-- Not user-callable — only the service-role Edge Function needs it.
REVOKE ALL ON FUNCTION public.list_missing_title_ids(integer) FROM public;
REVOKE ALL ON FUNCTION public.list_missing_title_ids(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_missing_title_ids(integer) TO service_role;

-- ── Refuse to apply without the Vault entry ────────────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM vault.secrets WHERE name = 'service_role_key';
  IF v_count = 0 THEN
    RAISE EXCEPTION
      'vault.secrets entry "service_role_key" not found. It should already '
      'exist from migration 039. Create it before applying (see 039 docstring).';
  END IF;
END $$;

-- ── Weekly cron ────────────────────────────────────────────────────
-- Sunday 05:00 UTC: after mood-rooms recluster (1st @ 03:00) and before
-- the daily enrich (06:30) / embed (06:45) crons, so freshly-inserted
-- titles get enriched + embedded the same morning. Weekly (not monthly)
-- so any first-run backlog beyond the 300/run cap drains within weeks.
SELECT cron.unschedule('backfill-missing-titles')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'backfill-missing-titles');

SELECT cron.schedule(
  'backfill-missing-titles',
  '0 5 * * 0',
  $cron$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/backfill-missing-titles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'service_role_key'
          LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- ── Verification (run after apply + after the first Sunday run) ─────
--   SELECT jobname, schedule, active FROM cron.job
--   WHERE jobname = 'backfill-missing-titles';               -- active = true
--
--   SELECT count(*) FROM public.list_missing_title_ids(100000);  -- gap size
--
--   SELECT j.jobname, d.status, d.return_message, d.end_time
--   FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
--   WHERE j.jobname = 'backfill-missing-titles'
--   ORDER BY d.end_time DESC LIMIT 3;                         -- status succeeded
