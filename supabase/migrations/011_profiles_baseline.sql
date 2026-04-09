-- Migration 011: Profiles baseline
--
-- Purpose: Codifies the existing production profiles table schema in a
-- version-controlled migration. The profiles table was created manually via
-- the Supabase dashboard and has no migration history until now.
--
-- This migration is IDEMPOTENT by design. Applying it against the current
-- production state changes nothing because every CREATE uses IF NOT EXISTS
-- and every policy is dropped-and-recreated. Its purpose is reproducibility,
-- not modification.
--
-- After this migration exists, fresh environments (local Supabase instances,
-- staging copies, future backups restored into new projects) can rebuild
-- the profiles table from source control rather than relying on dashboard
-- state.
--
-- Reference: Videx v2 Implementation Notes Parking Lot v0.3.2, entry IN-PRE-001

-- =============================================================================
-- 1. Table definition
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  theme_preference TEXT DEFAULT 'system',
  onboarding_completed BOOLEAN DEFAULT FALSE,
  region TEXT DEFAULT 'GB',
  is_test_user BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 2. Row-level security
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. RLS policies
--
-- Five policies matching the current production state. The "Allow public
-- username lookup" policy is intentionally permissive to support signup-time
-- username availability checks. This policy is flagged for tightening before
-- public launch (see Parking Lot entry IN-XPS-002 and Implementation Guide
-- Section 8.8 / 9.2). Do NOT tighten it in this baseline migration — the
-- goal here is to capture production as-is.
-- =============================================================================

DROP POLICY IF EXISTS "Allow public username lookup" ON public.profiles;
CREATE POLICY "Allow public username lookup"
  ON public.profiles
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users access own profile" ON public.profiles;
CREATE POLICY "Users access own profile"
  ON public.profiles
  FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- =============================================================================
-- 4. Auto-create profile trigger
--
-- When a new user signs up via Supabase Auth, this trigger creates a matching
-- profiles row using the username from the auth metadata. Without this, a new
-- user would exist in auth.users but not in profiles, breaking any join or
-- RLS check that relies on the profile row.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- End of migration 011
-- =============================================================================