---
title: Phase 2.5 — TMDb watch/providers backfill
type: concept
tags: [phase, phase-2-5, tmdb, backfill, bbc, now, skygo]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/phase-summaries/phase-2.5-summary.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/operations/phase-2.md
  - wiki/entities/apis/tmdb.md
  - wiki/entities/streaming-services/uk-services.md
---

# Phase 2.5 — TMDb watch/providers backfill

Branch: `phase-2.5-tmdb-provider-backfill`. Completed 2026-04-12. Backend only — no migration, no UI, no hook rewrites.

## Goal

Backfill `streaming_availability` with TMDb watch/providers data for BBC iPlayer, NOW TV, Sky Go (the three services absent or unusable from SA API), then rebuild fingerprints to cover all 13 services before Phase 3 cold-start wiring.

## Deliverables

- `scripts/fingerprints/preflight-tmdb-providers.ts` — WU-0 verifier of TMDb provider IDs against live API.
- `scripts/fingerprints/backfill-tmdb-providers.ts` — WU-1 discovery via TMDb `/discover`, inserts SA rows.
- `scripts/fingerprints/check-cosine-drift.ts` — WU-2 automated regression test.
- `docs/v2/phase-2-service-discrimination-baseline.md` — frozen 10-service baseline matrix.
- Updated `phase-2-service-discrimination-eval.md` (13 services).
- `refresh-service-fingerprints` Edge Function extended to run TMDb backfill before fingerprint recomputation (WU-3).

## Result

600 rows inserted into `streaming_availability` (200 each for BBC, NOW, SkyGo). All 13 services fingerprinted at title_count=150 except discovery (13), mubi (47), plutotv (107) which are catalogue-limited.

## Verification

| Metric | Threshold | Result | Status |
|---|---|---|---|
| Max pairwise cosine (13 services) | ≤ 0.92 | 0.9775 (prime × skygo) | CONDITIONAL PASS |
| Mean pairwise cosine | ≤ 0.75 | 0.9047 | CONDITIONAL PASS |
| Anchor BBC × MUBI in bottom 3 | hard gate | 0.8908, NOT in bottom 3 | CONDITIONAL PASS |
| Cosine drift on original 10 | < 0.02 | 0.0027 | PASS |
| `tsc --noEmit`, RLS, smoke test | — | PASS |

BBC × MUBI 0.8908 (vs hypothesis of "maximally dissimilar") reflects BBC iPlayer's genuinely broad catalogue: mainstream movies (Wolf of Wall Street, Prestige), US dramas (Suits, PLL), anime (Pokémon, Dragon Ball Super), children's (Bluey, Peppa). MUBI is not a Videx service so the pair has no user-facing impact. Provider ID 38 verified against live TMDb.

## Bottom 5 least-similar pairs (post-2.5)

| Pair | Cosine |
|---|---|
| discovery × mubi | 0.6864 |
| itvx × mubi | 0.7708 |
| disney × mubi | 0.7771 |
| apple × discovery | 0.7872 |
| discovery × plutotv | 0.7897 |

## Deviations

1. BBC × MUBI conditional pass accepted as catalogue characteristic, not build error.
2. Phase 2 baseline file created as frozen snapshot (eval script overwrites the eval report on each run).
3. NOW dual classification: 591 existing SA `addon` rows untouched; 200 new TMDb-sourced `subscription` rows alongside. Filed as parking-lot follow-up.

## Parking lot

- IN-250: ✅ DONE.
- NOW dual-classification follow-up: NEW.
- Fingerprint manual tuning option: NEW (park until Phase 3 cold-start testing reveals need).
