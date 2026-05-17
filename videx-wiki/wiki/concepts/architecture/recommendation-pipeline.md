---
title: Recommendation pipeline
type: concept
tags: [pipeline, ranker, stages, weights, scoring, contextual, mmr]
created: 2026-04-26
updated: 2026-05-07
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.8.md
  - raw/phase-summaries/phase-4-summary.md
  - raw/phase-summaries/phase-4-and-4.5-summary.md
  - docs/v2/phase-summaries/phase-5-summary.md
  - raw/codebase-snapshots/module-map.md
related:
  - wiki/concepts/architecture/taste-vector.md
  - wiki/concepts/architecture/sliders.md
  - wiki/concepts/architecture/for-you-surface.md
  - wiki/concepts/architecture/home-surface.md
  - wiki/entities/codebase/rpcs.md
  - wiki/entities/codebase/module-map.md
  - wiki/concepts/operations/phase-4.md
  - wiki/concepts/operations/phase-5.md
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

| Component | Strategy intent (sums to 1.0) | Phase 4/5 shipped (sums to 1.0) | Slider modulation |
|---|---|---|---|
| Taste-vector similarity | 50% | 62.5% | — |
| Recency | 20% | 25% | Catalogue-age (10-30%) with proportional re-norm |
| Contextual fit (device, time-of-day, viewing context) | 10% | 12.5% (Phase 5: real scorer; Phase 4 was 0.5 placeholder) | — |
| Intra-list diversity | 10% | post-processing stage | Focused ↔ Varied (drives MMR λ) |
| Cross-service spread | 10% | post-processing stage | — |

Phase 4 implementation note: the 5-component table in strategy §5.2 represents intent. Diversity and cross-service spread are inherently post-processing, not scoring. Phase 4 shipped 3-component scoring sum (62.5/25/12.5) + 2 post-processing passes (genre-spread, de-clustering).

**Phase 5 update (shipped 2026-05-06):**

- **Contextual sub-scorers (`contextual.ts`):** real scoring composed of three sub-components, weighted within the 12.5% contextual budget:
  - Time-of-day (40%): late-night biases toward shorter runtimes / comedy / animation; weekday morning biases toward documentary / news.
  - Viewing context (40%): `with_family` boosts family-rated and suppresses horror/thriller; `wind_down` boosts comedy/light drama; `focused` boosts prestige drama / documentary. Context comes from `profiles.viewing_context`.
  - Device (20%): Android phones suppress long-runtime movies (>120 min) by 0.12.
  - Each sub-score defaults to neutral 0.5 when its context field is missing → graceful degradation to Phase 4 placeholder behaviour.
- **`PipelineContext`** is built once per render (client-side via `pipelineContext.ts` from Capacitor `Device.getInfo()` + `new Date()` + profile read; Edge-side via `buildEdgePipelineContext()` from User-Agent header + body fields + service-role profile read) and threaded through `scoreCandidates(...)`. Time-of-day source-of-truth is the client's local time; client passes `hourOfDay` + `dayOfWeek` in the render-foryou-rows POST body (decision 9 — TZ skew avoidance). Edge falls back to UTC if absent.
- **MMR replaces `applyGenreSpread`** for For You taste-vector rows. Greedy MMR over 1536D embeddings: `λ × finalScore − (1 − λ) × max(cos sim to selected)`. λ from `getMMRLambda(varietySlider)`: 0.85 at full Comfort (low diversification), 0.55 at full Adventure. `applyGenreSpread` retained as fallback when embedding map is empty.
- **Embedding fetch step:** `fetchEmbeddingsForCandidates(top 200 by finalScore)` runs once per load on both client and Edge paths after `scoreCandidates`. ~3MB JSON payload — was the dominant Phase 5 latency cost.
- **`BASE_WEIGHTS` (62.5/25/12.5) unchanged in Phase 5.** Weight-split re-evaluation deferred until prototype-user vectors rebase post-marked_watched fix; Strategy v1.9 will land with the chosen split.

**Phase 5.5 update (shipped 2026-05-15):**

