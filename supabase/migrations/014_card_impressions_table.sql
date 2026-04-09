-- Migration 014: card_impressions table with pg_partman
--
-- Purpose: Creates the dedicated impression-tracking pipeline for v2.
-- Card impressions are intentionally NOT stored in user_interactions
-- because:
--   - Volume: 50-200 impressions per session vs 5-20 user actions
--   - Query pattern: aggregate analytics, not per-user history reads
--   - Retention: short-to-medium term (90d row + aggregated daily)
--
-- Components introduced by this migration:
--   1. card_impressions parent table, partitioned by month on shown_at
--   2. card_impression_daily_totals aggregation table
--   3. pg_partman config for monthly partition creation + 3-month retention
--   4. pg_cron job: daily rollup of >90-day-old impressions into the
--      aggregation table BEFORE the partman retention drop
--   5. pg_cron job: daily partman maintenance (creates new partitions,
--      drops expired ones)
--
-- Phase 0 / Migration row 014 in Project Orchestration v0.3.1 §3.4.
-- References: Implementation Notes Parking Lot v0.3.2 IN-005, IN-011.
-- Detail Page Signal Capture Spec v0.3.2 §5.2.

-- ──────────────────────────────────────────────────────────────────
-- Extensions
-- ──────────────────────────────────────────────────────────────────
-- pg_partman v5.3.1 on Supabase installs into the `public` schema
-- (verified via pg_extension on 2026-04-09). All partman objects
-- (create_parent, part_config, run_maintenance_proc) are referenced
-- WITHOUT a schema prefix throughout this migration — they resolve
-- via the search_path which includes public by default.
--
-- Note for v5: create_parent's signature changed from v4. p_type
-- now defaults to 'range' and the parameter order changed; we use
-- named parameters to be explicit.
--
-- Extension install history: pg_partman was manually installed via
-- `supabase db query` on 2026-04-09 before migration 014 could apply,
-- because the first apply attempt failed at create_parent() with
-- `schema "partman" does not exist` (Supabase installs partman into
-- public, not into a `partman` schema). The CREATE EXTENSION statement
-- below is now a no-op on prod but remains the canonical source for
-- fresh environment rebuilds.
CREATE EXTENSION IF NOT EXISTS pg_partman;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ──────────────────────────────────────────────────────────────────
-- card_impressions parent table (partitioned by month on shown_at)
-- ──────────────────────────────────────────────────────────────────
-- Note: pg_partman requires the partition key to be part of the
-- primary key for RANGE partitioning, hence (id, shown_at).
CREATE TABLE IF NOT EXISTS card_impressions (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content_id INTEGER NOT NULL,                    -- TMDb id, named for consistency with user_interactions
  source_surface TEXT NOT NULL CHECK (source_surface IN (
    'home', 'for_you', 'browse', 'watchlist', 'search', 'detail'
  )),
  position INTEGER NOT NULL,                      -- 0-indexed position within the row on that surface
  session_id UUID NOT NULL,
  shown_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id, shown_at)
) PARTITION BY RANGE (shown_at);

-- Indexes (created on the parent so partman propagates them to partitions)
CREATE INDEX IF NOT EXISTS idx_card_impressions_user_shown
  ON card_impressions(user_id, shown_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_impressions_surface_shown
  ON card_impressions(source_surface, shown_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_impressions_session
  ON card_impressions(session_id);

-- RLS — same pattern as user_interactions (immutable per-user log).
-- service_role bypasses RLS automatically; the rollup cron job runs
-- as the postgres superuser and is unaffected.
ALTER TABLE card_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own impressions"
  ON card_impressions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own impressions"
  ON card_impressions FOR SELECT
  USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────
-- pg_partman: monthly partitions, 2 months ahead, 3 months retention
-- ──────────────────────────────────────────────────────────────────
SELECT create_parent(
  p_parent_table => 'public.card_impressions',
  p_control      => 'shown_at',
  p_interval     => '1 month',
  p_type         => 'range',
  p_premake      => 2
);

UPDATE part_config
   SET retention             = '3 months',
       retention_keep_table  = false,
       retention_keep_index  = false
 WHERE parent_table = 'public.card_impressions';

-- ──────────────────────────────────────────────────────────────────
-- card_impression_daily_totals aggregation table
-- ──────────────────────────────────────────────────────────────────
-- Receives the rollup of any card_impressions row older than 90 days
-- BEFORE pg_partman's retention logic drops the partition. The
-- UNIQUE constraint matches the rollup INSERT's ON CONFLICT target
-- so re-running the rollup over the same day is a safe no-op.
CREATE TABLE IF NOT EXISTS card_impression_daily_totals (
  date DATE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  source_surface TEXT NOT NULL,
  content_id INTEGER NOT NULL,
  impression_count INTEGER NOT NULL,
  UNIQUE (date, user_id, source_surface, content_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_totals_user_date
  ON card_impression_daily_totals(user_id, date DESC);

-- RLS — same shape as the parent table.
ALTER TABLE card_impression_daily_totals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own impression totals"
  ON card_impression_daily_totals FOR SELECT
  USING (auth.uid() = user_id);

-- ──────────────────────────────────────────────────────────────────
-- pg_cron: rollup BEFORE retention
-- ──────────────────────────────────────────────────────────────────
-- INVARIANT: rollup_threshold (90 days) < retention_threshold
-- (3 months / ~91 days). If anyone tightens partman retention later
-- without pulling the rollup threshold in ahead of it, data will be
-- dropped before aggregation. ON CONFLICT DO UPDATE keeps rollup
-- idempotent, so the rollup can safely run ahead of retention as
-- long as the ordering holds.
--
-- Rollup runs at 01:00 UTC. Partman maintenance runs at 02:00 UTC.
-- Order matters. Do not reverse.
SELECT cron.schedule(
  'card_impressions_rollup',
  '0 1 * * *',
  $$
  INSERT INTO card_impression_daily_totals (date, user_id, source_surface, content_id, impression_count)
  SELECT
    date_trunc('day', shown_at)::date AS date,
    user_id,
    source_surface,
    content_id,
    count(*)::int AS impression_count
  FROM card_impressions
  WHERE shown_at < now() - interval '90 days'
  GROUP BY date_trunc('day', shown_at)::date, user_id, source_surface, content_id
  ON CONFLICT (date, user_id, source_surface, content_id)
  DO UPDATE SET impression_count = EXCLUDED.impression_count;
  $$
);

-- ──────────────────────────────────────────────────────────────────
-- pg_cron: pg_partman maintenance (creates new partitions, drops
-- expired ones). Runs at 02:00 UTC, one hour AFTER the rollup.
-- ──────────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'pg_partman_maintenance',
  '0 2 * * *',
  $$ CALL run_maintenance_proc(); $$
);

-- ──────────────────────────────────────────────────────────────────
-- Documentation comments
-- ──────────────────────────────────────────────────────────────────
COMMENT ON TABLE card_impressions IS
  'v2 impression log. Partitioned monthly via pg_partman. 90-day row retention; '
  'older rows aggregated into card_impression_daily_totals before retention drop. '
  'Inserted by the impression batcher in src/lib/instrumentation/impressionBatcher.ts.';

COMMENT ON TABLE card_impression_daily_totals IS
  'Daily rollup of card_impressions for analytics on data older than 90 days. '
  'Populated by the card_impressions_rollup cron job at 01:00 UTC daily.';
