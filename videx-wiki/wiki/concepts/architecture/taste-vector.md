---
title: User taste vector v2
type: concept
tags: [taste-vector, embeddings, bootstrap, decay]
created: 2026-04-26
updated: 2026-04-26
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

Phase 3 ships **dynamic 4-band weights** by watched-grid selection count (deviates from strategy's static 0.40/0.40/0.20):

| Watched-grid selections | Service fingerprints | Watched grid | Genre selections |
|---|---|---|---|
| 0 | 0.55 | 0.00 | 0.45 |
| 1-4 | 0.40 | 0.40 | 0.20 |
| 5-12 | 0.30 | 0.55 | 0.15 |
| 13+ | 0.20 | 0.70 | 0.10 |

## Schema (post Phase 3)

`taste_profiles` columns: `taste_vector_v2 vector(1536)`, slider state columns, metadata. v1 columns dropped in migration 024 (`vector`, `confidence`, `seed_vector`, `quiz_completed`, `quiz_answers`, `interaction_log`, `version`).

## Conflict resolution applied

- Strategy says "weighted blend ... 0.40/0.40/0.20" as a baseline. Phase 3 ships dynamic 4-band weights. Phase summary records this; strategy §5.2 updated.
- Older docs treat detail view as weak positive. v2 corrects this to NOT positive (anchor only).
