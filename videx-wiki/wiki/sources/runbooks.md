---
title: Source — Runbooks
type: source
tags: [runbooks, operations]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/runbooks/sync-pipeline.md
  - raw/runbooks/embedding-backfill.md
  - raw/runbooks/edge-function-deployment.md
  - raw/runbooks/monthly-mood-room-recluster.md
  - raw/runbooks/apk-build-and-install.md
  - raw/runbooks/service-role-jwt-rotation.md
  - raw/runbooks/supabase-backup-restore.md
  - raw/runbooks/supabase-migration-workflow.md
related:
  - wiki/concepts/operations/sync-pipeline.md
  - wiki/concepts/operations/embedding-backfill.md
  - wiki/concepts/operations/edge-function-deployment.md
  - wiki/concepts/operations/monthly-mood-room-recluster.md
  - wiki/concepts/operations/apk-build-and-install.md
  - wiki/concepts/operations/service-role-jwt-rotation.md
  - wiki/concepts/operations/supabase-backup-restore.md
  - wiki/concepts/operations/supabase-migration-workflow.md
---

# Source: Runbooks

Eight runbooks under `raw/runbooks/`, each mapped to a concept page under `wiki/concepts/operations/`.

| Raw | Wiki concept |
|---|---|
| `sync-pipeline.md` | [sync-pipeline](../concepts/operations/sync-pipeline.md) |
| `embedding-backfill.md` | [embedding-backfill](../concepts/operations/embedding-backfill.md) |
| `edge-function-deployment.md` | [edge-function-deployment](../concepts/operations/edge-function-deployment.md) |
| `monthly-mood-room-recluster.md` | [monthly-mood-room-recluster](../concepts/operations/monthly-mood-room-recluster.md) |
| `apk-build-and-install.md` | [apk-build-and-install](../concepts/operations/apk-build-and-install.md) |
| `service-role-jwt-rotation.md` | [service-role-jwt-rotation](../concepts/operations/service-role-jwt-rotation.md) |
| `supabase-backup-restore.md` | [supabase-backup-restore](../concepts/operations/supabase-backup-restore.md) |
| `supabase-migration-workflow.md` | [supabase-migration-workflow](../concepts/operations/supabase-migration-workflow.md) |

## Conflict notes

- `monthly-mood-room-recluster.md` references workflow filename `recluster-mood-rooms.yml`. Project orchestration v0.3.3 §6.1 and Phase 4.5 use `mood-rooms-recluster.yml`. Wiki concept page reflects current name; the runbook is older.
- `sync-pipeline.md` documents `--stage vectors` (legacy 24D `content_vector` backfill). Phase 1 dropped the column (migration 019) and the stage. Wiki page retains the stage table for historical reference but flags it as no longer active.

## Why it matters

Runbooks turn one-off knowledge into reusable procedures. Refresh after any phase that changes the underlying tooling (Capacitor major version, Supabase API surface, embedding model deprecation).
