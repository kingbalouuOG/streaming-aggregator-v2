-- ============================================
-- Phase 5 Workstream C — cron jobs Vault-backed JWT (IN-XPS-004)
-- Migration 039
-- ============================================
--
-- ⚠️ IRREVERSIBLE ⚠️
-- This migration is the second half of a two-step rotation. The first
-- step is out-of-repo and MUST happen before this migration is
-- applied. Sequence:
--
--   1. Joe rotates the service-role key in the Supabase dashboard
--      (Project Settings → API → Service Role → Rotate). The previous
--      key remains valid for a short overlap window.
--
--   2. Joe creates a Vault entry for the new key:
--      SELECT vault.create_secret(
--        '<new-service-role-jwt>',
--        'service_role_key',
--        'Service role JWT used by pg_cron jobs to call user-callable Edge Functions'
--      );
--
--   3. Joe applies this migration. It unschedules each existing cron
--      job (whose registration carries the OLD inline JWT) and re-
--      schedules with a Vault read. Until this migration applies, the
--      old jobs continue to run against the old key — which is fine,
--      because the old key is still valid during the overlap window.
--
--   4. Joe revokes the old key in the dashboard once cron.job_run_details
--      shows successful runs from the new schedules.
--
-- Rollback: only possible if step 4 has not happened. To roll back,
-- un-rotate the service-role key in the dashboard (re-instating the
-- old key as primary), then either git revert this migration or run
-- `cron.unschedule(...)` on each new schedule and re-run the original
-- migration 006 + the supabase/cron/*.sql files. After step 4 the
-- old key is gone and rollback requires another rotation.
--
-- Audit (run by CC 2026-05-06):
--   grep -R 'Bearer ey' supabase/migrations/  → matches only 006:19
--   grep -R 'Bearer ey' supabase/cron/        → matches embed_new_titles:45,
--                                                enrich_new_titles:46,
--                                                refresh_service_fingerprints:44
--   migration 014's cron jobs (card_impressions_rollup, pg_partman_maintenance)
--   are pure SQL — no JWT, no rotation needed.
--   mood-rooms-recluster is a GitHub Actions workflow using
--   SUPABASE_CONNECTION_STRING (postgres DSN), not service-role JWT.
--   Out of scope for this migration.
--
-- All four cron jobs that ARE in scope share the identical inline
-- JWT. One rotation covers them all.

-- Helper: read the vault secret. Inlined as a SQL expression in the
-- net.http_post calls below. The lookup happens at job-run time, not
-- at schedule time — so even though the cron registration is stored
-- as text in cron.job, the JWT itself is never persisted there.

-- Sanity check: refuse to apply if the Vault entry doesn't exist.
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM vault.secrets
    WHERE name = 'service_role_key';
  IF v_count = 0 THEN
    RAISE EXCEPTION
      'vault.secrets entry "service_role_key" not found. Create it via the dashboard before applying this migration. See migration 039 docstring step 2.';
  END IF;
END $$;

-- ── Unschedule the four existing jobs ─────────────────────────────
-- Each unschedule is idempotent: returns false rather than erroring
-- if the job doesn't exist.
SELECT cron.unschedule('daily-content-sync');
SELECT cron.unschedule('embed-new-titles');
SELECT cron.unschedule('enrich-new-titles');
SELECT cron.unschedule('refresh-service-fingerprints');

-- ── Re-schedule with Vault-backed JWT ─────────────────────────────

-- 1. daily-content-sync — replaces 006_cron_schedule.sql:11-24
SELECT cron.schedule(
  'daily-content-sync',
  '0 6 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/sync-incremental',
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

-- 2. embed-new-titles — replaces supabase/cron/embed_new_titles.sql
-- Original schedule: 06:45 UTC daily (Phase 1 actuals).
SELECT cron.schedule(
  'embed-new-titles',
  '45 6 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/embed-new-titles',
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

-- 3. enrich-new-titles — replaces supabase/cron/enrich_new_titles.sql
-- Original schedule: 06:30 UTC daily (Phase 0.5 actuals).
SELECT cron.schedule(
  'enrich-new-titles',
  '30 6 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/enrich-new-titles',
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

-- 4. refresh-service-fingerprints — replaces supabase/cron/refresh_service_fingerprints.sql
-- Original schedule: Sunday 07:00 UTC weekly (Phase 2 actuals).
SELECT cron.schedule(
  'refresh-service-fingerprints',
  '0 7 * * 0',
  $cron$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/refresh-service-fingerprints',
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

-- ── Verification (run after apply) ────────────────────────────────
--
-- Confirm all four jobs are registered with the new vault-backed JWT
-- and the OLD inline JWT no longer appears anywhere:
--
--   SELECT jobname, schedule, active FROM cron.job
--   WHERE jobname IN ('daily-content-sync', 'embed_new_titles',
--                     'enrich_new_titles', 'refresh_service_fingerprints');
--
--   SELECT count(*) FROM cron.job
--   WHERE command LIKE '%Bearer ey%';
--   -- expect 0 (no inline JWTs anywhere in cron registrations)
--
-- Wait for the next scheduled run of any one job (or trigger
-- manually via SELECT cron.schedule(...) with a near-future time
-- temporarily) and check:
--
--   SELECT jobname, status, return_message
--   FROM cron.job_run_details
--   ORDER BY end_time DESC LIMIT 10;
--   -- expect status = 'succeeded' for the rotated jobs
--
-- Once verified, the old service-role key can be revoked in the
-- dashboard.
