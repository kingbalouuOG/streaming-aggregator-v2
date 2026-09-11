# IN-SY-001 — fix landed in code; what Joe needs to run, and the four cleanup decisions

**Date:** 2026-09-11 · **Follows:** `2026-09-11-001-handoff-sync-tmdb-id-corruption.md` · **Branch:** PR #156 (`fix/sync-tmdb-id-map`) · **Status:** 083 applied, map seeded, function v32 deployed and verified on a live chain — see §2a. The sync has not written a vendor id since 11:24 UTC on 11 Sept.

Everything in §1 is built, type-checked (`deno check`) and smoke-tested. §2 is done (§2a has the numbers). §3 — the cleanup — has not touched production and is Joe's call.

---

## 1. What the PR contains

| Piece | What it does |
|---|---|
| `supabase/migrations/083_sa_show_map.sql` | `sa_show_map (sa_show_id text PK, tmdb_id, media_type, title, source, first_seen_at, last_seen_at)`, index on `(tmdb_id, media_type)`, RLS on with no policies (service-role only, same as `backfill_skips`). Additive; reversible with `DROP TABLE`. |
| `scripts/sync/backfill-service-catalogue.ts` | Upserts every catalogue entry into the map on any non-dry run (`/shows/search/filters` returns both `id` and `tmdbId`). New flags `--map-only`, `--map-out <file>`, `--map-in <file>`. `--prune` now leaves `sa_service_id = 'tmdb-backfill'` rows alone. |
| `supabase/functions/sync-incremental/index.ts` | `resolveShowIds()`: one map read per `/changes` page, then a bounded `/shows/{id}` lookup per miss (`MISS_LOOKUP_BUDGET` = 200/chain, body override `lookupBudget`), answer written back to the map. Unresolved changes are skipped and counted (`stats.unresolved`), never written under the vendor id. A map-read failure — including the table not existing — is a fetch failure: run marked `failed`, window not advanced. Buggy `extractTmdbId` ('series' test) replaced by `parseTmdbRef`. |
| Saved walks | `scripts/sync/walks/netflix.json` (8,567 entries) and `scripts/sync/walks/prime.json` (24,000 entries, the popularity head) from the dry-run measurement — gitignored, in the main checkout. Seeding from them costs **zero** vendor requests. |

## 2. Run list for Joe — in this order

The order matters: the function refuses to write without the table, and the map should be warm before the first run or the 200-lookup budget is spent on ids a walk would have given for free.

```bash
# 1. Apply migration 083 (Studio SQL editor, or the MCP apply_migration).
#    Verify:  select to_regclass('public.sa_show_map');

# 2. Seed the map from the saved dry-run walks (0 vendor requests each).
npx tsx scripts/sync/backfill-service-catalogue.ts --service netflix --map-in scripts/sync/walks/netflix.json
npx tsx scripts/sync/backfill-service-catalogue.ts --service prime   --map-in scripts/sync/walks/prime.json
#    Verify:  select source, count(*) from sa_show_map group by source;

# 3. Deploy the fixed function (manual; not in CI). The live function has verify_jwt = true — keep it.
npx supabase functions deploy sync-incremental
#    (needs SUPABASE_ACCESS_TOKEN / `supabase login`; the MCP deploy_edge_function tool is the alternative)

# 4. Optional but recommended before 06:00: run one chain now against the small window since this morning.
#    select enqueue_function_call('sync-incremental', '{}'::jsonb);
#    Then the verification query in §4. Rows it writes will carry last_verified_at >= now.
```

If step 3 happens without step 1, tomorrow's run fails loudly (`fetch_failures`, status `failed`, pipeline-health `no-failed-runs` emails you) and the window is re-covered once the table exists. It cannot write vendor ids.

## 2a. Done 2026-09-11 (Joe applied 083 at ~11:10 UTC; the rest ran from the session)

