-- ============================================
-- Phase 4.5 - Mood rooms + clustering runs audit
-- Migration 029
-- ============================================
--
-- Creates two tables:
--
--   mood_rooms       -- one row per cluster, per generation (version)
--                       produced by the monthly HDBSCAN re-clustering job.
--                       The frontend queries the latest generation via
--                       version = (SELECT MAX(version) FROM mood_rooms).
--                       Old generations are kept in place as a rollback path.
--
--   clustering_runs  -- audit trail for the monthly Python job. Captures
--                       count, coverage, failures. Catches silent output
--                       degradation (successful runs with poor cluster shape).
--
-- Writes are performed by the Python clustering script via the direct
-- PostgreSQL connection using service_role credentials; RLS is configured
-- so that authenticated clients can read mood_rooms (global, not user-
-- specific) and only service_role can see clustering_runs.
--
-- Depends on: pgvector extension (migration 018), pgcrypto for gen_random_uuid.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------
-- mood_rooms
-- ----------------------------------------------

CREATE TABLE IF NOT EXISTS mood_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  description TEXT,
  centroid vector(1536) NOT NULL,
  cluster_params JSONB NOT NULL,
  is_curated BOOLEAN NOT NULL DEFAULT false,
  title_count INTEGER NOT NULL CHECK (title_count >= 0),
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Latest-generation scan: frontend filters by MAX(version); compound index
-- makes "top rooms by title_count in the latest version" cheap.
CREATE INDEX IF NOT EXISTS idx_mood_rooms_version
  ON mood_rooms (version);

CREATE INDEX IF NOT EXISTS idx_mood_rooms_version_title_count
  ON mood_rooms (version DESC, title_count DESC);

ALTER TABLE mood_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_mood_rooms" ON mood_rooms;
CREATE POLICY "authenticated_read_mood_rooms"
  ON mood_rooms FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "service_role_mood_rooms" ON mood_rooms;
CREATE POLICY "service_role_mood_rooms"
  ON mood_rooms FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------
-- clustering_runs (audit log)
-- ----------------------------------------------

CREATE TABLE IF NOT EXISTS clustering_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  cluster_count INTEGER,
  catalogue_coverage_pct REAL,
  noise_count INTEGER,
  error_message TEXT,
  cluster_params JSONB NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS idx_clustering_runs_version
  ON clustering_runs (version);

CREATE INDEX IF NOT EXISTS idx_clustering_runs_started_at
  ON clustering_runs (started_at DESC);

-- RLS: audit table holds no user data but may contain redacted error
-- messages from the clustering job. service_role only; no anon/authenticated
-- access needed (the frontend never reads this).
ALTER TABLE clustering_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_clustering_runs" ON clustering_runs;
CREATE POLICY "service_role_clustering_runs"
  ON clustering_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
