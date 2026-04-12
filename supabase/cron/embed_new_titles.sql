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
-- Bearer token: same service-role JWT as enrich_new_titles.sql.
-- See Parking Lot entry IN-XPS-004 for the rotation plan before
-- public launch.
-- ============================================

SELECT cron.schedule(
  'embed-new-titles',
  '45 6 * * *',  -- 06:45 UTC, 15 minutes after enrich-new-titles
  $$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/embed-new-titles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdXN1Z2Rjbm53aXV6a2JqcXVvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTE5MTUzNSwiZXhwIjoyMDg2NzY3NTM1fQ.72SH7EjXEwh_RFiegV1eNonXOLVWMEtFMR7Jy3eZxt0'
    ),
    body := '{}'::jsonb
  );
  $$
);
