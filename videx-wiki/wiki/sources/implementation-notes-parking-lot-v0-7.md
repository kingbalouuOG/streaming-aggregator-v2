---
title: Source — Implementation Notes Parking Lot v0.7 (+ ENG-1 section)
type: source
tags: [parking-lot, implementation-notes, phase-5-5, eng-1]
created: 2026-06-10
updated: 2026-06-10
supersedes:
  - wiki/sources/implementation-notes-parking-lot-v0-5.md
sources:
  - raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_v0.7.md
related:
  - wiki/registers/parking-lot.md
  - wiki/sources/phase-eng-1-summary.md
  - wiki/sources/phase-repo-1-summary.md
  - wiki/registers/deferred-items.md
---

# Source: Implementation Notes Parking Lot v0.7 (+ ENG-1 section)

Running list of implementation-level notes feeding CC phase briefs. The raw v0.7 snapshot carries the Phase 5.5 close-out header **plus the ENG-1 follow-ups section filed 2026-06-10** (the doc version number was not re-bumped for the ENG-1 entries). Supersedes [v0.5](implementation-notes-parking-lot-v0-5.md) (v0.6 — Phase 5 close-out — was never snapshotted; its deltas are in the v0.7 changelog). The [parking-lot register](../registers/parking-lot.md) is the wiki's live per-entry status view.

## v0.7 changes (Phase 5.5 close, 2026-05-15)

- 14 entry flips to ✅ Incorporated: IN-PX-21..28 (quality/perf cluster), IN-PX-31, IN-PX-33, IN-PX-34, IN-PX-35, IN-XPS-006, IN-465.
- New: **IN-XPS-014** (UK solicitor review of Privacy Policy + ToS — hard pre-launch blocker) and **IN-PX-50** (scheduled catalogue-gap backfill Edge Function — Phase 6).
- Phase 5.5 review-pass follow-ups: IN-PX-51 ✅ (clearEmbeddingCache on SIGNED_OUT), IN-PX-52 (Edge `_shared/database.types.ts` regen), IN-PX-53 (Safari 5MB cache quota), IN-PX-54 (CI check: every user-scoped table in delete + export RPCs — honoured by migration 044 at ENG-1).

## ENG-1 follow-ups section (filed 2026-06-10)

| Entry | Summary | Target |
|---|---|---|
| **IN-PX-55** | 13/16 onboarding clusters define only 2–4 rep titles in `tasteClusters.ts` (audit cleared the pipeline: 67/68 rep ids embedded; sole gap tmdb 273481). Expand to ~8–10 reps per cluster (Joe-owned curation) + re-run `eval:eng1` §A to confirm seed separation. | Any time pre-launch; pairs with ENG-2-era bootstrap review |
| **IN-PX-56** | `card_impressions` lacks `media_type` → `v_training_examples` join collision class (0.8%, same as IN-458). Add the column (partitioned-table DDL) or accept as training noise. | ENG-2, only if its evals show the noise matters |
| **IN-PX-57** | Exploration seen-set approximates "zero prior impressions" as most-recent-1000 in 90d (PostgREST cap). Exact at prototype scale. Fix: paginate or SQL anti-join RPC. | Post-launch, telemetry-driven; likely absorbed by PLAT-3 |
