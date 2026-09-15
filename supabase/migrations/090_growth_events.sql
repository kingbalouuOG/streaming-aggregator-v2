-- ============================================
-- Growth events — attribution and growth telemetry (Growth G0-6, session S2)
-- Migration 090
-- ============================================
--
-- One table behind the growth loops' measures (plan
-- docs/plans/2026-09-14-003 §6 row 090; decisions D9, D10, D13, D17):
-- shares per weekly active user, preview open rate, open-to-install and
-- sign-up by source. The queries are supabase/queries/growth-dashboard.sql.
--
-- Written ONLY by the videx-api Worker, with the service role:
--   - preview_fetched / preview_opened: the /t/ and /room/ page handlers,
--     after the edge-cache read (ua_class 'crawler' / 'human'). No
--     install_id, no user_id; no IP address or raw User-Agent is stored.
--   - link_opened, first_open, signup_completed (S2) and share_initiated,
--     share_completed, notification_opened (S4): the app, through
--     POST /v1/growth/events. user_id comes from a verified Supabase JWT,
--     never from the request body.
--
-- Values follow ADR-015: via is the URL channel (share|push|seo|card|
-- household), src the session a share started in (push|organic),
-- object_type title|room|list with object_id 'movie-603' or a room uuid.
-- They are validated in the Worker (workers/api/src/growthEvents.ts), not by
-- CHECKs here, so later sessions can use new contract values without a
-- migration. Only event_name is constrained.
--
-- install_id is minted by the app on first launch (native/src/installId.ts):
-- a random UUID, not a device or advertising identifier.
--
-- Access: RLS on, no policies, anon and authenticated revoked (the same
-- posture as shared_rooms in 088).
--
-- Retention: 12 months, deleted nightly by the pg_cron job
-- growth_events_retention at 03:30 UTC. That slot was free in cron.job on
-- 2026-09-15 (01:00 card_impressions_rollup, 02:00 pg_partman_maintenance,
-- 03:00 search_terms_rollup, 05:00 onwards the sync chain).
--
-- User-scoped, so delete_own_account() and export_user_data() are rebuilt
-- here FROM 088's bodies (production checked 2026-09-15: both mention
-- shared_rooms, neither mentions growth_events). Both reach the caller's
-- rows AND the rows of any install the caller has used: link_opened and
-- first_open are written before sign-up with only an install_id, and would
-- otherwise outlive the account. The privacy policy says the install
-- identifier and first touch are deleted with the account.
--
-- Numbering: 088 is S1 (shared_rooms), 089 is S3 (handle_new_user), 090 is
-- S2. 089 does not touch these two functions, so the order of applying 089
-- and 090 does not matter.
--
-- Reversibility:
--   SELECT cron.unschedule('growth_events_retention');
--   DROP TABLE public.growth_events;
--   then re-apply 088 §3 and §4 (the previous function bodies).
-- Nothing else reads the table.

