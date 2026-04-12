-- ============================================
-- Phase 1 close-out — Drop legacy 24D content_vector column
-- ============================================
--
-- All server-side code now uses the 1536D `embedding vector(1536)` column
-- (migration 018). The sync scripts no longer compute or write 24D vectors.
-- The `content_vector float4[]` column and its `chk_content_vector_dim`
-- CHECK constraint are dead weight.
--
-- Client-side v1 taste code (src/lib/taste/computeContentVector.ts,
-- contentVectorMapping.ts) remains until Phase 3 — it computes 24D vectors
-- locally from genre_ids and metadata, not from the database column.
-- Dropping the column does not affect client-side code.
--
-- See Parking Lot IN-205 and Strategy v1.6.3 §7.2.

ALTER TABLE titles DROP CONSTRAINT IF EXISTS chk_content_vector_dim;
ALTER TABLE titles DROP COLUMN IF EXISTS content_vector;
