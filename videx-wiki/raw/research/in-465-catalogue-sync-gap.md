# IN-465 — Catalogue Sync Gap Investigation

**Status:** investigation skeleton (Phase 5.5 C17). Filled in once Joe runs the diagnostic queries + TMDb sample.
**Created:** 2026-05-14
**Owner:** Joe runs diagnostics; CC writes up findings.

## Why this exists

The `streaming_availability` table is populated by the SA API ingest
pipeline. The `titles` table is populated by the TMDb sync pipeline
(`scripts/sync-content.ts`). Each row in `streaming_availability`
should join to a `titles` row via `(tmdb_id, media_type)`. At plan-time
(2026-05-07) ~3,807 distinct `(tmdb_id, media_type)` pairs existed in
`streaming_availability` with no joining `titles` row, heavily Prime-
skewed.

Downstream impact: any candidate-pool query that filters
`titles.embedding IS NOT NULL` silently drops these titles from the
For You surface, search, anchored mood rooms, and the per-service home
rows. The user-facing symptom is that titles available on (mostly)
Prime that the rec engine should be able to recommend never appear.

C17 closes the gap by:
1. Confirming the current missing-count + service distribution.
2. Characterising the missing set (year buckets, genres, popularity).
3. Deciding whether the recurring fix is a discover-pattern tweak,
   a sync-pipeline refactor, or one-off-backfill-only.

C18 then ships the one-off backfill + (conditionally) the recurring
fix based on C17's findings.

## Diagnostic outputs (run 2026-05-15)

### §C17.1 — Current missing-count (Q1)

```
missing_n: 5,446
```

Compared to plan-time snapshot of ~3,807: grown ~43% in a week.
Expected — SA API continues to add UK availability rows for titles
the recurring TMDb sync isn't reaching, so the gap is widening at
roughly the catalogue-growth rate.

### §C17.2 — Missing-count by media_type (Q2)

| media_type | missing_n |
|---|---|
| movie | 4,511 (83%) |
| tv    | 935 (17%) |

Heavy movie skew. Consistent with the Prime back-catalogue
hypothesis (Prime's catalogue is movie-dominant).

### §C17.3 — Missing-count by service (Q3)

| service_id | missing_unique_titles |
|---|---|
| prime    | 4,582 (84%) |
| apple    | 301 |
| channel4 | 233 |
| netflix  | 194 |
| itvx     | 99 |
| disney   | 74 |
| paramount | 62 |
| now      | 51 |

**Prime-skew confirmation:** yes — Prime alone holds 84% of distinct
missing titles. All other UK services combined: 1,014 (~19%; some
titles appear on multiple services so per-service rows sum > 5,446).

**Other services with non-trivial missing counts:** Apple (301) and
Channel 4 (233) are the next tier; each ~5% of the gap. Below that
(Netflix 194 / ITVX 99 / Disney 74 / Paramount 62 / NOW 51) the
missing count is small enough to be statistical noise from
catalogue churn, not a structural gap.

### §C17.4 — TMDb sample profile (`scripts/in-465-tmdb-sample.ts`)

100 deterministically-ordered IDs (lowest tmdb_id first — TMDb IDs
are assigned in catalogue order over time, so this is the oldest
end of the missing set):

```json
{
  "totalSampled": 100,
  "notFoundOnTmdb": 23,
  "byMediaType": { "movie": 66, "tv": 34 },
  "byYearBucket": {
    "pre-2000":  43,
    "2000-2009": 31,
    "unknown":    3
  },
  "byPopularityQuartile": {
    "q1 (<5)":   61,
    "q2 (5-15)": 15,
    "q3 (15-50)": 1,
    "q4 (50+)":   0
  },
  "topGenres": [
    { "name": "Drama",   "count": 34 },
    { "name": "Comedy",  "count": 26 },
    { "name": "Romance", "count": 15 },
    { "name": "Crime",   "count": 11 },
    { "name": "Thriller","count": 11 }
  ],
  "byService": {
    "prime": 82, "now": 7, "itvx": 5, "paramount": 5,
    "disney": 4, "netflix": 3, "channel4": 2, "apple": 1
  }
}
```

Key observations:
- **Year-bucket dominance:** 74% pre-2010 (43 pre-2000 + 31
  2000-2009). Zero in 2020+. **Back-catalogue.**
- **Popularity quartile dominance:** 79% of the TMDb-existing
  titles sit in q1 (popularity < 5). Zero in q4. **Long-tail.**
- **Top genres:** Drama / Comedy / Romance / Crime / Thriller —
  these are MAINSTREAM genres, just *old* mainstream. Not weird
  niche content. Real catalogue gap, not noise.
- **TMDb-404 rate:** 23/100 = 23%. These titles exist on the SA
  API side but have been deleted from TMDb (e.g. catalogue churn,
  duplicate-merge, regional-rights vacated). The backfill will
  skip these — they stay missing forever. Acceptable noise floor.

## Root-cause diagnosis

The recurring sync (`scripts/sync-content.ts:stageTmdb` + the daily
`sync-incremental` Edge Function) calls TMDb `/discover/movie` and
`/discover/tv` with:

```
watch_region=GB
with_watch_providers=8|9|350|337|39|29|582|38|54|103  (UK 10-service OR)
sort_by=popularity.desc
```

TMDb's `/discover` endpoint caps at **500 pages × 20 results = 10,000
titles per pass**. When sorted by `popularity.desc`, the 10,000 most-
popular titles across ALL 10 UK services exhaust the cap — leaving
Prime's long-tail back-catalogue (popularity < 5, the q1 quartile
holding 79% of our sample) permanently below the cap.

