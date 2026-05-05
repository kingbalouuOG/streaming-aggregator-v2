---
title: Phase 2.6 — Fingerprint variant decision
type: concept
tags: [evaluation, phase-2-6, decision, exclusivity-weighting, fingerprints]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/evaluations/phase-2-6-decision.md
  - raw/phase-summaries/phase-2-6-decision.md
related:
  - wiki/concepts/operations/phase-2-6.md
  - wiki/concepts/architecture/service-fingerprints.md
  - wiki/concepts/evaluations/phase-2-6-variance-eval.md
---

# Phase 2.6 — Fingerprint variant decision

**Recommendation: ship `v1_popularity`. Do not ship `v2_exclusivity`.**

Gate failure, phase success. Phase 2.6 tested whether exclusivity-weighted centroids produce sharper service discrimination than popularity-ranked arithmetic means. The answer is no. The deliverable was a defensible decision, not a tuning.

## Evidence

### Variance gate (WU-2): FAIL — 5 of 13 improved (gate ≥ 8)

Mean v1 variance 0.002298, mean v2 variance 0.002284, mean delta −0.000014 (statistical noise).

### Synthetic cold-start gate (WU-3): SKIPPED

Early-exit invoked. Variance gate failed decisively (5/13, not borderline). Running WU-3 would either confirm what's known or contradict it without changing the decision.

## What v2 told us

Exclusivity weighting is not a universal signal-sharpener.

- **Niche services gained** (apple, bbc, mubi, plutotv, skygo) — already had differentiated catalogues; exclusivity amplified.
- **Mainstream services lost** (channel4, discovery, disney, itvx, netflix, now, paramount, prime) — downweighting shared blockbusters didn't reveal a distinctive core. Over-weighted near-arbitrary "exclusive" titles at the top-150 boundary.

The original suggestion to "weight by exclusivity" assumed all services have a meaningful exclusive-content signal buried under shared mainstream titles. In practice, mainstream UK services share most of their popular catalogue, and "exclusive" titles at top-150 boundary are not systematically distinctive — just titles licensed by one fewer service.

## Phase 3 instructions

- Hooks read `variant = 'v1_popularity'`.
- `variant` column stays in schema.
- `match_titles_by_vector` RPC permanent (Stage 1 retrieval). Do not delete.
- `--variant=exclusivity` flag retained in build script.

## Parking-lot

- IN-260 (exclusivity weighting): ✅ Discharged.
- Curation-based refinement: NEW. Revisit if Phase 3 cold-start underperforms for mainstream users.
- BBC characterisation in strategy §4.4: revise to broad mainstream-leaning reality (Joe handling separately).

## Artifacts retained vs deleted

| Artifact | Retention | Rationale |
|---|---|---|
| `match_titles_by_vector` RPC | Permanent | Phase 3 Stage 1. |
| `computeWeightedCentroid` | Permanent | Harmless, potentially useful. |
| `eval-bottom-half-variance.ts` | Permanent | Reusable. |
| `eval-synthetic-coldstart.ts` | Permanent | Built but not run; ready for Phase 3. |
| `--variant=exclusivity` flag | Retained | Re-runnable experiment. |
| `variant` column + CHECK | Retained | Schema support for future experiments. |
| v2_exclusivity rows | **Deleted** | Cleaned up post-decision. |
