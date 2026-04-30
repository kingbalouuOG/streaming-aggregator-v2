---
title: Phase History
type: concept
tags: [phase-history, timeline, deliverables]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/phase-summaries/Videx_v2_Phase_0_End_of_Phase_Summary.md
  - raw/phase-summaries/Videx_v2_Phase_0_5_End_of_Phase_Summary.md
  - raw/phase-summaries/phase-1-summary.md
  - raw/phase-summaries/phase-2-summary.md
  - raw/phase-summaries/phase-2.5-summary.md
  - raw/phase-summaries/phase-2.6-summary.md
  - raw/phase-summaries/phase-3-summary.md
  - raw/phase-summaries/phase-4-summary.md
  - raw/reference/phase-timeline.md
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
related:
  - wiki/sources/phase-summaries.md
  - wiki/entities/codebase/migrations.md
  - wiki/concepts/operations/phase-0.md
  - wiki/concepts/operations/phase-0-5.md
  - wiki/concepts/operations/phase-1.md
  - wiki/concepts/operations/phase-2.md
  - wiki/concepts/operations/phase-2-5.md
  - wiki/concepts/operations/phase-2-6.md
  - wiki/concepts/operations/phase-3.md
  - wiki/concepts/operations/phase-4.md
---

# Phase History

Compressed timeline of v2 phases. One row per phase. Click into per-phase pages for deviations, lessons, evidence.

| Phase | Date | Branch | Migrations | Outcome | Per-phase page |
|---|---|---|---|---|---|
| 0 — Instrumentation | 2026-04-10 | `phase-0-instrumentation` | 012, 013, 014, **015**, **016** (deviation +2) | Lifecycle manager, dwell timer, impression batcher, session ID, dismiss→not_interested rename. 14/14 end-to-end checks PASS. | [phase-0](phase-0.md) |
| 0.5 — Content enrichment | 2026-04-11 | `phase-0.5-content-enrichment` | 017 | 4 columns added to titles. 19,993/20,000 enriched. Director gate split by media_type (movies 99.7%, TV 54.9%). New `supabase/cron/` directory. | [phase-0-5](phase-0-5.md) |
| 1 — Content embeddings | 2026-04-12 | (merged commit `2fd4289`) | 018, 019 | 19,993 titles embedded with text-embedding-3-small. HNSW index. Wire format spike: `JSON.parse(row.embedding as string)`. Cluster eval conditional pass. Backfill cost ~£0.04. | [phase-1](phase-1.md) |
| 2 — Service fingerprints | 2026-04-12 | `phase-2-service-fingerprints` | 020 | 10 services fingerprinted (top-150 by popularity). Discrimination conditional pass (catalogue overlap structural). 3 services (BBC/NOW/SkyGo) absent → IN-250. | [phase-2](phase-2.md) |
| 2.5 — TMDb backfill | 2026-04-12 | `phase-2.5-tmdb-provider-backfill` | 0 (data-only) | 600 SA rows inserted (BBC/NOW/SkyGo, 200 each). All 13 services fingerprinted. BBC × MUBI conditional pass (BBC catalogue is broader than expected). Cosine drift 0.0027 PASS. | [phase-2-5](phase-2-5.md) |
| 2.6 — Fingerprint refinement | 2026-04-13 | `phase-2.6-fingerprint-signal-refinement` | 022 | v2 exclusivity-weighted centroids tested. Bottom-half variance gate FAIL (5/13). WU-3 skipped per early-exit. Decision: ship v1_popularity. `match_titles_by_vector` RPC added (Phase 3 inheritance). | [phase-2-6](phase-2-6.md) |
| 3 — Taste vector v2 | 2026-04-14 → 16 | `phase-3-taste-vector` | 023, 024, 025, **028** | 1536D taste vector. Auth integrated into onboarding Step 1. Bootstrap dynamic 4-band weights by watched-grid count. Quiz subsystem deleted (15 files, ~5,227 lines). 10 hooks rewritten. | [phase-3](phase-3.md) |
| 4 — Ranking pipeline & rows | 2026-04-17 → 19 | `main` (direct commits) | 0 | Stage 2 implemented as 3-component sum (62.5/25/12.5) + diversity post-processing. 7 Home rows + 7 For You rows. 4 sliders wired with bottom-sheet tray + haptic feedback. ~260ms time-to-first-render. | [phase-4](phase-4.md) |
| 4.5 — Mood Rooms | 2026-04-19 → 22 | (no end-of-phase summary file) | 029, 030, 031, 032 | UMAP+HDBSCAN ships 68 rooms at 53.5% coverage. GitHub Actions monthly cron. RPCs for ranking, thumbnails, detail. Gate 4 hotfix (PostgREST 1000-row cap → RPCs; `card_impressions.source_surface` CHECK fix). | _no per-phase page; reconstructed from strategy + migrations_ |
| 5 — Contextual signals | not started | — | (planned) | Replace `contextual.ts` placeholder. Re-evaluate 62.5/25/12.5 split. | — |
| 6 — Launch | not started | — | 033 (taste_profiles RLS planned) | APK build, install, end-to-end verify. Two prototype users re-onboard. | — |

## Conflict resolutions captured

- Migration 021 reserved → rolled into 022 (Phase 2.6). Numbering continues 023+.
- Strategy v1.5 said Phase 0 would ship 3 migrations; actual Phase 0 shipped 5 (012-016). Strategy v1.6.3 §6 renumbered downstream by +2.
- Strategy v1.6.3 §5.2 5-component weight table represents intent; Phase 4 actuals shipped 3-component scoring sum + diversity as post-processing per §5.2 Phase 4 implementation note.
- Mood rooms target 30-60 rooms in strategy; actual Phase 4.5 shipped 68 rooms at 53.5% coverage. Strategy doc updated; per-phase reality stands.
- Phase 3 hook rewrite scope: brief said 9 files; actual 10 (added `useTasteProfile`).
- Phase 0.5 enrichment scope: brief said 5 columns; actual 4 + opportunistic backfill of pre-existing `runtime`.
- Phase 0.5 director coverage: brief had a single 80% gate; phase split it by media_type post hoc (movies ≥95%, TV best-effort), recorded as IN-PX-07 policy.

## Realistic timeline note

Strategy v1.6.3 §7.2 estimates 14-18 weeks for Phases 0-6 of focused effort. Actuals through Phase 4.5: ~12 days of elapsed wall time (2026-04-10 → 22).
