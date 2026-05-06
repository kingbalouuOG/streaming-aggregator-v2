-- ============================================
-- Phase 1 — Schedule the embed-new-titles Edge Function
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
--   npx supabase db query --linked < supabase/cron/embed_new_titles.sql
--
-- Re-applying is safe — cron.schedule() is idempotent on the (jobname)
-- key and replaces the existing schedule if it differs.
--
-- Retire with:
--   SELECT cron.unschedule('embed-new-titles');
--
-- ----------------------------------------------------------------
-- Schedule: 06:45 UTC daily.
-- Pipeline sequence:
--   06:00  daily-content-sync (sync-incremental — inserts new titles)
--   06:30  enrich-new-titles  (populates keywords, cast, director, etc.)
--   06:45  embed-new-titles   (generates 1536D embeddings for enriched titles)
--
-- The 15-minute gap after enrichment is ample headroom: enrich-new-titles
-- processes max 100 rows at 260ms each = 26s.
--
-- ----------------------------------------------------------------
-- Bearer token: read from Supabase Vault entry `service_role_key` per
-- IN-XPS-004 (Phase 5 migration 039). The Vault entry must exist
-- before this file is applied or re-applied. See migration 039
-- docstring for the rotation procedure.
-- ============================================

SELECT cron.schedule(
  'embed-new-titles',
  '45 6 * * *',  -- 06:45 UTC, 15 minutes after enrich-new-titles
  $$
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
  $$
);
