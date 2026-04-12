-- ============================================
-- Phase 2 — Service fingerprints table
-- Migration 020
-- ============================================
--
-- Stores per-service taste centroids (element-wise mean of top-N title
-- embeddings). One row per (service_id, region). Used by the recommendation
-- pipeline (Phase 3+) to bias cold-start taste vectors toward a user's
-- subscribed services.
--
-- Depends on: pgvector extension (migration 018)

CREATE TABLE IF NOT EXISTS service_fingerprints (
  service_id TEXT NOT NULL,
  -- Region column: streaming_availability has no region column (all current
  -- data is UK-only), but this table includes region in the PK for forward
  -- compatibility. When multi-region support is added, the same service can
  -- have different fingerprints per region. Do not remove — it is intentional
  -- future-proofing, not vestigial.
  region TEXT NOT NULL DEFAULT 'GB',
  centroid vector(1536) NOT NULL,
  title_count INTEGER NOT NULL CHECK (title_count > 0 AND title_count = array_length(source_title_ids, 1)),
  source_title_ids INTEGER[] NOT NULL,  -- titles.id values (SERIAL PK)
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (service_id, region)
);

-- RLS: authenticated can SELECT (onboarding Step 2 reads fingerprints after
-- account creation in Step 1 — user is already authenticated by then).
-- No anon policy — avoids replicating the IN-XPS-002 pattern of unnecessary
-- public access. service_role gets ALL for build script + Edge Function writes.
ALTER TABLE service_fingerprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_fingerprints" ON service_fingerprints;
CREATE POLICY "authenticated_read_fingerprints"
  ON service_fingerprints FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service_role_fingerprints" ON service_fingerprints;
CREATE POLICY "service_role_fingerprints"
  ON service_fingerprints FOR ALL TO service_role USING (true) WITH CHECK (true);
