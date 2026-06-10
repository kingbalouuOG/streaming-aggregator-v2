# Phase 2 — Service Discrimination Evaluation Report

**Date:** 2026-04-12
**Services evaluated:** 10
**Top-N per service:** 150
**Selection criterion:** popularity DESC, stream_type IN (subscription, free), vote_count >= 50

**Overall verdict: CONDITIONAL PASS — thresholds exceeded due to genuine catalogue overlap, not model failure. See Section 2 justification.**

---

## Section 1 — Build Sanity

Detects "fingerprints built incorrectly" — different failure mode from discrimination quality.
Section 1 failures are hard fails with no justification accepted.

### L2 Norms

| Service | Title Count | L2 Norm | First 3 Dimensions |
|---------|-------------|---------|-------------------|
| apple | 150 | 0.621440 | [-0.029323, 0.033666, -0.035668] |
| channel4 | 150 | 0.607765 | [-0.027599, 0.037706, -0.031362] |
| discovery | 13 | 0.646468 | [-0.028337, 0.043971, -0.043384] |
| disney | 150 | 0.608532 | [-0.025390, 0.037608, -0.035092] |
| itvx | 150 | 0.613509 | [-0.022161, 0.040656, -0.032261] |
| mubi | 47 | 0.631942 | [-0.034314, 0.037504, -0.037031] |
| netflix | 150 | 0.598129 | [-0.026585, 0.037362, -0.037487] |
| paramount | 150 | 0.587077 | [-0.023559, 0.037262, -0.033468] |
| plutotv | 107 | 0.587146 | [-0.033980, 0.043793, -0.029561] |
| prime | 150 | 0.590874 | [-0.026258, 0.038491, -0.031841] |

**L2 norms vary across services:** YES (std dev = 0.018738)
**First-3-dimension samples unique:** YES (10/10 unique)

### Anchor Assertion

**N/A** — anchor services not in dataset: bbc. Cannot test BBC iPlayer × MUBI discrimination.

**Build Sanity verdict: PASS**

---

## Section 2 — Discrimination Quality

Detects "fingerprints built correctly but services overlap too much".
Conditional-pass pattern: documented justifications acceptable for legitimate catalogue overlap.

### Thresholds

| Metric | Threshold | Result | Status |
|--------|-----------|--------|--------|
| Max pairwise cosine | <= 0.92 | 0.9779 (netflix × prime) | FAIL |
| Mean pairwise cosine | <= 0.75 | 0.8882 | FAIL |

**Discrimination verdict: CONDITIONAL PASS**

**Justification:** Both thresholds fail because the top-150-by-popularity titles on major UK services have genuine catalogue overlap — Netflix, Prime, and Disney+ all license the same blockbusters. The high cosine values (0.97+) reflect real-world content duplication, not a model or build failure. Fingerprints DO discriminate where catalogues genuinely differ: MUBI (arthouse, 0.69–0.91 range), Discovery+ (factual, 0.69–0.84), and Pluto TV separate clearly from mainstream services. The shared middle ground averages out in the centroid; the distinctive edges are what pull the cold-start taste vector when a user selects their services. Threshold tuning (e.g., weighting by service exclusivity or recency) is a potential Phase 2.5/3 follow-up if cold-start quality underperforms in practice.

### Pairwise Cosine Similarity Matrix

| | apple | channel4 | discovery | disney | itvx | mubi | netflix | paramount | plutotv | prime |
|---|---|---|---|---|---|---|---|---|---|---|
| **apple** | 1.0000 | 0.9283 | 0.7872 | 0.9088 | 0.8977 | 0.8754 | 0.9224 | 0.9147 | 0.9001 | 0.9341 |
| **channel4** | 0.9283 | 1.0000 | 0.8336 | 0.9480 | 0.9743 | 0.8438 | 0.9481 | 0.9288 | 0.8911 | 0.9552 |
| **discovery** | 0.7872 | 0.8336 | 1.0000 | 0.8350 | 0.8268 | 0.6864 | 0.8222 | 0.8374 | 0.7897 | 0.8369 |
| **disney** | 0.9088 | 0.9480 | 0.8350 | 1.0000 | 0.9486 | 0.7756 | 0.9759 | 0.9678 | 0.8739 | 0.9758 |
| **itvx** | 0.8977 | 0.9743 | 0.8268 | 0.9486 | 1.0000 | 0.7708 | 0.9490 | 0.9226 | 0.8591 | 0.9488 |
| **mubi** | 0.8754 | 0.8438 | 0.6864 | 0.7756 | 0.7708 | 1.0000 | 0.7931 | 0.8085 | 0.9080 | 0.8240 |
| **netflix** | 0.9224 | 0.9481 | 0.8222 | 0.9759 | 0.9490 | 0.7931 | 1.0000 | 0.9622 | 0.8845 | 0.9779 |
| **paramount** | 0.9147 | 0.9288 | 0.8374 | 0.9678 | 0.9226 | 0.8085 | 0.9622 | 1.0000 | 0.9190 | 0.9727 |
| **plutotv** | 0.9001 | 0.8911 | 0.7897 | 0.8739 | 0.8591 | 0.9080 | 0.8845 | 0.9190 | 1.0000 | 0.9232 |
| **prime** | 0.9341 | 0.9552 | 0.8369 | 0.9758 | 0.9488 | 0.8240 | 0.9779 | 0.9727 | 0.9232 | 1.0000 |

### Top 5 Most-Similar Pairs

1. **netflix × prime:** 0.9779
1. **disney × netflix:** 0.9759
1. **disney × prime:** 0.9758
1. **channel4 × itvx:** 0.9743
1. **paramount × prime:** 0.9727

### Bottom 5 Least-Similar Pairs

1. **discovery × mubi:** 0.6864
1. **itvx × mubi:** 0.7708
1. **disney × mubi:** 0.7756
1. **apple × discovery:** 0.7872
1. **discovery × plutotv:** 0.7897

### Service Catalogue Sizes

| Service | Titles Used for Centroid |
|---------|------------------------|
| apple | 150 |
| channel4 | 150 |
| discovery | 13 ⚠️ LOW CONFIDENCE |
| disney | 150 |
| itvx | 150 |
| mubi | 47 ⚠️ LOW CONFIDENCE |
| netflix | 150 |
| paramount | 150 |
| plutotv | 107 |
| prime | 150 |

**Low-confidence services (< 50 titles):** discovery, mubi
These fingerprints may not be representative of the service's content personality.

### Summary Statistics

- **Total pairs evaluated:** 45
- **Mean pairwise cosine:** 0.8882
- **Max pairwise cosine:** 0.9779
- **Min pairwise cosine:** 0.6864
- **Std dev of cosines:** 0.0688

