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

## Cron schedule

| UTC | Job | Cadence |
|---|---|---|
| every 5 min | `chain-watchdog` | resumes stalled chains (SQL only) |
| 05:00 | `backfill-missing-titles` | daily since migration 069 (was weekly) |
| 06:00 | `daily-content-sync` | daily |
| 06:30 | `enrich-new-titles` | daily |
| 07:15 | `embed-new-titles` | daily since 069 (was 06:45) |
| 07:00 Sun | `refresh-service-fingerprints` | weekly |
| 08:00 | `daily-send-notifications` | daily |

Two ordering constraints hold this together:

- **backfill must finish before the sync.** A 12-slice chain is ~16 min, so
  05:00-05:16 against a 06:00 sync.
- **embed must start after enrich finishes.** Enrich runs 06:30 to ~06:46
  on a full chain. Overlap is not destructive — embed only selects
  `keywords IS NOT NULL`, so it would miss the tail and *correctly* report
  the queue drained — but the stragglers would then wait a full day. Hence
  07:15.

A title whose availability arrives in today's 06:00 sync is picked up by
*tomorrow's* 05:00 backfill, so new titles carry a one-day lag. Deliberate:
reordering backfill after the sync leaves no room before enrich.

### Queue ordering (A3)

`list_missing_title_ids` orders by **most recent availability**, not
`tmdb_id`. Migration 070, shipped 2026-08-26.

The original reason for changing it turned out to be obsolete: the plan
said the head of the queue was dead low-ID stubs that mostly 404, but by
the time A3 was implemented the skip-list had already drained that entire
zone (zero rows below tmdb_id 10000 remained, 2,016 confirmed 404s
recorded). The reason it was still worth doing is user-facing — the gap
spans tmdb_id 11,035 to 26,522,482, so ascending order works the catalogue
oldest-first:

| Ordering | Head of queue |
|---|---|
| `tmdb_id ASC` (old) | tmdb_id 11,035-12,278, mostly pre-2000 |
| most-recently-available | 250/250 available within the last 30 days |

Ordering does not change *whether* a title is fetched, only *when* — the
queue drains in ~14 days either way. It decides whether users see this
month's additions on day 1 or day 14.

> **Cost: ~9ms to ~1,025ms per call.** The ORDER BY forces a full
> HashAggregate over the anti-join instead of streaming from
> `idx_sa_lookup`. Fine at 12 calls per chain (~12s against a ~945s run).
> **Do not call this RPC in a tighter loop than once per slice.**

### Why daily, not weekly

The gap was **growing** under weekly cadence:

```
2026-08-25   count_missing_title_ids   22,260
2026-08-26   count_missing_title_ids   22,729   (+469, after a chain drained 595)
```

The daily SA sync adds ~1,000 new `(tmdb_id, media_type)` gaps per day. A
weekly chain delivers 3,000/week ≈ 428/day. **Inflow beat drain, so the
backlog could never close** — the original plan's "74 weeks to drain" was
optimistic rather than pessimistic. Daily nets ~2,000/day and clears
~22.7k in roughly eleven days, then holds steady with one- or two-slice
runs. This is why the A4 one-off bulk burst was never needed.

If `count_missing_title_ids()` starts climbing again on a daily cadence,
inflow has outgrown the chain: raise `MAX_CHAIN_DEPTH` in
`backfill-missing-titles`.

## Sliced, self-chaining jobs (A2, 2026-08-25)

Both long-running Edge Functions process **one slice per invocation** and hand off the next slice through `enqueue_function_call` (migration 067). Cron only ever starts slice 0.

| Job | Slice size | Budget | Chain cap | Resume state |
|---|---|---|---|---|
| `sync-incremental` | until budget | 75s | 10 slices | `chain_state` = `{since, ti, si, cursor}` |
| `backfill-missing-titles` | 250 rows | 75s | 12 (3,000 titles) | none — `list_missing_title_ids` self-advances |
| `enrich-new-titles` | 250 rows | 75s | 12 (3,000 rows) | none — `WHERE keywords IS NULL` self-advances |
| `embed-new-titles` | 500 rows | 75s | 12 (6,000 rows) | none — `WHERE embedding IS NULL` self-advances |

### Sizing: invocation count is the scarce resource, not duration

Slices were first sized at 50 rows / 18s. The first live chain died at slice 12:

```
16:02:36  slice 11 done — queued depth 12
16:02:36  POST | 502 | .../backfill-missing-titles
```

Edge Runtime workers linger minutes past the end of their request — that
chain's shutdown events trail on until 16:05:37, three minutes after the
last slice ran. Twelve invocations inside 3.5 minutes exhausted the
concurrent-worker allowance.

**Slices should therefore be big and few, not small and many.** Single
invocations of 105s and 128s are known to complete; forty 18s ones are
not. Resized the same day to 250 rows / 75s, plus a 3s pause before each
handoff. Keep new slices in the 60-90s band: below that the invocation
count climbs, above ~150s is where runs were being killed outright.

