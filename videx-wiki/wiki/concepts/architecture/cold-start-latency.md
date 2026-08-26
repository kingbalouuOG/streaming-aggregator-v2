---
title: Cold-start latency
type: concept
tags: [performance, hnsw, pgvector, cold-start, home-surface]
created: 2026-08-26
updated: 2026-08-26
sources:
  - raw/plans/2026-08-25-001-fix-catalogue-speed-freshness-plan.md
related:
  - wiki/concepts/architecture/for-you-surface.md
  - wiki/concepts/architecture/home-surface.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/operations/sync-pipeline.md
---

# Cold-start latency

Why the app took 5s+ to show anything on first open, and what fixed it.
Workstream B of the 2026-08-25 remediation plan.

## The cause is a cold index, not round trips

The instinct is to blame the number of requests. It was not that.

Measured back-to-back on the live database, 2026-08-26 — same query, same
data, same plan, run twice:

| | Execution time | Buffers |
|---|---|---|
| **Cold** | **4,155.679 ms** | `shared hit=3546 read=508` |
| **Warm** | **12.365 ms** | `shared hit=4054` (`read=0`) |

**336x.** The entire difference is those 508 HNSW index pages: cold they
come off disk, warm they are already in `shared_buffers`.

The trap is that the index is evicted whenever the database sits idle —
and a pre-launch app with intermittent traffic is idle almost all the
time. So in practice it is **always cold when a real user opens the app**.
Every measurement taken by a developer who has just been poking the
database looks fine, which is why this survived so long.

> `warmup-foryou` used to cover this. It was retired during the Worker
> migration with no replacement, and nothing noticed because nothing
> measures cold latency.

## B1 — keep it warm

`warm_recommendation_caches()` (migration 073), pg_cron every 5 minutes.
Touches the HNSW index with a **real** embedding — HNSW traversal depends
on the query point, so a synthetic zero vector would walk an
unrepresentative part of the graph — plus the availability path for the
six services carrying essentially all UK rows.

**pg_cron, not a Worker cron.** What is being kept warm is Postgres's own
buffer cache, so the closer the query runs to that cache the better: no
network, no auth, no Edge Runtime, nothing that can 502.

> Note this is the *opposite* call to the health check in migration 071,
> which deliberately runs outside Supabase on GitHub Actions. Both are
> right. Monitoring must be independent of the thing it watches; work
> should sit as close to the data as possible. Ask which one you are
> building before choosing where it runs.

The warmer records to `cache_warm_status` and the daily health check
asserts on it, because a warmer that quietly stops **fails nothing** — it
just returns cold-open latency to 4s and waits for a user to complain.

### The warmer alone was not enough — the index did not fit

073 shipped a 5-minute warmer. It ran, it succeeded, and it did not work.
Cron runs five minutes apart, measured live:

```
11:35:00 cron    2,637 ms   (cold)
11:35:12 manual      87 ms   (warm, 12s later)
11:40:00 cron    1,797 ms   (cold again)
```

The reason is sizing, and it is the check that should have been done
before writing the warmer at all:

| | |
|---|---|
| `shared_buffers` | **224 MB** |
| `idx_titles_embedding_hnsw_half` | **191 MB** — 85% of the whole pool |
| `titles` heap | 22 MB |

With one index needing 85% of the buffer cache, any other activity evicts
it. **No cron interval fixes a working set larger than the cache.**

> Before adding a cache-warming job, compare the object's size against
> `shared_buffers`. If it does not comfortably fit, warming is treating a
> symptom.

### The fix — halfvec (migration 074)

pgvector 0.8 `halfvec` (16-bit floats) halves the index to ~95 MB, which
fits alongside the heap. It is an **expression index** on
`(embedding::halfvec(1536))`, so the column stays `vector(1536)` and no
data migration is needed.

Precision cost on two real embeddings from this table:

```
exact  0.69766901055306
half   0.697668821958604
error  0.00000019
```

Even so, `match_titles_by_vector` does not simply swap the operator — it
feeds the entire recommendation pipeline. It now **retrieves 2× candidates
through the halfvec index, then re-ranks at full precision**, so returned
distances stay exact and ordering is unchanged for all but pathological
ties. The re-rank is 2N exact distance computations: microseconds.

Gate: `npm run eval:eng1` before trusting it in production.

### Diagnostic — use the warmer's own duration

```sql
SELECT ran_at, now() - ran_at AS age, duration_ms, ok FROM cache_warm_status;
```

Warm is **~90ms** (measured 87ms). Hundreds of ms, or seconds, means the
index went cold *between* runs and the 5-minute interval is too long for
this instance.

