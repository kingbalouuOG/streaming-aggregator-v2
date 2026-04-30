---
title: Supabase Migration Workflow Runbook
generated: 2026-04-26
sources: [docs/v2/Videx_v2_Project_Orchestration_v0.3.3.md §3]
---

# Supabase Migration Workflow

How schema changes flow from local edit to production application.

## Conventions

- File naming: `NNN_descriptive_name.sql`. Numbering monotonic; gap at 021 intentional and preserved.
- One coherent change per migration (single-purpose).
- Idempotent where possible (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS … CREATE POLICY …`).
- Destructive migrations (e.g. 019, 024) are explicitly marked at the top with `-- DESTRUCTIVE — take manual Supabase snapshot before applying.`
- Operational schedules live in `supabase/cron/`, not in numbered migrations (Phase 0.5 convention).

## Within-phase rule

Additive only within a phase to keep the phase branch reversible.

## Across-phase rule

Destructive cleanup happens in the phase that introduces the replacement. No "Phase 6.5 cleanup" phase. See ADR-007.

## Workflow

### 1. Author migration

```bash
# In repo root
touch supabase/migrations/033_my_change.sql
```

Edit. Use the existing migrations as style references. Include a comment header with phase, purpose, and any cross-references.

### 2. Apply locally first

If running a local Supabase stack:

```bash
supabase db reset       # Replays all migrations from scratch on local
```

If applying directly to remote (sole-developer workflow Videx uses):

```bash
supabase db push
```

This applies pending migrations to the linked project. Confirms via dry-run output before write.

### 3. Verify

```sql
-- Was the migration recorded?
SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;

-- Did the schema change land?
\d+ <table>
```

### 4. Regenerate types (if schema affected client-callable surface)

```bash
supabase gen types typescript --linked > src/lib/database.types.ts
```

Commit the regenerated file alongside the migration.

### 5. Commit

```bash
git add supabase/migrations/033_my_change.sql src/lib/database.types.ts
git commit -m "Migration 033: my change"
```

### 6. Deploy any dependent code

If the migration adds a new RPC, add the client wrapper. If it changes a table the app reads, deploy app changes in the same release.

## Pre-apply checklist for destructive migrations

1. Manual Supabase snapshot taken (`supabase-backup-restore.md`).
2. App deployed (or ready to deploy) that no longer references dropped columns / tables.
3. Migration explicitly marked DESTRUCTIVE in the file header.
4. Verify on staging first if available; Videx currently has none, so go directly to production with snapshot in hand.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `relation already exists` | Migration not idempotent | Add `IF NOT EXISTS`. |
| `policy already exists` | Re-running policy creation | Use `DROP POLICY IF EXISTS … CREATE POLICY …` pattern. |
| Migration applied locally but not pushed to remote | Forgot `supabase db push` | Push. |
| Migration partially applied (some statements failed) | Postgres rolled back the failed statement but committed earlier ones in some cases | Wrap multi-statement migrations in `BEGIN; … COMMIT;` to make them atomic. |
| Type regeneration produces empty file | Wrong project linked | `supabase link --project-ref <ref>` and retry. |

## Skipped migration numbers

- 021 reserved during planning, rolled into 022. Number kept skipped for traceability with strategy doc cross-references.
