---
title: Phase 2.6 — Fingerprint signal refinement (variant evaluation)
type: concept
tags: [phase, phase-2-6, evaluation, fingerprints, exclusivity-weighting]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/phase-summaries/phase-2.6-summary.md
  - raw/phase-summaries/phase-2-6-decision.md
  - raw/phase-summaries/phase-2-6-variance-eval.md
  - raw/evaluations/phase-2-6-decision.md
  - raw/evaluations/phase-2-6-variance-eval.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/architecture/service-fingerprints.md
  - wiki/concepts/evaluations/phase-2-6-decision.md
  - wiki/concepts/evaluations/phase-2-6-variance-eval.md
  - wiki/entities/codebase/migrations.md
  - wiki/entities/codebase/rpcs.md
---

# Phase 2.6 — Fingerprint signal refinement

Branch: `phase-2.6-fingerprint-signal-refinement`. Completed 2026-04-13. Backend only, evaluation phase. No production behaviour changes.

## Goal

Decide whether exclusivity-weighted centroids (v2) produce sharper service discrimination than popularity-ranked arithmetic means (v1).

## Outcome

**Gate failure, phase success. Ship v1_popularity. Do not ship v2_exclusivity.**

## Work units

| WU | Description | Result |
|---|---|---|
| WU-0 | Migration 022 (variant column + RPC) | PASS — applied, Edge Function redeployed |
| WU-1 | Build v2_exclusivity centroids | PASS — 13 services, deterministic |
| WU-2 | Bottom-half variance eval | FAIL — 5/13 services improved (gate ≥ 8) |
| WU-3 | Synthetic cold-start harness | SKIPPED — early-exit, gate failed decisively |
| WU-4 | Decision report | Ship v1_popularity |

## Key finding

Exclusivity weighting is not a universal signal-sharpener.

- **Improved (5)**: apple, bbc, mubi, plutotv, skygo — already had differentiated catalogues; exclusivity amplified.
- **Degraded (8)**: channel4, discovery, disney, itvx, netflix, now, paramount, prime — mainstream services. Downweighting shared blockbusters didn't reveal a hidden distinctive core; over-weighted near-arbitrary "exclusive" titles at the top-150 boundary.

Mean v1 variance 0.002298, mean v2 variance 0.002284, mean delta −0.000014 (statistical noise).

## Phase 3 inheritance

- **`match_titles_by_vector` RPC** built in 022. Permanent — Stage 1 retrieval. Do not delete.
- **`variant` column** retained. Cheap, useful for future experiments without migration.
- **`computeWeightedCentroid`** retained in `centroidMath.ts`.
- **`--variant=exclusivity` build flag** retained for re-runnable experiments.
- **v2_exclusivity rows deleted** post-decision.

Phase 3 hooks read `variant = 'v1_popularity'` from `service_fingerprints`.

## Parking-lot updates

- IN-260 (exclusivity weighting): ✅ Discharged — tested, didn't work. Do not re-propose without new information.
- IN-261 (curation-based refinement): ⏳ Parked. Revisit if Phase 3 cold-start underperforms for mainstream users.
- BBC characterisation in strategy §4.4 → revise to reflect broad mainstream-leaning reality (Joe handling separately).