- **Embedding cache (IN-PX-22):** new `src/lib/recommendations-v2/embeddingCache.ts` module wraps the fetch. Client side: 24h `localStorage` cache keyed `videx_emb_${userId}:${tasteProfilesUpdatedAt}`. Edge side: per-instance module-scoped `Map` with identical key shape, no TTL (instance lifecycle is the eviction). Worth ~600–1500ms client / ~200–600ms Edge on warm loads. Cache key simplified from plan v1's 4-component shape to 2 (`userId + taste_profiles.updated_at`) after review — embeddings are immutable per tmdb_id; misses fetch transparently. `clearEmbeddingCache()` wired into every signOut path (manual + `onAuthStateChange` SIGNED_OUT for JWT expiry / multi-tab / server-side invalidation).
- **Float32Array map shape + cached cosine norms (IN-PX-24):** `Map<string, number[]>` → `Map<string, { vec: Float32Array; norm: number }>` at MMR consumers. `cosineSimilarity` rewritten to take `CachedEmbedding` pairs, multiplies pre-computed L2 norms — skips per-call `Math.sqrt(normA * normB)`. **~3× MMR hot-loop speedup** on 1000-candidate × 50-selected microbenchmark (validated by test 10 in `__tests__/diversity.test.ts` against an inline-norm reference within 1e-9 tolerance).
- **MMR partial-coverage fallback (IN-PX-23):** `applyMMR` returns `{ selected: ScoredCandidate[]; bailedOut: boolean }` instead of a bare array. When > 50% of selected items have null embeddings after at least 4 picks (`MMR_NULL_RATIO_BAIL`, `MMR_MIN_SAMPLE` constants at top of `diversity.ts`), MMR exits early with `bailedOut: true`. `buildRowFromPool` catches the signal and falls through to `applyGenreSpread` for the full row. Hidden Gems and Outside Your Usual (back-catalogue / niche regime) most affected.
- **`buildRowFromPool` options object (IN-PX-26):** five positional params + `undefined` placeholders → `{ config?, getServices?, embeddingMap? }`. Six call sites updated (3 client + 3 Edge). Mechanical refactor; identical output pre/post.
- **`ViewingContext` narrowing (IN-PX-27):** moved from `weights.ts` to `types.ts` so `PipelineContext.viewingContext` can be typed as the union directly. Defensive narrowing helper at both DB boundaries (`pipelineContext.ts` client, `render-foryou-rows/index.ts` Edge) — unknown DB values fall to `null` rather than being silently coerced at score time.
- **Vitest rig (IN-PX-25):** 10 pure-function tests covering `computeContextualScore` (5 tests — late-night comedy vs documentary, with_family + horror suppression, empty ctx neutral, mobile long-runtime penalty, weekday_morning bucket) and `applyMMR` (5 tests — λ=1 sort-by-score, empty embeddingMap no-crash, all-redundant collapse, partial-coverage bailout, cached-norm precision equivalence).
- **`foryou-parity` golden probe activated (IN-PX-33 + IN-XPS-012):** property-level snapshot (per-item id + matchPercentage + anchor tier + slider echo, time-dependent fields excluded). Activated 2026-05-15 with all 5 secrets configured and golden seeded at `scripts/test/foryou-parity-golden.json` (6,083 bytes, 73 items across 8 sections). Future `recommendations-v2` PRs hard-fail on Edge / client divergence.

Recency anchors:

- **For You**: `release_date`, exponential decay 180-day half-life.
- **Home**: `MAX(release_date, available_since)`, piecewise linear.

No mixing of raw and normalised scores. v1's `scoreCandidate()` scale-mismatch bug is not carried forward.

### Stage 3 — Row selection (split per surface)

- Home: see [home-surface](home-surface.md).
- For You: see [for-you-surface](for-you-surface.md).

### Stage 4 — Within-row ordering

Three post-processing passes, applied in order:

1. `applyContentMixRatio` — resamples movies/TV by Content Mix slider.
2. **Intra-row diversity** — MMR (`applyMMR`) over 1536D embeddings is the primary diversity pass; `applyGenreSpread` (TMDb primary genre + taste cluster secondary) is the fallback when the embedding map is empty. Phase 5.5 added a **partial-coverage fallback** (`bailedOut` signal): when > 50% of selected items have null embeddings after at least 4 picks, MMR exits early and `buildRowFromPool` falls through to `applyGenreSpread` for the full row.
3. `deClusterByService` — max-2-consecutive same-service constraint.

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
