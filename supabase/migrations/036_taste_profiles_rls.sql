-- ============================================
-- Phase 5 Workstream C — taste_profiles RLS
-- Migration 036
-- ============================================
--
-- The taste_profiles table predates version-controlled migrations (it
-- existed in production before the v2 build began) and never had RLS
-- enabled. v2 columns were added in 023 / 024, but the table-level
-- security posture was never closed off. The Phase 4 security review
-- surfaced this as M1 — pre-launch GDPR / privacy blocker.
--
-- This migration enables RLS and adds a single FOR ALL policy keyed on
-- auth.uid() = user_id. SECURITY DEFINER calls (Edge Functions running
-- under service_role via withUserScope) bypass RLS as expected.
--
-- One-to-one mapping: each row's user_id references profiles.id, and
-- a user can only ever have at most one taste profile row (enforced
-- by the existing unique foreign key on user_id). The FOR ALL policy
-- therefore reads as "you can only see, write, or delete your own row".
--
-- Verification (run post-apply against the live project):
--   SET role anon;
--   SELECT count(*) FROM taste_profiles;
--   -- expect 0 (no anon SELECT permitted; previously returned all rows)
--
--   SET role authenticated;
--   SET request.jwt.claim.sub = '<test-uuid>';
--   SELECT count(*) FROM taste_profiles WHERE user_id = '<test-uuid>';
--   -- expect 1 (caller's row only)
--
--   SET role service_role;
--   SELECT count(*) FROM taste_profiles;
--   -- expect all rows (Edge Functions still load profiles via service_role)
--
-- Smoke: hit render-foryou-rows against a test user. The Edge Function
-- still loads the taste profile because withUserScope uses the
-- service-role client; client-side reads via the authenticated session
-- still work because auth.uid() matches user_id.

ALTER TABLE public.taste_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access own taste profile" ON public.taste_profiles;
CREATE POLICY "Users access own taste profile"
  ON public.taste_profiles
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
