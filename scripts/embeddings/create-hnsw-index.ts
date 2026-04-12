/**
 * Phase 1 — Create HNSW index on titles.embedding
 *
 * Run from Joe's laptop AFTER the bulk embedding backfill completes.
 * NOT from an Edge Function — the 150s timeout would kill the build.
 *
 * In practice the Supabase CLI `db query` route also has an HTTP gateway
 * timeout that may trigger before the index build completes. If that
 * happens, check whether the index was created server-side anyway:
 *
 *   npx supabase db query --linked \
 *     "SELECT indexname, indisvalid FROM pg_index
 *      JOIN pg_class ON pg_class.oid = pg_index.indexrelid
 *      WHERE pg_class.relname = 'idx_titles_embedding_hnsw';"
 *
 * If indisvalid = true, the index built successfully despite the client
 * timeout. If the index doesn't exist, retry via the Supabase SQL Editor
 * in the dashboard (no HTTP gateway timeout there).
 *
 * SQL to run:
 *   CREATE INDEX IF NOT EXISTS idx_titles_embedding_hnsw
 *   ON titles USING hnsw (embedding vector_cosine_ops);
 *
 * Expected runtime: 1-3 minutes for 20K vectors on Supabase Pro.
 * Uses default HNSW parameters (m=16, ef_construction=64).
 * Expected index size: ~156 MB.
 */

// This script documents the process. The actual index was created via:
//   npx supabase db query --linked "CREATE INDEX IF NOT EXISTS ..."
// See the commit message for details.
