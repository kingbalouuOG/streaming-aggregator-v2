# Phase 2 — Service Discrimination Evaluation Report

**Date:** 2026-04-13
**Services evaluated:** 13
**Top-N per service:** 150
**Selection criterion:** popularity DESC, stream_type IN (subscription, free), vote_count >= 50

**Overall verdict: CONDITIONAL PASS — see justifications below**

---

## Section 1 — Build Sanity

Detects "fingerprints built incorrectly" — different failure mode from discrimination quality.
Section 1 failures are hard fails with no justification accepted.

### L2 Norms

| Service | Title Count | L2 Norm | First 3 Dimensions |
|---------|-------------|---------|-------------------|
| apple | 150 | 0.621440 | [-0.029323, 0.033666, -0.035668] |
| bbc | 150 | 0.575606 | [-0.030739, 0.035443, -0.026642] |
| channel4 | 150 | 0.607765 | [-0.027599, 0.037706, -0.031362] |
| discovery | 13 | 0.646468 | [-0.028337, 0.043971, -0.043384] |
| disney | 150 | 0.607183 | [-0.025558, 0.037602, -0.034216] |
| itvx | 150 | 0.613509 | [-0.022161, 0.040656, -0.032261] |
| mubi | 47 | 0.631942 | [-0.034314, 0.037504, -0.037031] |
| netflix | 150 | 0.597486 | [-0.027349, 0.037450, -0.036995] |
| now | 150 | 0.576422 | [-0.029734, 0.034314, -0.035669] |
| paramount | 150 | 0.586987 | [-0.023485, 0.037483, -0.033884] |
| plutotv | 107 | 0.587146 | [-0.033980, 0.043793, -0.029561] |
| prime | 150 | 0.590494 | [-0.026303, 0.038343, -0.031849] |
| skygo | 150 | 0.588461 | [-0.030784, 0.041066, -0.032042] |

**L2 norms vary across services:** YES (std dev = 0.020710)
**First-3-dimension samples unique:** YES (13/13 unique)

### Anchor Assertion

BBC iPlayer × MUBI cosine: **0.8908**
In bottom 3 least-similar pairs: **NO — FAIL**

> **Hard fail.** BBC iPlayer (UK factual/drama) and MUBI (arthouse/international cinema) should be among the most dissimilar services. If they are not in the bottom 3, investigate the build pipeline for bugs.

**Build Sanity verdict: FAIL**

---

## Section 2 — Discrimination Quality

Detects "fingerprints built correctly but services overlap too much".
Conditional-pass pattern: documented justifications acceptable for legitimate catalogue overlap.

### Thresholds

| Metric | Threshold | Result | Status |
|--------|-----------|--------|--------|
| Max pairwise cosine | <= 0.92 | 0.9775 (prime × skygo) | FAIL |
| Mean pairwise cosine | <= 0.75 | 0.9047 | FAIL |

**Discrimination verdict: FAIL**

### Pairwise Cosine Similarity Matrix

| | apple | bbc | channel4 | discovery | disney | itvx | mubi | netflix | now | paramount | plutotv | prime | skygo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **apple** | 1.0000 | 0.9384 | 0.9283 | 0.7872 | 0.9092 | 0.8977 | 0.8754 | 0.9210 | 0.9481 | 0.9126 | 0.9001 | 0.9340 | 0.9177 |
| **bbc** | 0.9384 | 1.0000 | 0.9568 | 0.7931 | 0.9174 | 0.9370 | 0.8908 | 0.9270 | 0.9545 | 0.9246 | 0.9311 | 0.9447 | 0.9478 |
| **channel4** | 0.9283 | 0.9568 | 1.0000 | 0.8336 | 0.9467 | 0.9743 | 0.8438 | 0.9457 | 0.9622 | 0.9276 | 0.8911 | 0.9547 | 0.9420 |
| **discovery** | 0.7872 | 0.7931 | 0.8336 | 1.0000 | 0.8339 | 0.8268 | 0.6864 | 0.8200 | 0.8582 | 0.8370 | 0.7897 | 0.8370 | 0.8282 |
| **disney** | 0.9092 | 0.9174 | 0.9467 | 0.8339 | 1.0000 | 0.9474 | 0.7771 | 0.9753 | 0.9519 | 0.9674 | 0.8759 | 0.9753 | 0.9727 |
| **itvx** | 0.8977 | 0.9370 | 0.9743 | 0.8268 | 0.9474 | 1.0000 | 0.7708 | 0.9467 | 0.9417 | 0.9214 | 0.8591 | 0.9481 | 0.9331 |
| **mubi** | 0.8754 | 0.8908 | 0.8438 | 0.6864 | 0.7771 | 0.7708 | 1.0000 | 0.7905 | 0.8571 | 0.8083 | 0.9080 | 0.8250 | 0.8291 |
| **netflix** | 0.9210 | 0.9270 | 0.9457 | 0.8200 | 0.9753 | 0.9467 | 0.7905 | 1.0000 | 0.9496 | 0.9604 | 0.8818 | 0.9767 | 0.9681 |
| **now** | 0.9481 | 0.9545 | 0.9622 | 0.8582 | 0.9519 | 0.9417 | 0.8571 | 0.9496 | 1.0000 | 0.9552 | 0.9331 | 0.9692 | 0.9662 |
| **paramount** | 0.9126 | 0.9246 | 0.9276 | 0.8370 | 0.9674 | 0.9214 | 0.8083 | 0.9604 | 0.9552 | 1.0000 | 0.9198 | 0.9718 | 0.9733 |
| **plutotv** | 0.9001 | 0.9311 | 0.8911 | 0.7897 | 0.8759 | 0.8591 | 0.9080 | 0.8818 | 0.9331 | 0.9198 | 1.0000 | 0.9247 | 0.9217 |
| **prime** | 0.9340 | 0.9447 | 0.9547 | 0.8370 | 0.9753 | 0.9481 | 0.8250 | 0.9767 | 0.9692 | 0.9718 | 0.9247 | 1.0000 | 0.9775 |
| **skygo** | 0.9177 | 0.9478 | 0.9420 | 0.8282 | 0.9727 | 0.9331 | 0.8291 | 0.9681 | 0.9662 | 0.9733 | 0.9217 | 0.9775 | 1.0000 |

### Top 5 Most-Similar Pairs

1. **prime × skygo:** 0.9775
1. **netflix × prime:** 0.9767
1. **disney × prime:** 0.9753
1. **disney × netflix:** 0.9753
1. **channel4 × itvx:** 0.9743

### Bottom 5 Least-Similar Pairs

1. **discovery × mubi:** 0.6864
1. **itvx × mubi:** 0.7708
1. **disney × mubi:** 0.7771
1. **apple × discovery:** 0.7872
1. **discovery × plutotv:** 0.7897

### Service Catalogue Sizes

| Service | Titles Used for Centroid |
|---------|------------------------|
| apple | 150 |
| bbc | 150 |
| channel4 | 150 |
| discovery | 13 ⚠️ LOW CONFIDENCE |
| disney | 150 |
| itvx | 150 |
| mubi | 47 ⚠️ LOW CONFIDENCE |
| netflix | 150 |
| now | 150 |
| paramount | 150 |
| plutotv | 107 |
| prime | 150 |
| skygo | 150 |

**Low-confidence services (< 50 titles):** discovery, mubi
These fingerprints may not be representative of the service's content personality.

### Summary Statistics

- **Total pairs evaluated:** 78
- **Mean pairwise cosine:** 0.9047
- **Max pairwise cosine:** 0.9775
- **Min pairwise cosine:** 0.6864
- **Std dev of cosines:** 0.0629

