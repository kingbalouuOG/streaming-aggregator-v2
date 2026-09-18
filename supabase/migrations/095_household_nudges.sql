-- =============================================================================
-- 095 — Household nudges: a third push type, its dedup key, the 15-minute cron
--       (Growth G2, session H4)
--
-- Plan: docs/plans/2026-09-17-004-feat-phase-g2-household-loop-plan.md
-- (§5 row 095; decisions D9, D10, D13 accepted 2026-09-18). Handoff:
-- docs/plans/2026-09-18-005-handoff-growth-h4-nudges.md.
--
-- What this adds, all additive:
--   §1 notification_preferences.notification_type CHECK gains
--      'household_nudge'. An absent row still means enabled (056), so every
--      member with a push token gets nudges until they turn them off.
--   §2 notification_deliveries holds nudges as well as title alerts:
--      - the type CHECK gains 'household_nudge';
--      - tmdb_id and media_type become nullable (a nudge is about a list);
--      - new columns list_id (→ watchlists, ON DELETE SET NULL), nudge_window
--        (the UTC hour the nudge was claimed in) and push_id (one id per
--        push, shared by the rows of a bundle; closes IN-GR-026);
--      - notification_deliveries_shape_check: a title alert carries tmdb_id
--        and media_type and no list columns; a nudge carries nudge_window and
--        no title columns. list_id is required on INSERT by a trigger rather
--        than the CHECK, because ON DELETE SET NULL must still be able to
--        clear it when a household (and so its list) is deleted;
--      - a second unique index, (user_id, notification_type, list_id,
--        nudge_window): one nudge per person, list and hour window.
--   §3 cron 'send-nudges-15m', '*/15 * * * *', the 059 pattern.
--
-- Unique indexes: deliberately NOT partial. The handoff asked for both as
-- partial indexes (WHERE notification_type IN (...)). Postgres cannot infer a
-- partial index from ON CONFLICT (cols) without the WHERE predicate, and
-- PostgREST's upsert (on_conflict=cols) never sends one: verified live
-- 2026-09-18, a partial index answers 42P10 "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification", which would break the
-- 08:00 send-notifications claim outright. Full indexes give the same
-- enforcement here because NULLs are distinct: a nudge has tmdb_id NULL, so
-- it can never collide in uq_notification_deliveries_dedup; a title alert
-- has list_id NULL (shape CHECK), so it can never collide in
-- uq_notification_deliveries_nudge. uq_notification_deliveries_dedup is
-- therefore left exactly as 057 created it.
--
-- The cap query's index, idx_notification_deliveries_user_time
-- (user_id, sent_at DESC), already exists (057); nothing to add.
--
-- NOT re-emitted: delete_own_account() / export_user_data(). 092 (and 093's
-- re-emit) already delete notification_deliveries by user_id and export the
-- whole row with to_jsonb, so the new columns are deleted and exported with
-- no change (IN-PX-54 satisfied). No new table.
--
-- PREREQUISITES (out-of-repo, before applying):
--   1. Deploy the function: npx supabase functions deploy send-nudges
--      (verify_jwt = true, supabase/functions/send-nudges/config.toml).
--      Applying first is harmless: the cron gets a 404 every 15 minutes
--      until the deploy.
--   2. Vault secret 'service_role_key' must exist (039, 059). §3 checks.
--
-- Apply in Studio (never db push). Then regenerate src/lib/database.types.ts
-- and run supabase/queries/verify-095-nudges.sql (rolls back).
--
-- Reversibility (existing rows are not rewritten; only nudge rows depend on
-- the new shape):
--   SELECT cron.unschedule('send-nudges-15m');
--   DELETE FROM public.notification_deliveries WHERE notification_type = 'household_nudge';
--   DELETE FROM public.notification_preferences WHERE notification_type = 'household_nudge';
--   DROP TRIGGER notification_deliveries_nudge_list ON public.notification_deliveries;
--   DROP FUNCTION public.notification_deliveries_nudge_list();
--   DROP INDEX public.uq_notification_deliveries_nudge, public.idx_notification_deliveries_list;
--   ALTER TABLE public.notification_deliveries
--     DROP CONSTRAINT notification_deliveries_shape_check,
--     DROP COLUMN list_id, DROP COLUMN nudge_window, DROP COLUMN push_id,
--     ALTER COLUMN tmdb_id SET NOT NULL, ALTER COLUMN media_type SET NOT NULL;
--   re-add both type CHECKs with ('arrival', 'leaving_soon').
-- =============================================================================

