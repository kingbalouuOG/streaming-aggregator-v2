-- ============================================
-- Phase 5 Workstream C — cron jobs Vault-backed JWT (IN-XPS-004)
-- Migration 039
-- ============================================
--
-- Vault migration WITHOUT rotation. Phase 5 originally planned a full
-- service-role JWT rotation here, but the Supabase dashboard UI no
-- longer exposes a path to issue a new long-lived service-role JWT
-- signed by the current ECC signing key — the API key model has moved
-- to opaque `sb_secret_…` tokens that fail `verify_jwt = true` on our
-- Edge Functions. Full rotation deferred to Phase 6 (parking-lot
-- IN-XPS-004).
--
-- What this migration DOES achieve in Phase 5: the inline JWT moves
-- out of source code (006_cron_schedule.sql:19 + supabase/cron/*.sql)
-- and into Supabase Vault. The token value is unchanged, but git
-- history no longer leaks a usable credential, and future rotation
-- becomes a single `vault.update_secret(...)` + cron unschedule/
-- reschedule cycle (or just the secret update, with cron jobs picking
-- up the new value at their next firing).
--
-- Sequence (out-of-repo step 1, then this migration):
--
--   1. Joe creates a Vault entry containing the EXISTING legacy
--      service-role JWT (the same string visible in
--      006_cron_schedule.sql:19):
--      SELECT vault.create_secret(
--        '<paste-existing-legacy-service-role-jwt>',
--        'service_role_key',
--        'Service role JWT used by pg_cron jobs. Phase 5 Vault '
--        'migration without rotation; full rotation deferred to '
--        'Phase 6 pending Supabase tooling.'
--      );
--
--   2. Joe applies this migration. It unschedules each existing cron
--      job (whose registration carries the inline JWT) and re-
--      schedules with a Vault read. The inline-JWT registrations
--      still in cron.job today will be replaced.
--
--   3. No "revoke old key" step — the same JWT is now read from
--      Vault. Nothing to revoke.
--
-- Rollback: fully reversible. Re-apply migration 006 and the three
-- supabase/cron/*.sql files (in their pre-Phase-5 inline-JWT form,
-- restored from git history if needed) to put the inline registrations
-- back, then DELETE the vault entry.
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
