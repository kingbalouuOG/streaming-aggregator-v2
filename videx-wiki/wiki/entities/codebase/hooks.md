---
title: Hook Inventory
type: entity
tags: [hooks, react, frontend]
created: 2026-04-26
updated: 2026-06-18
sources:
  - raw/codebase-snapshots/hook-inventory.md
  - native/src/hooks/
related:
  - wiki/entities/codebase/module-map.md
  - wiki/entities/codebase/components.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/operations/phase-search-v2.md
---

# Hook Inventory

One line per `useX` hook. Each is a service-layer adapter between a screen and the data libraries. The table below is the **web** (`src/hooks/`) inventory; the [Native hooks](#native-hooks) section covers the RN/Expo app (`native/src/hooks/`), now the live product post-NATIVE-4 cutover.

| Hook | Returns | Primary callers | Depends on |
|---|---|---|---|
| `useHomeContent` | `{ rows, loading, error, refresh }` for the Home surface (hero, recently added, trending, coming soon, per-service charts, genre spotlight). | `App.tsx` Home route. | `useContentService`, `useTasteProfile`, `recommendations-v2/ranker`, `sectionSessionCache`. |
| `useForYouContent` | `{ rows, sliderState, loading, refresh }` for the For You surface. Conditional rows based on data depth. | `ForYouPage`. | `useTasteProfile`, `recommendations-v2/ranker`, `useMoodRoomsRow`. |
| `useBrowse` | `{ results, filters, setFilters, loading }` for browse and discover. | `BrowsePage`. | `tmdb`, `useSearch`, `useSectionData`. |
| `useContentDetail` | `{ detail, loading, error, refresh }` for the detail page. | `DetailPage`. | `tmdb`, `omdb`, `supabaseContent`, `detailAdapter`. |
| `useContentService` | Raw content fetchers (trending, popular, by category). | `useHomeContent`, `useBrowse`, `useSectionData`. | `tmdb`, `cache`. |
| `useTasteProfile` | `{ profile, sliders, updateSliders, recordInteraction }` for the taste system. | `useForYouContent`, `useHomeContent`, `DetailPage` ("More Like This"). | `taste-v2/tasteProfileV2`, `taste-v2/interactionUpdate`, `storage/interactions`. |
| `useSectionData` | Paginated section data for a TMDb discover query with infinite scroll. | `BrowsePage`, `LazyGenreSection`. | `tmdb`, `cache`. |
| `useSearch` | Debounced search with recent + trending suggestions. | `BrowsePage`. | `tmdb`, `searchUtils`. |
| `useUpcoming` | Coming Soon / Calendar releases for the user's connected services. | `CalendarPage`. | `tmdb`, `useUserPreferences`. |
| `useWatchlist` | `{ items, add, remove, rate, isInWatchlist }`. Auto-invalidates recommendation caches on mutation. | `WatchlistPage`, `DetailPage`, `ContentCard`. | `storage/watchlist`, `storage/recommendations`. |
| `useUserPreferences` | `{ preferences, updatePreferences, completeOnboarding }`. | `OnboardingFlow`, `ProfilePage`. | `storage/userPreferences`, `supabaseStorage`. |
| `useNetworkStatus` | `{ online }` derived from Capacitor Network API. | `App.tsx` (offline banner), `auth/NoConnectionScreen`. | `@capacitor/network`. |
| `useIntersectionObserver` | Generic IntersectionObserver hook for lazy loading. | `LazyGenreSection`, `ContentRow`. | none. |
| `useMoodRoomsRow` | `{ rooms, loading }` for the For You mood rooms row. | `MoodRoomsRow`. | `supabaseMoodRooms`. |

## Conventions

- Hooks return memoised state; mutation actions are stable references via `useCallback`.
- Network-bound hooks expose `loading` and `error` separately.
- Hooks fire-and-forget interaction events via `storage/interactions`; never block UI on instrumentation.
- Hooks read from Supabase content cache before falling back to TMDb/OMDB live.

## Phase 3 rewrites

Per [strategy v1.6.3 §7.2](../../sources/engine-strategy-v1-6-3.md), Phase 3 rewrote 9 hook/component files to point at v2 ranking and 1536D taste vectors: `useHomeContent`, `useContentDetail`, `useSectionData`, `useRecommendations`, `useHiddenGems`, `useUserPreferences`, `OnboardingFlow.tsx`, `ProfilePage.tsx`, `LazyGenreSection.tsx`. Phase 3 actually delivered 10 (+ `useTasteProfile` per phase summary).

## Native hooks

Hooks in `native/src/hooks/` (RN/Expo, the live app post-NATIVE-4). Unlike the web service layer, the data-fetching hooks are built on **TanStack Query** (`useQuery`), keyed under a `['native', …]` namespace, and import the **shared** `src/lib/` engine (`recommendations-v2/`, `taste-v2/`) directly via the Metro junction mount — no mirror. They feed the same row-builders the web Home/For You use.

| Hook | Returns | Primary callers | Notes |
|---|---|---|---|
| `useItemServices(item, max=3)` | `ServiceId[]` for badge rendering. | `ContentCard`, hero, search/popular/calendar cards. | **Adapter gotcha:** the TMDb adapters set `ContentItem.services: []`, so without this every search / popular / calendar card would paint **no badges**. Lazily resolves via TMDb `watch/providers` (`getCachedServices`, in-memory dedup'd, Hermes-safe) **only when** `item.services` is empty; per-service chart rows already carry services and skip the fetch. Caches the **full** resolved list under a `max`-agnostic key (`['native','itemServices',mediaType,tmdbId]`) then slices per caller, so hero (max 4) and cards (max 3) share one cache entry instead of racing. The web's lazy-availability pattern, ported. |
| `useBrowseDiscover(filters, sort, enabled, userServices)` | `useQuery` of `ContentItem[]`. | Browse "Build your search" / mood-preset (filter-only, no query). | Native analogue of web `useBrowse`. Filter-only path → TMDb **`/discover`** (movies + TV in parallel) instead of `/search`, so genre/rating/runtime/type/provider resolve **server-side** — works despite the empty `services: []` adapter output (unlike a client-side `applyBrowseFilters`). Provider scope = picked services, else the user's stack. Disabled unless `countActiveFilters > 0`. |
| `useSemanticSearch(query, enabled)` / `useSemanticFlag()` | `useQuery` of `ContentItem[]` / of the `search_semantic` flag boolean. | Browse mood search (Mode C). | Vector mood search (the Option-2 port). Reuses the shared engine end-to-end: `getFlag('search_semantic')` (per-user gate, [041 flag](../../concepts/operations/phase-search-v2.md)) → `semanticSearch` (embed via the JWT-gated `embed-query` Edge fn → `match_titles_by_vector` → rank → `ContentItem`). **Flag OFF → Browse falls back to the deterministic mood-filter presets.** No filters applied for moods (`defaultFor([])` = no-op post-filter; the mood phrase **is** the query). Quality floor (rating>0, voteCount≥20, ≥40-min movies) mirrors `scripts/search/eval-moods.ts`. `retry: 1` (depends on the Edge fn). |
| `useFeedbackPrompt()` | `{ visible, dismiss }`. | App root (one-time FeedbackSheet trigger). | One-time timed prompt for the in-app feedback loop (047 `app_feedback` / FeedbackSheet). Accumulates **cumulative signed-in foreground time** across sessions (banked to MMKV on background, ticked every 15s while active); crosses ~5 min → opens the sheet **once**. `fb_prompt_shown` MMKV flag makes it never auto-fire again; manual Profile → Send feedback stays available. Assumes "already shown" until storage loads, to avoid a premature fire. |
| `useHomeFeed()` | `useQuery` of `HomeFeed` (`hero`, `recentlyAdded`, `popular`, `freeTonight`, `upcoming`, per-service `rows`, genre `spotlights`). | Native Home screen. | Calls the **same** `src/lib/recommendations-v2/rows/home/` builders as web Home (`fetchPerServiceCharts`, `fetchGenreSpotlight`). Scoped to the user's onboarding services (`useUserServices`). Discover-backed rows (Recently Added / Free Tonight / Upcoming) filter by **provider server-side** because the old client filter on `item.services` (empty) always produced nothing. Hero = first row's lead title pulled OUT of its row; spotlights cross-row-dedup vs charts. |
| `useForYou()` | `useQuery` of `WorkerRenderPayload \| null`. | Native For You screen. | Renders via the **videx-api Worker only** (`tryRenderForYouWorker`, NATIVE-2 W5c) — the localStorage-bound client fallback pipeline is **deliberately not ported**; a Worker miss shows a retry state. Returns `null` (= "not ready") when: no proxy configured, signed out (no access token), no taste profile yet, or Worker error. Scoped to the user's services. |

Supporting native hooks (not detailed above): `useUserServices` (onboarding-saved service stack, retired `DEV_SERVICES`), `useContentDetail`, `useSearch` (text search + as-you-type), `useWatchlist`, `useWatchedGrid`, `useCompleteOnboarding` (mirrors web `completeOnboarding` → identical Supabase rows), `useOnboardingStatus`.
