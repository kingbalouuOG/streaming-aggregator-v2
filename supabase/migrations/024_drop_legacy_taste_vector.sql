-- Phase 3 cleanup: Drop v1 24D taste vector columns and interaction_log
-- DESTRUCTIVE — take manual Supabase snapshot before applying.
--
-- Prerequisite: all v1 taste system code deleted (Task 12 verified).
-- Prototype users will re-onboard on next app launch.

ALTER TABLE taste_profiles DROP COLUMN IF EXISTS vector;
ALTER TABLE taste_profiles DROP COLUMN IF EXISTS confidence;
ALTER TABLE taste_profiles DROP COLUMN IF EXISTS seed_vector;
ALTER TABLE taste_profiles DROP COLUMN IF EXISTS quiz_completed;
ALTER TABLE taste_profiles DROP COLUMN IF EXISTS quiz_answers;
ALTER TABLE taste_profiles DROP COLUMN IF EXISTS interaction_log;
ALTER TABLE taste_profiles DROP COLUMN IF EXISTS version;
