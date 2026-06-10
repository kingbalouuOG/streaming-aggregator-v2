---
title: Source — Project Orchestration v0.5
type: source
tags: [orchestration, version-control, ci, edge-functions]
created: 2026-04-30
updated: 2026-04-30
supersedes:
  - wiki/sources/project-orchestration-v0-3-3.md
sources:
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.5.md # never snapshotted to raw/ — page written from the docs/ copy; v0.5 deltas preserved in the v0.8 changelog
related:
  - wiki/concepts/operations/edge-function-deployment.md
  - wiki/concepts/decisions/adr-011-edge-function-shared-modules.md
  - wiki/concepts/decisions/adr-012-server-side-foryou-render.md
---

# Source: Project Orchestration v0.5

> **Superseded by [Project Orchestration v0.8](project-orchestration-v0-8.md)** (E&P track kickoff, 2026-06-10). v0.6/v0.7 were never snapshotted to raw/.

Versioned working doc for v2 build orchestration: branching model, environment setup, migration management, daily workflow, CI, scheduled jobs, backups.

## v0.5 changes (load-bearing)

- §11 (Confirmed Decisions): added IN-466 server-side render lock — `render-foryou-rows` Edge Function as the For You first-paint primary path with the existing `useForYouContent` client pipeline as fallback (1.5s timeout). Linked to ADR-012.
- §11: added the `_shared/recommendations-v2/` + `_shared/taste-v2/` mirror commitment per ADR-011 with `shared-tree-drift` GitHub Actions workflow as the drift control mechanism.
- §3.4 migration table unchanged — IN-466 was application-layer only, no new migrations. Migration 033 status flipped from ⏳ Planned → ✅ Applied.

## v0.4 changes (carried forward)

- §3.4: Phase 4.5 description rewritten — title-anchored ranking layer + LLM labelling fast-follow.
- §3.4: migration 033 added (`card_impressions.metadata` jsonb + `'anchor_room'` source_surface).
- §11: title-anchored mood rooms For You ranking lock alongside the existing HDBSCAN-pipeline lock.

## Locked decisions surfaced here

- ADR-011 (`_shared/` Edge Function pattern) — pre-existing; reaffirmed by IN-466.
- ADR-012 (server-side For You render) — locked April 2026 (IN-466).
- `shared-tree-drift` CI check enforces `src/lib/recommendations-v2/` ↔ `supabase/functions/_shared/recommendations-v2/` lockstep; escape hatch `drift-allowed: <reason>`.
- pg_partman + pg_cron dependencies on Supabase Pro — see Parking Lot IN-XPS-010 for downgrade risk inventory.
