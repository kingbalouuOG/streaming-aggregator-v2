---
title: Module Map (src/)
type: entity
tags: [codebase, src, frontend, modules]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/codebase-snapshots/module-map.md
  - raw/codebase-snapshots/package-json-annotated.md
related:
  - wiki/entities/codebase/components.md
  - wiki/entities/codebase/hooks.md
  - wiki/entities/codebase/database-schema.md
  - wiki/entities/infrastructure/capacitor.md
---

# Module Map (src/)

Annotated `src/` tree. Each module's role and primary callers. Source of truth: the repo itself.

> **Scope:** this page maps the **web** `src/` tree (which also holds the shared `src/lib/` engine). For the whole-repo picture — `native/` (the live Expo app), `workers/api/` (the Cloudflare Worker), and how all three surfaces share `src/lib` — see [Platform architecture](../../concepts/architecture/platform-architecture.md). The runtime-stack table below is the **web** app's; native deps live in `native/package.json`.

## Top level

- `App.tsx` — root shell, route state, theme + auth providers, global modals.
- `main.tsx` — entry point; mounts `App` to DOM.
- `index.css` — Tailwind v4 + custom tokens.
- `assets/` — platform PNG logos and SVG icons.

## `components/`

See [Component Inventory](components.md). Screens, sheets, primitives, infrastructure, auth screens.

## `hooks/`

See [Hook Inventory](hooks.md). Service-layer adapters between screens and data libraries.

## `lib/` — business logic

### Supabase + storage

- `lib/supabase.ts`, `lib/supabaseStorage.ts`, `lib/storage.ts`, `lib/database.types.ts` — client singleton, CRUD wrappers, localStorage adapter with auth-aware routing, generated DB types.

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

1536D embedding-space taste system. Replaces v1's 24D archetype vector. Files: `types.ts`, `vectorOps.ts`, `tasteClusters.ts` (16 archetypes used for cold-start), `tasteProfileV2.ts`, `bootstrap.ts`, `interactionUpdate.ts`.

### `lib/storage/`

- `interactions.ts` — fire-and-forget event emitter.
- `watchlist.ts` — CRUD with recommendation cache invalidation.
- `userPreferences.ts` — preferences and onboarding state.
- `recommendations.ts` — recommendation cache.

### `lib/instrumentation/`

Phase 0 silent-signal infrastructure. Dwell timer (singleton per detail page; coordinates with lifecycle and session ID), session ID module (5-minute background → rollover), impression batcher.

### `lib/lifecycle/`

- `appState.ts` — pause/resume on background, deep-link expected-background window. Centralises `App.addListener('appStateChange')`.

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

`serviceCache.ts`, `searchUtils.ts`, `providerClassifier.ts`, `errorHandler.ts`.

### `lib/deepLinks.ts`, `lib/openDeepLink.ts`

- `deepLinks.ts` — resolves an exact SA API link or a service-specific search fallback.
- `openDeepLink.ts` — Capacitor `AppLauncher` on native, `window.open` on web. Returns confidence tag (high if direct intent succeeds, low if browser fallback).

### `lib/debugLogger.ts`, `lib/sectionSessionCache.ts`

Debug logger (POSTs to Supabase in dev only); in-memory session cache for home sections.

## `scripts/`

- `sync-content.ts` — bulk pipeline (`--stage tmdb|sa|omdb|vectors`).
- `embeddings/` — embedding backfill, HNSW index build, cluster coherence eval.
- `enrichment/` — first-party enrichment backfill with checkpointing.
- `evaluation/rank-eval.ts` — offline ranking harness.
- `audit-results/` — captured profile snapshots.

## `supabase/`

- `migrations/` — 32 SQL files. See [migrations](migrations.md).
- `functions/` — `embed-new-titles`, `enrich-new-titles`, `refresh-service-fingerprints`, `sync-incremental`, `_shared/`.
- `cron/` — operational automation (e.g. `enrich_new_titles.sql`). Distinct from migrations.

## Runtime stack (annotated)

| Package | Why |
|---|---|
| `react`, `react-dom` v18 | UI runtime. |
| `motion` | Animations and bottom-sheet gestures. Smaller bundle than Framer Motion. |
| `sonner` | Toast notifications. |
| `lucide-react` | Tree-shakable icons. |
| `@supabase/supabase-js` | Auth, DB, Edge Functions, Storage. |
| `@capacitor/core`, `@capacitor/android` v8 | Native Android wrapper. iOS deferred. |
| `@capacitor/network` | Online/offline detection. |
| `@capacitor/app` | Lifecycle events (`appUrlOpen`, `appStateChange`). |
| `@capacitor/browser` | In-app browser fallback. |
| `@capacitor/app-launcher` | Native intent-based deep linking. |

## Notable omissions

- No router library. Route state lives in `App.tsx`.
- No state management library. Context for auth and theme; everything else hook-local.
- No HTTP client. `fetch` plus minimal `cache.ts`.
- No analytics SDK. Events go to Supabase via `lib/analytics/logger.ts`.
- No CSS-in-JS. Tailwind v4 only.
- No date library. `Intl.DateTimeFormat` and raw `Date`.
- No test framework yet. `tests/` has Playwright fixtures; unit testing is ad-hoc via `tsx`.
