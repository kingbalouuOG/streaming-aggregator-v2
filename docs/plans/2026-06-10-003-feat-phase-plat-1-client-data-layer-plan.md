# Phase PLAT-1 — Client Data Layer & Rendering: Implementation Plan

**Status:** DRAFT v1 — awaiting Joe's review. No code written.
**Branch:** `phase-plat-1-client-data-layer` (created from `main` @ `d222a3d`, the REPO-1 merge, 2026-06-10)
**Brief:** E&P brief §5 (authoritative). In-place refactor — **no backend changes, no schema changes, no ranking changes**. Gated on REPO-1 ✅ — written under the ratcheted lint rules (`no-explicit-any` at error, `jsx-no-leaked-render`).
**Locked constraints:** D5 (React.lazy only, NO router — tab-state + Capacitor back-button stack stays), §5.3 acceptance ("this phase must not touch ranking"), ADR-011 mirror untouched (no engine-tree changes expected → drift CI quiet).

## 0. Baseline (recorded 2026-06-10, the acceptance "before")

| Metric | Value |
|---|---|
| Eager main JS chunk | **778.17 kB raw / 233.60 kB gzip** (`index-*.js`; only two micro-chunks split today) |
| ≥30% reduction target | eager JS ≤ ~545 kB raw post-split |
| `App.tsx` | 1,175 lines — conditional-render routing on `activeTab` + `selectedItem`, all 8 page components eagerly imported |
| Bespoke caches | `src/lib/api/cache.ts` (208 lines — localStorage TTL: TMDb 24h / OMDB 7d / SA 24h, prefix-keyed) + `sectionSessionCache.ts` (33 lines, sessionStorage) |
| Hooks to migrate | `useContentDetail` 187 · `useSectionData` 326 · `useHomeContent` 397 · `useBrowse`/`useSearch` · `useForYouContent` 734 (minimal touch) |
| Heavy pages | WatchlistPage 1,051 · BrowsePage 1,054 · DetailPage 830 · CalendarPage 413 lines |
| Device cold-start | **Joe measures at first device pass** (before-APK = current main; after-APK = phase end) — stopwatch from icon tap to Home interactive, 3 runs each |
| Home image behaviour | ~80 posters eager-load on first paint (no IntersectionObserver, no `loading="lazy"`) |

## 1. Workstream A — TanStack Query as the single server-state layer

**Dependencies (all MIT, £0 — brief §10):** `@tanstack/react-query@5`, `@tanstack/react-query-persist-client`, `@tanstack/query-sync-storage-persister`, dev-only `@tanstack/react-query-devtools`.

**Scaffold (commit 1):** `QueryClientProvider` in `main.tsx`; one `QueryClient` with defaults `retry: 1`, `refetchOnWindowFocus: false` (mobile WebView). **Persistence: localStorage persister** (Q2) with `maxAge: 24h` and a `shouldDehydrateQuery` filter that persists ONLY `['tmdb', …]` / `['omdb', …]` / `['sa', …]` keys — pipeline/For You state is never persisted (it has its own embedding/avoid caches and PLAT-3 moves it server-side). Query-key convention: `[source, resource, ...params]`, e.g. `['tmdb','detail','movie',603]`. Per-source defaults via `queryClient.setQueryDefaults`: TMDb `staleTime` 24h, OMDB 7d, SA 24h — byte-identical TTL semantics to `cache.ts`; `gcTime` = staleTime (persisted entries are the long tail).

**Hook migration — one hook per commit, in the brief's order** (each commit: hook consumes `useQuery`/`useQueries`, behaviour identical, tests green):
1. `useContentDetail` (commit 2) — the worst offender: detail-open fires ~5 parallel calls today with zero dedup. TMDb detail + OMDB + SA links become parallel queries; the SA/Supabase links query keeps firing concurrently with TMDb (the ENG-era 200–400ms win is preserved by `useQueries`, not serialised).
2. `useSectionData` (commit 3) — paginated discover sections → `useInfiniteQuery`; `sectionSessionCache` retired here (Query's in-memory cache replaces the session cache; scroll-position caching in `sectionSessionCache` consumers stays — that's UI state, not server state… see note in commit).
3. `useHomeContent` (commit 4) — the waterfall: today sections fetch sequentially; becomes parallel `useQueries` with per-section keys.
4. `useSearch` / `useBrowse` (commit 5) — debounced search → `useQuery` keyed on `['tmdb','search',query,filtersHash]` with `placeholderData: keepPreviousData`; discover-browse likewise. Mode C semantic path untouched (flag-gated, Edge-backed).
5. `useForYouContent` (commit 6) — **minimum viable** per brief: the Edge call (`tryRenderForYouEdge`) + client-fallback pool fetch wrap in ONE query `['foryou','render',userId,servicesKey]` with `staleTime: 0`, `gcTime` ~15min (in-memory only, never persisted). Slider re-rank stays exactly as-is (client-side from cached pool — no refetch). No pipeline-internals changes; PLAT-3 shrinks this hook again.

**Retirement (commit 7):** delete `cache.ts` + `sectionSessionCache.ts` + the `cachedRequest` wrapper plumbing in `api/tmdb.ts`/`omdb.ts`. The `{ success, data }` return-shape stays at the API-client layer this phase (Q4) — queryFns unwrap it locally; full shape normalisation is gratuitous churn before PLAT-2 repoints these clients at the Worker proxy anyway. `_wpN`/`CACHE_VERSION` cache-busting gotchas die with cache.ts.

