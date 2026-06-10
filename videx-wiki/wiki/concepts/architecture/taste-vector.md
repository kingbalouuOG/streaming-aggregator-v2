---
title: User taste vector v2
type: concept
tags: [taste-vector, embeddings, bootstrap, decay]
created: 2026-04-26
updated: 2026-06-10
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/v2-strategy/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md
  - raw/phase-summaries/phase-3-summary.md
  - docs/v2/phase-summaries/phase-eng-1-summary.md
related:
  - wiki/concepts/decisions/adr-004-1536d-embeddings.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/architecture/cold-start.md
  - wiki/concepts/architecture/onboarding-flow.md
  - wiki/concepts/architecture/signal-architecture.md
  - wiki/entities/codebase/migrations.md
---

# User taste vector v2

Single 1536D vector in the same embedding space as content. Replaces v1's 24D archetype vector. Stored on `taste_profiles.taste_vector_v2`.

> **Phase ENG-1 (2026-06-10):** the single vector is now the *summary*, not the retrieval driver. Up to **K = 3 interest centroids** per user (`user_interest_centroids`, migration 044 — slot 0–2, weight, owner-RLS) drive multi-interest retrieval; the summary vector continues to back mood-room affinity, semantic-search taste-fit, and the fallback path for users with no centroid rows. See §ENG-1 below.

## Computation

Weighted aggregate of content vectors from user interactions. Per [detail page signal capture spec](../../sources/detail-page-signal-capture-spec-v0-3-2.md) §4.1:

| Signal | Weight |
|---|---|
| Watched + thumbs_up | +1.5 (combined; replaces both individual signals) |
| Thumbs up | +1.0 |
| Deep-link click (high confidence) | +0.8 |
| Marked watched | +0.5 |
| Deep-link click (low confidence) | +0.4 |
| Watchlist add | +0.3 |
| 30s+ dwell, back-no-action | −0.35 |
| Watchlist remove | ~~−0.4~~ **taste-neutral since ENG-1** |
| 10-30s dwell, back-no-action | −0.25 |
| Thumbs down | ~~−0.6~~ **avoid set since ENG-1, no vector update** |
| 3-10s dwell, back-no-action | −0.15 |
| Not interested | hard filter + avoid set (ENG-1), no taste update |
| Detail view alone | NOT positive (anchor only) |
| <3s dwell | ignored |
| App backgrounded (not expected) | ignored until session resumes |

## Combination rules

1. **Dedup within 24h.** Multiple detail views of same title within 24h count as one signal, highest-weight wins.
2. **Replace, don't add** for explicit signals on a title (watchlist +0.3 followed by thumbs_up +1.0 → final update is +1.0).
3. **Decay.** 90-day half-life for behavioural signals; 180-day half-life for explicit. Lazy: applied at recompute time only (per Phase 3 implementation).
4. **Confidence floor.** First 20 interactions weighted 1.5x to accelerate cold-start convergence.
5. **Negative session cap.** Cumulative negative dwell signal per session capped at −1.0.

## Update strategy (Phase 3 shipped)

Hybrid:

- **Incremental on interaction**: instant blend on every emit.
- **Full recompute if stale > 24h**: replays from `user_interactions` event log.

This gives instant feedback while remaining replayable from the source-of-truth log.

## Bootstrap (cold start)

Initial taste vector = weighted blend of:

- Service fingerprints (per Pillar 3) — see [service fingerprints](service-fingerprints.md).
- Watched-grid signals from onboarding Step 3.
- Genre selections from Step 4.

Phase 3 shipped **dynamic 4-band watched-grid-dominant weights**. Re-tuned 2026-05-08 to **cluster-dominant** after a 2,280-trial simulation sweep — see [ADR-013](../decisions/adr-013-cluster-dominant-bootstrap-weights.md).

Active weights (cluster-dominant, `bootstrap.ts:77`):

| Watched-grid selections | Service fingerprints | Watched grid | Cluster (genre) |
|---|---|---|---|
| 0 | 0.25 | 0.00 | 0.75 |
| 1-4 | 0.13 | 0.12 | 0.75 |
| 5-12 | 0.09 | 0.16 | 0.75 |
| 13+ | 0.05 | 0.20 | 0.75 |

Rationale: in simulation the previous watched-grid-dominant weights produced profiles that drifted toward whichever canonical anchor titles a user happened to tap (everyone landed near Marvel / Avengers regardless of declared cluster preferences). Cluster-Alignment Fidelity (CAF) lifted from 1.06 → 1.22 (+15%); Persona-Distinctness from 0.022 → 0.190 (+760%). Tap-count sensitivity tested at light (4) / normal (7) / heavy (10) — all produce equivalent profiles, confirming robustness to disengaged users. Profile variance N=30 ≤ 0.0008.

Genre-weight fallback: if the user selects no clusters at Step 4 the cluster weight is redistributed to service fingerprints (`bootstrap.ts:101`).

## Schema (post Phase 3)

`taste_profiles` columns: `taste_vector_v2 vector(1536)`, slider state columns, metadata. v1 columns dropped in migration 024 (`vector`, `confidence`, `seed_vector`, `quiz_completed`, `quiz_answers`, `interaction_log`, `version`).

## ENG-1: interest centroids (shipped 2026-06-10)

Fixes the retrieval-stage ceiling: a user who picks "cozy British comedy" + "dark thrillers" no longer gets one averaged vector pointing at neither.

- **Storage:** `user_interest_centroids (user_id, slot 0–2, centroid vector(1536), weight, updated_at)` — K fixed at 3 (E&P brief §9 D3). Zero rows = single-vector fallback (self-heals at next bootstrap or 24h recompute; no backfill).
- **Bootstrap:** per-cluster seed centroids (not the flattened union) → greedy agglomerative merge while over the K cap or pairwise cosine ≥ `INTEREST_MERGE_TAU` (0.80 — eval-confirmed: on the 16-cluster taxonomy, max pairwise is 0.7532, so only the cap merges). Service/watched signal blends into EACH interest at the existing band weights. Weights ∝ merged member count, floored at `INTEREST_WEIGHT_FLOOR` (0.15), slot 0 = dominant. Pure logic in `interestGrouping.ts`.
- **Incremental:** EMA updates the **nearest centroid only** (cosine assignment), positive events only, same learning rate / confidence floor / search-attribution boost. Single-row write.
- **Batch (24h recompute, client-only, fire-and-forget):** deterministic weighted k-means (`kmeans.ts`, k-means++ seeded from hashed content keys — same log replays to same centroids) over decay-weighted positive title mass; < 8 distinct positives keeps existing centroids; weights = share of decayed positive mass.
- **Negative signals:** removed from ALL vector paths (incremental, replay, centroid). `thumbs_down` + `not_interested` feed the score-time avoid set ([recommendation-pipeline](recommendation-pipeline.md)); `watchlist_remove` is taste-neutral. Historical vectors heal on their next 24h replay — `TASTE_RELEVANT_EVENTS` is positive-only.
- **GDPR:** migration 044 extended `delete_own_account()` + `export_user_data()` with the new table.

## Conflict resolution applied

- Strategy says "weighted blend ... 0.40/0.40/0.20" as a baseline. Phase 3 ships dynamic 4-band weights. Phase summary records this; strategy §5.2 updated.
- Phase 3 shipped watched-grid-dominant 4-band; 2026-05-08 re-tuned to cluster-dominant after simulation sweep. ADR-013 supersedes the Phase 3 weight choice. Existing user profiles will need re-bootstrap on next interaction or 24h recompute cycle.
- Older docs treat detail view as weak positive. v2 corrects this to NOT positive (anchor only).
