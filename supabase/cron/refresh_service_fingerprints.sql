-- ============================================
-- Phase 2 — Schedule the refresh-service-fingerprints Edge Function
-- ============================================
--
-- This file is OPERATIONAL AUTOMATION, NOT a schema migration.
-- It lives in supabase/cron/ per Orchestration v0.3.2 §3.4.
--
-- Apply manually:
--   npx supabase db query --linked < supabase/cron/refresh_service_fingerprints.sql
--
-- Re-applying is safe — cron.schedule() is idempotent on the (jobname)
-- key and replaces the existing schedule if it differs.
--
-- Retire with:
--   SELECT cron.unschedule('refresh-service-fingerprints');
--
-- ----------------------------------------------------------------
-- Schedule: Sunday 07:00 UTC (weekly).
-- Pipeline sequence (daily, Mon–Sun):
--   06:00  daily-content-sync
--   06:30  enrich-new-titles
--   06:45  embed-new-titles
-- Phase 2 (weekly, Sunday only):
--   07:00  refresh-service-fingerprints
--
-- Weekly is sufficient because service catalogues change slowly.
-- The 15-minute gap after embed-new-titles ensures any new Sunday
-- embeddings are available before fingerprints are recomputed.
--
-- ----------------------------------------------------------------
-- Bearer token: read from Supabase Vault entry `service_role_key` per
-- IN-XPS-004 (Phase 5 migration 039). The Vault entry must exist
-- before this file is applied or re-applied. See migration 039
-- docstring for the rotation procedure.
-- ============================================

SELECT cron.schedule(
  'refresh-service-fingerprints',
  '0 7 * * 0',  -- 07:00 UTC every Sunday
  $$
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
  $$
);