## 2. Workstream B — Code-splitting (D5: React.lazy only)

`React.lazy` + `<Suspense>` per top-level page: **ForYou, Browse, Detail, Watchlist, Profile, Calendar, MoodRoom, Onboarding (+ auth screens)**. **Home stays eager** (Q1): it's the cold-start landing surface — lazying it converts every app open into a suspense flash for zero practical gain; the 30% bundle target is comfortably reachable from the other seven (Browse+Watchlist+Detail+Profile alone are ~4,000 source lines plus their dependency subtrees: recharts-free but motion-heavy). Suspense fallback: a minimal full-page skeleton matching the design system (no spinner flash — 150ms delay before showing). Tab-state navigation untouched.

## 3. Workstream C — List virtualization

`@tanstack/react-virtual@3` on the three long-list surfaces: WatchlistPage grid, Browse results grid, CalendarPage. The 2-column poster grids virtualise by ROW (item pairs per virtual row — simpler and steadier than masonry-style per-item). Overscan tuned for poster heights; scroll-position restore (`sectionSessionCache` pattern) re-verified per surface. Horizontal `ContentRow`s are NOT virtualised (≤20 items by design).

## 4. Workstream D — Image lazy-loading

`ImageSkeleton` (69 lines) gains: IntersectionObserver gate (start loading ~one viewport ahead), native `loading="lazy"` as belt-and-braces, and **LQIP blur-up** — TMDb `w92` rendition stretched + blurred behind the full poster, swapped on load. `priority` prop opts out for above-fold (hero carousel, first visible row). Existing empty-`src` guard (the onLoad-never-fires gotcha) preserved. Home's ~80-poster eager load drops to the visible ~12–15.

## 5. Workstream E — State cleanup

Small **Zustand** store (`src/lib/store/appStore.ts`) for genuinely app-level state only: `activeTab`, `filters` (FilterState), `watchlistIds`, `userServices`. App.tsx stops threading those through 13–15-prop chains; **target: BrowsePage and DetailPage ≤5 props each** (acceptance). `memo()` on the card/row primitives (`ContentCard`, `ContentRow`, `BrowseCard`, `MoodRoomCard`) — App.tsx re-renders on every scroll pixel today (the MoodRoomPage comment documents the pain). This is prop-plumbing surgery, not an App.tsx rewrite — the shell shrinks naturally; PLAT-3 takes the next bite.

## 6. Acceptance (brief §5.3) and how each is measured

| Criterion | Method |
|---|---|
| Initial JS ≥30% smaller | `vite build` table, §0 vs phase end, in the summary |
| Device cold-start before/after | Joe, two APKs, 3-run stopwatch each (§0 row) |
| Zero duplicate concurrent requests on Home → Detail → Back → Detail | Chrome remote-debug the WebView (`chrome://inspect`), Network tab, scripted click-path |
| 500-item watchlist scrolls without jank | Dev-only synthetic seed (Q3): `__DEV__` Profile long-press injects 500 watchlist rows locally; visual scroll test on device |
| **No behaviour change** — For You/Home output identical | `foryou-parity` probe green **with the existing golden untouched** (no regen this phase — the strongest no-change guarantee we have), plus `rank-eval.ts` spot check |

## 7. Commit sequence

1. Deps + QueryClient + persister scaffold (+ devtools, dev-gated).
2–6. Hook migrations in §1 order (one per commit; parity probe must stay green from commit 6 especially).
7. Delete `cache.ts` + `sectionSessionCache.ts` + `cachedRequest` plumbing (in-phase cleanup rule).
8. React.lazy + Suspense fallbacks (bundle table snapshot in commit message).
9. Virtualization (three surfaces).
10. ImageSkeleton IO + LQIP + `priority`.
11. Zustand + `memo()` + prop-slimming (Browse/Detail ≤5 props).
12. Close-out: measurements, phase summary, wiki ingest, bloat sweep.

Every commit: typecheck + `npm test` (146) + production build green. No engine-tree changes anticipated; if one becomes necessary it follows the mirror rule.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Cache-semantics drift (stale-while-revalidate where code expected hard TTL) | Per-source `staleTime` mirrors the old TTLs exactly; per-hook commits; golden-untouched parity gate |
| localStorage quota (persisted queries + existing embedding caches) | Dehydrate filter (content queries only) + 24h maxAge + Query's LRU gc; embedding caches unchanged |
| Suspense + Capacitor back-button interplay | Lazy pages mount within the existing tab-state machine; back-button handler doesn't navigate via URL (D5) so no router edge cases; tested on device |
| Virtualised grids vs scroll-restore | Per-surface verification; TanStack Virtual `scrollToOffset` on mount from the saved position |
| `memo()` hiding needed re-renders | Props become primitives/stable refs via Zustand selectors; exhaustive-deps warnings watched (39 pre-existing, must not grow) |

## 9. Open questions for Joe

1. **Home eager, not lazy** (deviation from the brief's literal page list) — recommended: it's the landing surface; lazying it trades a cold-start flash for nothing.
2. **localStorage persister over IDB** — recommended at our payload scale (filtered content queries only); IDB adds an async persister dependency for no current win.
3. **500-item watchlist test as a `__DEV__`-only local seed** (no production data, no test-account pollution) — recommended.
4. **Keep the `{success,data}` API wrapper this phase** — queryFns unwrap locally; full normalisation would churn files PLAT-2 rewrites anyway. Recommended.
