# Videx B1-E1 Context Update — API Consolidation, Content Cache & Deep Linking

**Date:** March 2026
**Commit:** `aa90375` on `main`

## What Changed

### WatchMode Removed, Streaming Availability API Added

- **WatchMode API** has been fully removed (client deleted, all references cleaned up)
- **Streaming Availability API** (Movie of the Night, via RapidAPI) replaces it for:
  - Deep link URLs (exact links to streaming apps)
  - Rent/buy pricing (£ amounts where available)
  - Streaming availability data for 9 of 10 UK services
- **SA API key** is server-side only (`SA_API_KEY`, no `VITE_` prefix) — never bundled into client code
- The app reads SA API data from **Supabase** (cached), not directly from the API

### Supabase Content Cache

New Supabase tables store cached content data:
- **`titles`** — 20,000 TMDb titles with metadata, IMDb IDs, OMDB ratings, and `content_vector float4[24]` (pre-computed 24D taste vector per title)
- **`streaming_availability`** — ~40,000 deep link entries with pricing (one row per title-service-type-quality combo)
- **`title_genres`**, **`title_credits`** — schema exists but not yet populated
- **`sync_log`** — sync run tracking

**RLS policies:** `anon` + `authenticated` = SELECT only, `service_role` = ALL. The `authenticated` policy was a critical fix — without it, signed-in users got empty results silently.

### Sync Pipeline

- **Bulk sync:** `npx tsx scripts/sync-content.ts` with stages: `--stage tmdb`, `--stage imdb`, `--stage sa`, `--stage omdb`, `--stage vectors`
  - `--stage vectors` backfills `content_vector` for any titles where it is NULL (idempotent, safe to re-run)
- **Daily incremental:** Supabase Edge Function at `supabase/functions/sync-incremental/index.ts` using SA API `/changes` endpoint; also computes `content_vector` for new/updated titles using existing titles metadata
- **Monitoring views:** `sync_history`, `data_freshness`, `deep_link_coverage`, `ratings_coverage`

### Deep Linking

Service pills on the Detail Page are now tappable — they open the streaming app directly via Android App Links.

**Implementation:**
- `src/lib/deepLinks.ts` — resolves exact SA API link or search URL fallback per service
- `src/lib/openDeepLink.ts` — uses `@capacitor/app-launcher` (`AppLauncher.openUrl()`) on native, `window.open()` on web
- `src/components/DetailPage.tsx` — `WhereToWatch` pills are `<button>` elements with `ExternalLink` icon and press animation

**Per-service status on Android:**
| Service | Deep link | Method |
|---|---|---|
| Netflix | Opens app to title | App Links (verified domain) |
| Disney+ | Opens app to title | App Links |
| Channel 4 | Opens app | `/programmes/slug-year` URL |
| Prime Video | Opens in Chrome | No reliable Android deep link format exists |
| BBC iPlayer | Opens in Chrome | SA API catalogue empty, search fallback |
| Sky Go | Opens in Chrome | Not in SA API, Google site search |
| Apple TV, NOW, ITVX, Paramount+ | Opens via SA API deep link | App Links where supported |

**Prime Video limitation:** Amazon's Prime Video app has no public deep link format for detail pages on Android. `amazon.co.uk` opens the Shopping app, `app.primevideo.com` gives PARSE_ERROR, `primevideo.com` opens Chrome. This is a known industry-wide issue. Would work better on iOS via Universal Links.

### Pricing Display

- Rent/buy pills show `"Rent from £3.49"` or `"Buy from £4.99"` when SA API has pricing
- When no price available: `"Buy — check price"` label (user can still tap to open service)
- Rent prices: 100% coverage. Buy prices: ~62% coverage (Apple/Prime)

### SA API UK Service Coverage

| SA API slug | Service | Videx ServiceId | Status |
|---|---|---|---|
| `netflix` | Netflix | `netflix` | Full coverage |
| `prime` | Prime Video | `prime` | Full coverage |
| `disney` | Disney+ | `disney` | Full coverage |
| `apple` | Apple TV | `apple` | Full coverage |
| `itvx` | ITVX | `itvx` | Full coverage |
| `paramount` | Paramount+ | `paramount` | Full coverage |
| `now` | Now | `now` | Full coverage |
| `all4` | Channel 4 | `channel4` | Full coverage |
| `iplayer` | BBC iPlayer | `bbc` | Empty catalogue (GitHub issue filed) |
| — | Sky Go | `skygo` | Not in SA API |

