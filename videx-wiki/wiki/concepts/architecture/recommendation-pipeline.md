---
title: Recommendation pipeline
type: concept
tags: [pipeline, ranker, stages, weights, scoring]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/phase-summaries/phase-4-summary.md
  - raw/codebase-snapshots/module-map.md
related:
  - wiki/concepts/architecture/taste-vector.md
  - wiki/concepts/architecture/sliders.md
  - wiki/concepts/architecture/for-you-surface.md
  - wiki/concepts/architecture/home-surface.md
  - wiki/entities/codebase/rpcs.md
  - wiki/entities/codebase/module-map.md
  - wiki/concepts/operations/phase-4.md
---

# Recommendation pipeline

Multi-stage pipeline replacing v1's single scoring function. All weights live in `src/lib/recommendations-v2/weights.ts`.

## Principles

1. Multi-stage, not monolithic. Each stage has a clear job and can be evaluated/upgraded independently.
2. LLM embeddings for content; hand-built model for user taste.
3. Pragmatism over cleverness at our scale (no CF, no neural ranking).
4. Evaluation before deployment.

## Stages

### Stage 1 — Candidate retrieval

- Cosine similarity between user `taste_vector_v2` and content embeddings via `match_titles_by_vector(query_vector, k, ...)` RPC (HNSW, `vector_cosine_ops`).
- Filtered by:
  - Availability on user services (`get_available_tmdb_ids` JSON RPC, single-query DISTINCT).
  - Device-appropriate length.
  - Not on watchlist.
  - Not `not_interested` (read from `user_interactions` since Phase 0 rewrite of `getDismissedIds()`).
  - Not `thumbs_down`'d.
- Retrieval volume: top 500 candidates per request.
- One **shared 500-candidate pool** for all taste-vector rows on For You; conditional rows (Because You Watched anchors, More From [Person]) use separate calls.

### Stage 2 — Ranking

Weighted score on a consistent numerical scale.

| Component | Strategy intent (sums to 1.0) | Phase 4 shipped (sums to 1.0) | Slider modulation |
|---|---|---|---|
| Taste-vector similarity | 50% | 62.5% | — |
| Recency | 20% | 25% | Catalogue-age (10-30%) with proportional re-norm |
| Contextual fit (device, viewing context) | 10% | 12.5% (placeholder, returns 0.5 for all candidates) | — (Phase 5) |
| Intra-list diversity | 10% | post-processing stage | Focused ↔ Varied |
| Cross-service spread | 10% | post-processing stage | — |

Phase 4 implementation note: the 5-component table in strategy §5.2 represents intent. Diversity and cross-service spread are inherently post-processing, not scoring. Phase 4 ships 3-component scoring sum (62.5/25/12.5) + 2 post-processing passes (genre-spread, de-clustering). When Phase 5 replaces `contextual.ts`, the split must be re-evaluated.

Recency anchors:

- **For You**: `release_date`, exponential decay 180-day half-life.
- **Home**: `MAX(release_date, available_since)`, piecewise linear.

No mixing of raw and normalised scores. v1's `scoreCandidate()` scale-mismatch bug is not carried forward.

### Stage 3 — Row selection (split per surface)

- Home: see [home-surface](home-surface.md).
- For You: see [for-you-surface](for-you-surface.md).

### Stage 4 — Within-row ordering

- Titles ordered by Stage 2 score with diversity constraints (no two from same franchise consecutively, genre variation within row).
- `applyContentMixRatio` resamples movies/TV by Content Mix slider.
- `applyGenreSpread` (TMDb primary genre + taste cluster secondary).
- `deClusterByService` (max-2-consecutive constraint).

## Slider modulation

| Slider | Pipeline effect |
|---|---|
| Catalogue Age | Scales recency weight (default 25%, range 10-30%, proportional re-norm of taste/contextual) |
| Comfort Zone | Scales exploration ratio in Stage 3 (default 20-25%, range 10-40%) |
| Content Mix | Filters retrieval in Stage 1 (films-weighted vs TV-weighted) |
| Focused ↔ Varied | Modifies Stage 3 row selection (deeper similar-content rows vs greater variety) |

## Detail page "More Like This"

- TMDb similar/recommended endpoints fetch candidate IDs.
- Single batch Supabase query: `SELECT tmdb_id, embedding FROM titles WHERE tmdb_id = ANY($1)`.
- Returned embeddings deserialised via `JSON.parse(row.embedding as string)` (Phase 1 wire format spike pattern).
- Client-side cosine similarity vs user taste vector.
- One extra Supabase round-trip per detail page view; 246KB payload (20-40 candidates × 1536D × 4 bytes).

Alternatives rejected: server-side RPC (splits scoring across TS/SQL, divergence bugs); simplified client-side heuristic without taste vector (regression from v1).

## Hard filters (pre-scoring)

`hardFilters.ts`: not_interested, thumbs_down, unavailable, watched.

## Things v2 does NOT build

Two-tower neural model with trained towers (no training data). Thumbnail personalisation. Reinforcement learning. Collaborative filtering (re-evaluate at ~10K MAU). Full conversational discovery (Phase 7).
