---
title: Source — Codebase Snapshots
type: source
tags: [codebase, snapshots, schema, modules]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/codebase-snapshots/database-schema-snapshot.md
  - raw/codebase-snapshots/migration-changelog.md
  - raw/codebase-snapshots/module-map.md
  - raw/codebase-snapshots/component-inventory.md
  - raw/codebase-snapshots/hook-inventory.md
  - raw/codebase-snapshots/rpc-catalogue.md
  - raw/codebase-snapshots/event-taxonomy.md
  - raw/codebase-snapshots/package-json-annotated.md
related:
  - wiki/entities/codebase/database-schema.md
  - wiki/entities/codebase/migrations.md
  - wiki/entities/codebase/rpcs.md
  - wiki/entities/codebase/module-map.md
  - wiki/entities/codebase/components.md
  - wiki/entities/codebase/hooks.md
  - wiki/entities/codebase/event-taxonomy.md
---

# Source: Codebase Snapshots

Eight generated extracts from the live repo, all dated 2026-04-26. Single source of truth: the repo itself; this collection is a flattened reference for the wiki.

## Files and their wiki targets

| Raw file | Primary wiki page | Notes |
|---|---|---|
| `database-schema-snapshot.md` | [database-schema](../entities/codebase/database-schema.md) | Tables, extensions, triggers, RLS pattern, scheduled jobs. Anchored to migration 032. |
| `migration-changelog.md` | [migrations](../entities/codebase/migrations.md) | 32 migrations, gap at 021. Phase 0 deviation captured (015/016 inserted in-phase). |
| `module-map.md` | [module-map](../entities/codebase/module-map.md) | Annotated `src/` tree plus `scripts/` and `supabase/`. |
| `component-inventory.md` | [components](../entities/codebase/components.md) | Every React component, grouped by role. |
| `hook-inventory.md` | [hooks](../entities/codebase/hooks.md) | One row per `useX` hook. |
| `rpc-catalogue.md` | [rpcs](../entities/codebase/rpcs.md) | Every Supabase function with caller and migration of origin. |
| `event-taxonomy.md` | [event-taxonomy](../entities/codebase/event-taxonomy.md) | Every emitted event, destination table, payload. |
| `package-json-annotated.md` | [module-map](../entities/codebase/module-map.md#runtime-stack-annotated) | Folded into module map under "Runtime stack (annotated)" + "Notable omissions". |

## Why it matters

Pins canonical names (`event_type`, `content_id`, `not_interested`, slug forms) and the migration sequence. Every page below the codebase entities folder cites this set. Re-snapshot whenever schema or module structure shifts.