SA-to-Videx mapping is duplicated in 3 files (keep in sync):
- `src/lib/adapters/platformAdapter.ts`
- `scripts/sync-content.ts`
- `supabase/functions/sync-incremental/index.ts`

## New Files

| File | Purpose |
|---|---|
| `src/lib/api/streamingAvailability.ts` | SA API types + client (server-side only) |
| `src/lib/api/supabaseContent.ts` | Reads streaming links from Supabase with 24h client cache |
| `src/lib/deepLinks.ts` | Deep link resolution (exact link → search fallback) |
| `src/lib/openDeepLink.ts` | Platform-aware URL opener (AppLauncher / window.open) |
| `scripts/sync-content.ts` | Bulk content sync (TMDb → SA API → OMDB) |
| `supabase/functions/sync-incremental/index.ts` | Daily incremental sync Edge Function |
| `supabase/migrations/001-005` | Schema, constraint fixes, monitoring, data quality, RLS |
| `supabase/migrations/008_content_vectors.sql` | Adds `content_vector float4[]` with 24D constraint to `titles` |
| `src/lib/taste/computeContentVector.ts` | Pure isomorphic vector computation (no cache) — shared by client, sync script, Edge Function |
| `docs/solutions/` | 3 solution docs (RLS bug, cache bug, SA API coverage) |

## Key Patterns & Gotchas

- **Supabase RLS**: Always add policies for BOTH `anon` AND `authenticated` roles. Signed-in users query as `authenticated`, not `anon`. Missing policy = silent empty results.
- **Capacitor deep linking**: Do NOT use `@capacitor/browser` (`Browser.open()`) — it opens Chrome Custom Tabs which bypass App Links. Use `@capacitor/app-launcher` (`AppLauncher.openUrl()`) instead.
- **SA API key**: Must NOT have `VITE_` prefix. Server-side only (sync scripts + Edge Functions).
- **Client-side cache**: Streaming links use `sa_` prefix in localStorage, 24h TTL. One-time cache flush on app load via `sa_cache_flushed_v1` flag.
- **Price formatting**: Always format from `price_amount` (numeric) as `£X.XX`, not from `price_formatted` (which returns `"X.XX GBP"` format).
- **Channel 4 URLs**: Use `/programmes/{slug-year}` format, built from title + year.
- **Prime Video**: `FORCE_SEARCH_FALLBACK` set in `deepLinks.ts` — always uses search URL instead of SA API deep link.

## Completed Since Initial Deployment

### B1.4: Content vectors pre-computed server-side (migration 008)

