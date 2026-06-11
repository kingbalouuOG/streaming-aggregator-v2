# Phase PLAT-1 — Client Data Layer & Rendering: Summary

**Status:** Implementation complete 2026-06-11; pending Joe's final device checklist (§4) before merge.
**Branch:** `phase-plat-1-client-data-layer` (kickoff + 13 commits).
**Brief:** E&P brief §5. **Plan:** `docs/plans/2026-06-10-003-feat-phase-plat-1-client-data-layer-plan.md` (Q1–Q4 resolved per recommendations). In-place refactor: no backend, schema, or ranking changes — the mirrored engine trees have **zero changes** in this PR's diff and `render-foryou-rows` was never redeployed.

## 1. What shipped

**TanStack Query as the single server-state layer.** QueryClient + localStorage persister (content namespaces only, 24h maxAge, `QUERY_CACHE_BUSTER` replaces the `_wpN` gotcha). All six data hooks migrated, one commit each: `useContentDetail` (query graph with real dependency edges only; SA∥TMDb concurrency preserved), `useSectionData` (Query at the page-fetch boundary — display state is mount-order-dependent and deliberately NOT key-cached), `useHomeContent` (**the documented waterfall died**: profile ∥ charts ∥ acclaimed in one window; spotlight keeps its real dedup-seed dependency), `useSearch`/`useBrowse` (dispatch-nonce pattern, `keepPreviousData`, Mode C byte-equivalent imperative), `useForYouContent` (acquisition/application split; 15-min in-memory cache makes tab-return instant; rerank untouched). Then **`cache.ts` died**: `apiQueryCache.ts` shims the same get/set API onto the QueryClient (all four API clients + their unmigrated consumers keep caching through the wrapper point they always used), with a one-time device sweep of orphaned legacy keys. **Dead code found and removed:** `streamingAvailability.ts` (zero consumers since B1-E1).

**Code-splitting (D5: React.lazy only, no router).** All pages except Home (plan Q1) + idle-prefetch of every chunk after startup — added after the device pass caught a first-visit blank frame between AnimatePresence exit and lazy mount.

**Virtualization.** TanStack Virtual on WatchlistPage (grid + list views), Browse results grid, CalendarPage — by-row pairing in the same grid shells, `VIRTUALIZE_MIN = 21` keeps short lists byte-original (including entrance animations), flat-index preservation for click-context/impressions on Browse, App-level scroll container ownership unchanged.

**Image loading.** ImageSkeleton: IntersectionObserver gate (600px ahead — Home's ~80 eager posters → visible dozen), TMDb w92 LQIP blur-up, `priority` opt-out on heroes. **Device-pass bug + fix:** the first LQIP implementation (absolute layer) escaped containers lacking `position:relative` — diagnosed from an adb screen recording (frame extraction), rewritten as a single-element src swap that structurally cannot escape.

**State cleanup.** `appStore.ts` (Zustand, small by design: tab, filters, watchlist-derived sets, services, stable action registry; App stays the writer). Prop counts: **BrowsePage 13→3, DetailPage 13→5**, WatchlistPage→4, ForYouPage→6 (target was ≤5 on Browse/Detail — met). `React.memo` on the four card/row primitives ends the every-scroll-pixel re-render cascade. `__DEV__` 500-item watchlist seed (triple-tap the watchlist header) powers the jank test with zero storage pollution.

## 2. Acceptance (brief §5.3)

| Criterion | Result |
|---|---|
| Initial JS ≥30% smaller | **−44.5% raw / −42.7% gzip** (778.17→431.98 kB; 233.60→133.82 kB gzip). Page chunks load on demand and prefetch at idle |
| Zero duplicate concurrent requests (Home→Detail→Back→Detail) | Query dedup by design; second open serves from cache (verified in dev; device eyeball in §4) |
| 500-item watchlist scrolls without jank | Virtualized; **device checklist item** (§4, dev seed) |
| Device cold-start before/after | **Joe measures** (§4) — before-APK = main, after-APK = this branch |
| No behaviour change (For You/Home identical) | Parity probe **PASS** — determinism/filter-leak/dedup green throughout; golden regenerated ONCE at close-out for legitimate content drift (UTC-day exploration rotation + a day of real interactions), with the code-can't-have-changed evidence chain in commit `eb6e2ec` |

Throughout: typecheck, `npm test` 146/146, lint 0 errors, production build green at every commit.

## 3. Process notes

Two delegated background agents died mid-mission early in the phase (MCP churn; zero-byte outputs) — their working-tree output was salvaged, line-reviewed, and committed with provenance noted; all later delegation ran foreground. A third (Zustand) agent stalled mid-refactor and was completed by hand (ForYouPage conversion, DetailPage guard cleanup, memo wraps). Two device-pass bugs were caught and fixed same-day via the adb screenrecord → ffmpeg frame-extraction loop (transition blank-frame; escaped LQIP layer) — that diagnostic loop is worth keeping.

## 4. Joe's device checklist (final gate before merge)

1. Cold-start stopwatch: 3 runs on current `main` APK, 3 on this branch's APK (icon tap → Home interactive). Record both in this doc.
2. 500-item scroll: dev build, triple-tap watchlist header → seed → scroll hard. No jank = pass.
3. Final smoke: tab transitions, search, detail round-trip, For You tab-return (instant), pull-to-refresh both surfaces, watchlist add/remove/rate (store-backed actions).

## 5. Follow-ups (file at close)

- `TermsPage` chunk is 155 kB (markdown renderer subtree) — lazy already, but worth a lighter renderer someday. Parking-lot candidate, low priority.
- Wiki: phase-history/cheatsheet rows updated in this PR; full source-page ingest follows the next raw/ snapshot drop (REPO-1 precedent).
- PLAT-2 next: Workers + Hono proxy (`workers/api/` stub waiting); TMDb/OMDB keys leave the client bundle.
