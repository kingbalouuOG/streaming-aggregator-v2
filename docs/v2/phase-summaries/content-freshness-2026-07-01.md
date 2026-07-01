# Content Freshness Pass — Home + For You (2026-07-01)

**Context:** Home and For You felt static week-to-week. Investigation confirmed both surfaces are deterministic (popularity snapshots + a taste-vector-deterministic ranker) with no trending/novelty term driving day-to-day movement. This pass adds visible rotation to the most prominent rails without changing the personalization contract.

**Scope:** three changes (`#1`/`#2` Home, `#3` For You), native-first (the shipped app). Web received the safe subset.

## Changes

### #1 — Home "Popular" → real TMDb trending, service-filtered (native)
- Added `getTrendingMovies` / `getTrendingTV` to `src/lib/api/tmdb.ts` (`/trending/{type}/week` — a rolling window TMDb refreshes daily, vs the near-static `discover?sort_by=popularity.desc`).
- `fetchPopular` in `native/src/hooks/useHomeFeed.ts` now: fetch trending → **filter to the user's services** via `getAvailableTmdbIds` (the `get_available_tmdb_ids` RPC set) → **backfill** from the old provider-scoped popularity query when the intersection is thin (`< MIN_TRENDING_ITEMS = 8`), so the ribbon never collapses on sparse content-cache coverage.
- Trending has no watch-provider filter of its own; the intersection is where "only your services" is re-imposed.

### #2 — Daily seeded rotation (native + web)
- New pure util `src/lib/utils/dailyShuffle.ts`: `dailyShuffleTopN`, `dailyPick`, `utcDayStamp`. Seed = `${salt}:${UTC-day}` (same convention as the For You exploration slot). Stable within a UTC day (no re-render flicker), rotates at 00:00 UTC. Unit-tested (determinism-within-day, change-across-day, head-only, empty/single).
- Native: shuffles the top 20 of the trending pool (moves the Trending ribbon + editorial spotlight); rotates the hero ("Today's Pick") among the lead per-service row's top 5, leaving the ranked row intact.
- Web (`src/hooks/useHomeContent.ts`): top-20 shuffle applied to its popular row. `#1` (trending) intentionally **not** ported — web's popular row is built on the paginated `useSectionData` path; follow-up if web stays a shipping target.

### #3 — For You exploration slot: more visible daily novelty (shared)
- `src/lib/recommendations-v2/weights.ts`: `EXPLORATION_COUNT` 2→3, `EXPLORATION_SLOT_POSITIONS` `[5,13]`→`[2,5,13]` (1-indexed cards 3/6/14). One daily-rotating pick now sits above the fold; the head two cards stay fully personalized.
- Applies to **both** render paths — the Worker (`src/lib/server/foryouRender.ts`) and the client fallback (`src/hooks/useForYouContent.ts`) both read these constants.
- The slot's real signal is **live exploration CTR** (ENG-2 reads it from `card_impressions.metadata`); there is no offline gate that scores slot count/position. This is a product judgement validated in production, not by the eval below.

## Verification

- Unit tests: 18 passed (new `dailyShuffle` suite + existing `exploration` suite).
- `tsc --noEmit`: clean on both the root (shared + web) and `native/` trees.
- ESLint: 0 errors on changed files (native + web).

### ENG-1 retrieval eval — run 3 (regression check for the `weights.ts` edit)

`npm run eval:eng1` (`scripts/evaluation/eng1-eval.ts`), service-role client, read-only, run 2026-07-01T19:11:45Z. Purpose: confirm the `weights.ts` change (the file that also exports the retrieval constants) did not regress the retrieval gates. It does **not** measure the exploration slot — `eng1-eval` imports `PER_CENTROID_CANDIDATE_LIMIT` / `DEFAULT_CANDIDATE_LIMIT` / `AVOID_PENALTY_GAMMA`, not `EXPLORATION_COUNT`/`_SLOT_POSITIONS`.

| Section | Result | Gate |
|---|---|---|
| A — τ merge matrix (16 clusters, 120 pairs; min/median/max 0.3094 / 0.5598 / 0.7532) | `INTEREST_MERGE_TAU=0.80` → 0 pairs merge | keep 0.80 |
| B — synthetic multi-modal (`feel-good-funny`+`anime-animation`, K=3, weights [0.467, 0.333, 0.200]) | coverage top-20 spans **3** interests; multi recall ≥ single | ✅ PASS / ✅ ≥2 |
| C — avoid-set γ sweep (avoided `Brooklyn Nine-Nine` tv-48891) | neighbour suppression 2→0 at active γ=0.15, positives Δ0 | ✅ PASS |

**Reading:** identical to runs 1–2 (deterministic harness) — the freshness pass is retrieval-neutral, as expected. Do **not** quote §B recall@500 (0/2) as a result: the synthetic profile yields only 2 held-out titles; both baseline and multi score 0, so the comparative gate holds but the number is not meaningful (per the run-1 note). Real-profile recall (`--user-id` + service key) was not run.

## Follow-ups

1. **#1 web parity** — port trending to web's popular row if web remains a shipping target (native cutover is complete).
2. **#3 CTR validation** — watch exploration CTR at the new count/position in the ENG-2 data gate; dial `EXPLORATION_COUNT`/positions from real engagement.
3. **Editor's Note staleness** (out of scope here) — the note falls back to a hardcoded 2024 sample if `editor_notes` has no fresh row; a stale note reinforces the "frozen" feel independent of this pass.
