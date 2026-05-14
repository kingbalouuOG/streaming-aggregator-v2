-- Phase 5.5 C10 / IN-XPS-006: capture delete_own_account in source control.
--
-- Date authored:           2026-05-14
-- Pre-cut audit (H5):      Live RPC body fetched 2026-05-14 — body was a
--                          single `DELETE FROM auth.users WHERE id = auth.uid();`,
--                          relying entirely on FK cascade rules. FK cascade
--                          audit (Q1-rev) confirmed every user-scoped table
--                          has ON DELETE CASCADE either directly from
--                          auth.users (profiles, user_feature_flags) or
--                          chained via profiles (card_impressions,
--                          user_interactions, taste_profiles, user_services,
--                          user_genres, watchlist, onboarding_events).
--                          The live behaviour is GDPR-compliant.
--
-- This migration ships the same behaviour with explicit DELETE
-- statements as belt-and-braces defence. Rationale: a future schema
-- change that drops one cascade rule would silently leak orphaned
-- rows; the explicit DELETEs survive that regression. If CASCADE
-- has already fired by the time the explicit DELETE runs, the
-- DELETE is a no-op — idempotent.
--
-- Signature handling: DROP FUNCTION IF EXISTS before CREATE OR REPLACE
-- so a future return-type / argument-signature change doesn't error
-- on "cannot change return type of existing function".
--
-- Permissions: SECURITY DEFINER + search_path pinned (Postgres CVE
-- hardening per migration 027 convention). Anon cannot call; only
-- authenticated users can call for their own account.

DROP FUNCTION IF EXISTS public.delete_own_account();

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
  DELETE FROM public.card_impressions   WHERE user_id = v_user_id;
  DELETE FROM public.user_interactions  WHERE user_id = v_user_id;
  DELETE FROM public.taste_profiles     WHERE user_id = v_user_id;
  DELETE FROM public.user_services      WHERE user_id = v_user_id;
  DELETE FROM public.user_genres        WHERE user_id = v_user_id;
  DELETE FROM public.watchlist          WHERE user_id = v_user_id;
  DELETE FROM public.onboarding_events  WHERE user_id = v_user_id;

  -- Public-schema tables that reference auth.users directly.
  DELETE FROM public.user_feature_flags WHERE user_id = v_user_id;

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

GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.delete_own_account() IS
  'GDPR Article 17 / right-to-erasure RPC. Deletes the caller''s account ' ||
  'and all associated rows across user-scoped tables. SECURITY DEFINER with ' ||
  'explicit DELETEs as belt-and-braces against cascade-rule regression. ' ||
  'See migration 042 / Phase 5.5 C10 for the audit trail.';
