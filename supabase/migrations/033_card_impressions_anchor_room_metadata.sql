-- ============================================
-- Phase 4.5 redirect — anchored mood rooms instrumentation
-- Migration 033
-- ============================================
--
-- Two changes in one migration. They're tightly coupled (both serve the
-- anchored mood rooms instrumentation in §3.2/§3.3 of the Phase 4
-- Title-Anchored Mood Rooms kick-off) so they ship as a single DDL.
--
--   1. Extend the `card_impressions.source_surface` CHECK constraint to
--      include 'anchor_room'. Mirrors migration 032's pattern (which
--      added 'mood_room'). Required so per-row CTR analytics can
--      distinguish anchored from global mood-room engagement at the
--      surface column directly, instead of having to read the metadata
--      blob to disambiguate.
--
--   2. Add a `metadata jsonb` column to card_impressions. Used by the
--      anchored mood rooms row to log per-impression context — the
--      anchor's tier (1/2/3), the source cluster id (Tier 2 only), and
--      whether a Tier 1 anchor sits inside a user-selected cluster's
--      0.40 cosine-distance neighbourhood. This data answers the
--      IN-OB-006 question (onboarding cluster taxonomy review) with
--      data instead of guesswork.
--
-- The metadata column is intentionally generic (jsonb, nullable, no
-- CHECK constraint on shape) so future surfaces can attach their own
-- per-impression context without another migration. Existing inserts
-- pass NULL implicitly; no application changes required for code paths
-- that don't need metadata.
--
-- Index policy: no index on metadata in this migration. The analytics
-- query pattern is "filter by source_surface = 'anchor_room' THEN read
-- metadata fields", which the existing source_surface index already
-- accelerates. A GIN index on metadata is cheap to add later if a
-- query pattern emerges that justifies it; not adding speculatively.
--
-- The CHECK constraint and the column live on the partitioned parent
-- and propagate to all child partitions; one DDL covers everything.

-- ──────────────────────────────────────────────────────────────────
-- 1. Extend source_surface CHECK constraint with 'anchor_room'
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE card_impressions
  DROP CONSTRAINT IF EXISTS card_impressions_source_surface_check;

ALTER TABLE card_impressions
  ADD CONSTRAINT card_impressions_source_surface_check
  CHECK (source_surface IN (
    'home', 'for_you', 'mood_room', 'anchor_room', 'browse', 'watchlist', 'search', 'detail'
  ));

-- ──────────────────────────────────────────────────────────────────
-- 2. Add nullable metadata jsonb column
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE card_impressions
  ADD COLUMN IF NOT EXISTS metadata jsonb;

COMMENT ON COLUMN card_impressions.metadata IS
  'Per-impression surface-specific context. For source_surface=''anchor_room'': '
  '{ anchor_tmdb_id: int, anchor_tier: 1|2|3, anchor_source_cluster_id: text|null, '
  'tier_1_inside_stated_cluster: bool|null }. For other surfaces: null today; '
  'reserved for future per-impression context without another migration.';
