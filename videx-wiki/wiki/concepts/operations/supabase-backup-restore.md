---
title: Supabase backup and restore runbook
type: concept
tags: [runbook, backup, restore, pitr, pg_dump]
created: 2026-04-26
updated: 2026-07-06
sources:
  - raw/runbooks/supabase-backup-restore.md
related:
  - wiki/entities/infrastructure/supabase.md
  - wiki/concepts/decisions/adr-003-supabase-pro.md
---

# Supabase backup and restore runbook

## Automated backups

- Provider: Supabase Pro tier provides daily auto-backups with PITR.
- Retention: 7 days on Pro.
- Coverage: entire database including all schemas, RLS policies, functions, triggers, extensions.

## Manual snapshot (recommended before destructive migrations)

Before applying destructive migrations (e.g. 019 dropped legacy `content_vector`, 024 dropped v1 24D taste columns):

### Option A: pg_dump from local

```bash
pg_dump "${SUPABASE_DB_URL}" \
  --schema=public \
  --no-owner --no-privileges \
  --format=custom \
  --file=videx-pre-migration-$(date +%Y%m%d-%H%M).dump
```

Use direct connection (port 5432), not pooler.

### Option B: Supabase Dashboard

Database → Backups → Create snapshot. Stored in Supabase, not exported.

## Restore

### From PITR (preferred for recent issues)

1. Dashboard → Database → Point in Time Recovery.
2. Pick timestamp.
3. Confirm.

> Restore is destructive. Take a manual snapshot of current state first if any post-incident data is worth preserving.

### From pg_dump file

```bash
pg_restore \
  --dbname="${SUPABASE_DB_URL}" \
  --no-owner --no-privileges \
  --clean --if-exists \
  videx-pre-migration-20260426-1430.dump
```

## What is NOT covered by backups

- Edge Function code (lives in repo, deploy from there).
- Edge Function secrets (set manually via `supabase secrets set`).
- pg_cron job definitions (in migrations / `supabase/cron/`).
- GitHub Actions workflow files and secrets.

## Post-restore checklist

1. Verify row counts in `titles`, `streaming_availability`, `user_interactions`, `card_impressions`.
2. Confirm RLS policies present: `SELECT count(*) FROM pg_policies;`.
3. Run `SELECT * FROM run_data_quality_check();`.
4. Confirm extensions: `SELECT extname FROM pg_extension;`.
5. Confirm pg_cron jobs: `SELECT * FROM cron.job;`.
6. Manually trigger one Edge Function and one sync stage.

## Automated off-site backup — ✅ shipped (H0 Stream D, 2026-07-06)

`.github/workflows/db-backup.yml` runs a monthly (04:00 UTC, 1st) `pg_dump`
(schema=public, custom format), **GPG-symmetric-encrypts it on the runner**
(AES256), and uploads it as a 90-day GitHub Actions artifact — outside
Supabase. `workflow_dispatch` allows manual runs.

- **Secrets:** reuses the existing `SUPABASE_CONNECTION_STRING` (the Direct
  5432 URI mood-rooms-recluster already uses — carries the DB password, proven
  to work from GHA, pg_dump-compatible). Joe adds only `BACKUP_GPG_PASSPHRASE`
  (store in a password manager — loss makes every backup unrecoverable). The
  job hard-fails if either is missing.
- **Restore:** download the artifact, then
  `gpg --batch --yes --decrypt --passphrase "<pass>" -o restore.dump videx-*.dump.gpg`
  and follow [From pg_dump file](#from-pg_dump-file) above.
- Uses a PGDG-pinned `postgresql-client-17` so the client version is ≥ the
  Supabase server regardless of the runner default.

## Frequency

- Manual snapshot: before any destructive migration, before major Phase boundaries.
- Off-site: **monthly, automated** via the workflow above (was: manual `pg_dump` to encrypted personal cloud storage).
