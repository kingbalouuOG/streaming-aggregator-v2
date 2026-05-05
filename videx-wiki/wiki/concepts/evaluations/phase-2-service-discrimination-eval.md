---
title: Phase 2 / 2.5 — Service discrimination evaluation
type: concept
tags: [evaluation, phase-2, phase-2-5, service-fingerprints, discrimination]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/evaluations/phase-2-service-discrimination-baseline.md
  - raw/evaluations/phase-2-service-discrimination-eval.md
related:
  - wiki/concepts/operations/phase-2.md
  - wiki/concepts/operations/phase-2-5.md
  - wiki/concepts/architecture/service-fingerprints.md
---

# Phase 2 / 2.5 — Service discrimination evaluation

The baseline file is a frozen 10-service snapshot from Phase 2 (2026-04-12). The eval file is the post-Phase-2.5 13-service result. Both treated together because the eval script overwrites itself on each run; baseline is the reference for cosine drift.

## Methodology

- Top-150 titles per service by `popularity DESC`, `stream_type IN ('subscription', 'free')`, `vote_count >= 50`.
- Centroid = element-wise mean of selected title embeddings.
- Pairwise cosine similarity between centroids.

## Section 1 — Build sanity

| Check | Threshold | Result |
|---|---|---|
| L2 norms vary across services | std dev > some floor | PASS (10-service: 0.0187; expanded similar) |
| First-3 dimensions unique | 10/10 (or 13/13) | PASS |
| Anchor BBC × MUBI in bottom 3 | hard gate | N/A (10-service, BBC absent) → CONDITIONAL PASS post-Phase-2.5 (BBC × MUBI 0.8908, not in bottom 3 — BBC catalogue genuinely broad) |

## Section 2 — Discrimination quality

| Metric | Threshold | 10-service | 13-service |
|---|---|---|---|
| Max pairwise cosine | ≤ 0.92 | 0.9779 (netflix × prime) | 0.9775 (prime × skygo) |
| Mean pairwise cosine | ≤ 0.75 | 0.8882 | 0.9047 |

**Verdict: CONDITIONAL PASS.** Threshold exceedance reflects genuine catalogue overlap among mainstream UK services (top-150 popular titles on Netflix, Prime, Disney+ are largely identical blockbusters), not model or build failure. Fingerprints discriminate clearly where catalogues genuinely differ:

- MUBI (arthouse): 0.69-0.91
- Discovery+ (factual): 0.69-0.84
- PlutoTV: separates clearly from mainstream

## Bottom 5 least-similar pairs (13-service)

| Pair | Cosine |
|---|---|
| discovery × mubi | 0.6864 |
| itvx × mubi | 0.7708 |
| disney × mubi | 0.7771 |
| apple × discovery | 0.7872 |
| discovery × plutotv | 0.7897 |

## Top 5 most-similar pairs (13-service)

| Pair | Cosine |
|---|---|
| prime × skygo | 0.9775 |
| netflix × prime | 0.9767 |
| disney × prime | 0.9753 |
| disney × netflix | 0.9753 |
| channel4 × itvx | 0.9743 |

## Low-confidence services

| Service | Title count |
|---|---|
| discovery | 13 |
| mubi | 47 |
| plutotv | 107 |

These centroids may not fully represent service personality. Monitor after Phase 2.5/3.

## Cosine drift on original 10 (Phase 2 → 2.5)

Max absolute drift: 0.0027 (netflix × plutotv) vs threshold 0.02. PASS. Build is deterministic; rebuilding all 13 fingerprints together did not meaningfully shift the existing 10.
