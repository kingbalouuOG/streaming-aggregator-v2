---
title: V2 Strategy Documents (Index)
generated: 2026-04-26
---

# V2 Strategy Documents

The seven canonical v2 documents live in `docs/v2/` in the main repo. Drop copies (or the originals) into this folder for the wiki to ingest. Suggested file names mirror the originals.

## Suggested files

| File | Source | Purpose |
|---|---|---|
| `videx-recommendation-engine-v2-strategy-v1.6.3.md` | `docs/v2/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md` | Engine strategy. Most cross-referenced doc in the v2 set. |
| `videx-v2-design-reference-v0.1.md` | `docs/v2/Videx_v2_Design_Reference_v0.1.md` | Visual reference index pointing to design PNGs. |
| `videx-v2-detail-page-signal-capture-spec-v0.3.2.md` | `docs/v2/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md` | Signal taxonomy and capture spec for the detail page. |
| `videx-v2-home-and-foryou-composition-hypothesis-v0.3.md` | `docs/v2/Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.3.md` | Two-surface composition logic. |
| `videx-v2-implementation-guide-v0.2.md` | `docs/v2/Videx_v2_Implementation_Guide_v0.2.md` | Operational runbook for running the v2 build with CC. |
| `videx-v2-implementation-notes-parking-lot-v0.3.4.md` | `docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md` | IN-XXX entries; phase-tagged implementation notes. |
| `videx-v2-project-orchestration-v0.3.3.md` | `docs/v2/Videx_v2_Project_Orchestration_v0.3.3.md` | Branching, env, migrations, scheduled workflows. |

## Phase summaries

Drop into `raw/phase-summaries/` (not here):

- `phase-0-end-of-phase-summary.md` (was `Videx_v2_Phase_0_End_of_Phase_Summary.md`)
- `phase-0.5-end-of-phase-summary.md`
- `phase-1-summary.md`
- `phase-2-summary.md`
- `phase-2.5-summary.md`
- `phase-2.6-summary.md`
- `phase-3-summary.md`
- `phase-4-summary.md`

## Eval reports

Drop into `raw/evaluations/` (not here):

- `phase-1-cluster-eval.md`
- `phase-1-wire-format-spike.md`
- `phase-2-service-discrimination-baseline.md`
- `phase-2-service-discrimination-eval.md`
- `phase-2-6-decision.md`
- `phase-2-6-variance-eval.md`

## Other top-level docs

From `docs/` (drop into the noted subfolder of `raw/`):

- `attributions.md` → `raw/v2-strategy/` (or `raw/product/` if treated as legal text).
- `migration-notes.md` → `raw/v2-strategy/`.
- `context-update-b1-e1.md` → `raw/v2-strategy/`.
- `component-specs.md` → `raw/v2-strategy/` or `raw/frontend/`.
- `docs/plans/` → `raw/plans/`.
- `docs/solutions/` (full tree) → `raw/solutions/`.
- `docs/v2/design-references/*.png` → `raw/screenshots/`.
- `docs/brainstorms/` (when populated) → new `raw/brainstorms/` folder.

## Convention

Once these files are in `raw/`, the LLM ingests each per AGENTS.md's workflow:

1. Read the doc.
2. Discuss takeaways.
3. Create `wiki/sources/{slug}.md` summarising the doc.
4. Update or create relevant `wiki/entities/` and `wiki/concepts/` pages.
5. Update `index.md` and append a single entry to `log.md`.
