-- Phase 5.5 C15 / IN-PX-35: export_user_data SECURITY DEFINER RPC.
--
-- GDPR Article 20 (right to data portability) + Article 15 (right to
-- access). Returns a JSON object containing every row of data
-- described in the Privacy Policy §2 for the calling user.
--
-- Caller authorisation: auth.uid() inside SECURITY DEFINER. The RPC
-- is locked to authenticated; anon callers cannot invoke. Every
-- table filter is `WHERE user_id = v_user_id` (or `id = v_user_id`
-- for profiles). A user can ONLY export their own data — a bug
-- here exposes another user's data, which is catastrophic, so the
-- C16 smoke test verifies this explicitly with a throwaway second
-- account.
--
-- Numbering: 043 not 042 — 042 was claimed by delete_own_account
-- in the same Phase 5.5 batch, 041 by user_feature_flags, 040 by
-- the unapplied editor_notes.
--
-- Retention scope: card_impressions is capped at the last 90 days
-- because rows older than that are rolled up to daily aggregates
-- per migration 014's pg_partman maintenance job — exporting the
-- aggregate would be misleading and exporting both is redundant.
-- Other tables are exported in full.
--
-- Payload size: prototype-scale users produce <5MB JSON; the
-- synchronous Blob download in C16 handles that comfortably. If a
-- future user blows past ~50MB the client browser slows on Blob
-- creation and we switch to async delivery (deferred — parking-lot
-- IN-PX-35 recommendation).

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
      'version',      '1.0',
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
    ), '[]'::jsonb)
  )
  INTO v_payload;

  RETURN v_payload;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.export_user_data() TO authenticated;
-- See migration 042 for the rationale: Supabase auto-grants undo this
-- REVOKE, but the function body's auth.uid() check is the actual gate.
REVOKE EXECUTE ON FUNCTION public.export_user_data() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.export_user_data() IS 'GDPR Article 20 / right-to-portability RPC. Returns a JSON object with one key per user-scoped table, scoped to auth.uid(). card_impressions capped to last 90 days (see migration 014 rollup). See migration 043 / Phase 5.5 C15 for the audit trail.';
