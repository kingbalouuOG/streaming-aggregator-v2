-- ============================================
-- Phase 5 Workstream C — username availability via RPC
-- Migration 038 (IN-XPS-002)
-- ============================================
--
-- The "Allow public username lookup" policy on profiles (created in
-- 011_profiles_baseline.sql:51-55) is `FOR SELECT USING (true)` —
-- unrestricted anon read across every column on every row of the
-- profiles table. The intent was username availability checking
-- during signup; the implementation grants far more.
--
-- Replace with a SECURITY DEFINER RPC that returns just a boolean
-- for the single check the signup flow actually needs. Anon callers
-- can no longer SELECT from profiles directly.
--
-- Client wire-up: AuthContext.checkUsernameAvailable swaps from
-- `from('profiles').select('id').eq('username', x).maybeSingle()` to
-- `rpc('username_available', { check_username: x })`. Same Promise<boolean>
-- contract for callers in SignUpScreen and OnboardingFlow.StepAccount.
--
-- Reversibility: drop the function and re-create the policy. Anon users
-- regain ability to query usernames during the rollback window.
--
-- Verification (run post-apply):
--   SET role anon;
--   SELECT * FROM profiles LIMIT 1;
--   -- expect: permission denied (anon can no longer SELECT profiles)
--
--   SET role anon;
--   SELECT public.username_available('joegreen');
--   -- expect: true or false (boolean answer)
--   RESET ROLE;
--
-- Smoke: signup flow username availability indicator still works.

CREATE OR REPLACE FUNCTION public.username_available(check_username text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE username = check_username
  );
$function$;

COMMENT ON FUNCTION public.username_available(text) IS
  'Returns true when the given username is available for signup, '
  'false when taken. SECURITY DEFINER so anon callers can use it '
  'without needing direct SELECT on profiles. Replaces the open '
  '"Allow public username lookup" policy from 011_profiles_baseline.sql.';

GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;

DROP POLICY IF EXISTS "Allow public username lookup" ON public.profiles;
