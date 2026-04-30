---
title: Embedding Backfill Runbook
generated: 2026-04-26
script: scripts/embeddings/backfill-embeddings.ts
---

# Embedding Backfill Runbook

Generates 1536D `text-embedding-3-small` vectors for `titles.embedding`. Used for initial population and to recover after failed Edge Function runs.

## Prerequisites

- `OPENAI_API_KEY` in `.env`.
- `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
- Sufficient OpenAI quota. ~20K titles × ~80 tokens ≈ 1.6M tokens ≈ $0.03 at `text-embedding-3-small` pricing.

## Run

```bash
npx tsx scripts/embeddings/backfill-embeddings.ts
```

Reads from `titles WHERE embedding IS NULL`. Builds the embedding template per Strategy v1.6.3 §4.1. Writes embeddings in batches.

### Resume semantics

- Checkpoint file: `scripts/embeddings/.checkpoint.json`.
- Resumes from last successful batch on restart.
- Failed titles append to `scripts/embeddings/.failures.jsonl` (one JSON line each) without halting the run.

## Build / rebuild HNSW index

After a large backfill or when changing index parameters:

```bash
npx tsx scripts/embeddings/create-hnsw-index.ts
```

This drops and recreates the HNSW index. Build is offline; queries during build degrade to sequential scan. Run during low-traffic window.

## Failure handling

| Symptom | Cause | Fix |
|---|---|---|
| `429` from OpenAI | Rate limit | Script retries with exponential backoff. Reduce concurrency in script if persistent. |
| `Embedding shape mismatch` | OpenAI returned wrong dimension | Verify model string is `text-embedding-3-small`. |
| Large `.failures.jsonl` | Persistent failures (often empty `overview` field) | Inspect failed payloads; fix template handling for missing fields. |
| Postgres `value too long for type vector(1536)` | Mismatch between API model and column type | Should not happen; verify column definition `vector(1536)`. |

## Coherence eval

After any embedding template change:

```bash
npx tsx scripts/embeddings/eval-cluster-coherence.ts
```

Compares cohort centroids against thresholds. Must pass before promoting changes to production. See `docs/v2/phase-1-cluster-eval.md` for the methodology and `raw/reference/eval-harness-reference.md` for current thresholds.

## Health checks

```sql
-- Queue length
SELECT count(*) FROM titles WHERE embedding IS NULL;

-- Distribution of embedding null vs present
SELECT count(*) FILTER (WHERE embedding IS NOT NULL) as embedded,
       count(*) FILTER (WHERE embedding IS NULL) as missing
FROM titles;

-- Sample similarity sanity check
SELECT title, embedding <=> (
  SELECT embedding FROM titles WHERE title = 'The Bear' LIMIT 1
) AS dist
FROM titles
WHERE embedding IS NOT NULL
ORDER BY dist
LIMIT 10;
```
