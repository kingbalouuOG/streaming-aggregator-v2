---
title: Source — Implementation plans
type: source
tags: [plans, implementation, eng-1, repo-1]
created: 2026-04-26
updated: 2026-06-10
sources:
  - raw/plans/2026-03-15-001-feat-api-consolidation-content-cache-deep-linking-plan.md
  - raw/plans/2026-06-10-001-feat-phase-eng-1-multi-interest-plan.md
  - raw/plans/2026-06-10-002-chore-phase-repo-1-hygiene-plan.md
related:
  - wiki/concepts/decisions/adr-001-watchmode-replaced-by-sa-api.md
  - wiki/entities/apis/streaming-availability-api.md
  - wiki/concepts/operations/phase-eng-1.md
  - wiki/concepts/operations/phase-repo-1.md
  - wiki/sources/ep-hardening-brief-v0-2.md
---

# Source: Implementation plans

Three files under `raw/plans/` as of 2026-06-10. Plans are point-in-time: the phase summaries record what actually shipped; deviations are listed there.

## Files

### `2026-03-15-001-feat-api-consolidation-content-cache-deep-linking-plan.md`

The B1→E1 plan that locked in [ADR-001 (WatchMode → SA API)](../concepts/decisions/adr-001-watchmode-replaced-by-sa-api.md), the Supabase content cache (`titles`, `streaming_availability`, `streaming_history`), deep linking via `@capacitor/app-launcher`, and the daily incremental sync. Where the v2 build actually started. Conflict resolution applied at first ingest: plan-time `interaction_type`/`tmdb_id` superseded by `event_type`/`content_id`.

### `2026-06-10-001-feat-phase-eng-1-multi-interest-plan.md`

ENG-1 implementation plan (followed; deviations in the [phase summary](phase-eng-1-summary.md)): migrations 044 + 045 SQL shapes, workstreams A–D design (bootstrap grouping at τ = 0.80, per-centroid 200-RPC fan-out + weighted interleave, avoid-set γ = 0.15 on top-200, exploration slots 6/14 daily-seeded, clickContext stash), the §6 eval-gate table, an 8-commit sequence each leaving the app shippable, and the four open questions Q1–Q4 — **all resolved 2026-06-10** (watchlist_remove taste-neutral; two migrations; positions 6/14 confirmed; weight floor 0.15 confirmed). Known plan errata: said "24 onboarding clusters" — taxonomy has 16.

### `2026-06-10-002-chore-phase-repo-1-hygiene-plan.md`

REPO-1 plan with the §0 reality-check table (72 `any`s not ~20; `title_genres`/`title_credits` both 0 rows → migration 046 GO; parity probe is load-bearing CI, move not delete; wiki raw/ lag). Eight-commit sequence; four open questions — all resolved per CC recommendations (full burn-down; delete ADR-013 backfill; co-locate search briefs under `docs/design/search/`; snapshot drop timing Joe-owned). Deviations in the [phase summary](phase-repo-1-summary.md).

## Why it matters

Plans carry design rationale (risk tables, trade-off notes, SQL shapes) that summaries compress away — e.g. the ENG-1 plan's top-200-vs-500 avoid-penalty trade-off and its RPC-side escalation lever.
