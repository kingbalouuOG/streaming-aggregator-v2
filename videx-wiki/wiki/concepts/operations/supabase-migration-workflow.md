---
title: Supabase migration workflow runbook
type: concept
tags: [runbook, migrations, supabase, schema]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/runbooks/supabase-migration-workflow.md
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.3.3.md
related:
  - wiki/entities/codebase/migrations.md
  - wiki/entities/infrastructure/supabase.md
  - wiki/concepts/decisions/adr-007-v1-archived-as-tag.md
---

# Supabase migration workflow runbook

How schema changes flow from local edit to production application.

## Conventions

- Naming: `NNN_descriptive_name.sql`. Numbering monotonic; gap at 021 intentional.
- One coherent change per migration (single-purpose).
- Idempotent where possible (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS … CREATE POLICY …`).
- Destructive migrations marked at top: `-- DESTRUCTIVE — take manual Supabase snapshot before applying.`
- Operational schedules live in `supabase/cron/`, not numbered migrations (Phase 0.5 convention).

## Schema rules

- **Within a phase**: additive only, so phase branch can be reverted via `git revert` without leaving DB broken.
- **Between phases**: destructive migrations allowed and expected. Each is the final migration of the phase that makes it safe.
- No "Phase 6.5 cleanup" phase per [ADR-007](../decisions/adr-007-v1-archived-as-tag.md).

## Workflow

### 1. Author migration

```bash
touch supabase/migrations/033_my_change.sql
```

Edit. Use existing migrations as style references. Comment header with phase, purpose, cross-references.

### 2. Apply

```bash
supabase db push     # remote (sole-developer)
# or
supabase db reset    # local (replays all migrations from scratch)
```

### 3. Verify

```sql
SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;
\d+ <table>
```

### 4. Regenerate types (if schema affects client)

```bash
supabase gen types typescript --linked > src/lib/database.types.ts
```

Commit alongside migration.

### 5. Commit

```bash
git add supabase/migrations/033_my_change.sql src/lib/database.types.ts
git commit -m "Migration 033: my change"
```

### 6. Deploy dependent code

If migration adds RPC, add client wrapper. If it changes tables app reads, deploy app changes in the same release.

## Pre-apply checklist for destructive migrations

1. Manual Supabase snapshot taken (see [supabase-backup-restore](supabase-backup-restore.md)).
2. App deployed (or ready) that no longer references dropped columns/tables.
3. Migration explicitly marked DESTRUCTIVE.
4. Verify on staging if available; Videx has none, so go directly with snapshot in hand.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `relation already exists` | Migration not idempotent | Add `IF NOT EXISTS`. |
| `policy already exists` | Re-run | Use `DROP POLICY IF EXISTS … CREATE POLICY …`. |
| Applied locally but not pushed | Forgot `supabase db push` | Push. |
| Partially applied | Multi-statement not wrapped in transaction | Wrap in `BEGIN; … COMMIT;` for atomicity. |
| Type regen empty | Wrong project linked | `supabase link --project-ref <ref>` and retry. |

## Skipped migration numbers

021 reserved during planning, rolled into 022. Number kept skipped for traceability.
