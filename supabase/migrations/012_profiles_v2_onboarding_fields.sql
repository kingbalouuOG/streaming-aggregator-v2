-- Migration 012: profiles v2 onboarding fields
--
-- Purpose: Adds the two columns the v2 onboarding Step 1 needs to capture
-- about a new user before the taste quiz runs:
--   - age_range:       free-form bucket the user picks during onboarding
--   - viewing_context: who they typically watch with (solo, partner, family, etc.)
--
-- Both columns are nullable. Existing rows are not backfilled — they will
-- read NULL and the v2 onboarding flow will populate them on next sign-in
-- (Phase 1).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is safe to re-run.
--
-- Phase 0 / Migration row 012 in Project Orchestration v0.3.1 §3.4.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age_range TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS viewing_context TEXT;

COMMENT ON COLUMN profiles.age_range IS
  'v2 onboarding Step 1. Nullable, free-form bucket (e.g. ''18-24'', ''25-34''). NULL for pre-v2 rows.';
COMMENT ON COLUMN profiles.viewing_context IS
  'v2 onboarding Step 1. Nullable, free-form (e.g. ''solo'', ''partner'', ''family''). NULL for pre-v2 rows.';
