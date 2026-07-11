-- 062: explicit pg_net timeouts on every cron→Edge-Function invoke.
--
-- pg_net's default timeout is 5s. A transient DNS/connect blip inside that
-- window silently eats the invoke — observed 2026-07-10 when a manual
-- backfill-missing-titles trigger vanished without a trace (no EF log, no
-- error surfaced anywhere; only net._http_response recorded the failure).
-- 30s absorbs slow connects/responses; the EFs themselves keep running
-- server-side regardless once the request lands.
--
-- cron.schedule() upserts by jobname, so each call below rewrites the
-- existing job (same name, same schedule) with the timeout added.

-- Daily incremental content sync (06:00 UTC)
SELECT cron.schedule('daily-content-sync', '0 6 * * *', $$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/sync-incremental',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$);

-- Enrich new titles (06:30 UTC)
SELECT cron.schedule('enrich-new-titles', '30 6 * * *', $$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/enrich-new-titles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$);

-- Embed new titles (06:45 UTC)
SELECT cron.schedule('embed-new-titles', '45 6 * * *', $$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/embed-new-titles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$);

-- Weekly service-fingerprint refresh (Sun 07:00 UTC)
SELECT cron.schedule('refresh-service-fingerprints', '0 7 * * 0', $$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/refresh-service-fingerprints',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$);

-- Daily notification send (08:00 UTC)
SELECT cron.schedule('daily-send-notifications', '0 8 * * *', $$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$);

-- Weekly missing-titles backfill (Sun 05:00 UTC)
SELECT cron.schedule('backfill-missing-titles', '0 5 * * 0', $$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/backfill-missing-titles',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$);
