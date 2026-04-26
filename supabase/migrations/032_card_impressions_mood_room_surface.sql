-- ============================================
-- Phase 4.5 fix - Allow 'mood_room' in card_impressions.source_surface
-- Migration 032
-- ============================================
--
-- Migration 014 created card_impressions with a CHECK constraint:
--
--   source_surface TEXT NOT NULL CHECK (source_surface IN (
--     'home', 'for_you', 'browse', 'watchlist', 'search', 'detail'
--   ))
--
-- Phase 4.5 added 'mood_room' to the ImpressionSurface TypeScript
-- union (Task 3.2). The plan note (A4) said the column had no CHECK
-- constraint and no DDL was needed. That was wrong — the constraint
-- was right there in 014 and it correctly rejected all 'mood_room'
-- INSERTs for the past two days. Every batch flush that contained
-- a mood_room row failed atomically and was dropped after one
-- retry; for_you / home batches without mood_room rows continued
-- to succeed, which is why home + for_you impressions kept flowing
-- but mood_room never landed.
--
-- Fix: drop and recreate the constraint with 'mood_room' included.
-- The CHECK lives on the partitioned parent and propagates to all
-- child partitions; one DDL covers everything.

ALTER TABLE card_impressions
  DROP CONSTRAINT IF EXISTS card_impressions_source_surface_check;

ALTER TABLE card_impressions
  ADD CONSTRAINT card_impressions_source_surface_check
  CHECK (source_surface IN (
    'home', 'for_you', 'mood_room', 'browse', 'watchlist', 'search', 'detail'
  ));
