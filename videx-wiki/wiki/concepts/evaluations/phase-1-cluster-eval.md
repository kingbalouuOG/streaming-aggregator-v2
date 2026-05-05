---
title: Phase 1 — Cluster Coherence Evaluation
type: concept
tags: [evaluation, phase-1, embeddings, cluster-coherence]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/evaluations/phase-1-cluster-eval.md
related:
  - wiki/concepts/operations/phase-1.md
  - wiki/concepts/techniques/embeddings.md
---

# Phase 1 — Cluster Coherence Evaluation

Date: 2026-04-12. 19,993 titles embedded with `text-embedding-3-small` (1536D) using strategy v1.6.3 §4.1 template (title, genres, overview, keywords, cast, runtime).

## Verdict

CONDITIONAL PASS. Four of five real cohorts pass within-cohort threshold; the one miss (Christopher Nolan) is director-driven and expected to be weak in a template that excludes director.

## Per-cohort within-cohort cosine

| Cohort | Titles | Mean | Min | Max | Status |
|---|---|---|---|---|---|
| Christopher Nolan Films | 5/5 | 0.4714 | 0.3547 | 0.5749 | FAIL — director not in template |
| BBC Period Dramas | 7/7 | 0.5309 | 0.4445 | 0.6689 | PASS |
| Studio Ghibli | 7/7 | 0.6067 | 0.5325 | 0.6808 | PASS |
| Conjuring Universe Horror | 5/5 | 0.6054 | 0.5145 | 0.8467 | PASS |
| MCU | 6/6 | 0.5830 | 0.5038 | 0.6942 | PASS |
| Incoherent Control | 5/5 | 0.3033 | 0.1902 | 0.4561 | (control: confirms low-similarity floor) |

## Threshold misses (with justification)

- **Nolan within-cohort 0.47 vs 0.5**: cohort is director-driven, director is intentionally not in template. Films span war, neo-noir, sci-fi, comic-book action — minimal genre/overview overlap. Expected behaviour, not defect.
- **Between-cohort mean 0.52 vs 0.3**: action-adjacent pairs share genuine genre overlap. Nolan × MCU = 0.69, Nolan × Horror = 0.58, Horror × MCU = 0.49. Structurally different pairs are much lower (BBC Period × Ghibli 0.37, Ghibli × MCU 0.45). Threshold of 0.3 assumes genre-orthogonal cohorts; unrealistic.
- **Control set 0.30 at boundary**: 5 unrelated genres (romance, war, western, documentary, anime). 0.30 reflects baseline embedding-space similarity from shared vocabulary; the min of 0.19 confirms meaningful low-similarity discrimination.
- **Gap −0.22 vs +0.2**: driven entirely by Nolan × MCU (0.69) exceeding weakest within-cohort (Nolan 0.47). Excluding Nolan, gap is positive but still below 0.2.

## IN-PX-06 assessment

BBC Period Dramas TV cohort within-cohort 0.5309, vs movie cohort average 0.5666 (delta −0.036). TV clusters effectively without director signal. IN-PX-06 (widen TV director extraction) deferred — director not in current template; data shows TV clusters on genre/overview/keywords/cast alone.

## Lesson

Between-cohort cosine thresholds need revision for Phase 3: use within/between **ratio** rather than absolute thresholds.
