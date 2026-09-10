# Phase 2 — Service Discrimination Evaluation Report

**Date:** 2026-09-10
**Services evaluated:** 18
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
| apple | 150 | 0.621941 | [-0.029060, 0.033872, -0.036356] |
| bbc | 150 | 0.579226 | [-0.032917, 0.037299, -0.028716] |
| channel4 | 150 | 0.593113 | [-0.029361, 0.038421, -0.030083] |
| crunchyroll | 56 | 0.679036 | [-0.018257, 0.034050, -0.034369] |
| curiosity | 1 | 1.000029 | [-0.040955, 0.018799, 0.008011] |
| discovery | 15 | 0.640987 | [-0.024188, 0.040800, -0.041467] |
| disney | 150 | 0.606047 | [-0.026137, 0.036909, -0.033627] |
| hbo | 150 | 0.584086 | [-0.029043, 0.043882, -0.032640] |
| hotstar | 38 | 0.647552 | [-0.032067, 0.023698, -0.028877] |
| itvx | 150 | 0.612279 | [-0.021009, 0.039269, -0.032239] |
| mubi | 55 | 0.628361 | [-0.024970, 0.044139, -0.037172] |
| netflix | 150 | 0.594285 | [-0.027134, 0.036920, -0.036940] |
| now | 150 | 0.587463 | [-0.028467, 0.035740, -0.036652] |
| paramount | 150 | 0.586436 | [-0.024165, 0.036821, -0.033991] |
| plutotv | 95 | 0.612726 | [-0.036782, 0.046432, -0.033280] |
| prime | 150 | 0.581825 | [-0.027020, 0.037695, -0.033403] |
| skygo | 150 | 0.594144 | [-0.026347, 0.039083, -0.032814] |
| zee5 | 25 | 0.650524 | [-0.037561, 0.034488, -0.034704] |

**L2 norms vary across services:** YES (std dev = 0.093055)
**First-3-dimension samples unique:** YES (18/18 unique)

### Anchor Assertion

BBC iPlayer × MUBI cosine: **0.8595**
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
| Max pairwise cosine | <= 0.92 | 0.9848 (disney × skygo) | FAIL |
| Mean pairwise cosine | <= 0.75 | 0.8085 | FAIL |

**Discrimination verdict: FAIL**

### Pairwise Cosine Similarity Matrix

