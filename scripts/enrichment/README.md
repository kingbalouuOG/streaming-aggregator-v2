# Phase 0.5 Content Enrichment

One-time bulk backfill that populates the four new enrichment columns
(`keywords`, `cast_top_5`, `director`, `content_rating`) plus `runtime`
on the `titles` table from TMDb. Pairs with the ongoing-enrichment
Edge Function at `supabase/functions/enrich-new-titles/`.

## Prerequisites

`.env` at the repo root must contain:

```
VITE_TMDB_API_KEY=...
VITE_SUPABASE_URL=https://fmusugdcnnwiuzkbjquo.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

The service-role key is required because the backfill writes to every
row in `titles` regardless of RLS — the anon key cannot do that.

## Running

```bash
# Full backfill (~90 min for 20K titles at 260 ms per TMDb call)
npm run backfill:enrichment

# Process at most N rows (smoke test, debugging)
npx tsx scripts/enrichment/backfill-enrichment.ts -- --limit 50

# Dry run — fetch + extract but don't UPDATE Supabase
npx tsx scripts/enrichment/backfill-enrichment.ts -- --limit 50 --dry-run
```

(`npm run backfill:enrichment` doesn't accept extra args cleanly without
`--`, so for flags you usually want `npx tsx` directly.)

## Resuming after interruption

Re-run the same command. The backfill is resume-safe by construction:

- The work-queue query is `SELECT ... FROM titles WHERE keywords IS NULL ORDER BY id`.
- Re-running picks up wherever the last run stopped, regardless of
  whether it crashed cleanly or was killed mid-batch.
- A `.checkpoint.json` file is written after every row (atomic
  tmp+rename) for human-readable progress tracking, but it is NOT the
  source of truth — `WHERE keywords IS NULL` is.
- `.checkpoint.json` and `.failures.jsonl` are git-ignored.

## Inspecting failures

Failed rows are appended to `.failures.jsonl` (one JSON object per line)
with shape:

```json
{"id":12345,"tmdb_id":99999,"media_type":"movie","reason":"tmdb_404","at":"2026-04-11T..."}
{"id":12346,"tmdb_id":88888,"media_type":"tv","reason":"fetch_or_update_error","message":"...","at":"..."}
```

Reasons:

- `tmdb_404` — TMDb returned 404 (title was deleted upstream). The
  row's `keywords` stays NULL so a future re-run will pick it up if
  TMDb re-adds the title. Counts as `skipped`, not `failed`.
- `fetch_or_update_error` — Network error, TMDb 5xx after retries
  exhausted, or Supabase update error. The row stays unenriched.

## Verification (post-run)

After the full backfill finishes, run the row-count gate:

```sql
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE keywords IS NOT NULL)        AS keywords_populated,
  COUNT(*) FILTER (WHERE cast_top_5 IS NOT NULL)      AS cast_populated,
  COUNT(*) FILTER (WHERE director IS NOT NULL)        AS director_populated,
  COUNT(*) FILTER (WHERE content_rating IS NOT NULL)  AS rating_populated,
  COUNT(*) FILTER (WHERE runtime IS NOT NULL)         AS runtime_populated,
  ROUND(100.0 * COUNT(*) FILTER (WHERE keywords IS NOT NULL)       / COUNT(*), 1) AS keywords_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE cast_top_5 IS NOT NULL)     / COUNT(*), 1) AS cast_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE director IS NOT NULL)       / COUNT(*), 1) AS director_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE content_rating IS NOT NULL) / COUNT(*), 1) AS rating_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE runtime IS NOT NULL)        / COUNT(*), 1) AS runtime_pct
FROM titles;
```

Acceptance gates (per the Phase 0.5 brief §6.2):

- `keywords_pct`, `cast_pct`, `director_pct`, `runtime_pct` ≥ **80%**
- `rating_pct` ≥ **60%** (UK certifications are missing for a meaningful
  chunk of TMDb's older catalogue)

If any gate fails, surface the actual figure for review before declaring
the phase complete.

## Files

```
scripts/enrichment/
├── backfill-enrichment.ts       # entry point
├── tmdb-enrichment-client.ts    # rate-limited TMDb fetch helper
├── extract_fields.test.ts       # node:assert tests for the shared module
├── fixtures/                    # TMDb response fixtures for the tests
└── README.md                    # this file
```

The shared transformation logic lives at
[`supabase/functions/_shared/extract_fields.ts`](../../supabase/functions/_shared/extract_fields.ts)
so the same code runs in this Node script and in the
`enrich-new-titles` Deno Edge Function — single source of truth, no
drift.