| Step | Result |
|---|---|
| 083 applied | `to_regclass('public.sa_show_map')` → present, RLS on |
| Map seeded from the saved walks | 31,767 rows (32,567 entries; 800 vendor ids are on both Netflix and Prime) |
| Function deployed | version 32, `verify_jwt = true` kept |
| First chain (11:24–11:28 UTC, window since 06:05) | **completed, window consumed**, 4 slices, 294 SA requests (94 pages + 200 lookups). 683 changes processed: 457 added, 96 updated, 130 removed. `map_hits` 484, `lookups` 200, **`unresolved` 539** (the 200/chain lookup budget was spent at 11:26; every later miss was skipped, never written). 1 change skipped for having no deep link. |
| Verification | 296 rows written; 101 of them have a Videx title and **101 of 101 match the vendor's title for the same TMDb id, 0 differ**. Readable-slug sample: *Bob's Burgers* on ITVX → `itv.com/watch/bobs-burgers`. The other 195 are genuine orphans with real TMDb ids — the legitimate backfill queue, which `backfill-missing-titles` clears at 05:00. |

**What the 539 unresolved mean.** The map is warm for Netflix and Prime's popularity head only; every other catalogue's changes fell to the 200-lookup budget and the remainder were skipped for this window. That is the designed transitional behaviour (skipped beats corrupt), but it repeats daily until the other catalogues are walked — and a skipped change is only recovered by a walk of that catalogue. So the next quota spend to approve is a `--map-only` seed of the remaining catalogues (or, better, their full cleanup walks in §3.2, which seed the map as a side effect and do the rebuild in the same requests):

```bash
for s in disney apple itvx paramount now all4 hbo plutotv discovery crunchyroll mubi; do
  npx tsx scripts/sync/backfill-service-catalogue.ts --service $s --map-only --max-requests 1500
done
```

The wave-1 five cost 253 last time; disney/itvx/paramount/now/all4 are unmeasured but small; apple is the unknown (buy/rent-heavy, plausibly 1,000–1,500). Until then, watch `unresolved` in `sync_history` each morning.

## 2b. Cleanup run 2026-09-11 (Joe approved the recommendations; §3 decisions taken) — DONE

Order actually run: skip-list prune (3.3) → walks with `--prune --include-unknown-titles` for the eleven single-tier catalogues → Apple and Prime walked **without** prune, corrupt cohort removed by date, unrefreshed March rows removed as the prune-equivalent → history repair (3.4 option A) → verification.

| Catalogue | Requests | Entries | Rows written | Pruned / removed | Note |
|---|---|---|---|---|---|
| mubi | 24 | 465 | 465 | 22 | |
| crunchyroll | 76 | 1,504 | 1,510 | 51 | |
| discovery | 48 | 948 | 948 | 5 | |
| plutotv | 17 | 325 | 325 | 595 | vendor lists 325 today (513 on 10 Sept) |
| hbo | 73 | 1,452 | 1,453 | 9 | |
| itvx | 44 | 877 | 877 | 386 | |
| all4 | 65 | 1,294 | 1,294 | 650 | |
| paramount | 45 | 881 | 882 | 347 | |
| now | 16 + 16 | 318 | 318 | 1,802 | **vendor lists 318 NOW titles today** (Hayu 148 · Entertainment 106 · Cinema 64) vs ~1,840 in March; `now.addon` returns the same 318 — filed IN-SC-003 |
| disney | 179 | 3,564 | 3,569 | 1,816 | |
| netflix | 429 | 8,568 | 8,568 | 4,328 | |
| apple | 1,504 | 30,067 | 67,134 | 11,207 corrupt + 904 stale March | buy 42,415 · rent 21,705 · addon 2,699 · sub 315 |
| prime | 2,625 (+2,625 failed first attempt) | 52,496 | 153,850 | 33,574 corrupt + 1,324 stale March | buy 60,764 · rent 50,364 · addon 18,166 · sub 18,045 · free 6,511; 41,001 entries not in `titles` |

`backfill_skips`: 16,692 deleted, 412 kept. `count_available_services_drift()` = 0 throughout. The first Prime attempt (2,625 requests) completed its walk but the writes died at row 5,400 on a transient Supabase "fetch failed" with nothing persisted — hence the retry/replay hardening in the script and a second walk (which itself absorbed five transient failures).

**History (3.4, option A) — done, run once.** 102,537 rows repaired through the map (`tmdb_id`/`media_type` rewritten), 6,055 rows the map could not explain deleted. Post-fix rows untouched.