| | apple | bbc | channel4 | crunchyroll | curiosity | discovery | disney | hbo | hotstar | itvx | mubi | netflix | now | paramount | plutotv | prime | skygo | zee5 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **apple** | 1.0000 | 0.9326 | 0.9329 | 0.7390 | 0.4828 | 0.7833 | 0.9078 | 0.9364 | 0.7290 | 0.9018 | 0.8563 | 0.9196 | 0.9414 | 0.9116 | 0.8981 | 0.9316 | 0.9099 | 0.7505 |
| **bbc** | 0.9326 | 1.0000 | 0.9591 | 0.7556 | 0.5255 | 0.8112 | 0.9376 | 0.9675 | 0.7565 | 0.9401 | 0.8595 | 0.9487 | 0.9473 | 0.9439 | 0.9186 | 0.9579 | 0.9582 | 0.7769 |
| **channel4** | 0.9329 | 0.9591 | 1.0000 | 0.7177 | 0.4903 | 0.8548 | 0.9541 | 0.9529 | 0.7123 | 0.9704 | 0.8561 | 0.9566 | 0.9753 | 0.9431 | 0.9105 | 0.9647 | 0.9613 | 0.7524 |
| **crunchyroll** | 0.7390 | 0.7556 | 0.7177 | 1.0000 | 0.3352 | 0.6075 | 0.7640 | 0.7674 | 0.6257 | 0.7366 | 0.6263 | 0.8245 | 0.7357 | 0.7711 | 0.6679 | 0.7870 | 0.7670 | 0.6210 |
| **curiosity** | 0.4828 | 0.5255 | 0.4903 | 0.3352 | 1.0000 | 0.4867 | 0.4516 | 0.5137 | 0.4523 | 0.4364 | 0.5028 | 0.4534 | 0.4970 | 0.4966 | 0.5415 | 0.4933 | 0.4819 | 0.4731 |
| **discovery** | 0.7833 | 0.8112 | 0.8548 | 0.6075 | 0.4867 | 1.0000 | 0.8527 | 0.8319 | 0.5730 | 0.8501 | 0.6688 | 0.8422 | 0.8635 | 0.8473 | 0.7542 | 0.8501 | 0.8512 | 0.6063 |
| **disney** | 0.9078 | 0.9376 | 0.9541 | 0.7640 | 0.4516 | 0.8527 | 1.0000 | 0.9554 | 0.6753 | 0.9542 | 0.7736 | 0.9804 | 0.9684 | 0.9687 | 0.8632 | 0.9756 | 0.9848 | 0.6918 |
| **hbo** | 0.9364 | 0.9675 | 0.9529 | 0.7674 | 0.5137 | 0.8319 | 0.9554 | 1.0000 | 0.7419 | 0.9252 | 0.8639 | 0.9630 | 0.9626 | 0.9625 | 0.9258 | 0.9756 | 0.9686 | 0.7530 |
| **hotstar** | 0.7290 | 0.7565 | 0.7123 | 0.6257 | 0.4523 | 0.5730 | 0.6753 | 0.7419 | 1.0000 | 0.6629 | 0.7403 | 0.7079 | 0.7067 | 0.7166 | 0.7702 | 0.7243 | 0.7090 | 0.9502 |
| **itvx** | 0.9018 | 0.9401 | 0.9704 | 0.7366 | 0.4364 | 0.8501 | 0.9542 | 0.9252 | 0.6629 | 1.0000 | 0.7732 | 0.9576 | 0.9573 | 0.9255 | 0.8434 | 0.9507 | 0.9540 | 0.6919 |
| **mubi** | 0.8563 | 0.8595 | 0.8561 | 0.6263 | 0.5028 | 0.6688 | 0.7736 | 0.8639 | 0.7403 | 0.7732 | 1.0000 | 0.7929 | 0.8271 | 0.8131 | 0.9307 | 0.8303 | 0.7959 | 0.7800 |
| **netflix** | 0.9196 | 0.9487 | 0.9566 | 0.8245 | 0.4534 | 0.8422 | 0.9804 | 0.9630 | 0.7079 | 0.9576 | 0.7929 | 1.0000 | 0.9684 | 0.9661 | 0.8693 | 0.9786 | 0.9830 | 0.7246 |
| **now** | 0.9414 | 0.9473 | 0.9753 | 0.7357 | 0.4970 | 0.8635 | 0.9684 | 0.9626 | 0.7067 | 0.9573 | 0.8271 | 0.9684 | 1.0000 | 0.9594 | 0.8975 | 0.9759 | 0.9771 | 0.7323 |
| **paramount** | 0.9116 | 0.9439 | 0.9431 | 0.7711 | 0.4966 | 0.8473 | 0.9687 | 0.9625 | 0.7166 | 0.9255 | 0.8131 | 0.9661 | 0.9594 | 1.0000 | 0.8949 | 0.9763 | 0.9727 | 0.7244 |
| **plutotv** | 0.8981 | 0.9186 | 0.9105 | 0.6679 | 0.5415 | 0.7542 | 0.8632 | 0.9258 | 0.7702 | 0.8434 | 0.9307 | 0.8693 | 0.8975 | 0.8949 | 1.0000 | 0.9106 | 0.8862 | 0.7981 |
| **prime** | 0.9316 | 0.9579 | 0.9647 | 0.7870 | 0.4933 | 0.8501 | 0.9756 | 0.9756 | 0.7243 | 0.9507 | 0.8303 | 0.9786 | 0.9759 | 0.9763 | 0.9106 | 1.0000 | 0.9807 | 0.7386 |
| **skygo** | 0.9099 | 0.9582 | 0.9613 | 0.7670 | 0.4819 | 0.8512 | 0.9848 | 0.9686 | 0.7090 | 0.9540 | 0.7959 | 0.9830 | 0.9771 | 0.9727 | 0.8862 | 0.9807 | 1.0000 | 0.7267 |
| **zee5** | 0.7505 | 0.7769 | 0.7524 | 0.6210 | 0.4731 | 0.6063 | 0.6918 | 0.7530 | 0.9502 | 0.6919 | 0.7800 | 0.7246 | 0.7323 | 0.7244 | 0.7981 | 0.7386 | 0.7267 | 1.0000 |

### Top 5 Most-Similar Pairs

1. **disney × skygo:** 0.9848
1. **netflix × skygo:** 0.9830
1. **prime × skygo:** 0.9807
1. **disney × netflix:** 0.9804
1. **netflix × prime:** 0.9786

### Bottom 5 Least-Similar Pairs

1. **crunchyroll × curiosity:** 0.3352
1. **curiosity × itvx:** 0.4364
1. **curiosity × disney:** 0.4516
1. **curiosity × hotstar:** 0.4523
1. **curiosity × netflix:** 0.4534

### Service Catalogue Sizes

| Service | Titles Used for Centroid |
|---------|------------------------|
| apple | 150 |
| bbc | 150 |
| channel4 | 150 |
| crunchyroll | 56 |
| curiosity | 1 ⚠️ LOW CONFIDENCE |
| discovery | 15 ⚠️ LOW CONFIDENCE |
| disney | 150 |
| hbo | 150 |
| hotstar | 38 ⚠️ LOW CONFIDENCE |
| itvx | 150 |
| mubi | 55 |
| netflix | 150 |
| now | 150 |
| paramount | 150 |
| plutotv | 95 |
| prime | 150 |
| skygo | 150 |
| zee5 | 25 ⚠️ LOW CONFIDENCE |

**Low-confidence services (< 50 titles):** curiosity, discovery, hotstar, zee5
These fingerprints may not be representative of the service's content personality.

### Summary Statistics

- **Total pairs evaluated:** 153
- **Mean pairwise cosine:** 0.8085
- **Max pairwise cosine:** 0.9848
- **Min pairwise cosine:** 0.3352
- **Std dev of cosines:** 0.1563