This is the right signal because the warmer runs the same query a user's
cold open would, every 5 minutes, and writes down how long it took.

> ⚠ **Do not use `EXPLAIN (ANALYZE, BUFFERS)` and read `read=0` as proof
> of warmth.** This page said to, and it misled a real verification.
> `match_titles_by_vector` is plpgsql, so the outer EXPLAIN shows a
> Function Scan node whose buffer counts **do not include** the index
> pages touched inside the function. A genuinely cold call was observed
> reporting `hit=4054 read=0` while taking **2,136 ms**. Buffer counts at
> a function-scan boundary tell you nothing about what the function did.

To time it by hand, call it twice: the first call after an idle spell pays
the cold cost, the second is the warm number. Measured 2026-08-26 after
~10 minutes idle: **1,471 ms then 7 ms**.

Eviction is fast — under ten minutes on this instance — which is why the
interval is 5 minutes and why `duration_ms` is worth watching rather than
assuming.

## B4 — the serial stretches in Home

Two, in `native/src/hooks/useHomeFeed.ts`.

### The availability hoist, and why it was there

`fetchHomeFeed` awaited `getAvailableTmdbIds()` before its parallel batch,
so seven unrelated requests queued behind an availability RPC they did not
need.

**Removing it naively makes things worse.** The localStorage cache is
written only *after* the RPC resolves, so a call racing `buildFilterSets`
(which calls `getAvailableTmdbIds` internally) means both miss the cache
and both fire the RPC — 1.2–2.9s and ~256 KB, twice. Serialising was the
only thing guaranteeing one call.

The real fix is **in-flight de-duplication** in `getAvailableTmdbIds`: a
promise shared by cache key, cleared in a `finally` so a rejection cannot
wedge the key. Then the two callers share one request, the hoist becomes
unnecessary, and only `fetchPopular` waits on availability.

> General lesson: a cache that populates only on completion does not
> de-duplicate concurrent callers. Any read-through cache fronting an
> expensive call needs an in-flight map as well as a result store.

### The spotlight chain

The three genre spotlights ran sequentially because each fed its results
into `exclude` so the next could not repeat them — the "same title in two
adjacent rows" failure.

Parallelising naively loses that. They now fetch concurrently from the
same starting exclusions, and **collisions are resolved in order
afterwards**: spotlight 0 keeps its picks, 1 drops anything 0 took, and so
on. Identical output ordering and dedup guarantees, one round trip instead
of three. Each over-fetches slightly so a row still fills after losing
items to an earlier spotlight.

## B3 — availability filtering in SQL

Every Home load fetched `get_available_tmdb_ids`: **43,234 ids, 328,790
bytes (~321 KB)**, transferred, parsed, and rebuilt into a 43k-entry Set —
to membership-test the ~100 titles actually rendered. The mood-room RPCs
take the same array as a *parameter*, so it went **up as well as down**.

B1 fixed the database; this is the wire. They were separate problems and
only one of them was ever about the index.

**The observation that made it cheap:** availability is only enormous as a
flat id list. Per title it is tiny — measured 1.26 services each, max 7.

Migration 075 denormalises it onto `titles.available_services` (GIN
indexed), so every existing query filters with one predicate:

```ts
query.overlaps('available_services', services)
```

### The empty-array convention fails open — be careful

`services.length === 0` means *no availability filter*, matching the old
`availableTmdbIds.size > 0` guard. That convention **fails open**: get it
wrong and users are silently shown titles they cannot watch, with no
error. Any new caller must preserve it deliberately.

### Denormalisation guards

A copied column is only safe if something checks it:

1. **Row-level trigger** on `streaming_availability` — the only writer in
   normal operation.
2. **`refresh_title_available_services()`** — full rebuild, for repair and
   after bulk loads.
3. **`count_available_services_drift()`** — asserted daily by the health
   check. Drift means users see wrong availability and nothing else would
   notice.

> ⚠ The trigger fires **per row**. `scripts/sync-content.ts` stage `sa`
> writes tens of thousands of rows — disable the trigger, load, re-enable,
> then call the refresh. The daily incremental sync (~600–3,500 rows) needs
> no special handling. Instructions are in the migration header.

### What still uses the old path

Deliberately deferred, none of it crossing a mobile connection: the
mood-room RPCs (the array is a parameter — signature change plus a
migration), `foryouRender`/`ranker` (server-side, inside the provider
network, KV-cached), and web `useForYouContent` (legacy surface).

## Still open

`B2` feed pre-warm, `B3` SQL-side availability filtering (stops shipping a
256 KB id array to the client), `B5` `/v1/home` aggregator, `B6`
stale-while-revalidate. See the plan.
