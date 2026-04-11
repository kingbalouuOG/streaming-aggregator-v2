# enrich-new-titles Edge Function

Ongoing enrichment of new titles arriving from the daily content sync.
Companion to the one-time `scripts/enrichment/backfill-enrichment.ts`
script — same logic, same shared transformer module
([`../_shared/extract_fields.ts`](../_shared/extract_fields.ts)),
different runtime.

The work queue is `SELECT ... FROM titles WHERE keywords IS NULL` —
identical to the backfill. Per-invocation budget: **100 rows**, ~26 s
of TMDb work at the 260 ms rate gate.

## Deployment

```bash
npx supabase functions deploy enrich-new-titles --project-ref fmusugdcnnwiuzkbjquo
```

JWT verification is **on** (no `--no-verify-jwt`). The cron job and any
manual invocation must pass a `Bearer <service-role-key>` header.

## Required secrets

Set once via the Supabase CLI before the first deploy:

```bash
npx supabase secrets set TMDB_API_KEY=<your-tmdb-v3-api-key> --project-ref fmusugdcnnwiuzkbjquo
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-provided by the
Functions runtime — do NOT set them manually.

## Manual smoke test (after deploy)

```bash
curl -X POST https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/enrich-new-titles \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response (200):

```json
{
  "status": "ok",
  "processed": 100,
  "skipped": 0,
  "failed": 0,
  "remaining": 19899
}
```

Check the function logs in the Supabase dashboard for the per-row error
details if any failures appear.

## End-to-end new-title test

Reproducible test that proves the ongoing pipeline works without
waiting for the daily sync to insert a real new title.

1. **Insert a synthetic test row** with all enrichment columns NULL but
   a real recent-release TMDb ID. Pick a popular movie or TV show that
   TMDb definitely has full metadata for. Example using The Substance
   (2024 movie, tmdb_id 933260):

   ```sql
   INSERT INTO titles (tmdb_id, media_type, title)
   VALUES (933260, 'movie', 'E2E Test Row — DELETE ME')
   RETURNING id, tmdb_id, media_type, keywords;
   ```

   Confirm `keywords` is `NULL`.

2. **Invoke the function:**

   ```bash
   curl -X POST https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/enrich-new-titles \
     -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

3. **Verify the row** has all five enrichment fields populated:

   ```sql
   SELECT tmdb_id, media_type, title, keywords, cast_top_5,
          director, content_rating, runtime
   FROM titles
   WHERE tmdb_id = 933260 AND media_type = 'movie';
   ```

   Expected: `keywords` is a non-empty `text[]`, `cast_top_5` has 5
   names, `director` is a string, `content_rating` is `'15'` or
   similar, `runtime` is an integer.

4. **Delete the test row:**

   ```sql
   DELETE FROM titles
   WHERE tmdb_id = 933260
     AND media_type = 'movie'
     AND title = 'E2E Test Row — DELETE ME';
   ```

   The `title` predicate is a safety belt — never delete by tmdb_id
   alone, in case the daily sync has independently inserted the real
   row with the same tmdb_id between steps 2 and 4.

## Schedule

Wired via `supabase/cron/enrich_new_titles.sql` — pg_cron job
`enrich-new-titles` fires daily at **06:30 UTC**, 30 minutes after
the existing `daily-content-sync` job. Apply the cron config manually:

```bash
npx supabase db query --linked < supabase/cron/enrich_new_titles.sql
```

Verify:

```sql
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = 'enrich-new-titles';
```

## Failure semantics

- **TMDb 404**: counted as `skipped`, the row's `keywords` stays NULL
  so a future invocation will pick it up if TMDb re-adds the title.
- **TMDb 429 / 5xx**: 2 retries with exponential backoff (4 s, 8 s).
  After that, counted as `failed` and skipped this invocation. The
  row's `keywords` stays NULL — next day's run picks it up again.
- **Supabase update error**: counted as `failed`, logged with the
  Postgres error message.
- **Per-row exceptions never throw out of the handler.** The function
  always returns a 200 with the failure counted in `stats.failed`,
  because pg_cron has no retry-on-failure logic for `http_post` calls.
