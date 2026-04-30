---
title: Module Map
generated: 2026-04-26
source: src/
---

# Module Map

Annotated `src/` tree. Each module's public surface and primary callers are noted. For a tree-only view, see `README.md`.

## Top level

- `App.tsx` — root shell, route state, theme + auth providers, global modals.
- `main.tsx` — entry point; mounts `App` to DOM.
- `index.css` — Tailwind v4 + custom tokens.
- `assets/` — platform PNG logos and SVG icons.

## `components/`

UI components, mostly screen-level. Shared subcomponents live alongside their primary screen.

| File | Role |
|---|---|
| `OnboardingFlow.tsx` | 5-step onboarding state machine. |
| `ForYouPage.tsx` | For You surface (personalised). Slider tray entry point. |
| `BrowsePage.tsx` | Search + filter + grid. |
| `DetailPage.tsx` | Detail view; primary signal capture surface. |
| `WatchlistPage.tsx` | Want to Watch / Watched tabs. |
| `ProfilePage.tsx` | Settings, services, account deletion. |
| `CalendarPage.tsx` | Coming Soon calendar. |
| `SpendDashboard.tsx` | Monthly spend tracker. |
| `MoodRoomPage.tsx`, `MoodRoomCard.tsx`, `MoodRoomsRow.tsx` | Mood room surface (Phase 4.5). |
| `FeaturedHero.tsx` | Top-of-Home hero carousel. |
| `SliderTray.tsx` | Bottom-sheet slider panel for ranking tuning. |
| `FilterSheet.tsx` | Service / genre / rating filter sheet. |
| `ReportSheet.tsx` | "Report incorrect availability" sheet. |
| `LazyGenreSection.tsx` | Lazy-loaded genre row. |
| `BottomNav.tsx` | Tab bar. |
| `ContentCard.tsx`, `BrowseCard.tsx`, `ContentRow.tsx` | Card primitives. |
| `ServiceBadge.tsx` | Platform pill. |
| `ImageSkeleton.tsx` | Loading placeholder. |
| `ErrorBoundary.tsx` | Top-level error boundary. |
| `AuthContext.tsx` | Supabase auth provider + `useAuth` hook. |
| `ThemeContext.tsx` | Light/dark theme. |
| `platformLogos.ts`, `icons.tsx` | Asset registries. |
| `auth/` | `AuthScreen`, `SignInScreen`, `SignUpScreen`, `ForgotPasswordScreen`, `ResetPasswordScreen`, `SignUpSuccess`, `NoConnectionScreen`. |

## `hooks/`

Service-layer hooks. One per data domain; each returns a memoised state object plus action functions.

| Hook | Returns |
|---|---|
| `useHomeContent` | Home surface rows. |
| `useForYouContent` | For You rows + slider state. |
| `useBrowse` | Browse / discover state. |
| `useContentDetail` | Detail page payload. |
| `useContentService` | Trending, popular, generic content fetch. |
| `useTasteProfile` | Taste profile state + continuous learning. |
| `useSectionData` | TMDb discover paginated section. |
| `useSearch` | Debounced search. |
| `useUpcoming` | Coming Soon. |
| `useWatchlist` | Watchlist CRUD with derived memos. |
| `useUserPreferences` | User preferences. |
| `useNetworkStatus` | Online/offline (Capacitor). |
| `useIntersectionObserver` | Viewport intersection. |
| `useMoodRoomsRow` | Mood rooms row data. |

## `lib/`

Business logic. Pure modules; no React imports except where noted.

### `lib/supabase.ts`, `lib/supabaseStorage.ts`, `lib/storage.ts`, `lib/database.types.ts`

Supabase client singleton, CRUD wrappers, localStorage adapter with auth-aware routing, generated DB types.

### `lib/api/`

| File | Purpose |
|---|---|
| `tmdb.ts` | TMDb client (discover, search, details, providers). |
| `omdb.ts` | OMDB client (IMDb / RT ratings). |
| `streamingAvailability.ts` | SA API types and client (server-side only). |
| `supabaseContent.ts` | Supabase content cache queries (links, deep links). |
| `supabaseMoodRooms.ts` | Mood room RPC client. |
| `cache.ts` | HTTP response cache (TMDb, OMDB, SA prefixes). |

### `lib/adapters/`

