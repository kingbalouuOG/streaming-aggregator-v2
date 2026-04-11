-- ============================================
-- Phase 0.5 — First-party content enrichment columns
-- ============================================
--
-- Adds four nullable columns to `titles` to hold persistent first-party
-- metadata that the Phase 1 embedding template (Strategy v1.6.3 §4.1)
-- consumes:
--   - keywords        TEXT[]   — TMDb keyword names, ordered as TMDb returns them
--   - cast_top_5      TEXT[]   — first 5 billed cast member names
--   - director        TEXT     — single name (movies) or creator (TV); multiple
--                                directors joined with ", "
--   - content_rating  TEXT     — UK certification preferred, US fallback, NULL otherwise
--
-- IMPORTANT: `runtime` is NOT added here. It already exists on `titles`
-- (001_content_tables.sql:24, "movies only"). In practice it is currently
-- NULL for all 20,000 rows because sync-content.ts:220 sets it NULL — the
-- discover endpoint doesn't return runtime (see Parking Lot IN-105). The
-- Phase 0.5 backfill populates it opportunistically alongside the other
-- four fields. The work-queue invariant is `keywords IS NULL ⇒ unenriched`,
-- so the queue does NOT widen to `OR runtime IS NULL` — that would
-- permanently pin shorts/unaired-TV (where TMDb has no runtime) into
-- every daily enrichment run.
--
-- Empty array `'{}'` ≠ NULL for keywords/cast_top_5: empty means TMDb
-- returned no values, NULL means the row has not yet been enriched.
--
-- Decisions confirmed during Phase 0.5 planning:
--   - Region fallback for content_rating: GB → US → NULL (no synthetic 'NR')
--   - Keywords cap: none (store everything TMDb returns)
--
-- Type choice: TEXT[] for keywords/cast_top_5 mirrors the existing
-- `genre_ids INTEGER[]` convention on 001:19, sorts/filters better than
-- JSONB for flat string lists, and avoids JSONB's quoting overhead.

ALTER TABLE titles
  ADD COLUMN IF NOT EXISTS keywords TEXT[],
  ADD COLUMN IF NOT EXISTS cast_top_5 TEXT[],
  ADD COLUMN IF NOT EXISTS director TEXT,
  ADD COLUMN IF NOT EXISTS content_rating TEXT;

-- Partial index on the work-queue condition. Tiny by construction (only
-- unenriched rows), self-prunes as the backfill progresses, and lets the
-- enrichment Edge Function's `WHERE keywords IS NULL ORDER BY id LIMIT 100`
-- query stay cheap as the table grows. Drop in a future migration once
-- the queue is permanently drained if you care about the index slot.

CREATE INDEX IF NOT EXISTS idx_titles_enrichment_queue
  ON titles (id) WHERE keywords IS NULL;
