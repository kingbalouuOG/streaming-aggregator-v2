---
title: Source — Phase Summaries (collected)
type: source
tags: [phase-summaries, history, deliverables]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/phase-summaries/Videx_v2_Phase_0_End_of_Phase_Summary.md
  - raw/phase-summaries/Videx_v2_Phase_0_5_End_of_Phase_Summary.md
  - raw/phase-summaries/phase-1-summary.md
  - raw/phase-summaries/phase-2-summary.md
  - raw/phase-summaries/phase-2.5-summary.md
  - raw/phase-summaries/phase-2.6-summary.md
  - raw/phase-summaries/phase-2-6-decision.md
  - raw/phase-summaries/phase-2-6-variance-eval.md
  - raw/phase-summaries/phase-3-summary.md
  - raw/phase-summaries/phase-4-summary.md
  - raw/phase-summaries/phase-4-and-4.5-summary.md
  - raw/phase-summaries/phase-4.5-anchored-rooms-summary.md
  - raw/phase-summaries/IN-466-server-side-foryou-render-summary.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/operations/phase-0.md
  - wiki/concepts/operations/phase-0-5.md
  - wiki/concepts/operations/phase-1.md
  - wiki/concepts/operations/phase-2.md
  - wiki/concepts/operations/phase-2-5.md
  - wiki/concepts/operations/phase-2-6.md
  - wiki/concepts/operations/phase-3.md
  - wiki/concepts/operations/phase-4.md
  - wiki/concepts/evaluations/phase-2-6-decision.md
  - wiki/concepts/evaluations/phase-2-6-variance-eval.md
  - wiki/concepts/decisions/adr-012-server-side-foryou-render.md
---

# Source: Phase Summaries (collected)

End-of-phase summary documents under `raw/phase-summaries/`. Per the implementation guide §4.6, every phase produces one when complete. Each file follows the same template: what was built → verification → deviations → lessons → parking-lot adds → next-phase observations.

## Files

| Phase | Raw | Wiki page |
|---|---|---|
| 0 | `Videx_v2_Phase_0_End_of_Phase_Summary.md` | [phase-0](../concepts/operations/phase-0.md) |
| 0.5 | `Videx_v2_Phase_0_5_End_of_Phase_Summary.md` | [phase-0-5](../concepts/operations/phase-0-5.md) |
| 1 | `phase-1-summary.md` | [phase-1](../concepts/operations/phase-1.md) |
| 2 | `phase-2-summary.md` | [phase-2](../concepts/operations/phase-2.md) |
| 2.5 | `phase-2.5-summary.md` | [phase-2-5](../concepts/operations/phase-2-5.md) |
| 2.6 | `phase-2.6-summary.md` | [phase-2-6](../concepts/operations/phase-2-6.md) |
| 2.6 (decision) | `phase-2-6-decision.md` | [phase-2-6-decision](../concepts/evaluations/phase-2-6-decision.md) |
| 2.6 (variance) | `phase-2-6-variance-eval.md` | [phase-2-6-variance-eval](../concepts/evaluations/phase-2-6-variance-eval.md) |
| 3 | `phase-3-summary.md` | [phase-3](../concepts/operations/phase-3.md) |
| 4 | `phase-4-summary.md` | [phase-4](../concepts/operations/phase-4.md) |
| 4 + 4.5 (combined) | `phase-4-and-4.5-summary.md` | — |
| 4.5 anchored rooms | `phase-4.5-anchored-rooms-summary.md` | — |
| IN-466 server-side render | `IN-466-server-side-foryou-render-summary.md` | [for-you-surface §Server-side render path](../concepts/architecture/for-you-surface.md), [ADR-012](../concepts/decisions/adr-012-server-side-foryou-render.md) |

## Notes

- `phase-summaries/phase-2-6-decision.md` and `phase-summaries/phase-2-6-variance-eval.md` are duplicated under `raw/evaluations/`. Same content, single wiki source page each (filed under evaluations because they are evaluation outputs, not the phase summary).

## Why it matters

These are the canonical record of what was actually shipped. When strategy intent and shipped reality differ, the phase summary wins (per Step 4 of the ingest brief). The phase-history concept page consolidates timeline; per-phase pages preserve specifics.
