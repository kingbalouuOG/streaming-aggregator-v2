-- ============================================
-- Phase 0.5 — Schedule the enrich-new-titles Edge Function
-- ============================================
--
-- This file is OPERATIONAL AUTOMATION, NOT a schema migration.
-- It lives in supabase/cron/ per Orchestration v0.3.2 §3.4: the
-- supabase/migrations/ sequence is reserved strictly for schema
-- evolution (CREATE TABLE, ALTER TABLE, indexes, constraints,
-- extensions). Recurring job schedules and other operational
-- runtime config live here.
--
-- Apply manually:
--   npx supabase db query --linked < supabase/cron/enrich_new_titles.sql
--
-- Re-applying is safe — cron.schedule() is idempotent on the (jobname)
-- key and replaces the existing schedule if it differs.
--
-- Retire with:
--   SELECT cron.unschedule('enrich-new-titles');
--
-- ----------------------------------------------------------------
-- Schedule: 06:30 UTC daily.
-- The existing daily-content-sync job (006_cron_schedule.sql) runs at
-- 06:00 UTC. The 30-minute gap is ample headroom for sync-incremental
-- to finish inserting new rows with `keywords IS NULL` before this
-- function sweeps the work queue.
--
-- ----------------------------------------------------------------
-- Bearer token: matches the pattern in 006_cron_schedule.sql:19.
-- Bearer token: read from Supabase Vault entry `service_role_key` per
-- IN-XPS-004 (Phase 5 migration 039). The Vault entry must exist
-- before this file is applied or re-applied. See migration 039
-- docstring for the rotation procedure.
-- ============================================

SELECT cron.schedule(
  'enrich-new-titles',
  '30 6 * * *',  -- 06:30 UTC, 30 minutes after daily-content-sync
  $$
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
  $$
);
