---
title: Source — Implementation plans
type: source
tags: [plans, implementation]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/plans/2026-03-15-001-feat-api-consolidation-content-cache-deep-linking-plan.md
related:
  - wiki/concepts/decisions/adr-001-watchmode-replaced-by-sa-api.md
  - wiki/entities/apis/streaming-availability-api.md
---

# Source: Implementation plans

One file under `raw/plans/` as of 2026-04-26: the B1→E1 plan that locked in [ADR-001 (WatchMode → SA API)](../concepts/decisions/adr-001-watchmode-replaced-by-sa-api.md), the Supabase content cache, and deep linking.

## File

`2026-03-15-001-feat-api-consolidation-content-cache-deep-linking-plan.md` — dated 2026-03-15. Status: active (per frontmatter; superseded in practice by the shipped implementation).

Covers:

- WatchMode → SA API swap (10 files updated, 1 deleted).
- Supabase content cache (`titles`, `streaming_availability`, `streaming_history`).
- Deep linking via `@capacitor/app-launcher` with confidence tagging.
- Daily incremental sync via Edge Function + pg_cron.

## Why it matters

This is the plan whose execution produced ADR-001, [migration 005 (authenticated-role RLS fix)](../concepts/operations/solutions/authenticated-role-missing-rls.md), and the foundational schema later expanded by Phase 0+. Reading it shows where the v2 build actually started.

## Conflict resolution applied

Plan-time identifiers `interaction_type` and `tmdb_id` on `card_impressions` were superseded later by `event_type` and `content_id` (strategy v1.6 / v1.6.1). Wiki entities and concepts use the canonical names.
