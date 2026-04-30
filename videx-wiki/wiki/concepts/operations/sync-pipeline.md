---
title: Sync pipeline runbook
type: concept
tags: [runbook, sync, tmdb, sa-api, omdb]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/runbooks/sync-pipeline.md
related:
  - wiki/entities/apis/tmdb.md
  - wiki/entities/apis/omdb.md
  - wiki/entities/apis/streaming-availability-api.md
  - wiki/entities/codebase/database-schema.md
---

# Sync pipeline runbook

`scripts/sync-content.ts`. Bulk content sync TMDb → SA API → OMDB → vectors. Run on demand for backfill/initial population. Daily incremental runs automatically via Edge Function.

## Stages

```
npx tsx scripts/sync-content.ts --stage tmdb
npx tsx scripts/sync-content.ts --stage sa
npx tsx scripts/sync-content.ts --stage omdb
npx tsx scripts/sync-content.ts --stage vectors
```

| Stage | Source | Writes | Idempotent | Notes |
|---|---|---|---|---|
| `tmdb` | TMDb `/discover` | `titles` (insert + update) | yes | Iterates `popularity.desc`. Default ~20K titles. |
| `sa` | SA API | `streaming_availability` | yes | Iterates by `tmdb_id`. Honours `Retry-After`. Concurrency 4. |
| `omdb` | OMDB | `titles.imdb_rating`, `titles.rt_score` | yes | Skips titles missing IMDb ID. Free-tier quota 1000/day. |
| `vectors` | derived | `titles.content_vector` (legacy 24D) | yes | Backfill-only. Newer 1536D `embedding` is owned by `embed-new-titles` Edge Function and `scripts/embeddings/backfill-embeddings.ts`. |

> ⚠ Phase 1 deprecated `--stage vectors` and dropped `content_vector`. Stage entry retained in this runbook for historical reference; the live sync no longer computes 24D vectors.

## Prerequisites

`.env`: `VITE_TMDB_API_KEY`, `VITE_OMDB_API_KEY`, `SA_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`. Supabase healthy. Disk for response cache under `node_modules/.cache/` (small).

## Daily incremental sync

pg_cron at 06:00 UTC (migration 006). Edge Function `supabase/functions/sync-incremental/`. Hits SA API `/changes`, writes deltas to `streaming_availability`, appends to `streaming_history`.

Manual: `supabase functions invoke sync-incremental --no-verify-jwt`.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| 429 from SA API mid-run | RapidAPI throttled | Wait `Retry-After`; auto-resumes. Check tier. |
| EPERM on Windows during write | File watchers | Close watchers / antivirus exclusion (IN-XPS-005). |
| Empty `streaming_availability` writes | Missing service_role key | Confirm `SUPABASE_SERVICE_ROLE_KEY`. |
| `vectors` updates 0 rows | All titles already vectorised | Expected (legacy stage). |

## Health checks

```sql
SELECT count(*) FROM titles;
SELECT count(*) FROM streaming_availability;
SELECT count(*) FROM streaming_history WHERE event_time > now() - interval '24 hours';
SELECT count(*) FROM titles WHERE last_verified_at < now() - interval '7 days';
SELECT * FROM run_data_quality_check();
```
