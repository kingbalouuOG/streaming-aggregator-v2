-- Migration 041: user_feature_flags
--
-- Per-user feature flag table backing the Phase Search V2 Cluster B
-- semantic-search rollout. The pattern is generic enough that any
-- future per-user gated feature can reuse it without a schema change
-- — flag names are strings, ownership is by composite primary key,
-- RLS scopes reads + writes to the owning user.
--
-- Rationale for per-user (vs. global) flagging: Phase Search V2 plans
-- a staged rollout — Joe flips `search_semantic` for himself first,
-- runs the eval fixture, then opens it to prototype users one by one.
-- A global flag couldn't express "on for these specific users."

-- =============================================================================
-- 1. Table definition
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_feature_flags (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_name   TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, flag_name)
);

COMMENT ON TABLE public.user_feature_flags IS
  'Per-user feature flags. Absence of a row means the flag is at its default (typically false) for that user.';

-- =============================================================================
-- 2. Row-level security
--
-- Reads + writes scoped to the owning user. Service-role bypass (used
-- by Joe in Studio when flipping flags for prototype users) is implicit
-- — RLS doesn't apply to service-role queries.
-- =============================================================================

ALTER TABLE public.user_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own feature flags" ON public.user_feature_flags;
CREATE POLICY "Users read own feature flags"
  ON public.user_feature_flags
  FOR SELECT
  USING (user_id = auth.uid());

-- Insert/update is allowed from the client but not strictly required
-- yet — Phase 1 flips flags via Studio. The policy is here so a
-- future in-app "Settings → Experimental features" toggle works
-- without an additional migration.
DROP POLICY IF EXISTS "Users manage own feature flags" ON public.user_feature_flags;
CREATE POLICY "Users manage own feature flags"
  ON public.user_feature_flags
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- 3. updated_at trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION public.touch_user_feature_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_feature_flags_touch_updated_at ON public.user_feature_flags;
CREATE TRIGGER user_feature_flags_touch_updated_at
  BEFORE UPDATE ON public.user_feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_user_feature_flags_updated_at();

-- =============================================================================
-- End of migration 041
-- =============================================================================
