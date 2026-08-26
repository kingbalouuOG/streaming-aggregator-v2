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

Diagnostic:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM match_titles_by_vector(
  (SELECT embedding FROM titles WHERE embedding IS NOT NULL LIMIT 1), 200);
```

`read=0` means warm. **Any non-zero `read=` means pages were evicted and
the warmer is not keeping up.**

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

## Still open

`B2` feed pre-warm, `B3` SQL-side availability filtering (stops shipping a
256 KB id array to the client), `B5` `/v1/home` aggregator, `B6`
stale-while-revalidate. See the plan.
