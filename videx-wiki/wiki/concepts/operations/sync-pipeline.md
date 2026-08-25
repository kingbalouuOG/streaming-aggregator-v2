---
title: Sync pipeline runbook
type: concept
tags: [runbook, sync, tmdb, sa-api, omdb]
created: 2026-04-26
updated: 2026-08-25
sources:
  - raw/runbooks/sync-pipeline.md
related:
  - wiki/entities/apis/tmdb.md
  - wiki/entities/apis/omdb.md
  - wiki/entities/apis/streaming-availability-api.md
  - wiki/entities/codebase/database-schema.md
  - wiki/concepts/operations/risks-register.md
  - wiki/concepts/operations/edge-function-deployment.md
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

pg_cron at 06:00 UTC (migration 006; timeout set in 062). Edge Function `supabase/functions/sync-incremental/`. Hits SA API `/changes`, writes deltas to `streaming_availability`, appends to `streaming_history`.

**It does not write `titles`.** There is no `.from('titles')` call anywhere in the file. Only `scripts/sync-content.ts` and the `backfill-missing-titles` Edge Function create title rows.

Manual: `supabase functions invoke sync-incremental --no-verify-jwt`.

## Sliced, self-chaining jobs (A2, 2026-08-25)

Both long-running Edge Functions process **one slice per invocation** and hand off the next slice through `enqueue_function_call` (migration 067). Cron only ever starts slice 0.

| Job | Slice size | Budget | Chain cap | Resume state |
|---|---|---|---|---|
| `sync-incremental` | until budget | 18s | 30 slices | `chain_state` = `{since, ti, si, cursor}` |
| `backfill-missing-titles` | 50 rows | 18s | 40 slices (2,000 titles) | none — `list_missing_title_ids` is self-advancing |

Why sliced rather than one long run:

- **pg_net severs every cron→function call at 30s.** It does *not* kill the function — the 2026-08-23 backfill ran 105s and returned 200 well past the sever — but it discards the outcome, so nothing downstream ever learns whether the work succeeded.
- **The Edge Function wall-clock limit does kill it.** 62 of 145 incremental runs since 2026-03-31 (42.8%) were killed mid-pagination and left stuck at `status='running'`.
- `getLastSyncTimestamp()` reads only *completed* runs, so each stuck run made the next one re-cover the same SA API window. That is the ~40% of SA quota spent re-fetching pages already paid for.

Rules that follow from this, worth keeping:

- A partial window must **never** be marked `completed` — a chain that dies or exhausts its depth is marked `failed` on purpose, so the window gets re-covered.
- Flush early and often. The backfill flushes titles *and* skips every 10 rows; before A2 it flushed titles at 100 and skips only at the very end of a 300-row run, so anything cutting the run short discarded every completed fetch.
- Handoff goes through pg_net, not `fetch()` inside the function: an isolate can be torn down as soon as it writes its response, dropping an unflushed outbound request.

## Reading sync health

`cron.job_run_details.status = 'succeeded'` **only means pg_net queued the request.** It is not evidence the function ran, let alone succeeded. Three surfaces, in increasing order of truth:

| Surface | Tells you |
|---|---|
| `cron.job_run_details` | The cron fired and pg_net accepted the request. Nothing more. |
| `net._http_response` | Whether the HTTP call completed or timed out. Retained only a few hours. |
| `sync_log` | What the job actually did. The authoritative surface. |

```sql
-- The one query worth having: what did the jobs actually do?
SELECT * FROM sync_history;              -- superseded by migration 066
```

Since migration 066, `sync_log` columns mean what they say:

| Column | Meaning |
|---|---|
| `titles_added` | Rows inserted into `titles`. Only the backfill and `sync-content.ts` move it. |
| `availability_added` / `_updated` / `_removed` | `streaming_availability` rows. This is what the incremental sync counts. |
| `error_details` | Failures aggregated by `(scope, message)` with counts. NULL means a genuinely clean run. |
| `heartbeat_at` | Last proof of life. Stale + `running` = killed; `reap_stale_sync_runs()` closes those out. |
| `chain_state` | Resume position and running totals for a sliced job. |

> ⚠ Before 066, `titles_added` on an incremental run held the **streaming-option** count. The 2026-08-18 run reported `titles_added=925` on a day zero titles were created. Migration 066 relabelled 65 historic rows (19,811 phantom "titles added" moved to `availability_added`). Any analysis of `sync_log` predating 2026-08-25 is reading the old meaning.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| 429 from SA API mid-run | RapidAPI throttled | Wait `Retry-After`; auto-resumes. Check tier. |
| EPERM on Windows during write | File watchers | Close watchers / antivirus exclusion (IN-XPS-005). |
| Empty `streaming_availability` writes | Missing service_role key | Confirm `SUPABASE_SERVICE_ROLE_KEY`. |
| `vectors` updates 0 rows | All titles already vectorised | Expected (legacy stage). |
| `titles` stops growing; `list_missing_title_ids` climbs | **TMDb 401** — `TMDB_API_KEY` secret invalid/revoked. Froze the catalogue from 2026-06-07 to at least 2026-08-25. | Rotate the Functions secret. Since A2 the backfill aborts the whole chain on the first 401/403 and records it in `sync_log.error_details` rather than walking 300 IDs against a dead key. |
| `sync_log` row stuck at `running` | Function killed mid-run | `SELECT reap_stale_sync_runs();` — also called at the head of every run. |
| Cron "succeeded" but nothing changed | pg_net queued the request; the function failed | Read `sync_log`, then Edge Function logs. Not `cron.job_run_details`. |

## Health checks

```sql
SELECT count(*) FROM titles;
SELECT count(*) FROM streaming_availability;
SELECT count(*) FROM streaming_history WHERE event_time > now() - interval '24 hours';
SELECT count(*) FROM titles WHERE last_verified_at < now() - interval '7 days';
SELECT * FROM run_data_quality_check();

-- Catalogue growth: this must not be flat.
SELECT max(created_at) AS newest_title,
       count(*) FILTER (WHERE created_at > now() - interval '7 days') AS added_7d
FROM titles;

-- Size of the availability-without-metadata gap (~2.3s; not per-slice).
SELECT count_missing_title_ids();

-- Did the last runs actually do anything?
SELECT * FROM sync_history;
```