Other services don't hit the cap as hard because their catalogues
are smaller and skew newer (Disney+ originals, Apple TV+ originals,
Channel 4 mostly post-2000 broadcast). Prime's UK catalogue is the
deepest back-catalogue of the lot (decades of licensed content),
which is exactly why 84% of missing IDs are Prime.

## Recommendation

**Decision: MID priority.**

**Rationale:** 5,446 missing distinct ids — too many to be noise.
84% Prime, 83% movies, 74% pre-2010, 79% popularity < 5. Five
co-pointing signals at the same root cause (the popularity.desc cap
on `/discover`). The fix is a discover-pattern tweak, not a sync-
pipeline refactor. Specifically: add a back-catalogue pass keyed
by release-date decade for Prime (and optionally Apple / Channel 4,
the next-tier outliers) — each decade gets its own 500-page cap so
the long tail isn't crowded out.

## Pipeline split — important finding

Investigation surfaced an architectural fact that simplifies the
recurring fix:

- `daily-content-sync` cron calls the `sync-incremental` Edge
  Function. That function ONLY writes to `streaming_availability`
  and `availability_history` — **it never creates `titles` rows**.
- `titles` rows are created exclusively by
  `scripts/sync-content.ts:stageTmdb`, which is a **manual** script
  Joe runs from his laptop.

So the gap accumulation pattern is:
1. SA API surfaces new Prime back-catalogue
2. `sync-incremental` cron writes to `streaming_availability`
3. `titles` row needs `scripts/sync-content.ts` to be re-run
4. That script's `/discover` popularity-cap excludes back-catalogue
5. Gap persists indefinitely.

## Plan (revised)

1. **C18 backfill ships the immediate fix.** One-off TMDb fetch for
   every missing (tmdb_id, media_type), upsert into `titles`. After
   23% TMDb-404 skip, ~4,200 titles land and become embeddable via
   the next `embed-new-titles` cron run (06:45 UTC).

2. **`scripts/backfill_missing_titles.ts` IS the recurring fix.**
   The script reads from
   `streaming_availability LEFT JOIN titles WHERE titles IS NULL`,
   so every run catches whatever SA has added since the last run.
   No discover-pattern patch is needed because the missing-set is
   itself the input — there's no risk of "missing what discover
   missed". Joe re-runs this manually as a maintenance task (e.g.
   monthly) until the cron-automation work in (3).

3. **Phase 6 follow-up: wrap the backfill in a scheduled Edge
   Function.** Filed as new parking-lot entry **IN-PX-50** —
   "scheduled catalogue-gap backfill". Scope:
     - New Edge Function `backfill-missing-titles` running the same
       logic as `scripts/backfill_missing_titles.ts`.
     - `cron.schedule` registration in a new migration.
     - Cadence: weekly (catalogue churn at SA is daily but the gap
       grows slowly enough that weekly catches it; monthly is also
       acceptable).
     - TMDb API key threaded via Vault (same pattern as 039).

4. **Verification of (1):** post-backfill, re-run Q1 from
   `supabase/queries/in-465-investigation.sql` — expect `missing_n`
   to drop to ~ (number of TMDb-404 skips, ~1,250 if the 23% sample
   rate holds for the full set). 24h later, spot-check 5
   backfilled IDs in the app to confirm enrich + embed crons
   picked them up.
