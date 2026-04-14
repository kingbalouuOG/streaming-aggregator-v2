-- Phase 3: Add v2 embedding-space taste vector and slider state
-- Additive only. v1 columns remain until migration 024.

-- 1. The v2 taste vector (1536D, matching titles.embedding)
ALTER TABLE taste_profiles
  ADD COLUMN IF NOT EXISTS taste_vector_v2 vector(1536);

-- 2. Vector lifecycle metadata
ALTER TABLE taste_profiles
  ADD COLUMN IF NOT EXISTS taste_vector_updated_at TIMESTAMPTZ;

ALTER TABLE taste_profiles
  ADD COLUMN IF NOT EXISTS taste_vector_interaction_count INTEGER DEFAULT 0 NOT NULL;

ALTER TABLE taste_profiles
  ADD COLUMN IF NOT EXISTS taste_vector_bootstrapped_from TEXT;

-- 3. Slider state (0.0-1.0 range, Phase 4 reads these for pipeline modulation)
ALTER TABLE taste_profiles
  ADD COLUMN IF NOT EXISTS slider_catalogue_age REAL DEFAULT 0.5;

ALTER TABLE taste_profiles
  ADD COLUMN IF NOT EXISTS slider_comfort_zone REAL DEFAULT 0.25;

ALTER TABLE taste_profiles
  ADD COLUMN IF NOT EXISTS slider_content_mix REAL DEFAULT 0.5;

ALTER TABLE taste_profiles
  ADD COLUMN IF NOT EXISTS slider_variety REAL DEFAULT 0.5;

-- 4. Slider range constraints
ALTER TABLE taste_profiles
  ADD CONSTRAINT chk_slider_catalogue_age
    CHECK (slider_catalogue_age BETWEEN 0.0 AND 1.0);

ALTER TABLE taste_profiles
  ADD CONSTRAINT chk_slider_comfort_zone
    CHECK (slider_comfort_zone BETWEEN 0.0 AND 1.0);

ALTER TABLE taste_profiles
  ADD CONSTRAINT chk_slider_content_mix
    CHECK (slider_content_mix BETWEEN 0.0 AND 1.0);

ALTER TABLE taste_profiles
  ADD CONSTRAINT chk_slider_variety
    CHECK (slider_variety BETWEEN 0.0 AND 1.0);
