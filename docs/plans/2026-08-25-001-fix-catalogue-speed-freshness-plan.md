# Launch-blocking remediation: catalogue, speed, freshness

**Status:** proposed · **Date:** 2026-08-25 · **Owner:** Joe + CC

Three issues block viable launch: (1) the catalogue has been frozen since 2026-06-07, (2) cold-open latency is 5s+ on WiFi and worse on cellular, (3) For You returns the same titles in the same order. All three were investigated against the live database on 2026-08-25; evidence is inline.

**Key dependency: Workstream C is not worth shipping before A.** Rotation logic only feels fresh if there is fresh stock to rotate in.

---

## Evidence base (measured 2026-08-25)

| Metric | Value | Source |
|---|---|---|
| `titles` rows | 22,864 | live count |
| Newest `titles.created_at` | **2026-06-07** (79d ago) | live |
| New titles in last 30d | **0** | live |
| Missing titles (`list_missing_title_ids`) | **22,260** | live RPC |
| Missing with `tmdb_id < 10000` | 6,644 | live |
| `backfill_skips` recorded | 600 | live |
| `match_titles_by_vector(500)` cold | **8.2s → statement timeout** | measured |
| `match_titles_by_vector(1500)` warm | **247 ms** | measured |
| `get_available_tmdb_ids` (6 services) | 1.2–2.9s, 41,151 ids, 256 KB | measured |
| Avg times a user sees the same title | **4.2** | `card_impressions` |
| Max views of one title by one user | **52** | `card_impressions` |

---

## Workstream A — Catalogue pipeline repair (ROOT CAUSE, do first)

Four compounding failures, all confirmed:

1. **`sync-incremental` never writes `titles`.** No `.from('titles')` write exists in the file. `stats.added` (line 332) counts new *streaming options*; line 423 reports it as `titles_added`. The sync log has been reporting phantom title additions (e.g. "925 added" on a day when zero titles were created).
2. **pg_net severs the call at 30s.** `net._http_response` shows `daily-content-sync` and `enrich-new-titles` timing out at 30,000ms daily. `backfill-missing-titles` sleeps 260ms/title and first flushes at 100 titles (~35–45s) — killed before its first write, so the buffer is discarded.
3. **Worst-first ordering.** `list_missing_title_ids` is `ORDER BY tmdb_id ASC`; the head of the queue is dead low-ID records that mostly 404 (next up: `9/tv, 65/tv, 70/movie, 92/movie`).
4. **Throughput.** 300/run × weekly vs 22,260 backlog = **74 weeks**.

### A1. Fix observability first (cheap, unblocks everything)
- Rename `titles_added` → `availability_added` in `sync_log`; add a real `titles_added` sourced from the backfill.
- Populate `sync_log.error_details` (currently always null despite `errors=1` on many runs).
- Record Edge Function outcomes, not pg_net queue status. `cron.job_run_details` "succeeded" only means *the request was queued* — it is not evidence the job ran.

### A2. Decouple long jobs from the 30s pg_net ceiling
Options (pick one):
- **(a) Self-chaining function** — process a slice well under 20s, then re-invoke for the next slice. Removes the wall-clock ceiling entirely. *Recommended.*
- (b) Move the driver to a GitHub Actions workflow (no 30s limit), as `mood-rooms-recluster` already does.
- (c) Queue-based: cron enqueues, worker drains.

Whichever is chosen, **flush per chunk and flush early** so a severed connection cannot discard completed work.

### A3. Reorder the queue by value
Change `list_missing_title_ids` ordering from `tmdb_id ASC` to a relevance proxy — most recent availability change, newest `release_date`, or service popularity. Users care about what landed on Netflix this week, not tmdb_id 9. Pre-filter obviously dead ranges into `backfill_skips`.

### A4. Clear the backlog out-of-band
22,260 titles will not drain on a weekly cadence. Run `scripts/enrichment/backfill_missing_titles.ts` (the manual, unlimited counterpart) once to clear the bulk, then let the scheduled job maintain steady state. Respect TMDb rate limits; run off-peak.

### A5. Raise cadence
Once A2 removes the timeout, move backfill from weekly to daily.

**Exit criteria:** `titles` grows daily; `list_missing_title_ids` trends below 500; `sync_log` reports true counts; no pg_net timeouts.

### Note on the SA API quota
The SA API is **never called at runtime** — verified exhaustively: two call sites, both batch (`scripts/sync-content.ts`, `supabase/functions/sync-incremental`). A blown quota cannot break feed loading; it degrades catalogue freshness only.

**Do not upgrade the plan yet.** Roughly 40% of recent runs hang and re-fetch the same pages, so measured usage is inflated. Fix A1/A2, re-measure, then decide. A weekly SA cadence is **not** recommended — it would batch ~4,200 changes into one run and time out every time.

---

## Workstream B — Speed

Root cause is **not** round trips: it is a cold database. The HNSW vector index is evicted when idle; the first query after idle takes 8s+ or times out. Warm, the same query is 247ms — a ~30× difference. Intermittent usage means it is always cold. `warmup-foryou` was retired in the Worker migration and has **no replacement**.

### B1. Keep the index warm (biggest win, smallest change)
Scheduled ping every ~5 min issuing a cheap `match_titles_by_vector` plus availability query. Cloudflare Worker cron or pg_cron. Nothing else in this plan buys as much latency per line of code.