### Handoffs need a watchdog

`enqueue_function_call` returning successfully means pg_net **queued** the
request. It says nothing about delivery — the 502 above killed the chain
silently, which is structurally the same bug as `cron.job_run_details` =
`'succeeded'`, one layer down.

`resume_stalled_chains()` (migration 068, pg_cron every 5 min, pure SQL so
it cannot itself be severed) restarts any chain whose heartbeat is over 3
minutes old, from its saved depth. It records the delivery status looked
up from `net._http_response` via `chain_state.last_request_id`, and gives
up after 5 attempts with the reason in `error_details`. Resuming bumps
`heartbeat_at`, so the 10-minute reaper cannot close a row out from under
a chain the watchdog is nursing.

Duplicate slices are possible if the watchdog resumes a chain that was in
fact still alive. This is safe by construction — every slice's writes are
idempotent (`titles` upsert on `(tmdb_id, media_type)`, enrich/embed are
single-row updates keyed by id) — so the cost is wasted work, never
corruption. **Any new sliced job must preserve that property.**

### Completion must mean "finished the work", not "fetched a short page"

A sliced job stops chaining when it decides the queue is drained. Deriving
that from the row count alone is wrong:

```
titles_processed: 200      queue_at_start: 371
stopped_because: "queue drained"   queue_at_end: 171
```

That run (embed, 2026-08-26) fetched 371 rows under its 500 cap, processed
200, hit the 75s budget, and called it drained — stopping barely half way
through the work it was started to do, and recording that as success.

**A short fetch only means "empty queue" if the slice got through
everything it fetched.** Every row-count-driven job now sets a `truncated`
flag when the elapsed-time budget cuts its loop short, and the drain check
requires `!truncated`.

`sync-incremental` never had this bug, because it derives completion from
its loops actually running out rather than from a row count. That is the
more robust shape — prefer it for new sliced jobs.

### The downstream jobs are the constraint

Repairing the backfill made `enrich-new-titles` and `embed-new-titles` the
bottleneck: the 2026-08-25 chain added 379 titles against a downstream
capacity of 100/day each.

This is not just lag. `embed-new-titles` only processes rows where
`keywords IS NOT NULL`, so an unenriched title is never embedded — and a
title with no embedding is not retrievable by `match_titles_by_vector`,
so it **cannot appear in For You at all**. An under-fed enrich queue is
invisible catalogue, and `count(*) FROM titles` will not show it.

> `embed-new-titles` used to call `embedSingle` per row — one OpenAI
> request per title. The shared client in `_shared/openaiEmbeddings.ts`
> has always exposed `embedBatch`, which accepts an array and returns one
> embedding per input in positional order. It now sends 100 titles per
> request. If you add another embedding path, batch it.

Batching the OpenAI calls only moved the bottleneck. Measured on two live
chains, 2026-08-26: **200 rows / 78s** and **171 rows / 70s** — about
400ms per row, all of it one PostgREST `UPDATE` round trip per row. That
capped a 75s slice near 200 rows and embed near 2,400 rows/day, against
the ~1,900 rows/day daily backfill produces.

`bulk_set_title_embeddings()` (migration 069) writes a whole chunk in one
statement. **The general lesson: in a sliced Edge Function, per-row DB
round trips are usually the real cost, not the third-party API.** Check
that before sizing a slice.

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
| Chain stops mid-run; `slices` stops climbing | Handoff not delivered — HTTP 502 from the Edge Runtime under rapid invocation | The watchdog resumes it within 5 min. If `chain_state.resumes` keeps climbing, slices are too small: raise `SLICE_LIMIT`, lower `MAX_CHAIN_DEPTH`. |
| Titles exist but never appear in For You | No embedding — the enrich/embed queue is behind | `SELECT count(*) FROM titles WHERE embedding IS NULL;` then trigger the chains (see health checks). |

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

-- Can these titles actually be recommended? No embedding means not
-- retrievable by match_titles_by_vector, so not eligible for For You.
SELECT count(*) FILTER (WHERE keywords IS NULL)  AS awaiting_enrich,
       count(*) FILTER (WHERE embedding IS NULL) AS awaiting_embed
FROM titles;

-- Chain health across all four sliced jobs.
SELECT sync_type, status, titles_processed,
       chain_state->>'slices'  AS slices,
       chain_state->>'resumes' AS resumes,
       chain_state->>'stopped_because' AS stopped_because
FROM sync_log WHERE chain_state IS NOT NULL
ORDER BY started_at DESC LIMIT 8;
```

Manual trigger for any sliced job (starts slice 0; the chain self-drives):

```sql
SELECT enqueue_function_call('enrich-new-titles');
SELECT enqueue_function_call('embed-new-titles');
```
