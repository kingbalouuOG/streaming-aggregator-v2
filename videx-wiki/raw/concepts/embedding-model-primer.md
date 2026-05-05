---
title: Embedding Model Primer
generated: 2026-04-26
sources: [docs/v2/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md §4.1, scripts/embeddings/]
---

# Embedding Model Primer

Videx uses OpenAI `text-embedding-3-small` to encode every title and every user's taste into the same 1536D vector space.

## Model choice

- **Provider:** OpenAI.
- **Model:** `text-embedding-3-small`.
- **Dimensions:** 1536 (default; matryoshka truncation not used).
- **Distance:** cosine.
- **Cost (April 2026):** ~$0.02 per 1M tokens. ~20K titles at ~80 tokens each ≈ 1.6M tokens ≈ $0.03 for a full backfill. Negligible.

## Why this model

- Cheap enough for full-catalogue regen at any time.
- Compatible with pgvector at default dimensionality (`vector(1536)`).
- Larger model `text-embedding-3-large` (3072D) doubles storage and HNSW build time without proportional ranking improvement at our catalogue size.
- Switching providers later is plausible (Voyage, Cohere) but would require a coordinated regen of titles + user vectors.

## Embedding template

The string passed to the embedder for each title:

```
{title}
genres: {genres joined}
overview: {overview}
keywords: {keywords joined}
cast: {cast_top_5 joined}
runtime: {runtime} minutes
```

The template is locked in Strategy v1.6.3 §4.1 and reflects two decisions:
- **Runtime included.** Discriminates short-form from long-form within the same genre.
- **Director excluded.** Coverage was 77.2% post-Phase 0.5; director-heavy weighting hurt cohorts with poor coverage. May be reintroduced once coverage improves.

## User taste vector

The user's `taste_vector_v2` lives on `taste_profiles` and is the same shape as title embeddings. Computed via:

- **Bootstrap (cold start):** mean of selected onboarding archetype centroids, weighted by selection order.
- **Incremental update:** running weighted mean of interacted titles' embeddings, with explicit-signal weights from the signal spec.
- **Full recompute:** triggered on demand or when interaction volume crosses a threshold.

See `lib/taste-v2/bootstrap.ts` and `lib/taste-v2/interactionUpdate.ts`.

## Storage and indexing

- Column: `titles.embedding vector(1536)`.
- Index: HNSW with `vector_cosine_ops`. Built once in Phase 1.
- Work-queue index: partial index on `embedding IS NULL` for the embed-new-titles Edge Function.

## Drift handling

- Embedding model is pinned to a specific snapshot string. OpenAI is committed to backwards compatibility for `text-embedding-3-small`, but a deprecated model would force a coordinated full regen of titles + user vectors.
- Cohort coherence eval (`scripts/embeddings/eval-cluster-coherence.ts`) re-run after any template change. Pass thresholds documented in `docs/v2/phase-1-cluster-eval.md`.

## Observability

- Backfill checkpoint: `scripts/embeddings/.checkpoint.json`.
- Failures: `scripts/embeddings/.failures.jsonl` (one JSON line per title that failed; usually rate limits).
- Postgres-side queue length: `SELECT count(*) FROM titles WHERE embedding IS NULL;`