-- =============================================================================
-- 1. Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.growth_events (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_name   TEXT NOT NULL CHECK (event_name IN (
                 'preview_fetched',
                 'preview_opened',
                 'link_opened',
                 'first_open',
                 'signup_completed',
                 'share_initiated',
                 'share_completed',
                 'notification_opened'
               )),
  -- App-minted random UUID; null on page events.
  install_id   UUID NULL,
  -- From the verified JWT; null before sign-in and on page events.
  user_id      UUID NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  via          TEXT NULL,
  src          TEXT NULL,
  object_type  TEXT NULL,
  object_id    TEXT NULL,
  -- 'ios' | 'android' from the app; the visitor's UA bucket
  -- ('ios' | 'android' | 'other') on page events.
  platform     TEXT NULL,
  -- 'crawler' | 'human' on page events; null on app events.
  ua_class     TEXT NULL,
  -- notification_deliveries id for notification_opened (S4).
  delivery_id  UUID NULL,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.growth_events IS
  'Growth loop telemetry (Growth G0-6, plan D10): page previews, link opens, '
  'first open, sign-up, shares, notification opens with via/src attribution. '
  'Written only by the videx-api Worker with the service role; RLS on, no '
  'policies. 12-month retention (cron growth_events_retention).';

CREATE INDEX IF NOT EXISTS growth_events_user_id_occurred_at_idx
  ON public.growth_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS growth_events_install_id_idx
  ON public.growth_events (install_id);

CREATE INDEX IF NOT EXISTS growth_events_event_name_occurred_at_idx
  ON public.growth_events (event_name, occurred_at DESC);

-- =============================================================================
-- 2. Row-level security — on, no policies (service role only)
-- =============================================================================

ALTER TABLE public.growth_events ENABLE ROW LEVEL SECURITY;

-- Belt and braces: with no policy RLS already denies anon and authenticated.
REVOKE ALL ON public.growth_events FROM anon, authenticated;

-- =============================================================================
-- 3. Retention — 12 months, nightly at 03:30 UTC
--
-- cron.schedule with an existing job name replaces that job, so re-running
-- this file is safe.
-- =============================================================================

SELECT cron.schedule(
  'growth_events_retention',
  '30 3 * * *',
  $job$DELETE FROM public.growth_events WHERE occurred_at < now() - interval '12 months'$job$
);

-- =============================================================================
-- 4. delete_own_account() — add growth_events (042 contract)
--
-- Body is 088's plus two DELETEs. CREATE OR REPLACE without DROP keeps the
-- existing grants (same reasoning as 044 §4, 086 §5 and 088 §3).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_own_account called without auth.uid()';
  END IF;

  -- Growth G0 / migration 090. Rows written before sign-up carry only the
  -- install id, so the profiles cascade cannot reach them: delete every row
  -- of any install this account has used, then the account's own rows.
  DELETE FROM public.growth_events
   WHERE install_id IN (
     SELECT g.install_id FROM public.growth_events g
      WHERE g.user_id = v_user_id AND g.install_id IS NOT NULL
   );
  DELETE FROM public.growth_events       WHERE user_id = v_user_id;

  -- Public-schema tables that reference profiles. CASCADE handles these
  -- automatically when the profiles row is deleted below; the explicit
  -- DELETEs are belt-and-braces against a future cascade-rule regression.
  DELETE FROM public.card_impressions    WHERE user_id = v_user_id;
  DELETE FROM public.user_interactions   WHERE user_id = v_user_id;
  DELETE FROM public.taste_profiles      WHERE user_id = v_user_id;
  DELETE FROM public.user_services       WHERE user_id = v_user_id;
  DELETE FROM public.user_service_addons WHERE user_id = v_user_id;  -- IN-SC-004 / migration 086
  DELETE FROM public.user_genres         WHERE user_id = v_user_id;
  DELETE FROM public.watchlist           WHERE user_id = v_user_id;
  DELETE FROM public.onboarding_events   WHERE user_id = v_user_id;
  DELETE FROM public.shared_rooms        WHERE created_by = v_user_id;  -- Growth G0 / migration 088

  -- Public-schema tables that reference auth.users directly.
  DELETE FROM public.user_feature_flags WHERE user_id = v_user_id;
  DELETE FROM public.user_interest_centroids WHERE user_id = v_user_id;  -- ENG-1 / migration 044

  -- profiles row last in the public schema (its CASCADE will have
  -- already removed all the rows above; this is the defensive
  -- backstop).
  DELETE FROM public.profiles WHERE id = v_user_id;

  -- Finally the auth.users row. Any cascade rules still attached
  -- to auth.users will fire here harmlessly — every child row has
  -- already been removed above.
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$function$;

-- =============================================================================
-- 5. export_user_data() — add growth_events (043/061/086/088 contract)
--
-- Body is 088's plus one key, covering the same rows section 4 deletes.
-- Version 1.2 → 1.3: 1.2 shipped in v2.4.0 without this key, so the shape
-- changed. CREATE OR REPLACE without DROP keeps grants.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.export_user_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id  uuid := auth.uid();
  v_payload  jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'export_user_data called without auth.uid()';
  END IF;

  SELECT jsonb_build_object(
    '_export_metadata', jsonb_build_object(
      'version',      '1.3',
      'generated_at', now(),
      'user_id',      v_user_id
    ),
    'profiles', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.profiles t WHERE t.id = v_user_id), '[]'::jsonb),
    'taste_profiles', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.taste_profiles t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_services', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_services t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_service_addons', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_service_addons t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_genres', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_genres t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'watchlist', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.watchlist t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_interactions', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_interactions t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'card_impressions', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.card_impressions t WHERE t.user_id = v_user_id AND t.shown_at > now() - interval '90 days'), '[]'::jsonb),
    'onboarding_events', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.onboarding_events t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'availability_reports', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.availability_reports t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_interest_centroids', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_interest_centroids t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_feature_flags', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_feature_flags t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'app_feedback', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.app_feedback t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'user_push_tokens', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.user_push_tokens t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'notification_preferences', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.notification_preferences t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'notification_deliveries', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.notification_deliveries t WHERE t.user_id = v_user_id), '[]'::jsonb),
    'card_impression_daily_totals', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.card_impression_daily_totals t WHERE t.user_id = v_user_id), '[]'::jsonb),
    -- Growth G0 / migration 088 --
    'shared_rooms', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.shared_rooms t WHERE t.created_by = v_user_id), '[]'::jsonb),
    -- Growth G0 / migration 090 (same rows delete_own_account removes) --
    'growth_events', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.occurred_at)
        FROM public.growth_events t
       WHERE t.user_id = v_user_id
          OR t.install_id IN (
               SELECT g.install_id FROM public.growth_events g
                WHERE g.user_id = v_user_id AND g.install_id IS NOT NULL
             )
    ), '[]'::jsonb)
  )
  INTO v_payload;

  RETURN v_payload;
END;
$function$;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Verify after apply:
--   SELECT to_regclass('public.growth_events');                          -- not null
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.growth_events'::regclass;  -- true
--   SELECT count(*) FROM pg_policies WHERE tablename = 'growth_events';  -- 0
--   SELECT has_table_privilege('anon', 'public.growth_events', 'INSERT'),
--          has_table_privilege('authenticated', 'public.growth_events', 'SELECT');  -- false, false
--   SELECT jobname, schedule FROM cron.job WHERE jobname = 'growth_events_retention';  -- 30 3 * * *
--   SELECT position('growth_events' in pg_get_functiondef('public.delete_own_account()'::regprocedure)) > 0,
--          position('shared_rooms' in pg_get_functiondef('public.delete_own_account()'::regprocedure)) > 0,
--          position('growth_events' in pg_get_functiondef('public.export_user_data()'::regprocedure)) > 0,
--          position('user_service_addons' in pg_get_functiondef('public.export_user_data()'::regprocedure)) > 0;  -- all true
-- Then regenerate src/lib/database.types.ts.
-- =============================================================================
