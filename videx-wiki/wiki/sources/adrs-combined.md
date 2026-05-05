---
title: Source — Architecture Decision Records (Combined)
type: source
tags: [adrs, decisions]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/adrs/adrs-combined.md
related:
  - wiki/concepts/decisions/adr-001-watchmode-replaced-by-sa-api.md
  - wiki/concepts/decisions/adr-002-two-surface-architecture.md
  - wiki/concepts/decisions/adr-003-supabase-pro.md
  - wiki/concepts/decisions/adr-004-1536d-embeddings.md
  - wiki/concepts/decisions/adr-005-hdbscan-python-github-actions.md
  - wiki/concepts/decisions/adr-006-card-impressions-dedicated-table.md
  - wiki/concepts/decisions/adr-007-v1-archived-as-tag.md
  - wiki/concepts/decisions/adr-008-static-genre-mapping.md
  - wiki/concepts/decisions/adr-009-not-interested-rename.md
  - wiki/concepts/decisions/adr-010-pg-partman-card-impressions.md
  - wiki/concepts/decisions/adr-011-edge-function-shared-modules.md
  - wiki/concepts/decisions/adr-012-server-side-foryou-render.md
---

# Source: ADRs Combined

Twelve ADRs extracted from `raw/adrs/adrs-combined.md`, split into individual `wiki/concepts/decisions/adr-*.md` pages so each decision is queryable on its own.

| ADR | Title | Status |
|---|---|---|
| 001 | WatchMode replaced by Streaming Availability API | locked, applied |
| 002 | Two-surface architecture (Home + For You) | locked |
| 003 | Supabase Free → Pro tier | locked, applied Phase 1 |
| 004 | 24D archetype vector replaced by 1536D embedding | locked, applied Phases 1-3 |
| 005 | HDBSCAN runs in Python + GitHub Actions, not TypeScript | locked |
| 006 | `card_impressions` dedicated partitioned table | locked, applied Phase 0 |
| 007 | v1 archived as Git tag, not run in parallel | locked |
| 008 | Static genre mapping retained over `title_genres` | locked, applied Phase 0.5 |
| 009 | `dismiss` event renamed to `not_interested` | locked, applied Phase 0 |
| 010 | pg_partman + monthly partitions for `card_impressions` | locked, applied Phase 0 |
| 011 | Edge Function shared modules duplicated into `_shared/` | locked |
| 012 | Server-side For You first paint via Edge Function | locked, applied IN-466 |

Decision: split per-ADR rather than keep combined, because individual decisions get linked from many entity and concept pages and the combined page would force readers to scan past unrelated context. The combined source page above acts as the index.

Sources of each ADR include both `raw/adrs/adrs-combined.md` and the originating strategy/orchestration/parking-lot doc, retained on the per-ADR page.