-- =============================================================================
-- 1. notification_preferences: the third type
-- =============================================================================

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_notification_type_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_notification_type_check
  CHECK (notification_type IN ('arrival', 'leaving_soon', 'household_nudge'));

COMMENT ON TABLE public.notification_preferences IS
  'Per-type push opt-in (arrival | leaving_soon | household_nudge). Absent row = '
  'enabled (default-on). 056; household_nudge added in 095 (Growth G2 H4).';

-- =============================================================================
-- 2. notification_deliveries: nudge rows
-- =============================================================================

ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_notification_type_check;
ALTER TABLE public.notification_deliveries
  ADD CONSTRAINT notification_deliveries_notification_type_check
  CHECK (notification_type IN ('arrival', 'leaving_soon', 'household_nudge'));

ALTER TABLE public.notification_deliveries
  ALTER COLUMN tmdb_id DROP NOT NULL,
  ALTER COLUMN media_type DROP NOT NULL;

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS list_id UUID NULL REFERENCES public.watchlists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nudge_window TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS push_id UUID NULL;

COMMENT ON COLUMN public.notification_deliveries.list_id IS
  'household_nudge: the shared list the nudge was about. Nulled if the list is deleted (095).';
COMMENT ON COLUMN public.notification_deliveries.nudge_window IS
  'household_nudge: the UTC hour the nudge was claimed in (pushPolicy.nudgeWindowStart). Part of the nudge dedup key (095).';
COMMENT ON COLUMN public.notification_deliveries.push_id IS
  'One id per push, shared by every row of a bundle; sent in the push payload and echoed in notification_opened metadata (095, IN-GR-026). Null on rows before 095.';

-- Every existing row is a title alert with tmdb_id and media_type set and the
-- new columns NULL, so the constraint is added VALID.
ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_shape_check;
ALTER TABLE public.notification_deliveries
  ADD CONSTRAINT notification_deliveries_shape_check CHECK (
    (notification_type IN ('arrival', 'leaving_soon')
      AND tmdb_id IS NOT NULL AND media_type IS NOT NULL
      AND list_id IS NULL AND nudge_window IS NULL)
    OR
    (notification_type = 'household_nudge'
      AND tmdb_id IS NULL AND media_type IS NULL
      AND nudge_window IS NOT NULL)
  );

-- list_id is required when a nudge is written, and only then (see header).
CREATE OR REPLACE FUNCTION public.notification_deliveries_nudge_list()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.notification_type = 'household_nudge' AND NEW.list_id IS NULL THEN
    RAISE EXCEPTION 'household_nudge needs list_id' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notification_deliveries_nudge_list() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notification_deliveries_nudge_list ON public.notification_deliveries;
CREATE TRIGGER notification_deliveries_nudge_list
  BEFORE INSERT ON public.notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.notification_deliveries_nudge_list();

-- Nudge dedup key. Not partial (see header): title rows have list_id NULL and
-- never collide here. send-nudges claims with
-- upsert(onConflict: 'user_id,notification_type,list_id,nudge_window', ignoreDuplicates).
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_deliveries_nudge
  ON public.notification_deliveries (user_id, notification_type, list_id, nudge_window);

-- ON DELETE SET NULL on list_id scans by list_id; keep that off a seq scan.
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_list
  ON public.notification_deliveries (list_id)
  WHERE list_id IS NOT NULL;

COMMENT ON TABLE public.notification_deliveries IS
  'Append-only sent-push ledger (057). Title alerts: UNIQUE(user,type,tmdb,media) = dedup. '
  'household_nudge (095): UNIQUE(user,type,list,nudge_window) = one per hour window. '
  'sent_at = cap windows (pushPolicy.ts); push_id = one push; expo_ticket_id = receipts and dead-token pruning.';

-- =============================================================================
-- 3. Cron: send-nudges every 15 minutes (the 059 pattern)
-- =============================================================================
-- The function skips the whole run during quiet hours (22:00 to 08:00
-- Europe/London), so firing through the night costs one short request.

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
SELECT cron.unschedule('send-nudges-15m')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-nudges-15m');

SELECT cron.schedule(
  'send-nudges-15m',
  '*/15 * * * *',                   -- every 15 minutes
  $cron$
  SELECT net.http_post(
    url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/send-nudges',
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
--   supabase/queries/verify-095-nudges.sql (rolls back).
--
--   -- cron.job_run_details 'succeeded' only means the request was queued;
--   -- the function's answer is in net._http_response:
--   SELECT r.created, r.status_code, left(r.content::text, 200)
--     FROM net._http_response r
--    ORDER BY r.created DESC LIMIT 10;
