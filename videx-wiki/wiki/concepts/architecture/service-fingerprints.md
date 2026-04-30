---
title: Service fingerprints
type: concept
tags: [service-fingerprints, cold-start, centroid, pillar-3]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/phase-summaries/phase-2-summary.md
  - raw/phase-summaries/phase-2.5-summary.md
  - raw/phase-summaries/phase-2.6-summary.md
related:
  - wiki/concepts/architecture/cold-start.md
  - wiki/concepts/architecture/taste-vector.md
  - wiki/concepts/evaluations/phase-2-service-discrimination-eval.md
  - wiki/concepts/evaluations/phase-2-6-decision.md
  - wiki/entities/codebase/migrations.md
---

# Service fingerprints

Pre-computed per-service taste centroids in the 1536D embedding space. Used for cold-start service-bias modelling (Pillar 3 of strategy).

## Storage

`service_fingerprints` table (migration 020), composite PK on `(service_id, region, variant)` after migration 022.

| Column | Notes |
|---|---|
| `service_id` | One of the 10 UK service slugs. |
| `variant` | Currently `'v1_popularity'`. `v2_exclusivity` was tested in Phase 2.6 and rejected. |
| `centroid` | `vector(1536)`. |
| `title_count` | CHECK `title_count > 0 AND title_count = array_length(source_title_ids, 1)`. |
| `source_title_ids` | Array of TMDb IDs in the centroid. |

RLS: authenticated SELECT, service_role write. No anon (onboarding Step 2 happens after Step 1 sign-up).

## Build method (`v1_popularity`, shipped)

- Top-150 titles per service by `popularity DESC`.
- Filter: `stream_type IN ('subscription', 'free')`, `vote_count >= 50` (noise filter).
- Centroid = element-wise mean of selected title embeddings.
- Computed by `scripts/fingerprints/build-service-fingerprints.ts` and refreshed weekly via `refresh-service-fingerprints` Edge Function (Sunday 07:00 UTC).

`v2_exclusivity` variant tested in Phase 2.6 with `weight_i = 1/N_services`. Failed bottom-half variance gate (5/13 services improved, gate ≥ 8). See [phase-2-6-decision](../evaluations/phase-2-6-decision.md).

## Coverage

13 services fingerprinted post-Phase 2.5: apple, bbc, channel4, discovery, disney, itvx, mubi, netflix, now, paramount, plutotv, prime, skygo.

Low-confidence (< 50 titles): discovery (13), mubi (47).

BBC/NOW/SkyGo absent from SA API; backfilled via TMDb watch/providers (200 SA rows each, all subscription) in Phase 2.5.

## Cold-start use

When a user selects services during onboarding Step 2, fingerprints are blended (weighted by reported usage if available, equally if not) to form a Bayesian prior on the user's taste vector — the day-zero representation before any onboarding signal.

## Discrimination quality

| Metric | Threshold | 13-service result | Status |
|---|---|---|---|
| Max pairwise cosine | ≤ 0.92 | 0.9775 (prime × skygo) | CONDITIONAL PASS |
| Mean pairwise cosine | ≤ 0.75 | 0.9047 | CONDITIONAL PASS |
| Cosine drift on original 10 (Phase 2 → 2.5) | < 0.02 | 0.0027 | PASS |

Threshold exceedance reflects genuine catalogue overlap among mainstream UK services (top-150 popular titles on Netflix/Prime/Disney+ are largely identical). Fingerprints discriminate clearly where catalogues genuinely differ (MUBI 0.69-0.91, Discovery+ 0.69-0.84, PlutoTV).

BBC × MUBI 0.8908 (NOT in bottom 3) reflects BBC iPlayer's genuinely broad catalogue (mainstream movies, US dramas, anime, children's content alongside BBC originals), not a build error. MUBI not a Videx service so the pair has no user-facing impact.