Data model bridges between API responses and UI types.

- `contentAdapter.ts` — `ContentItem` ↔ `WatchlistItem`.
- `detailAdapter.ts` — TMDb detail + streaming links → `DetailData`.
- `platformAdapter.ts` — TMDb provider IDs ↔ `ServiceId` strings ↔ SA API slugs.

### `lib/recommendations-v2/`

Phase 4 ranking pipeline. All weights consolidated in `weights.ts`.

| File | Role |
|---|---|
| `types.ts` | `CandidatePool`, `ScoredCandidate`, `Stage2Weights`. |
| `weights.ts` | Single source of truth for weights, slider mappings, feature flags. |
| `ranker.ts` | Pipeline orchestrator. |
| `recency.ts` | Recency scoring (linear + exponential). |
| `contextual.ts` | Phase 4 placeholder (returns 0.5). |
| `diversity.ts` | Genre spread, service de-clustering, content-mix. |
| `hardFilters.ts` | Dismissed, thumbs-down, availability filters. |
| `titleAdapter.ts` | DB row → `ContentItem`. |
| `rows/home/perServiceChart.ts` | Per-service popularity rows. |
| `rows/home/criticallyAcclaimed.ts` | RT/IMDb filtered row (gated by OMDB coverage). |
| `rows/home/genreSpotlight.ts` | Weekly rotating genre cluster row. |

### `lib/taste-v2/`

1536D embedding-space taste system. Replaces v1's 24D archetype vector.

- `types.ts`, `vectorOps.ts`, `tasteClusters.ts` (16 archetypes used for cold-start), `tasteProfileV2.ts`, `bootstrap.ts` (onboarding seed), `interactionUpdate.ts` (incremental + full recompute).

### `lib/storage/`

Persistence layer with localStorage + Supabase routing.

- `interactions.ts` — fire-and-forget event emitter.
- `watchlist.ts` — CRUD with recommendation cache invalidation.
- `userPreferences.ts` — preferences and onboarding state.
- `recommendations.ts` — recommendation cache.

### `lib/instrumentation/`

Phase 0 silent-signal infrastructure.

- Dwell timer (singleton per detail page; coordinates with lifecycle and session ID).
- Session ID module (5-minute background → rollover).
- Impression batcher.

### `lib/lifecycle/`

- `appState.ts` — pause/resume on background, deep-link expected-background window.

### `lib/analytics/`

- `events.ts` — onboarding event taxonomy and metadata types.
- `logger.ts` — Supabase event logging.

### `lib/constants/`

- `config.ts` — app-wide constants.
- `genres.ts` — TMDb genre mappings, `GENRE_NAMES`, taste vector keys.
- `platforms.ts` — UK provider definitions, name and ID variants, network → provider fallback.

### `lib/data/`

- `platformPricing.ts` — UK subscription pricing for the 10 services. Last verified April 2026.

### `lib/reports/`

- `reportService.ts` — availability report submission.

### `lib/utils/`

Misc utilities: `serviceCache.ts`, `searchUtils.ts`, `providerClassifier.ts`, `errorHandler.ts`.

### `lib/deepLinks.ts`, `lib/openDeepLink.ts`

- `deepLinks.ts` — resolves an exact SA API link or a service-specific search fallback.
- `openDeepLink.ts` — Capacitor `AppLauncher` on native, `window.open` on web. Returns confidence tag (high if direct intent succeeds, low if browser fallback).

### `lib/debugLogger.ts`, `lib/sectionSessionCache.ts`

- Debug logger (POSTs to Supabase in dev only).
- In-memory session cache for home sections.

## `scripts/`

- `sync-content.ts` — bulk pipeline (`--stage tmdb|sa|omdb|vectors`).
- `embeddings/` — embedding backfill, HNSW index build, cluster coherence eval.
- `enrichment/` — first-party enrichment backfill with checkpointing.
- `evaluation/rank-eval.ts` — offline ranking harness.
- `audit-results/` — captured profile snapshots.

## `supabase/`

- `migrations/` — 32 SQL files. See `migration-changelog.md`.
- `functions/` — `embed-new-titles`, `enrich-new-titles`, `refresh-service-fingerprints`, `sync-incremental`, `_shared/`.
- `cron/` — operational automation (e.g. `enrich_new_titles.sql`). Distinct from migrations.
