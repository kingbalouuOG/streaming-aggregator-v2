---
title: Solution — The incremental sync stored the vendor's show id as tmdb_id (IN-SY-001)
type: concept
tags: [solution, post-mortem, sync, sa-api, data-corruption, quota]
created: 2026-09-11
updated: 2026-09-11
sources:
  - docs/plans/2026-09-11-001-handoff-sync-tmdb-id-corruption.md (not yet snapshotted into raw/)
  - docs/plans/2026-09-11-002-plan-sync-tmdb-id-cleanup.md (not yet snapshotted into raw/)
related:
  - wiki/concepts/operations/sync-pipeline.md
  - wiki/entities/apis/streaming-availability-api.md
  - wiki/entities/codebase/migrations.md
  - wiki/registers/parking-lot.md
  - wiki/concepts/operations/risks-register.md
---

# Solution — The incremental sync stored the vendor's show id as `tmdb_id`

Date found: 2026-09-11. Live since: `b29bdf1`, 2026-04-01. Category: data corruption, silent. Parking lot: IN-SY-001.

## Problem

`supabase/functions/sync-incremental` consumes the Streaming Availability
`/changes` feed. Each change names its title by `showId`, which is Movie of
the Night's **own** id — Stranger Things is vendor `6`, TMDb `tv/66732`.
The loop did `parseInt(change.showId)` straight into
`streaming_availability.tmdb_id` (and `streaming_history.tmdb_id`,
`expires_on`), under a comment that called it a TMDb reference. A fallback
on `change.show?.tmdbId` never ran: the payload has no `show` object and
no TMDb id at all.

| Cohort | Rows | Distinct ids | Effect |
|---|---|---|---|
| March bulk load (`sync-content.ts`), `last_verified_at < 2026-04-01` | 40,832 | 15,718 | Correct. The control. |
| Since April, id matches no title | 31,074 | 17,103 | Invisible; **is** the `backfill_skips` table (16,692 of its 17,104 rows) |
| Since April, id collides with an unrelated title | 27,644 | — | **Renders on cards with the wrong service and link** (7 of 7 sampled NOW slugs mismatched) |
| Since April, `sa_service_id = 'tmdb-backfill'` | 765 | — | Correct — different writer (TMDb watch/providers) |
| `streaming_history` since April | 108,592 | — | All from this writer; 49,571 join a (wrong) title. The arrival / leaving-soon alerts are built on these. Nothing fired at a real user for lack of a cohort. |

Verified live on 2026-09-11 with the queries in the handoff. Why it hid
for five months: the orphaned rows fed the title backfill, whose 404s were
recorded as "dead TMDb ids", so the symptom looked like a 17k catalogue gap
rather than a bad id column.

## Why not a one-line fix

There is no correct id at the point of use. Resolving every change via
`/shows/{showId}` would cost ~1,100 distinct ids/day ≈ 33,000/month against
the plan's **25,000 requests/month** (R-032). Quota is the binding
constraint, so the shape of the fix is an architecture decision.

## Fix (the IN-SY-001 PR)

**A vendor-id → TMDb-id map, seeded almost for free.**

- **Migration 083** — `sa_show_map (sa_show_id text PK, tmdb_id, media_type, title, source, first_seen_at, last_seen_at)`. Service-role only. The id is stored as **text**: the vendor documents it as an opaque string, and storing it as an integer is the mistake this undoes.
- **`scripts/sync/backfill-service-catalogue.ts`** upserts every catalogue entry it sees into the map on any non-dry run — `/shows/search/filters` returns both `id` and `tmdbId` per entry, 20 per request. New flags: `--map-only` (seed the map, touch no availability row), `--map-out <file>` (save the staged map under `--dry-run` so a measuring walk is never paid for twice), `--map-in <file>` (seed from a saved file, zero vendor requests). The `--prune` scan now excludes `sa_service_id = 'tmdb-backfill'` rows, which come from TMDb and which a vendor-scoped prune would otherwise delete (~290 on NOW).
- **`sync-incremental`** resolves each page's show ids with one map read, then a bounded `/shows/{id}` lookup per miss (`MISS_LOOKUP_BUDGET` = 200 per chain, overridable via `lookupBudget` in the body) whose answer is written back to the map. A change that cannot be resolved is **skipped and counted** (`chain_state.stats.unresolved`, error bucket `change.unresolved`) — never written under the vendor id. A map-read failure (including the table not existing) is a fetch failure: the run fails loudly and the window is not advanced. The `extractTmdbId` helper, which tested for `'series'` and would have filed every TV title as a movie, is replaced by `parseTmdbRef` (accepts `tv/` and `series/`).