**Verification after everything:** 241,834 availability rows; **0** rows left from the corrupt writer (the 930 April `iplayer` rows on BBC are per-title fetches, all titled, and were never in the changes feed); every title-less row's id is vouched for by the map (0 orphans the map cannot explain); of 18,566 rebuilt rows with a Videx title, **18,502 match the vendor's title exactly and 64 differ only by punctuation or alternate title**; 10 of 10 random ITVX / Channel 4 / NOW links point at their own title.

**Vendor quota, 11 Sept:** dry-run measurement 1,631 + first fixed chain 294 + cleanup walks 7,786 + probes ~15 ≈ **9,700**. Month to date ≈ 11,200 of 25,000, with ~19 daily runs (~200 each) still to come.

**Titles — the one number Joe should look at.** With `--include-unknown-titles` on every catalogue, `count_missing_title_ids()` went from 411 to **58,029**. Most of that is Prime's and Apple's buy/rent long tail (41,001 + 24,139 unknown entries), not the ~4k wave-1 titles the question started from. The 05:00 `backfill-missing-titles` chain creates ~1,900–3,000 a night (one TMDb request each), then enrich and embed follow — so at the default cadence the queue drains over **three to four weeks**, and `titles` roughly triples (34,587 → ~92k). Two levers if that is more than wanted: delete the title-less `buy`/`rent`-only rows on prime and apple before tonight (the queue collapses to the subscription/free/addon tail, ~15k), or raise `MAX_CHAIN_DEPTH` in the backfill for a faster drain. Baseline fingerprint eval before any of this: **FAIL** (max pairwise 0.985, mean 0.809, anchor fail) — saved as `scripts/sync/walks/eval-fingerprints-before-2026-09-11.md`; run `npm run eval:fingerprints` again after a Sunday 07:00 refresh once the new titles are embedded.

**Still open:** scheduling the weekly/monthly walks (3.1) as a GitHub Actions cron; the eval "after".

## 3. The four decisions

### 3.1 Cadence and architecture — RECOMMENDED: map + daily `/changes` + weekly walk

Three shapes were costed in the handoff. The synthesis is what shipped: `/changes` survives as the daily delta (≈121 requests/day on 13 catalogues, measured 11 Sept), resolved against the map at zero cost; misses fall back to one lookup each, bounded.

Walk cost, measured today in dry-run (the five wave-1 catalogues were 253 requests / 4,876 entries on 10 Sept):

| Catalogue | Requests | Entries | Walk complete |
|---|---|---|---|
| netflix | 429 | 8,567 | yes (4m16s; 5,218 subscription rows for held titles, 3,349 entries not in `titles`) |
| prime | 1,200 (ceiling) | 24,000+ | **no** — stopped at the ceiling after 10m41s at cursor `18530713:0`. Head: 2,937 subscription / 6,746 buy / 3,434 rent / 1,927 addon / 859 free rows for held titles; 17,907 of the first 24,000 entries not in `titles` |

**Recommendation.** Bare `catalogs=prime` returns every option type (the stream-type breakdown proves it: buy and rent dominate), so Prime's full catalogue is well beyond 24,000 entries and did not finish in 1,200 requests. A weekly full Prime walk alone would be ≥5,200/month — too much. Split the cadence by how fast each catalogue moves:

| Cadence | Catalogues | Cost |
|---|---|---|
| Daily | `/changes` on all 13, resolved through the map | ~121/day ≈ 3,600/month (measured 11 Sept) |
| Weekly | netflix (429) + disney, itvx, paramount, now, all4 (unmeasured; small subscription catalogues) + the wave-1 five (253) | ≈ 700–1,100/week ≈ 3,000–4,700/month |
| Monthly | prime and apple full walks (buy/rent-heavy, slow-moving inventory) | prime ≥1,200, plausibly 2,000–3,000; apple unmeasured (~9k March rows suggests ~1,000–1,500) |

Roughly 10,000–13,000/month against the 25,000 plan, leaving room for the one-off cleanup walks. Two numbers to pin before committing to it: **finish the Prime measurement from the saved cursor** (at most one more ceiling; the file it saves seeds the tail of the map) and **measure apple**:

```bash
npx tsx scripts/sync/backfill-service-catalogue.ts --service prime --dry-run --max-requests 1500 --cursor 18530713:0 --map-out scripts/sync/walks/prime-2.json
npx tsx scripts/sync/backfill-service-catalogue.ts --service apple --dry-run --max-requests 1500 --map-out scripts/sync/walks/apple.json
```