- **`content_vector float4[24]`** added to `titles` table — stores a pre-computed 24D taste vector per title
- **Shared module** `src/lib/taste/computeContentVector.ts` — pure isomorphic function, no cache, no browser APIs. Imported by the sync script, Edge Function, and (via the cache wrapper in `contentVectorMapping.ts`) by the client.
- **`stageTmdb()`** in `sync-content.ts` now computes and upserts the vector for every title (runtime is NULL at this stage since TMDb /discover doesn't return it; pacing is derived from genre signals only)
- **`--stage vectors`** in `sync-content.ts` backfills vectors for all existing titles with `content_vector IS NULL`; uses `runtime` from the DB if present
- **Incremental sync** computes vectors for `new` and `updated` change types using existing `titles` metadata; skips (and logs) titles not yet in the table
- **Vector serialisation**: `ALL_DIMENSIONS.map(d => vector[d])` gives a canonical 24-float array in guaranteed dimension order

### Final tasks (commit `d004a58`)
- **B1.7:** pg_cron daily sync scheduled at 06:00 UTC (migration 006)
- **C1.1:** Exponential backoff retry (3 attempts, 1s→2s→4s) added to both Edge Function and bulk sync script
- **C1.3:** Data quality SQL functions deployed — `run_data_quality_check()` detects missing availability, orphaned rows, stale data, TMDb confirmation gaps
- **Dashboard query:** `supabase/queries/dashboard.sql` — combined health check
- **Edge Function deployed** with retry logic and auth check
- **Supabase CLI** connected to project `fmusugdcnnwiuzkbjquo`

### Bug fixes applied during device testing
- **RLS `authenticated` policy missing** — signed-in users got empty results from content cache tables. Fixed in migration 005. Critical lesson: always add policies for both `anon` AND `authenticated` roles.
- **Deep link opener** — `@capacitor/browser` (`Browser.open()`) bypasses Android App Links. Switched to `@capacitor/app-launcher` (`AppLauncher.openUrl()`) which uses ACTION_VIEW intent.
- **Prime Video** — no reliable Android deep link format exists. `FORCE_SEARCH_FALLBACK` in `deepLinks.ts` always uses `primevideo.com/search` URL (opens in Chrome). Would work on iOS via Universal Links.
- **Channel 4 slug** — uses `/programmes/{title-slug-year}` format with year from DetailData.
- **Price formatting** — always formats from `price_amount` as `£X.XX`, not from SA API's `"X.XX GBP"` format. Missing prices show "Buy — check price".
- **Stale SA cache** — one-time flush on app load via `sa_cache_flushed_v1` localStorage flag.

## Remaining Operational Tasks

- Run OMDB ratings daily (`npx tsx scripts/sync-content.ts --stage omdb`) until all 20K titles covered (~20 days at 950/day cap)
- Downgrade SA API from Pro to free tier (initial population complete)
- Monitor daily cron sync via `SELECT * FROM sync_history;` in SQL Editor

---

# C1.5 — Historical Data Retention

**Date:** March 2026
**Status:** Implemented and verified

## What Was Built

### Migration 009 — `streaming_history` table

`supabase/migrations/009_streaming_history.sql` adds an append-only log of streaming availability changes:
- `streaming_history` table with columns for `sync_id`, `title_id`, `service`, `change_type` (`added`/`updated`/`removed`/`expiring`), `option_type`, `quality`, `price_amount`, `price_currency`, `leave_date`, and `recorded_at`
- 3 indexes: on `title_id`, `service`, and `recorded_at` (for range queries)
- RLS policies: `anon` + `authenticated` = SELECT, `service_role` = ALL

### Edge Function updates (`sync-incremental/index.ts`)

- **`HistoryEvent` interface** — typed shape for a single history log entry
- **`insertHistoryBatch()`** — inserts in batches of 100; flushes automatically every 200 events during a sync run to avoid holding large arrays in memory
- **History events logged** for `added`, `updated`, `removed`, and `expiring` change types, with `sync_id` passed through for traceability
- **SA API format change handled** — the new SA API format sends `showId` (numeric string) + `showType` (`"movie"` / `"series"`) as separate fields, replacing the old `show.tmdbId` (`"movie/238"`) combined format. The Edge Function was updated to parse both fields correctly and derive the numeric TMDb ID and media type from them. The old `upsertAvailability()` helper was removed; replaced with per-option insert logic that matches the new format.
- **Auth check** updated from raw string comparison to JWT role claim check (more robust against header tampering)

### Shared module — `_shared/computeContentVector.ts`

A self-contained copy of the content vector computation function lives at `supabase/functions/_shared/computeContentVector.ts`. It inlines the `tasteVector` types rather than importing from `src/lib/taste/`, because the Supabase CLI remote deployment path (no Docker) cannot resolve paths outside the `supabase/functions/` tree. The Edge Function import was updated from `../../../src/lib/taste/computeContentVector.ts` to `../_shared/computeContentVector.ts`.

This establishes a pattern: any logic shared across multiple Edge Functions should live in `supabase/functions/_shared/` as a self-contained module.

### Supabase CLI setup

Supabase CLI was installed via Homebrew and linked to project `fmusugdcnnwiuzkbjquo`. Migrations 001–008 were marked as applied via `supabase migration repair` so the CLI's migration state matches the actual database state.

## Key Decisions

- **SA API format change discovered during C1.5 work.** The API switched from `show.tmdbId` (e.g. `"movie/238"`) to separate `showId` + `showType` fields. This is a breaking change in the API response shape; handled in the Edge Function but worth checking if the bulk sync script (`scripts/sync-content.ts`) also needs updating if it reads this field.
- **`_shared/` module pattern for CLI deployment.** Remote deploy without Docker cannot cross the `supabase/functions/` boundary. Self-contained copies in `_shared/` are the correct pattern. If `computeContentVector` logic changes in `src/lib/taste/`, the `_shared/` copy must be kept in sync manually.
- **Incremental history flushing** (every 200 events) keeps peak memory bounded during large syncs. The batch insert size (100 rows) is a separate concern from the flush threshold.

## Current Status

- Migration 009 deployed and verified
- History events are being written on each incremental sync run
- Import path for `computeContentVector` fixed in the Edge Function

## Pending

- **Removal tracking test** — `removed` change type events will only appear when catalogue removals actually occur; not yet observed in production. Verify the history row and RLS policy for this case when next removals are detected.
- **`content_vector` schema cache** — Supabase caches the PostgREST schema; if the `content_vector` column was added while a schema cache was stale, queries may silently drop the column. Monitor for NULL vectors on titles that should have them.

---

# C1.6 — User Interactions Event Log

**Date:** April 2026
**Status:** Implemented

## What Was Built

### Migration 010 — `user_interactions` table

`supabase/migrations/010_user_interactions.sql` adds an immutable, append-only event log for all user behavioural signals:

- `user_interactions` table with columns: `id` (UUID PK), `user_id` (FK → `profiles`, CASCADE DELETE), `event_type` (TEXT), `content_id` (INTEGER, nullable — TMDb ID), `media_type` (TEXT, nullable — `'movie'` / `'tv'`), `metadata` (JSONB), `created_at` (TIMESTAMPTZ)
- **No UPDATE or DELETE RLS policies** — events are immutable; the only deletion path is account deletion via CASCADE
- RLS: INSERT and SELECT restricted to the owning user via `auth.uid() = user_id`
- 3 indexes: `(user_id, created_at DESC)` for timeline queries, `(user_id, event_type)` for type-filtered queries, `(user_id, content_id, media_type)` for per-content lookups

### New module — `src/lib/storage/interactions.ts`

Central emitter module. All interaction tracking goes through this file.

**Event types** (`InteractionEventType`):
| Event type | Trigger |
|---|---|
| `thumbs_up` | Rating a watched item positively |
| `thumbs_down` | Rating a watched item negatively |
| `watchlist_add` | Adding a title to Want to Watch |
| `watched` | Moving a title to Watched |
| `removed` | Removing a title from the watchlist |
| `quiz_answer` | Each individual quiz pair answer |
| `quiz_completed` | Quiz finished (includes answer count + top genres) |
| `detail_view` | Opening a title's detail page |
| `search` | Executing a search query (includes query string + result count) |
| `dismiss` | (Reserved — not yet wired) |

**Core function:** `emitInteraction(event)` — fire-and-forget, never throws, no-op for unauthenticated users.

**Convenience emitters** (thin wrappers around `emitInteraction`):
- `emitContentInteraction(eventType, contentId, mediaType, metadata?)` — for watchlist/rating events
- `emitQuizAnswer(pairId, chosen, phase)` — per-answer quiz events
- `emitQuizCompleted(answerCount, topGenres)` — quiz completion summary
- `emitDetailView(contentId, mediaType, title, source?)` — detail page views
- `emitSearch(query, resultCount)` — search events

**Query helpers** (for future analytics/replay):
- `getUserInteractions(limit?, eventTypes?)` — paginated event history
- `getInteractionCounts()` — event type frequency map

### Integration points

| File | What was added |
|---|---|
| `src/hooks/useTasteProfile.ts` | Imports `emitContentInteraction`; called after every taste vector update (thumbs up/down, watchlist_add, watched, removed) with the content vector delta as metadata |
| `src/App.tsx` | Imports `emitContentInteraction`; called in `handleRemoveBookmark` for the `removed` event (second removal path not covered by `useTasteProfile`) |
| `src/lib/storage/tasteProfile.ts` | Imports `emitQuizAnswer` + `emitQuizCompleted`; called inside `saveQuizResults` — one `quiz_answer` event per answer, then `quiz_completed` when all answers saved |
| `src/hooks/useContentDetail.ts` | Imports `emitDetailView`; called when detail data resolves successfully |
| `src/hooks/useSearch.ts` | Imports `emitSearch`; called after search results are ranked and returned |

## Relationship to `taste_profiles.interaction_log`

The existing `taste_profiles.interaction_log` (JSONB array) continues to be written in parallel. It serves a different purpose: it is the compact, vector-delta log used by the recommendation engine for fast local reads. The new `user_interactions` table is the raw, granular event log intended for future analytics, replay, and model retraining. Both are written on every user action; neither depends on the other.

## Key Decisions

- **Fire-and-forget:** `emitInteraction` never awaits the result in call sites — it returns `void` and `.catch(() => {})` silences any unhandled rejection. Interaction logging must never degrade the user action that triggered it.
- **No-op for guests:** `isSupabaseActive()` is checked first; unauthenticated users produce no events and no errors.
- **Immutability enforced at the DB layer:** No UPDATE or DELETE RLS policies exist on `user_interactions`. The only way rows are removed is via CASCADE when the parent `profiles` row is deleted (account deletion).
- **`content_id` is nullable** by design — quiz and search events have no associated TMDb content ID.
- **Dual-write instead of migration:** `taste_profiles.interaction_log` was not removed. The event log is additive; removing the existing log would require changes to the recommendation engine that were out of scope.
