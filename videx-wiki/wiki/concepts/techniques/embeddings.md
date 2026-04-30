---
title: Content embeddings (text-embedding-3-small)
type: concept
tags: [embeddings, openai, pgvector, hnsw, technique]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/concepts/embedding-model-primer.md
  - raw/phase-summaries/phase-1-summary.md
  - raw/evaluations/phase-1-cluster-eval.md
  - raw/evaluations/phase-1-wire-format-spike.md
related:
  - wiki/concepts/decisions/adr-004-1536d-embeddings.md
  - wiki/concepts/architecture/taste-vector.md
  - wiki/concepts/operations/phase-1.md
  - wiki/entities/codebase/database-schema.md
  - wiki/entities/infrastructure/pgvector-pg_partman-pg_cron.md
---

# Content embeddings (text-embedding-3-small)

OpenAI `text-embedding-3-small`. 1536-dim. $0.02/M tokens. Locked decision per [ADR-004](../decisions/adr-004-1536d-embeddings.md).

## Why this model

Won head-to-head against Voyage 3.5-lite on a 510-title sample:

- ~1.8x better genre separation.
- ~2.1x better service discrimination.

Cost: one-time backfill of 20K titles ≈ £0.20 (Phase 1 actual: $0.047, 2.35M tokens, ~117 tokens/title). Ongoing ≈ £0.50/month.

## Locked template (strategy v1.6.3 §4.1)

```
{title} ({release_year}) - {media_type}
Genres: {genres}
Overview: {overview}
Keywords: {keywords}
Cast: {cast}
Runtime: {runtime} minutes
```

Empty lines omitted. Trim to ~2000 characters max. Genres resolved from `genre_ids` against static `GENRE_NAMES` map in `lib/constants/genres.ts` (and isomorphic copy at `supabase/functions/_shared/genreNames.ts`).

**Director excluded** despite being available from Phase 0.5. Excluding it reflects how content-based recommendation should work: cluster on theme/genre/keywords/cast, not on signature.

## Storage

`titles.embedding vector(1536)` (migration 018). Legacy 24D `content_vector` dropped in 019.

## HNSW index

`USING hnsw (embedding vector_cosine_ops)`. Built one-time during Phase 1 after bulk embedding insert. ~156 MB. Index build via `supabase db query --linked` because HTTP gateway timed out client-side; server-side completed.

`hnsw.ef_search` raised dynamically in `match_titles_by_vector` RPC (migration 025) to ensure enough results survive service-overlap filtering.

## Wire format pattern (locked)

PostgREST returns `vector(N)` columns as bracket-delimited strings, not parsed arrays. Locked Phase 3 pattern:

```typescript
const vec: number[] = JSON.parse(row.embedding as string);
```

See [phase-1-wire-format-spike](../evaluations/phase-1-wire-format-spike.md).

## Backfill and ongoing

- One-time backfill: `scripts/embeddings/backfill-embeddings.ts` (Joe's laptop, resume-safe via `WHERE embedding IS NULL`, EPERM-retry).
- Ongoing: `supabase/functions/embed-new-titles/index.ts` (JWT-verified, 100 rows per invocation), pg_cron 06:45 UTC daily.

## Cluster coherence (Phase 1 eval)

Conditional pass. 4/5 real cohorts pass within-cohort threshold; Nolan cohort fails (0.47 vs 0.5) by design — director not in template. Between-cohort threshold of 0.3 unrealistic for genre-overlapping cohorts (action-adjacent pairs share legitimate content overlap). See [phase-1-cluster-eval](../evaluations/phase-1-cluster-eval.md).

## Re-embedding

If template changes or model is deprecated:

1. Rebuild from `titles` (keywords, cast_top_5, genre_ids, overview, runtime all persisted as first-party data per Phase 0.5).
2. Backfill via `backfill-embeddings.ts`. ~£0.05 cost. Trivial.

This is why Phase 0.5 (first-party metadata) is a hard prerequisite for Phase 1.
