-- ============================================
-- H0 Stream B — Share v1
-- Migration 058 — add 'share' to user_interactions.event_type
-- ============================================
--
-- Share v1 logs a `share` event when a user shares a title from the
-- detail page (native React Native Share). It rides the existing
-- user_interactions signal log rather than a new table — consistent with
-- the event taxonomy (videx-wiki event-taxonomy.md).
--
-- The event_type CHECK constraint was last set in migration 037. This
-- re-adds the full allow-list plus 'share'. Drop/add pattern, idempotent.
-- No data change — 'share' has never been emitted before this ships.
--
-- Metadata carried on the event: { to_surface, shared_url, media_type }.
-- It is a weak/neutral taste signal (a share is engagement, but not a
-- like) — it is NOT added to INTERACTION_WEIGHTS; it exists for product
-- analytics (growth-loop attribution), not ranking.

ALTER TABLE public.user_interactions DROP CONSTRAINT IF EXISTS user_interactions_event_type_check;
ALTER TABLE public.user_interactions
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
    'section_expanded',
    -- H0 Stream B — Share v1 (growth-loop analytics; not a ranking signal)
    'share'
  ));
