---
title: User taste vector v2
type: concept
tags: [taste-vector, embeddings, bootstrap, decay]
created: 2026-04-26
updated: 2026-05-08
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/v2-strategy/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md
  - raw/phase-summaries/phase-3-summary.md
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
| Watchlist remove | −0.4 |
| 10-30s dwell, back-no-action | −0.25 |
| Thumbs down | −0.6 |
| 3-10s dwell, back-no-action | −0.15 |
| Not interested | hard filter only, no taste update |
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

## Conflict resolution applied

- Strategy says "weighted blend ... 0.40/0.40/0.20" as a baseline. Phase 3 ships dynamic 4-band weights. Phase summary records this; strategy §5.2 updated.
- Phase 3 shipped watched-grid-dominant 4-band; 2026-05-08 re-tuned to cluster-dominant after simulation sweep. ADR-013 supersedes the Phase 3 weight choice. Existing user profiles will need re-bootstrap on next interaction or 24h recompute cycle.
- Older docs treat detail view as weak positive. v2 corrects this to NOT positive (anchor only).