### B2. Pre-populate the feed cache
Extend the existing `0 4 * * *` Worker cron (currently taste-vector recompute only) to write `FORYOU_CACHE` entries for recently-active users, so first open is a KV hit (~50ms) rather than a full render.

### B3. Stop shipping 41,151 ids to the client
Do availability filtering **in SQL** (join/`EXISTS` inside `match_titles_by_vector`) instead of materialising a 256 KB id array, transferring it, and rebuilding a Set client-side. Removes 1–3s from *both* surfaces. Also raise the client's 10-minute availability TTL.

### B4. Revert the serial hoist (regression introduced in the freshness pass)
`native/src/hooks/useHomeFeed.ts` awaits `getAvailableTmdbIds` *before* the parallel batch. Fold it back into the parallel group, and parallelise the 3 sequential `fetchGenreSpotlight` calls.

### B5. `/v1/home` aggregator
Give Home the treatment For You already has: one Worker endpoint doing orchestration server-side, returning a finished payload. Collapses ~15 client round trips to 1. Largest job; do after B1–B4.

### B6. Stale-while-revalidate
Paint immediately from the MMKV cache, refresh behind it. Persistence already exists; the app just does not prefer speed on launch.

**Exit criteria:** cold-open time-to-content under 1.5s on 4G; no cold-index timeouts across a week of sampling.

---

## Workstream C — For You freshness (park / bury / backfill)

Confirmed deterministic: same vector → same pool → same scores → same MMR → same order. `seenIds` is already fetched on every render (`foryouRender.ts:199`) but used **only** to pick exploration candidates — it never demotes anything. Measured consequence: users see the same title **4.2×** on average, worst case **52×**.

### C1. Two-stage engagement fatigue

| Stage | Trigger | Action |
|---|---|---|
| **Park** | Seen once, no interaction | Temporary demotion; eligible to resurface later |
| **Bury** | Seen 2–3×, still no interaction | Strong demotion / evict from pool |
| **Backfill** | Pool shrinks as titles are buried | Pull fresh candidates in behind them |

Demotion decays over weeks so parked titles can return. Note `watchlist_add` is already hard-filtered from the main pool, and `deep_link_click` currently *boosts* the taste vector — clicked-but-not-converted should demote **placement** without unlearning **taste**.

### C2. Unblock backfill at the retrieval layer
`match_titles_by_vector(query_vector, match_limit)` has **no offset and no exclusion parameter** — it is pure top-K (`ORDER BY embedding <=> query_vector LIMIT match_limit`). Evicting titles today just shrinks the pool; it cannot reach deeper. Fix:
- Add an exclusion parameter (`AND tmdb_id <> ALL(p_exclude)`), and/or
- Retrieve deeper — **measured: `match_limit` 1500 costs 247ms warm**.

Do both: exclusion for correctness, depth for headroom.

### C3. Per-session ordering variation
Seeded shuffle within score bands so consecutive opens differ, using the technique already proven in the exploration slot. Distinct from C1: C1 changes *what* is eligible, C3 changes *order* within it.

**Exit criteria:** average impressions-per-title-per-user trends toward ~1.5; no title exceeds ~3 impressions without interaction; consecutive opens differ visibly.

---

## Sequencing

1. **A1 + A2** — observability + timeout fix. Everything else is guesswork without them.
2. **A4** — clear the 22,260 backlog out-of-band. Roughly doubles the usable pool.
3. **B1 + B4** — warm cron + revert regression. Small, immediate wins.
4. **A3 + A5** — reorder queue, daily cadence.
5. **C1 + C2 + C3** — freshness, now that stock exists.
6. **B2 + B3** — feed pre-warm, SQL-side availability.
7. **B5 + B6** — `/v1/home`, stale-while-revalidate.

## Risks

- **A4** is a large TMDb burst — respect rate limits, run off-peak.
- **B3** changes the retrieval RPC; re-run `npm run eval:eng1` after.
- **C1** trades relevance for novelty — validate via exploration CTR (ENG-2), not offline eval; the harness does not gate slot composition.
- **A3** reordering may surface lower-quality titles if the relevance proxy is poor; sample the first batch manually.
- Restoring `src/lib` (wiped 2026-08-25 by a recursive delete following the `native/src/lib` symlink) is unrelated but worth guarding: avoid `rm -rf` inside `native/`.


---

## Follow-up (2026-08-27) — ordering bucket vs. quick re-opens

`ORDERING_BUCKET_MINUTES` = 20 is matched to the Worker's 20-minute feed-cache
TTL, so closing and reopening the app inside 20 minutes shows an **identical
feed**. That is correct behaviour — it is what stops the feed flickering on
every re-open — but it is also precisely the scenario behind the original
"same titles in the same order every time" complaint.

Current evidence says leave it alone: `npm run eval:novelty` shows a median 18%
new titles between sessions, and every 0% session so far is explained by the
bucket rather than by broken rotation.

If it still feels static on quick re-opens once real users arrive, the lever is
**decoupling ordering from the cache TTL** — vary the order on read while still
serving one cached payload — rather than shortening the TTL, which would cost
re-renders and undo part of the B-workstream latency work.

**Watch, do not change on current evidence.**
