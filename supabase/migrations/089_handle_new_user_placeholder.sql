-- ============================================
-- Growth S3 — provider sign-ups get a placeholder username
-- Migration 089 (G0-5, plan 2026-09-14-003 §6, decision D8)
-- ============================================
--
-- Apple and Google sign-in (supabase.auth.signInWithIdToken) create the
-- auth.users row with no `username` in raw_user_meta_data. The trigger
-- from 011 inserted that NULL into profiles.username (UNIQUE NOT NULL),
-- so every provider sign-up would fail with "Database error saving new
-- user". Until this is applied, do NOT ship a build with the provider
-- buttons.
--
-- Changes:
--  1. profiles.username_chosen boolean NOT NULL DEFAULT true. Existing
--     rows and email sign-ups are true (they picked a name at Step 1).
--  2. handle_new_user(): when no username was supplied (absent or
--     blank), insert `user_` + the first 8 hex digits of the user id and
--     set username_chosen = false. The app shows a "Choose your name"
--     prompt while it is false and never displays the placeholder.
--     If the 8-digit form is already taken (an email user may have
--     picked exactly that name), fall back to all 32 hex digits, which
--     is unique because the id is.
--
-- Kept from 011/027: SECURITY DEFINER, search_path pinned to
-- public, pg_temp, the same trigger. The email sign-up path is
-- unchanged: a supplied username is inserted as-is and a duplicate
-- still fails the sign-up (the client checks availability first).
--
-- Not touched: username_available (053's rate-limited version needs no
-- change; it checks profiles.username, which now includes placeholders,
-- and nobody can legitimately want one), delete_own_account and
-- export_user_data (S2 rewrites both in 090; the new column rides the
-- profiles row they already cover).
--
-- Reversibility:
--   ALTER TABLE public.profiles DROP COLUMN username_chosen;
--   then re-create handle_new_user() from 011 (body) with 027's
--   search_path pin. Provider sign-ups start failing again, so hide the
--   buttons (or roll back the build) first. Placeholder rows created in
--   the meantime stay valid usernames.
--
-- Verification (post-apply): run
--   supabase/queries/verify-089-handle-new-user-placeholder.sql
-- in the Studio SQL editor. It inserts fixture auth.users rows inside a
-- transaction, asserts the profiles rows, and rolls back.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username_chosen boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.username_chosen IS
  'false while username is the trigger placeholder (user_ + hex) given to '
  'a provider sign-up; the app prompts "Choose your name" and sets it true. '
  'Migration 089.';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_username text := nullif(btrim(NEW.raw_user_meta_data->>'username'), '');
  v_hex      text := replace(NEW.id::text, '-', '');
BEGIN
  IF v_username IS NOT NULL THEN
    INSERT INTO public.profiles (id, username)
    VALUES (NEW.id, v_username);
    RETURN NEW;
  END IF;

  v_username := 'user_' || left(v_hex, 8);
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) THEN
    v_username := 'user_' || v_hex;
  END IF;

  INSERT INTO public.profiles (id, username, username_chosen)
  VALUES (NEW.id, v_username, false);
  RETURN NEW;
END;
$function$;