Until Prime's tail is walked, changes on Prime buy/rent titles outside the popularity head fall to the 200/chain lookup budget — watch `unresolved` in the first few runs. The weekly/monthly walks are run by hand (or a GitHub Actions cron alongside `pipeline-health.yml`) — not from an Edge Function, which cannot run long enough.

### 3.2 The 58,718 suspect availability rows — RECOMMENDED: rebuild by walk, then delete the residue

Repairing in place is possible for rows whose vendor id the map knows, but it cannot distinguish a vendor-id row from a correct row written the same day by the wave-1 walk on the same five services, so it is not trustworthy. The walk is: for each of the 13 catalogues, `--prune` deletes every row the vendor no longer lists for that service and rewrites the rest from the listing. A vendor-id row survives only if its number coincides with a real TMDb id that is genuinely on that service, in which case the walk replaces it with a correct row.

```bash
# dry-run each first; Joe approves with the numbers in hand
for s in netflix prime disney apple itvx paramount now all4 hbo plutotv discovery crunchyroll mubi; do
  npx tsx scripts/sync/backfill-service-catalogue.ts --service $s --dry-run --prune --max-requests 1500
done
# then live, same list, without --dry-run
```

Then the residue — since-April rows, not `tmdb-backfill`, whose id matches no title. After the walks these can only be vendor ids for services the walk did not cover (there are none) or coincidences the walk pruned:

```sql
-- count first
select count(*) from streaming_availability sa
left join titles t on t.tmdb_id = sa.tmdb_id and t.media_type = sa.media_type
where t.tmdb_id is null
  and sa.last_verified_at >= '2026-04-01'
  and sa.sa_service_id <> 'tmdb-backfill';

-- then delete with the identical predicate
delete from streaming_availability sa
using (
  select sa2.id from streaming_availability sa2
  left join titles t on t.tmdb_id = sa2.tmdb_id and t.media_type = sa2.media_type
  where t.tmdb_id is null
    and sa2.last_verified_at >= '2026-04-01'
    and sa2.sa_service_id <> 'tmdb-backfill'
) x where x.id = sa.id;

select public.count_available_services_drift();   -- expect 0
```

The March rows are touched only where a title has genuinely left a service, which is the prune working as intended. `tmdb-backfill` rows (bbc, now, skygo — 765 since April, all correct) are never touched.

**⚠ Learned on NOW during the run (2026-09-11): never `--prune` an addon-tiered service off its bare listing.** The vendor models NOW as `subscription: false` with three addons (Cinema `movies`, Entertainment, Hayu); Prime and Apple carry ~85 and ~50 channel addons. `catalogs=now` listed 318 entries and the prune removed 1,802 rows, including the March tiers. A `now.addon` walk (`--catalog now.addon`, prune refused) then returned the **same 318** — so the vendor's NOW catalogue genuinely is 318 titles today (Hayu 148 · Entertainment 106 · Cinema 64) against ~1,840 in March, and the prune matched vendor truth. The lesson stands regardless: for Prime and Apple the walk ran **without** `--prune`, and the corrupt cohort was removed by date instead — every row written between 2026-04-01 and the 11:24 deploy on those services came from the corrupt writer, so `delete … where service_id = X and sa_service_id <> 'tmdb-backfill' and last_verified_at >= '2026-04-01' and last_verified_at < '2026-09-11 11:24'` is exact, and the walk first refreshes any that were coincidentally right. The vendor's catalogue ids are `service` or `service.type` (subscription | rent | buy | free | addon); addon *names* are rejected.

**Optional, and a decision in its own right — absorb IN-SC-001 into the same walks.** The walk already carries a correct TMDb id for every catalogue entry, including the ~3,979 wave-1 entries `titles` has no row for (Crunchyroll 1,431 · HBO Max 965 · Discovery+ 808 · Pluto TV 371 · MUBI 404). Adding `--include-unknown-titles` writes their availability rows too (still no `titles` write); the nightly `backfill-missing-titles` chain at 05:00 UTC then creates the titles from those rows, as it does for the daily sync's, and enrich/embed follow at 06:30/07:15. The real queue is 411 today, so there is headroom, though ~4k rows is a few nights of chain capacity (~1,900/day). **Caveat to decide rather than inherit:** roughly 1,700 of those are anime; dropping them into a 34,587-title catalogue shifts its composition, and service fingerprints, mood clusters and taste vectors all derive from it. Crunchyroll at 71 titles is close to useless, so it may well be right — but measure it: `npm run eval:fingerprints` before and after. Raised by the session that filed IN-SC-001.

