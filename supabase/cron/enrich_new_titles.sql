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
-- This service-role JWT is committed to source control intentionally
-- (Phase 0.5 inherits the precedent from Phase B1, it does not create
-- new exposure). See Parking Lot entry IN-XPS-004 for the rotation
-- plan: this and the existing 006 token must rotate to a secrets-
-- managed reference (vault.create_secret + vault.decrypted_secrets,
-- or similar) before public launch.
-- ============================================

SELECT cron.schedule(
  'enrich-new-titles',
  '30 6 * * *',  -- 06:30 UTC, 30 minutes after daily-content-sync
  $$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/enrich-new-titles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdXN1Z2Rjbm53aXV6a2JqcXVvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTE5MTUzNSwiZXhwIjoyMDg2NzY3NTM1fQ.72SH7EjXEwh_RFiegV1eNonXOLVWMEtFMR7Jy3eZxt0'
    ),
    body := '{}'::jsonb
  );
  $$
);
