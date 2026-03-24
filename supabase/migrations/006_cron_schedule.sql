-- ============================================
-- B1.7: Schedule daily incremental sync via pg_cron
-- Triggers the sync-incremental Edge Function at 06:00 UTC daily.
-- ============================================

-- Enable pg_cron and pg_net extensions (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the daily sync
SELECT cron.schedule(
  'daily-content-sync',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/sync-incremental',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtdXN1Z2Rjbm53aXV6a2JqcXVvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTE5MTUzNSwiZXhwIjoyMDg2NzY3NTM1fQ.72SH7EjXEwh_RFiegV1eNonXOLVWMEtFMR7Jy3eZxt0'
    ),
    body := '{}'::jsonb
  );
  $$
);
