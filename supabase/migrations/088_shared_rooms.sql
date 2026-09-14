-- ============================================
-- Shared room snapshots — Growth G0-4 (session S1)
-- Migration 088
-- ============================================
--
-- A room shared from the app is frozen at share time into one row here and
-- served at https://videxstreaming.com/room/{id} by the videx-api Worker.
-- Never a live mood_rooms.id: those regenerate on the monthly recluster
-- (029 header) and anchored rooms have no row at all. ADR-015 records the
-- rule; plan docs/plans/2026-09-14-003 §6 row 088 is the spec.
--
-- Numbering: written as 085 on 2026-09-14; renumbered to 088 on 2026-09-15
-- after 085–087 (included-only services, channel entitlements, channel
-- follow-ups) merged first.
--
-- Access: RLS on with NO policies. The Worker inserts with the service role
-- after verifying the sharer's JWT (POST /v1/share/room) and reads with the
-- service role for the public page and the app (GET /room/:id,
-- GET /v1/room/:id). No client reads or writes this table directly.
--
-- Privacy (Joe, 14 Sept 2026): anonymous to the recipient, personal
-- framing stripped from the label by the Worker, no expiry, no unshare.
-- created_by exists for erasure and export only.
--
-- User-scoped table, so delete_own_account() and export_user_data() are
-- extended in this file (CONVENTIONS: IN-PX-54). Both bodies were checked
-- against production on 2026-09-15 before rewriting: each matched
-- migration 086 (which added user_service_addons).
--
-- Reversibility: DROP TABLE public.shared_rooms; re-apply 086 §5.

-- =============================================================================
-- 1. Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.shared_rooms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('global', 'anchor')),
  -- mood_rooms id (global) or 'anchor:{media_type}-{tmdb_id}' (anchored).
  source_ref   TEXT NOT NULL CHECK (char_length(source_ref) BETWEEN 1 AND 100),
  label        TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  description  TEXT NULL CHECK (description IS NULL OR char_length(description) <= 500),
  -- Ordered [{tmdb_id, media_type}], as the sharer saw the room.
  tmdb_ids     JSONB NOT NULL CHECK (
                 jsonb_typeof(tmdb_ids) = 'array'
                 AND jsonb_array_length(tmdb_ids) BETWEEN 1 AND 60
               ),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.shared_rooms IS
  'Snapshot of a mood room at share time (Growth G0-4, ADR-015). Written and '
  'read only by the videx-api Worker with the service role; RLS on, no policies.';

CREATE INDEX IF NOT EXISTS shared_rooms_created_by_created_at_idx
  ON public.shared_rooms (created_by, created_at DESC);

-- =============================================================================
-- 2. Row-level security — on, no policies (service role only)
-- =============================================================================

ALTER TABLE public.shared_rooms ENABLE ROW LEVEL SECURITY;

-- Belt and braces: with no policy RLS already denies anon and authenticated.
REVOKE ALL ON public.shared_rooms FROM anon, authenticated;

-- =============================================================================
-- 3. delete_own_account() — add shared_rooms (042 contract)
--
-- Body is 086's plus one DELETE. CREATE OR REPLACE without DROP keeps the
-- existing grants (same reasoning as 044 §4 and 086 §5).
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
-- 4. export_user_data() — add shared_rooms (043/061/086 contract)
--
-- Body is 086's plus one key. The payload version stays '1.2': 086 set it
-- and nothing has read a 1.2 export that lacked this key as final.
-- CREATE OR REPLACE without DROP keeps grants.
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
      'version',      '1.2',
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
    'shared_rooms', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM public.shared_rooms t WHERE t.created_by = v_user_id), '[]'::jsonb)
  )
  INTO v_payload;

  RETURN v_payload;
END;
$function$;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Verify after apply:
--   SELECT to_regclass('public.shared_rooms');                       -- not null
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.shared_rooms'::regclass;  -- true
--   SELECT count(*) FROM pg_policies WHERE tablename = 'shared_rooms';  -- 0
--   SELECT position('shared_rooms' in pg_get_functiondef('public.delete_own_account()'::regprocedure)) > 0,
--          position('user_service_addons' in pg_get_functiondef('public.export_user_data()'::regprocedure)) > 0;  -- true, true
-- Then regenerate src/lib/database.types.ts.
-- =============================================================================
