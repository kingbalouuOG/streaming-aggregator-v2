---
title: Evaluation Harness Reference
generated: 2026-04-26
sources: [scripts/evaluation/rank-eval.ts, scripts/embeddings/eval-cluster-coherence.ts, docs/v2/phase-1-cluster-eval.md, docs/v2/phase-2-service-discrimination-*.md]
---

# Evaluation Harness Reference

The evaluation tooling that gates phase boundaries. Run before promoting any change that touches embeddings, scoring, or recommendation rows.

## Cluster Coherence Eval

**Script:** `scripts/embeddings/eval-cluster-coherence.ts`.

**What it does:** measures whether the embedding template produces sensible clusters by checking cohorts of titles known to be related.

### Cohorts (Phase 1)

- Christopher Nolan Films
- BBC Period Dramas
- Studio Ghibli
- Conjuring Universe Horror
- MCU
- Incoherent Control (random titles, should NOT cluster)

### Metrics

| Metric | Threshold | Meaning |
|---|---|---|
| Within-cohort mean cosine | ≥ 0.5 | Titles in the same cohort should be close. |
| Between-cohort baseline | ≤ 0.3 | Titles in different cohorts should be far. |
| Gap (min within - max between) | ≥ 0.2 | Cohorts should be separable. |
| Control set mean cosine | ≤ 0.3 | Random titles should not be close. |

### Phase 1 result (2026-04-12)

CONDITIONAL PASS: 4/5 cohorts passed; Christopher Nolan Films cohort had 0.4714 mean (below 0.5 threshold). Control set marginally too tight at 0.3033. Acceptable for proceeding because the Nolan cohort spans genres widely and the template is genre-weighted.

## Service Discrimination Eval

**Script(s):** `scripts/evaluation/service-discrimination-baseline.ts` and `service-discrimination.ts`.

**What it does:** measures whether `service_fingerprints` discriminate between services. A user with strong signal toward Netflix titles should rank Netflix titles higher than Disney+ titles, all else equal.

### Phase 2 baseline result

See `docs/v2/phase-2-service-discrimination-baseline.md`. Documented baseline ranking precision per service.

### Phase 2.6 variant result

See `docs/v2/phase-2-6-decision.md`. Variants tested and locked.

## Rank-Eval Harness

**Script:** `scripts/evaluation/rank-eval.ts`.

**What it does:** runs the full ranking pipeline against synthetic users built from `p2-1-sessions.csv` and `p2-1-vectors.csv`. Reports nDCG@10, recall@k, novelty, diversity per row.

### Inputs

- Synthetic user vectors: `p2-1-vectors.csv`.
- Ground-truth interactions per session: `p2-1-sessions.csv`.

### Outputs

- Per-user nDCG@10.
- Per-row diversity score (genre spread, service spread).
- Tail-cumulative novelty (how often the pipeline surfaces titles outside top-popularity).

### Thresholds (current)

These should evolve with phase work; the values that gate any release are in the script header.

| Metric | Threshold |
|---|---|
| Mean nDCG@10 | ≥ 0.30 |
| Mean genre spread per row | ≥ 0.6 |
| Mean service spread per row | ≥ 0.5 |
| Mean novelty | ≥ 0.2 |

## When to run each

| Trigger | Eval(s) |
|---|---|
| Embedding template change | Cluster Coherence |
| Service fingerprint refresh / variant change | Service Discrimination |
| Ranking weight change | rank-eval |
| New row builder added | rank-eval |
| Slider mapping change | rank-eval |
| Pre-release of any phase touching the engine | All three |

## Output conventions

All evals write a markdown report to `docs/v2/`. Naming convention: `phase-{N}-{eval-name}.md`. The report includes parameters, metrics, pass/fail per threshold, and qualitative notes.
