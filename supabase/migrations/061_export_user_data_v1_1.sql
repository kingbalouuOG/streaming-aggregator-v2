-- ============================================
-- GDPR export coverage — export_user_data v1.1
-- Migration 061
-- ============================================
--
-- Migration 043 (Phase 5.5, 2026-05-15) predates seven user-scoped tables
-- added since, so a user's GDPR Article 20 export silently omitted them —
-- exactly the drift class the deferred IN-PX-54 CI check was filed to catch.
-- Found during the 2026-07-10 device-test walk-through.
--
-- Added keys (all scoped to auth.uid(), same to_jsonb pattern as 043):
--   * availability_reports         (migration P4-era; missed by 043)
--   * user_interest_centroids      (044, ENG-1 — post-dates 043)
--   * user_feature_flags           (041; missed by 043)
--   * app_feedback                 (047 — gap noted in wiki log 2026-06)
--   * user_push_tokens             (055)
--   * notification_preferences     (056)
--   * notification_deliveries      (057)
--   * card_impression_daily_totals (user-scoped aggregate of >90d impressions)
--
-- Deletion side is already safe: all of the above either cascade from
-- profiles(id) ON DELETE CASCADE or are enumerated in delete_own_account
-- (042). Export was the only gap.
--
-- _export_metadata.version bumps 1.0 → 1.1.
--
-- Reversibility: re-apply migration 043's body.

DROP FUNCTION IF EXISTS public.export_user_data();

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
      'version',      '1.1',
      'generated_at', now(),
      'user_id',      v_user_id
    ),
    'profiles', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.profiles t
      WHERE t.id = v_user_id
    ), '[]'::jsonb),
    'taste_profiles', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.taste_profiles t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    'user_services', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.user_services t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    'user_genres', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.user_genres t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    'watchlist', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.watchlist t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    'user_interactions', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.user_interactions t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    -- card_impressions capped to 90 days (see migration 014 rollup job).
    'card_impressions', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.card_impressions t
      WHERE t.user_id = v_user_id
        AND t.shown_at > now() - interval '90 days'
    ), '[]'::jsonb),
    'onboarding_events', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.onboarding_events t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    -- v1.1 additions below (2026-07-10) --
    'availability_reports', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.availability_reports t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    'user_interest_centroids', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.user_interest_centroids t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    'user_feature_flags', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.user_feature_flags t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    'app_feedback', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.app_feedback t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    'user_push_tokens', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.user_push_tokens t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    'notification_preferences', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.notification_preferences t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    'notification_deliveries', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.notification_deliveries t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb),
    'card_impression_daily_totals', COALESCE((
      SELECT jsonb_agg(to_jsonb(t))
      FROM public.card_impression_daily_totals t
      WHERE t.user_id = v_user_id
    ), '[]'::jsonb)
  )
  INTO v_payload;

  RETURN v_payload;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.export_user_data() TO authenticated;
-- See migration 042 for the rationale: Supabase auto-grants undo any
-- REVOKE; the function body's auth.uid() check is the actual gate.

COMMENT ON FUNCTION public.export_user_data() IS
  'GDPR Article 20 / right-to-portability RPC, v1.1 (migration 061). One key '
  'per user-scoped table, scoped to auth.uid(); card_impressions capped to '
  'last 90 days. v1.1 adds the seven tables created after migration 043 — '
  'see the 061 header for the list and the IN-PX-54 drift context.';
