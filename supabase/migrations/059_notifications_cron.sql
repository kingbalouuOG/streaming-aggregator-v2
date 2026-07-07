-- ============================================
-- H0 Stream B — Notifications v1 (Phase 2)
-- Migration 059 — schedule send-notifications daily cron
-- ============================================
--
-- Fires the send-notifications Edge Function once daily, AFTER the 06:00
-- UTC content sync (daily-content-sync, migration 039) has had time to
-- write that day's streaming_history 'added' events. 08:00 UTC leaves a
-- 2h margin over the sync (which can time-out and resume across
-- invocations) and clears the 06:30 enrich / 06:45 embed crons.
--
-- Uses the Vault-backed service-role JWT established in migration 039
-- (secret name 'service_role_key'). The Edge Function verifies the JWT
-- role claim === 'service_role' before doing anything.
--
-- PREREQUISITES (out-of-repo, do before applying):
--   1. Deploy the function:
--      npx supabase functions deploy send-notifications --project-ref fmusugdcnnwiuzkbjquo
--   2. Vault secret 'service_role_key' must exist (already created for
--      migration 039). No new secret needed.
--
-- Rollback: SELECT cron.unschedule('daily-send-notifications');

-- Refuse to apply if the Vault entry the job depends on is missing.
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM vault.secrets
    WHERE name = 'service_role_key';
  IF v_count = 0 THEN
    RAISE EXCEPTION
      'vault.secrets entry "service_role_key" not found. See migration 039.';
  END IF;
END $$;

-- Idempotent: unschedule any prior registration first.
SELECT cron.unschedule('daily-send-notifications')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-send-notifications');

SELECT cron.schedule(
  'daily-send-notifications',
  '0 8 * * *',                      -- 08:00 UTC daily
  $cron$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/send-notifications',
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

-- ── Verification (run after apply) ────────────────────────────────────
--   SELECT jobname, schedule, active FROM cron.job
--   WHERE jobname = 'daily-send-notifications';
--
--   -- After the first 08:00 run:
--   SELECT jobname, status, return_message
--   FROM cron.job_run_details
--   WHERE jobname = 'daily-send-notifications'
--   ORDER BY end_time DESC LIMIT 5;
