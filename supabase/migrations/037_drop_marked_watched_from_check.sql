-- ============================================
-- Phase 5 Workstream C — drop marked_watched event_type
-- Migration 037
-- ============================================
--
-- Migration 013 added the user_interactions.event_type CHECK constraint
-- with `marked_watched` carried as a forward-compat slot for Phases
-- 1-4 (Signal Spec §5.1). At runtime, the v2 app never emits an
-- event_type of `marked_watched` — `emitContentInteraction` in
-- src/lib/storage/interactions.ts:86 only accepts 'watched'. The
-- forward-compat slot is unused.
--
-- Pre-flight gate (run by Joe 2026-05-06 against the live project):
--   SELECT count(*) FROM user_interactions WHERE event_type = 'marked_watched';
-- Result: 0. Migration is a clean DROP / ADD swap; no UPDATE step needed.
--
-- The `marked_watched` token survives in two unrelated places that are
-- intentionally NOT touched by this migration (per Phase 5 plan
-- decision 6):
--   - ExitReason union in src/lib/storage/interactions.ts:35 — that
--     value lives inside dwell_event payload metadata, not as an
--     event_type. Detail Page Signal Capture Spec v0.3.2 line 237
--     keeps it canonical.
--   - DetailPage.tsx:402,416 — local UI state set when the user clicks
--     "Mark as watched"; passed through to the dwell_event as exit_reason.
--
-- Read-side queries that filter for both 'watched' and 'marked_watched'
-- are cleaned up in the same PR (useForYouContent.ts:511, render-foryou-rows
-- index.ts:468). The `marked_watched` entries in TASTE_RELEVANT_EVENTS
-- and INTERACTION_WEIGHTS (src/lib/taste-v2/types.ts + _shared mirror)
-- are removed in the same PR.
--
-- Reversibility: trivial. Re-run migration 013 lines 47-69 to restore
-- the original 15-value constraint. No data loss possible since the
-- pre-flight count was 0.

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
    'section_expanded'
    -- 'marked_watched' removed in Phase 5 — was unused at runtime,
    -- exit_reason payload value is unaffected.
  ));
