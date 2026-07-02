---
title: Evaluation harness reference
type: concept
tags: [evaluation, harness, ndcg, cluster-coherence, service-discrimination, rank-eval]
created: 2026-04-26
updated: 2026-07-01
sources:
  - raw/reference/eval-harness-reference.md
related:
  - wiki/concepts/evaluations/phase-1-cluster-eval.md
  - wiki/concepts/evaluations/phase-2-service-discrimination-eval.md
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/operations/embedding-backfill.md
  - wiki/concepts/architecture/recommendation-pipeline.md
---

# Evaluation harness reference

The evaluation tooling that gates phase boundaries. Run before promoting any change that touches embeddings, scoring, or recommendation rows.

## Cluster coherence eval

**Script**: `scripts/embeddings/eval-cluster-coherence.ts`. Measures whether the embedding template produces sensible clusters across known cohorts.

Cohorts (Phase 1): Christopher Nolan, BBC Period Dramas, Studio Ghibli, Conjuring Universe Horror, MCU, Incoherent Control.

Metrics:

| Metric | Threshold |
|---|---|
| Within-cohort mean cosine | ≥ 0.5 |
| Between-cohort baseline | ≤ 0.3 |
| Gap (min within − max between) | ≥ 0.2 |
| Control set mean cosine | ≤ 0.3 |

Phase 1 result: conditional pass. See [phase-1-cluster-eval](../evaluations/phase-1-cluster-eval.md).

## Service discrimination eval

**Scripts**: `scripts/fingerprints/eval-service-discrimination.ts` and `eval-bottom-half-variance.ts`. Measures whether `service_fingerprints` discriminate.

Phase 2 baseline: 10-service. Phase 2.5: 13-service. Phase 2.6: variant evaluation. See [phase-2-service-discrimination-eval](../evaluations/phase-2-service-discrimination-eval.md), [phase-2-6-decision](../evaluations/phase-2-6-decision.md), [phase-2-6-variance-eval](../evaluations/phase-2-6-variance-eval.md).

## Rank-eval harness

**Script**: `scripts/evaluation/rank-eval.ts` (Phase 4). Standalone Node script. Accepts `--user-id <uuid>`, fetches taste vector + sliders + interactions, runs the full pipeline, outputs scored top-50 with per-component breakdowns + row assignments + diversity metrics.

Inputs (per source): synthetic user vectors `p2-1-vectors.csv`, ground-truth interactions `p2-1-sessions.csv`.

Outputs: per-user nDCG@10, per-row diversity (genre spread, service spread), tail-cumulative novelty.

Thresholds (per source; values that gate any release are in script header):

| Metric | Threshold |
|---|---|
| Mean nDCG@10 | ≥ 0.30 |
| Mean genre spread per row | ≥ 0.6 |
| Mean service spread per row | ≥ 0.5 |
| Mean novelty | ≥ 0.2 |

## ENG-1 eval harness

**Script**: `scripts/evaluation/eng1-eval.ts` (`npm run eval:eng1`, Phase ENG-1). Self-contained: in-memory centroids via the production pure modules + live `match_titles_by_vector` RPC. Sections: τ-matrix (pairwise cluster-rep cosines), synthetic recall/coverage, γ sweep for the avoid-set penalty, real-profile checks. Cold-HNSW warmup + retry built in. ENG-1 outcomes: coverage PASS, parity PASS, τ = 0.80 and γ = 0.15 confirmed; recall@500 carried forward (synthetic holdout too small). Report: `docs/v2/phase-summaries/eng1-eval-2026-06-10.md`.

> ⚠ **Scope gap — the harness does NOT gate the exploration *slot* (count/position).** It imports the retrieval constants (`PER_CENTROID_CANDIDATE_LIMIT`, `DEFAULT_CANDIDATE_LIMIT`, `AVOID_PENALTY_GAMMA`) but not `EXPLORATION_COUNT` / `EXPLORATION_SLOT_POSITIONS`. So the "exploration change → eng1-eval" trigger below only covers exploration *selection*/retrieval quality; changing how many exploration cards show or where is retrieval-neutral and passes unchanged. The real signal for slot composition is **live exploration CTR** (ENG-2, read from `card_impressions.metadata`) — there is no offline gate for it.

**Run 3 (2026-07-01)** — regression check for the content-freshness pass's `weights.ts` edit (`EXPLORATION_COUNT` 2→3, positions `[5,13]`→`[2,5,13]`). All sections identical to runs 1–2 (deterministic harness): τ=0.80 → 0 merges, coverage 3 (PASS), γ=0.15 suppression 2→0 positives Δ0 (PASS). Confirms the freshness pass is retrieval-neutral. Report: `docs/v2/phase-summaries/content-freshness-2026-07-01.md`.

## When to run each

| Trigger | Eval(s) |
|---|---|
| Embedding template change | Cluster Coherence |
| Service fingerprint refresh / variant change | Service Discrimination |
| Ranking weight change | rank-eval |
| New row builder added | rank-eval |
| Slider mapping change | rank-eval |
| Multi-interest grouping / avoid-set / exploration change | eng1-eval |
| Pre-release of any phase touching the engine | All of the above |

## Output convention

Markdown report to `docs/v2/phase-summaries/` (eval and baseline reports were consolidated there from the `docs/v2/` root in REPO-1, 2026-06-10). Naming: `phase-{N}-{eval-name}.md`. Include parameters, metrics, pass/fail per threshold, qualitative notes.
