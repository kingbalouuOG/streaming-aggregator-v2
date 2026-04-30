---
title: Source — Evaluations (collected)
type: source
tags: [evaluations, eval-reports]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/evaluations/phase-1-cluster-eval.md
  - raw/evaluations/phase-1-wire-format-spike.md
  - raw/evaluations/phase-2-service-discrimination-baseline.md
  - raw/evaluations/phase-2-service-discrimination-eval.md
  - raw/evaluations/phase-2-6-decision.md
  - raw/evaluations/phase-2-6-variance-eval.md
related:
  - wiki/concepts/evaluations/phase-1-cluster-eval.md
  - wiki/concepts/evaluations/phase-1-wire-format-spike.md
  - wiki/concepts/evaluations/phase-2-service-discrimination-eval.md
  - wiki/concepts/evaluations/phase-2-6-decision.md
  - wiki/concepts/evaluations/phase-2-6-variance-eval.md
---

# Source: Evaluations (collected)

Eval reports under `raw/evaluations/`. These are the formal evidence behind phase decisions.

## Files

| Raw | Wiki concept page | Notes |
|---|---|---|
| `phase-1-cluster-eval.md` | [phase-1-cluster-eval](../concepts/evaluations/phase-1-cluster-eval.md) | Cluster coherence test against 5 real cohorts + 1 control. |
| `phase-1-wire-format-spike.md` | [phase-1-wire-format-spike](../concepts/evaluations/phase-1-wire-format-spike.md) | pgvector → Supabase JS client wire format finding. Locks `JSON.parse(row.embedding as string)`. |
| `phase-2-service-discrimination-baseline.md` | [phase-2-service-discrimination-eval](../concepts/evaluations/phase-2-service-discrimination-eval.md) | Phase 2 frozen 10-service baseline (drift reference). |
| `phase-2-service-discrimination-eval.md` | (same page) | Phase 2.5 13-service result. |
| `phase-2-6-decision.md` | [phase-2-6-decision](../concepts/evaluations/phase-2-6-decision.md) | Variant decision (ship v1_popularity). Duplicated under `raw/phase-summaries/`. |
| `phase-2-6-variance-eval.md` | [phase-2-6-variance-eval](../concepts/evaluations/phase-2-6-variance-eval.md) | Per-service v1 vs v2 variance numbers. Duplicated under `raw/phase-summaries/`. |

## Note on duplication

`phase-2-6-decision.md` and `phase-2-6-variance-eval.md` exist under both `raw/evaluations/` and `raw/phase-summaries/`. Same content. Wiki treats them as evaluations. The duplication is captured in the phase-summaries source page.

## Why it matters

Evaluations supply the evidence behind locked decisions. Strategy claims should reference the eval that justifies them.
