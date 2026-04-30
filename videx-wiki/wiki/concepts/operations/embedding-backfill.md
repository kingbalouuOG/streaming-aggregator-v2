---
title: Embedding backfill runbook
type: concept
tags: [runbook, embeddings, backfill, openai, hnsw]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/runbooks/embedding-backfill.md
related:
  - wiki/concepts/techniques/embeddings.md
  - wiki/concepts/operations/phase-1.md
  - wiki/entities/codebase/migrations.md
---

# Embedding backfill runbook

`scripts/embeddings/backfill-embeddings.ts`. Generates 1536D `text-embedding-3-small` vectors for `titles.embedding`. Used for initial population and recovery from failed Edge Function runs.

## Prerequisites

- `OPENAI_API_KEY` in `.env`.
- `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
- OpenAI quota: ~20K titles × ~80 tokens ≈ 1.6M tokens ≈ $0.03-0.05.

## Run

```bash
npx tsx scripts/embeddings/backfill-embeddings.ts
```

Reads from `titles WHERE embedding IS NULL`. Builds embedding template per [strategy v1.6.3 §4.1](../../sources/engine-strategy-v1-6-3.md). Writes in batches.

## Resume semantics

- Checkpoint: `scripts/embeddings/.checkpoint.json`.
- Resumes from last successful batch.
- Failed titles append to `scripts/embeddings/.failures.jsonl` without halting.
- Phase 0.5 lesson: plain `writeFileSync` not tmp+rename on Windows (IN-XPS-005); 50ms × 3 EPERM retry; checkpoint cadence every 50 rows.

## HNSW build

After large backfill or index parameter change:

```bash
npx tsx scripts/embeddings/create-hnsw-index.ts
```

Drops and recreates the HNSW index. Build is offline; queries during build degrade to seq scan. Run during low-traffic window. HTTP gateway may time out client-side; server-side completes.

## Failure handling

| Symptom | Cause | Fix |
|---|---|---|
| 429 from OpenAI | Rate limit | Script retries with exponential backoff. |
| Embedding shape mismatch | Wrong model | Verify model is `text-embedding-3-small`. |
| Large `.failures.jsonl` | Persistent failures (often empty `overview`) | Inspect and fix template handling. |
| `value too long for type vector(1536)` | Column type mismatch | Verify `vector(1536)`. |

## Coherence eval

After any template change:

```bash
npx tsx scripts/embeddings/eval-cluster-coherence.ts
```

Must pass before promoting changes. See [phase-1-cluster-eval](../evaluations/phase-1-cluster-eval.md) for methodology and thresholds.

## Health checks

```sql
SELECT count(*) FROM titles WHERE embedding IS NULL;
SELECT count(*) FILTER (WHERE embedding IS NOT NULL) AS embedded,
       count(*) FILTER (WHERE embedding IS NULL) AS missing
FROM titles;

SELECT title, embedding <=> (
  SELECT embedding FROM titles WHERE title = 'The Bear' LIMIT 1
) AS dist
FROM titles
WHERE embedding IS NOT NULL
ORDER BY dist
LIMIT 10;
```
