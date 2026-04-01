-- B1.4: Add content_vector column to titles table
-- Stores pre-computed 24-dimensional taste vectors (19 genre + 5 meta dimensions)
-- Populated during sync pipeline; enables future server-side recommendation scoring
-- Uses float4[] (plain Postgres array) — no pgvector dependency

ALTER TABLE titles ADD COLUMN IF NOT EXISTS content_vector float4[];

ALTER TABLE titles
  ADD CONSTRAINT chk_content_vector_dim
  CHECK (content_vector IS NULL OR array_length(content_vector, 1) = 24);
