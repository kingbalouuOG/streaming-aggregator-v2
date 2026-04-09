-- Migration 013: user_interactions v2 expansion
--
-- Purpose: Prepares the user_interactions table for the Phase 0
-- instrumentation pipeline by:
--   1. Adding two top-level columns (session_id, source_surface) so
--      session-bounded analytics and surface-level filters can be
--      indexed instead of digging through metadata JSONB.
--   2. Renaming the previously-unused 'dismiss' event_type to
--      'not_interested' (the v2 name from the Detail Page Signal
--      Capture Spec). Zero rows expected in production but the
--      UPDATE handles any that exist gracefully.
--   3. Adding a new CHECK constraint to user_interactions.event_type.
--      Migration 010 left event_type as free-form TEXT with no
--      constraint, so this migration introduces one for the first
--      time. The allowed-values list is the superset of:
--        - everything currently emitted by v1 code
--          (thumbs_up, thumbs_down, watchlist_add, watched, removed,
--           quiz_answer, quiz_completed, detail_view, search)
--        - Phase 0 additions
--          (dwell_event, deep_link_click, not_interested)
--        - forward-compat names from Signal Spec §5.1 that v2
--          emitters in Phases 1-4 will introduce without needing
--          another constraint migration
--          (watchlist_remove, marked_watched, section_expanded)
--      The 'watched'/'marked_watched' and 'removed'/'watchlist_remove'
--      pairs coexist by design. A future cleanup migration
--      (Parking Lot IN-PX-NNN) will consolidate them.
--
-- Existing rows have session_id = NULL and source_surface = NULL by
-- design. No JSONB-to-column backfill is performed; the columns
-- only carry meaning for events emitted after this migration lands.
--
-- Phase 0 / Migration row 013 in Project Orchestration v0.3.1 §3.4.
-- Reference: Implementation Notes Parking Lot v0.3.2 IN-007.

-- 1. Add the two new columns (idempotent).
ALTER TABLE user_interactions ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE user_interactions ADD COLUMN IF NOT EXISTS source_surface TEXT;

-- 2. Rename any existing 'dismiss' rows to 'not_interested'.
-- Zero rows expected in production. Runs before the CHECK constraint
-- is added so the new constraint won't reject pre-existing data.
UPDATE user_interactions SET event_type = 'not_interested' WHERE event_type = 'dismiss';

-- 3. Add the CHECK constraint. Drop-then-add pattern so the migration
-- is idempotent if it ever needs to be re-applied.
ALTER TABLE user_interactions DROP CONSTRAINT IF EXISTS user_interactions_event_type_check;
ALTER TABLE user_interactions
  ADD CONSTRAINT user_interactions_event_type_check
  CHECK (event_type IN (
    -- v1 names still emitted by current code
    'thumbs_up',
    'thumbs_down',
    'watchlist_add',
    'watched',
    'removed',
    'quiz_answer',
    'quiz_completed',
    'detail_view',
    'search',
    -- Phase 0 additions
    'dwell_event',
    'deep_link_click',
    'not_interested',
    -- Forward-compat for Phases 1-4 (Signal Spec §5.1)
    'watchlist_remove',
    'marked_watched',
    'section_expanded'
  ));

-- 4. Document the design decisions on the new columns.
COMMENT ON COLUMN user_interactions.session_id IS
  'Top-level for indexing. Existing pre-Phase-0 rows are NULL by design — no JSONB backfill.';
COMMENT ON COLUMN user_interactions.source_surface IS
  'Top-level for indexing (e.g. ''home'', ''for_you'', ''browse'', ''watchlist'', ''search'', ''detail''). Existing pre-Phase-0 rows are NULL by design — no JSONB backfill.';

-- 5. Index for session reconstruction. Partial index keeps it small
-- since pre-Phase-0 rows have session_id IS NULL.
CREATE INDEX IF NOT EXISTS idx_interactions_session
  ON user_interactions(session_id)
  WHERE session_id IS NOT NULL;