New per-chain stats in `sync_log.chain_state.stats`: `mapHits`, `mapLookups`, `unresolved`.

**Live since 2026-09-11 11:24 UTC** (function v32; 083 applied by Joe; map seeded with 31,767 entries from the Netflix and Prime walks). First chain: window consumed, 683 changes, 0 fetch failures, `map_hits` 484, `lookups` 200, `unresolved` 539 — the budget ran out because only two catalogues were mapped. 101 of 101 written rows with a Videx title match the vendor's title; 0 differ.

### Walk cost (measured 2026-09-11, dry-run)

| Catalogue | Requests | Entries | Notes |
|---|---|---|---|
| hbo, plutotv, discovery, mubi, crunchyroll (wave 1, 2026-09-10) | 253 | 4,876 | live run |
| netflix | 429 | 8,567 | complete in 4m16s; 5,218 subscription rows for held titles; 3,349 entries Videx does not hold |
| prime | 1,200 (ceiling) | 24,000+ | **NOT complete** after 10m41s — stopped at the ceiling, cursor `18530713:0`; the popularity-ordered head yields 2,937 subscription / 6,746 buy / 3,434 rent / 1,927 addon / 859 free rows for held titles; 17,907 of the first 24,000 entries are not in `titles`. Bare `catalogs=prime` includes every option type, so the full catalogue is far larger than the subscription tier |

## Cleanup (decisions for Joe, not inherited)

Costed and written up with SQL in `docs/plans/2026-09-11-002-plan-sync-tmdb-id-cleanup.md`. Nothing below has been run.

1. **Suspect availability rows** — rebuild per catalogue with the walk script (`--prune`), which deletes every row the vendor no longer lists for that service and rewrites the rest from the listing. A vendor-id row survives only if its number coincides with a real TMDb id that is genuinely on that service, in which case it is replaced by a correct row. Then delete the residue: since-April rows, not `tmdb-backfill`, whose id matches no title. March rows for titles that have genuinely left a service are pruned too — that is the walk doing its job, not collateral. The same walks can absorb **IN-SC-001** (`--include-unknown-titles` lets title-less rows through for the 05:00 backfill to create the titles) — opt-in, because ~1,700 of the ~3,979 missing wave-1 titles are anime and that shifts catalogue composition; measure with `npm run eval:fingerprints` first.
2. **`backfill_skips`** — delete the 16,692 rows whose id is a since-April orphan; keep the 412 that are not explained by orphans (likely genuine 404s). Must run **before** the walks, because the prune removes the orphan rows the predicate depends on.
3. **`streaming_history`** — either repair in place through the map (every since-April row is from this one writer, so `tmdb_id::text = sa_show_map.sa_show_id` is unambiguous — run exactly once, in one transaction, delete-unexplained-first) or purge all 108,592 since-April rows. Repair keeps the audit trail; purge is simpler. Decide before the H1 community rollout puts real people behind the alerts.
4. **Cadence** — daily `/changes` stays (≈121 requests/day on 13 catalogues). A weekly full walk of all 13 catalogues with `--prune` is the reconciliation pass and the map refresh; whether it fits the quota is a function of the walk-cost table above.

## Verification

The property: every availability row's `tmdb_id` names the title its own
deep link points at. ITVX, Channel 4, NOW and BBC links carry readable
slugs, so this is checkable without a second API call:

```sql
select t.title, sa.service_id, sa.deep_link_url
from streaming_availability sa
join titles t on t.tmdb_id=sa.tmdb_id and t.media_type=sa.media_type
where sa.service_id in ('itvx','channel4','now')
  and sa.last_verified_at >= '2026-09-12'   -- first post-fix run
order by random() limit 14;
```

Regress against the March cohort, which is known good.

## Lessons

- **A comment is not a contract.** The line said `showId` was a TMDb id; nothing checked it. Any id crossing a vendor boundary needs a sample joined against the target table before it is trusted.
- **Watch for the symptom that explains itself.** 17k "dead TMDb ids" was a satisfying story and it was wrong. The skip list should have been sampled: none of those ids existed at TMDb because none of them were TMDb ids.
- **When the id is missing at the point of use, buy it where it is cheapest.** The listing endpoint gives 20 (vendor id, TMDb id) pairs per request; the detail endpoint gives one. A map fed by the cheap source and topped up by the expensive one is the general shape.
