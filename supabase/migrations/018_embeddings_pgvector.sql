-- ============================================
-- Phase 1 — pgvector extension + 1536D embedding column
-- ============================================
--
-- Enables the pgvector extension and adds a `embedding vector(1536)` column
-- to `titles` for storing OpenAI text-embedding-3-small output.
--
-- Column name is `embedding`, NOT `content_vector`. The legacy v1 column
-- (`content_vector float4[]`) has a CHECK constraint `chk_content_vector_dim`
-- enforcing array_length = 24. Reusing the name would conflict. `embedding`
-- follows pgvector convention. See Parking Lot IN-204.
--
-- The HNSW index is NOT created here. It is built post-backfill via
-- `scripts/embeddings/create-hnsw-index.ts` (run from Joe's laptop, not
-- from an Edge Function — the 150s Edge Function timeout would kill an
-- HNSW build at 20K vectors). See Strategy v1.6.3 §5.2 and §7.2.
--
-- A partial work-queue index mirrors the enrichment queue pattern from
-- migration 017. It supports both the one-time bulk backfill and the
-- ongoing `embed-new-titles` cron Edge Function.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE titles ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Work-queue index: lets `WHERE embedding IS NULL AND keywords IS NOT NULL`
-- queries stay cheap as the table grows. Kept permanently (tiny, helps the
-- daily cron find pending rows).
CREATE INDEX IF NOT EXISTS idx_titles_embedding_queue
  ON titles (id) WHERE embedding IS NULL AND keywords IS NOT NULL;