### 3.3 `backfill_skips` — RECOMMENDED: delete the 16,692 explained rows, keep the 412

All 17,104 are `tmdb_404`, but only 16,692 are since-April orphan ids; 412 are not explained by any orphan row and are probably genuine dead TMDb ids. **Run before the walks** — the prune removes the orphan rows this predicate depends on.

```sql
-- expect 16,692
select count(*) from backfill_skips s
join (
  select distinct sa.tmdb_id, sa.media_type from streaming_availability sa
  left join titles t on t.tmdb_id = sa.tmdb_id and t.media_type = sa.media_type
  where t.tmdb_id is null and sa.last_verified_at >= '2026-04-01' and sa.sa_service_id <> 'tmdb-backfill'
) o on o.tmdb_id = s.tmdb_id and o.media_type = s.media_type;

delete from backfill_skips s
using (
  select distinct sa.tmdb_id, sa.media_type from streaming_availability sa
  left join titles t on t.tmdb_id = sa.tmdb_id and t.media_type = sa.media_type
  where t.tmdb_id is null and sa.last_verified_at >= '2026-04-01' and sa.sa_service_id <> 'tmdb-backfill'
) o where o.tmdb_id = s.tmdb_id and o.media_type = s.media_type;
```

`count_missing_title_ids()` will not move: the residue rows are deleted in 3.2, so nothing new enters the backfill queue.

### 3.4 `streaming_history` and the alerts — two options, Joe's call

Every since-April row (108,592) is from this one writer (`sync_run_id` set on all of them), so `tmdb_id` is a vendor id on every one. `send-notifications` builds arrival alerts from `event_type = 'added'` in the last day; leaving-soon reads `expires_on` off availability directly. Nothing has reached a real user.

**Option A — repair through the map (keeps the audit trail).** Unambiguous because there is exactly one writer. Run **once**, in **one transaction**, delete-unexplained-first — the update is not idempotent (a repaired TMDb id could coincidentally equal another vendor id on a second pass):

```sql
begin;
-- rows the map cannot explain (count first; expect small once all 13 catalogues are walked)
delete from streaming_history h
where h.recorded_at >= '2026-04-01'
  and not exists (select 1 from sa_show_map m where m.sa_show_id = h.tmdb_id::text);

update streaming_history h
set tmdb_id = m.tmdb_id, media_type = m.media_type
from sa_show_map m
where m.sa_show_id = h.tmdb_id::text
  and h.recorded_at >= '2026-04-01';
commit;
```

**Option B — purge.** `delete from streaming_history where recorded_at >= '2026-04-01';` Simpler; loses five months of movement data that was wrong anyway.

Either way, do it before the H1 community rollout, and after the walks (Option A needs the map warm).

## 4. Verification after the first post-fix run

```sql
-- every new row's tmdb_id must name the title its own link points at
select t.title, sa.service_id, sa.deep_link_url
from streaming_availability sa
join titles t on t.tmdb_id = sa.tmdb_id and t.media_type = sa.media_type
where sa.service_id in ('itvx','channel4','now')
  and sa.last_verified_at >= '2026-09-11 12:00'   -- after deploy
order by random() limit 14;

-- the run's own accounting
select started_at, status, sa_requests,
       chain_state->'stats'->>'mapHits'    as map_hits,
       chain_state->'stats'->>'mapLookups' as lookups,
       chain_state->'stats'->>'unresolved' as unresolved,
       error_details
from sync_log where sync_type = 'incremental' order by started_at desc limit 3;

-- no new orphans should appear from a resolved change unless the title is genuinely not in `titles`
-- (that is the legitimate backfill queue, ~411 today)
select count_missing_title_ids();
```

## 5. Rollback

- Function: redeploy the previous commit. The old code writes vendor ids again — do not.
- Migration: `drop table public.sa_show_map;` — the fixed function then fails loudly and stops writing; it never falls back to the vendor id.
- Script: `--map-only` / `--map-in` write only `sa_show_map`; a walk without `--prune` only adds and refreshes.
