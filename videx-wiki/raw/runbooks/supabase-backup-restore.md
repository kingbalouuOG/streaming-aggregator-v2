---
title: Supabase Backup and Restore Runbook
generated: 2026-04-26
---

# Supabase Backup and Restore Runbook

Backup strategy and restore procedure for Videx's Supabase database.

## Automated backups

- **Provider:** Supabase Pro tier provides daily automated backups with PITR (Point-in-Time Recovery).
- **Retention:** 7 days on Pro (extendable on higher tiers).
- **Coverage:** entire database including all schemas, RLS policies, functions, triggers, and extensions state.

## Manual snapshot (recommended before destructive migrations)

Before applying any destructive migration (e.g. 019, 024 dropped legacy columns):

### Option A: pg_dump from local

```bash
pg_dump "${SUPABASE_DB_URL}" \
  --schema=public \
  --no-owner --no-privileges \
  --format=custom \
  --file=videx-pre-migration-$(date +%Y%m%d-%H%M).dump
```

Use the direct connection string (port 5432), not the pooler.

### Option B: Supabase Dashboard

Database → Backups → Create snapshot. Stored in Supabase, not exported. Sufficient for short-window rollback.

## Restore procedure

### From PITR (preferred for recent issues)

1. Supabase Dashboard → Database → Point in Time Recovery.
2. Pick the timestamp.
3. Confirm. Supabase restores the entire DB to that point. Old state is lost.

> **Restore is destructive.** It overwrites the current database. Take a manual snapshot of the current state first if any post-incident data is worth preserving.

### From pg_dump file

```bash
pg_restore \
  --dbname="${SUPABASE_DB_URL}" \
  --no-owner --no-privileges \
  --clean --if-exists \
  videx-pre-migration-20260426-1430.dump
```

`--clean --if-exists` drops existing objects before recreating; necessary for a clean restore.

## What is **not** covered by backups

- Edge Function code (lives in repo, deploy from there).
- Edge Function secrets (set manually via `supabase secrets set`).
- pg_cron job definitions (in migrations / `supabase/cron/`).
- GitHub Actions workflow files and secrets.

## Post-restore checklist

1. Verify row counts in `titles`, `streaming_availability`, `user_interactions`, `card_impressions`.
2. Confirm RLS policies present: `SELECT count(*) FROM pg_policies;`.
3. Run `SELECT * FROM run_data_quality_check();`.
4. Confirm all extensions enabled: `SELECT extname FROM pg_extension;`.
5. Confirm pg_cron jobs scheduled: `SELECT * FROM cron.job;`.
6. Manually trigger one Edge Function and one sync stage to confirm key paths work.

## Frequency

- Manual snapshot: before any destructive migration, before major Phase boundaries.
- Off-site copy: monthly recommended. Download a `pg_dump` and store outside Supabase (e.g. encrypted in personal cloud storage).
