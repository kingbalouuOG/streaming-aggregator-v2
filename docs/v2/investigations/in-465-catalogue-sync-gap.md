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

## Diagnostic outputs

### §C17.1 — Current missing-count (from `supabase/queries/in-465-investigation.sql` Q1)

```
missing_n: [PASTE Q1 RESULT]
```

Compared to the plan-time snapshot of ~3,807 — note any drift.

### §C17.2 — Missing-count by media_type (Q2)

| media_type | missing_n |
|---|---|
| (paste Q2 result rows here) | |

### §C17.3 — Missing-count by service (Q3)

| service_id | missing_unique_titles |
|---|---|
| (paste Q3 result rows here) | |

**Prime-skew confirmation:** [yes / no — based on Q3]
**Other services with non-trivial missing counts:** [list]

### §C17.4 — TMDb sample profile (from `scripts/in-465-tmdb-sample.ts`)

Run:
```bash
npx tsx scripts/in-465-tmdb-sample.ts > /tmp/in-465-sample.json
```

Paste the JSON output into the section below.

```json
[PASTE in-465-tmdb-sample.ts STDOUT HERE]
```

Key observations:
- Year-bucket dominance: [pre-2000 / 2000-09 / 2010-19 / 2020+]
- Popularity quartile dominance: [q1 / q2 / q3 / q4]
- Top genres: [from `topGenres`]
- TMDb-404 rate: [`notFoundOnTmdb / totalSampled`]

## Discover-sweep diagnosis (optional)

If §C17.4 indicates the missing set is mostly back-catalogue
(pre-2010, low popularity, niche genres), the recurring sync's
`/discover` query is likely missing them because of how it paginates.
Test this by running these TMDb discover permutations against the
same `with_watch_providers=9` (Prime) + `watch_region=GB`:

1. **Current:** `sort_by=popularity.desc` — the production behaviour.
2. **Back-catalogue:** `sort_by=popularity.asc` — flips the slice.
3. **Date-window:** `sort_by=primary_release_date.asc` with explicit
   `primary_release_date.gte` / `.lte` buckets per decade.
4. **Tier-specific:** `with_watch_monetization_types=flatrate` to scope
   to the Prime subscription tier (Prime mixes flatrate + rent + buy
   on a single provider id).

For each permutation, count how many of the 50 sampled missing IDs
appear. Whichever permutation surfaces ≥80% of the sample is the
recurring fix candidate.

## Recommendation (filled in post-investigation)

Choose one of:

- **Low-priority — backfill only.** Missing set is mostly noise
  (TMDb-deleted stubs, obscure niche titles, etc.). One-off backfill
  closes the gap; the recurring sync staying as-is is fine. C18 ships
  only the backfill script.

- **Mid-priority — backfill + discover-pattern tweak.** Investigation
  surfaces a clear discover permutation that closes the gap recurringly.
  C18 ships the backfill AND patches `scripts/sync-content.ts` (or its
  cron equivalent) with the new pattern.

- **High-priority — backfill + full sync-pipeline refactor.**
  Investigation reveals a structural issue (e.g. SA→TMDb confirmation
  step is too strict, or the recurring sync's tmdb_id lookup is
  buggy). One-off backfill still ships in 5.5 to close the immediate
  gap; full refactor punts to Phase 6 with a new IN-XXX entry.

**Decision:** [LOW / MID / HIGH]
**Rationale:** [one paragraph from §C17.1-4 evidence]
