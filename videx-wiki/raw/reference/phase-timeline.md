---
title: Phase Timeline
generated: 2026-04-26
sources: [docs/v2/phase-summaries/, docs/v2/Videx_v2_Project_Orchestration_v0.3.3.md]
---

# Phase Timeline

Canonical view of v2 phases. One row per phase. For details see the per-phase summary in `docs/v2/phase-summaries/`.

| Phase | Title | Branch | Status | Completed | Migrations | Summary doc |
|---|---|---|---|---|---|---|
| Pre-0 | Profiles baseline | direct on main | applied | 2026-04-08 | 011 | (in parking lot IN-PRE-001) |
| 0 | Instrumentation | `phase-0-instrumentation` | merged | 2026-04-10 | 012, 013, 014, 015, 016 | `Videx_v2_Phase_0_End_of_Phase_Summary.md` |
| 0.5 | First-party content enrichment | `phase-0.5-content-enrichment` | merged | 2026-04-12 | 017 + `supabase/cron/enrich_new_titles.sql` | `Videx_v2_Phase_0_5_End_of_Phase_Summary.md` |
| 1 | Embeddings + pgvector | `phase-1-embeddings` | merged | 2026-04-14 | 018, 019 | `phase-1-summary.md` |
| 2 | Service fingerprints baseline | `phase-2-service-fingerprints` | merged | 2026-04-15 | 020 | `phase-2-summary.md` |
| 2.5 | Service-discrimination eval | `phase-2.5-eval` | merged | 2026-04-15 | (none) | `phase-2.5-summary.md` |
| 2.6 | Variant evaluation | `phase-2.6-variant` | merged | 2026-04-16 | 022 | `phase-2.6-summary.md`, `phase-2-6-decision.md` |
| 3 | Taste vector v2 + ranker | `phase-3-taste-v2` | merged | 2026-04-17 | 023, 024, 025, 026, 027, 028 | `phase-3-summary.md` |
| 4 | Ranking pipeline | direct on main | merged | 2026-04-19 | (none — TS only) | `phase-4-summary.md` |
| 4.5 | Mood Rooms | `phase-4.5-mood-rooms` | merged | 2026-04-22 | 029, 030, 031, 032 | (in progress) |
| 5 | Contextual scoring | _planned_ | not started | — | — | — |
| 6 | Content variety + variety row | _planned_ | not started | — | — | — |

## Branch model

`main` is the primary branch. Each phase gets a feature branch named `phase-{N}-{slug}`. Phase 4 was applied directly to main due to its TypeScript-only scope and lack of risky migrations. Branches are merged via PR after the end-of-phase summary is approved. Tag `v2-phase-{N}-complete` recommended on the merge commit.

## Phase numbering

`0`, `0.5`, `1`, `2`, `2.5`, `2.6`, `3`, `4`, `4.5`, `5`, `6`. Decimal phases (`0.5`, `2.5`, `2.6`, `4.5`) are insertions for work that materially altered the plan but did not justify renumbering subsequent phases.

## Migration numbering vs phase numbering

Migration numbers do not align cleanly with phase numbers because:
- Pre-Phase 0 work used migrations 011 (re-codified existing prod state).
- Phase 0 deviations inserted migrations 015 and 016, shifting subsequent phase migrations by +2.
- Migration 021 is intentionally skipped.

The strategy doc keeps cross-references in sync (Strategy v1.6.3).
