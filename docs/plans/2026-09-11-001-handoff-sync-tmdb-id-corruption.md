# Handoff: the incremental sync writes the vendor's show id into `tmdb_id` (IN-SY-001)

**Date:** 2026-09-11 · **Found:** while investigating why the title backfill looked slow; it was not slow, this was underneath it · **Parking lot:** IN-SY-001 · **Severity:** live data corruption, user-visible · **Clock:** the next sync runs 06:00 UTC. Joe's call (11 Sept) was to leave it running rather than pause it.

Everything below is measured, not inferred. Re-verify anything you intend to act on, but **do not re-run the investigation from scratch** — the cause is established and the evidence is reproducible from the queries here.

---

## The defect

`supabase/functions/sync-incremental/index.ts`, in the `/changes` loop:

```ts
// SA API new format: showId is a plain numeric string (e.g. "28584"),
// showType is "movie" or "series" as a separate field.
if (change.showId && change.showType) {
  tmdbId = parseInt(change.showId, 10);          // <-- this is the VENDOR's id
  mediaType = change.showType === 'series' ? 'tv' : 'movie';
} else if (change.show?.tmdbId) {
  ({ tmdbId, mediaType } = extractTmdbId(change.show.tmdbId));   // dead branch
}
```

`showId` is Movie of the Night's own show id. It has no relationship to a TMDb id. From `/shows/search/filters?country=gb&catalogs=netflix` on 2026-09-11:

| Title | vendor `id` | `tmdbId` |
|---|---|---|
| Stranger Things | `6` | `tv/66732` |
| I Swear | `22007718` | `movie/1317149` |
| The Gentlemen | `7547182` | `tv/236235` |

The value lands in `streaming_availability.tmdb_id`, and in `streaming_history.tmdb_id` and the `expires_on` dates from the same variable.

Introduced in `b29bdf1`, 1 April 2026, "C1.5 — streaming history, content vectors, incremental sync rewrite".

## What it did

| Availability rows | Count | Effect |
|---|---|---|
| March bulk load (`sync-content.ts`) | 40,832 | Correct. Zero orphaned. This is the control. |
| Since 1 April, id matches no TMDb title | 31,074 | Invisible. This is the entire `backfill_skips` table (17,104 rows, all `tmdb_404`) and it is why the catalogue gap looked like a 17k backlog when the real queue is 411. |
| Since 1 April, id collides with a real but unrelated title | 27,644 | **Renders on cards. Wrong service, wrong link.** |

Sampled NOW rows with human-readable link slugs, 7 of 7 mismatched:

- *Things to Do in Denver When You're Dead* → `nowtv.com/watch/wonder-woman-2017`
- *The Great Train Robbery* → `nowtv.com/watch/free-willy-1993`
- *Michael Hayes* → `nowtv.com/watch/million-dollar-listing-new-york`
- *Terry Jones' Barbarians* → `nowtv.com/watch/the-fast-show`

BBC rows from the older TMDb backfill were correct in the same sample (`Cutting It` → `/episodes/b00pdvy5/cutting-it`), which rules out the sampling method being at fault.

Reproduce with:

```sql
select t.title, sa.service_id, sa.deep_link_url
from streaming_availability sa
join titles t on t.tmdb_id=sa.tmdb_id and t.media_type=sa.media_type
where sa.service_id in ('itvx','channel4','now')
  and sa.last_verified_at >= '2026-04-01'
order by random() limit 14;
```

## Why it is not a one-line fix

**The `/changes` payload carries no TMDb id at all.** Checked live on 2026-09-11; the keys are exactly:

```
changeType, itemType, link, service, showId, showType, streamingOptionType, timestamp
```

There is no `show` object, so the `change.show?.tmdbId` fallback has never executed. There is no correct id available at the point of use, which is why this needs a design decision rather than a patch.

Quota is the binding constraint. The plan grants **25,000 requests/month**; usage was ~1,200 on 10 Sept, and the daily sync costs ~121.

| Approach | Cost | Verdict |
|---|---|---|
| Resolve every change via `/shows/{showId}` | ~1,100 distinct ids/day ≈ 33,000/month | Exceeds quota on its own |
| Cache a vendor-id → tmdb-id map, per-change lookup on a miss | Same as above until the map is warm; 41,038 historical ids to seed | Right idea, wrong way to seed it |
| Walk catalogues via `/shows/search/filters` | 20 shows/request, returns **both** `id` and `tmdbId` | Cheapest source of truth |

**The synthesis worth costing first:** a periodic catalogue walk builds the vendor-id → tmdb-id map almost for free, because `/shows/search/filters` returns both ids on every entry. Daily `/changes` then resolves against the map at zero request cost, falling back to a single `/shows/{id}` lookup only for ids the map has never seen. `scripts/sync/backfill-service-catalogue.ts` (merged in #153) already implements the walk with cursor pagination, a request ceiling and a dry-run, so it is a working reference rather than something to write from nothing.

**Measure the walk before committing to it.** The five wave-1 catalogues cost 253 requests for 4,876 entries. Prime and Netflix are far larger and were never measured — run the script with `--dry-run --max-requests` on each and get a real number before choosing a cadence. A weekly full walk may fit the quota; a daily one will not.

## Decisions the next session needs to make, not inherit

1. **Cadence and architecture.** Which of the three shapes above, at what frequency, and does `/changes` survive at all.
2. **What happens to the 58,718 suspect rows.** A vendor id cannot be reversed into a TMDb id without a lookup per row, so repair costs more quota than the data is worth. Deleting everything written since 1 April by a writer other than `tmdb-backfill` and rebuilding from catalogue walks is probably cheaper and is certainly more trustworthy. Note the March 40,832 are clean and must survive whatever is done.
3. **`backfill_skips`.** All 17,104 entries are `tmdb_404` against ids that were never TMDb ids. They are not dead TMDb titles, they are a symptom. They should probably be truncated as part of the cleanup, or the skip list will suppress genuine ids that happen to collide later.
4. **`streaming_history` and alerts.** Same corrupt ids, so arrival and leaving-soon alerts are built on them. Nothing has fired at a real user only because there is no cohort. Decide whether to purge the history rows too before the H1 community rollout puts real people behind those notifications.

## Guardrails

- **Do not pause the daily sync without asking** — Joe's explicit call on 11 Sept was to leave it running.
- **Anything touching production data needs Joe's approval first**, with dry-run numbers in hand. That was the pattern for the wave-1 backfill and it worked.
- `titles` has exactly two writers, `sync-content.ts` and `backfill_missing_titles.ts`. Do not become a third.
- The Edge Function does not deploy from CI. `supabase functions deploy sync-incremental` is manual.
- Worktree branch off `main`, relative paths, `npx expo lint` in `native/` if you touch anything there, wiki updated from the same worktree.

## Verification for whatever fix lands

The property to assert is that every availability row's `tmdb_id` names the title its own deep link points at. The readable-slug services (ITVX, Channel 4, NOW, BBC) make that checkable without a second API call, and the March cohort is a known-good control to regression against.
