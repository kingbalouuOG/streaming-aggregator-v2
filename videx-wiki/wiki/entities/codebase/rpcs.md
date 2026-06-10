---
title: Supabase RPC Catalogue
type: entity
tags: [supabase, rpc, postgres]
created: 2026-04-26
updated: 2026-06-10
sources:
  - raw/codebase-snapshots/rpc-catalogue.md
  - raw/phase-summaries/phase-5.5-summary.md
related:
  - wiki/entities/codebase/database-schema.md
  - wiki/entities/codebase/migrations.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/architecture/mood-rooms.md
  - wiki/concepts/product/privacy-and-gdpr.md
---

# Supabase RPC Catalogue

Every Supabase function callable via `supabase.rpc()`. Source of truth: `supabase/migrations/`. New RPCs must be added to `database.types.ts` regen step before client code can call them.

## Recommendation pipeline

### `match_titles_by_vector(query_vector vector(1536), k int, ...)`

- Returns: `setof title_match { tmdb_id, media_type, distance }`.
- Caller: `recommendations-v2/ranker` (For You retrieval), `useContentDetail` ("More Like This").
- Notes: HNSW similarity search. `ef_search` raised in migration 025 to ensure enough results for service-overlap filtering. Built first in migration 022 (variant column), refined in 025.

### `get_available_tmdb_ids(service_ids text[]) returns jsonb`

- Returns: JSONB array of distinct `tmdb_id`s available on the given services.
- Caller: `recommendations-v2/hardFilters` (availability gate), Phase 3 hooks, anchor room generation, BYW filtering, OnboardingFlow.
- Notes: Replaces 42 sequential paginated REST calls. Migration 028 first introduced this as TABLE return; **migration 035 (Phase 4.5 cold-start fix)** changed return shape from TABLE → JSONB array, eliminating per-row PostgREST envelope cost (~1.5–2s saved on Edge Function cold-starts).
- **Phase 5.5 follow-up (IN-458 / planned migration 040):** the function returns bare `tmdb_id` values without distinguishing `media_type`. Movie/TV id collisions exist at ~0.8% rate. Fix is a parallel function `get_available_tmdb_id_pairs` (additive — don't swap return shape on the existing function).

## Mood rooms

### `get_mood_rooms_for_user(user_id uuid, limit int) returns setof mood_room`

- Mood rooms ranked by distance between room centroid and the user's taste vector. Caller: `useMoodRoomsRow`, For You surface. Migration 031.

### `get_mood_room_thumbnails(mood_room_id uuid, limit int) returns setof thumbnail`

- Top-N most central titles by `centrality` for thumbnail rendering. Caller: `MoodRoomCard`. Migration 031.

### `get_mood_room_detail(mood_room_id uuid, user_id uuid, limit int) returns json`

- Full payload for the mood room detail page (label, thumbnails, ranked title list filtered by user availability). Caller: `MoodRoomPage`. Migration 031.

## Data quality

### `get_stale_titles(limit_count)`, `get_stale_availability(limit_count)`, `get_stale_ratings(limit_count)`

- Rows ordered by `last_verified_at ASC`. Caller: `scripts/sync-content.ts`. Migration 001.

### `check_titles_without_availability()`, `check_orphaned_availability()`, `check_stale_availability()`, `run_data_quality_check()`

- Counts and sample rows for each DQ probe. Caller: sync scripts post-stage; manual SQL Editor invocations. Migration 007.

## Auth and lifecycle

### `handle_new_user() returns trigger`

- Trigger: `on_auth_user_created` on `auth.users` INSERT. Inserts `(id, username)` into `profiles` from `NEW.raw_user_meta_data->>'username'`. Migration 011.

### `card_impressions_ensure_rls() returns event_trigger`

- Event trigger on table CREATE matching the `card_impressions_p*` partition naming. Applies the user-scoped RLS policies from the template partition. Migration 016.

### `username_available(check_username text) returns boolean`

- Returns `true` if no profile row carries the given username, `false` otherwise.
- Caller: `AuthContext.checkUsernameAvailable` (signup flow username availability indicator).
- Notes: SECURITY DEFINER + STABLE, granted to `anon` and `authenticated`. **Phase 5 (IN-XPS-002, migration 038):** replaces the wide-open `"Allow public username lookup"` policy on `profiles` with this scoped boolean RPC. Anon SELECT on profiles is now denied entirely. Trade-off: anon callers can still enumerate usernames one-at-a-time; rate-limit tracked as Phase 6 follow-up (IN-PX-29).

### `delete_own_account()` — ✅ captured Phase 5.5

- Caller: `AuthContext.deleteAccount` via `supabase.rpc('delete_own_account')`.
- **Source-of-truth gap closed Phase 5.5 (migration 042, 2026-05-15).** Live RPC body was captured pre-cut (H5 audit) — original body was a minimal single-line `DELETE FROM auth.users WHERE id = auth.uid();` relying entirely on FK cascade chains.
- **Body (migration 042):** SECURITY DEFINER + `SET search_path = public, pg_temp`. Raises `'delete_own_account called without auth.uid()'` if `auth.uid()` returns NULL. Then explicit DELETEs across 8 user-scoped tables in this order: `card_impressions` → `user_interactions` → `taste_profiles` → `user_services` → `user_genres` → `watchlist` → `onboarding_events` → `user_feature_flags` → `profiles` → `auth.users`. Belt-and-braces against future cascade-rule regression.
- **ENG-1 update (migration 044, 2026-06-10):** body CREATE OR REPLACEd to also DELETE from the new `user_interest_centroids` table — 9 user-scoped tables now covered. IN-PX-54 honoured at table-creation time.
- **Supabase auto-grant gotcha:** the migration's `REVOKE EXECUTE FROM PUBLIC, anon` doesn't persist — Supabase auto-grants EXECUTE to anon / authenticated / service_role on every `public.*` function so PostgREST can route to it. The functional auth gate is the body's NULL `auth.uid()` raise, not the grant. Documented inline in the migration.
- **C11 throwaway-account smoke test (validated 2026-05-15):** throwaway user with 113 `card_impressions` + 6 `onboarding_events` + profile / taste / services rows. Post-`delete_own_account()`: every count = 0; `auth.users` row gone. The 113 → 0 specifically validates the partitioned `card_impressions` FK CASCADE.
- UI gate flipped at the same time (`ProfilePage.tsx` `PrivacyDataPage` modal): type-username-to-confirm UX, case-insensitive trimmed match against `currentUsername`.

### `export_user_data()` — NEW Phase 5.5

- Returns: `jsonb` object keyed by user-scoped table.
- Caller: `src/lib/storage/userExport.ts` via `supabase.rpc('export_user_data')`, which then branches on `Capacitor.isNativePlatform()` to either `@capacitor/filesystem` `writeFile` (Documents directory) or browser Blob download.
- Notes: GDPR Article 20 (data portability) + Article 15 (access). SECURITY DEFINER + search_path pinned. Raises if `auth.uid()` is NULL. Scoped to caller's user_id on every internal `SELECT ... WHERE user_id = v_user_id`.
- **Payload shape:** keys `profiles`, `taste_profiles`, `user_services`, `user_genres`, `watchlist`, `user_interactions`, `card_impressions` (capped to last 90 days — matches migration 014's daily-aggregate rollup), `onboarding_events`. Plus `_export_metadata` with `{ version: '1.0', generated_at: now(), user_id: auth.uid() }`. Empty tables return `'[]'::jsonb` via `COALESCE`.
- Migration: 043 (applied 2026-05-15). Verified `prosecdef = true`, `search_path = public,pg_temp`.
- **ENG-1 update (migration 044, 2026-06-10):** body CREATE OR REPLACEd to also export `user_interest_centroids` (IN-PX-54 honoured at table-creation time).

## Edge Functions (RPC-shaped HTTP endpoints)

These are not pg-callable RPCs but follow the same client-side pattern (`supabase.functions.invoke` or direct `fetch`).

### `render-foryou-rows`

- Server-side For You first paint (IN-466). Returns the full `recommendedForYou`/`hiddenGems`/`outsideYourUsual`/`becauseYouWatched`/`moreFromPerson`/`fromYourWatchlist` + anchor room previews + candidate pool + slider state in a single call.
- Auth: `verify_jwt = true` (per-function `config.toml` since Phase 5 / IN-XPS-011); user identity via `extractUserIdFromJwt` decode (signature verification delegated to Supabase gateway).
- CORS: tightened in Phase 5 (IN-XPS-013) — origin echo only when allow-listed (`capacitor://localhost`, `https://localhost`, regex `http://localhost(:port)?$`, plus `VIDEX_ALLOWED_DEV_ORIGINS` env hook).
- Phase 5 additions: contextual scoring + MMR + body fields `hourOfDay`/`dayOfWeek` (decision 9 — TZ skew avoidance) + embedding fetch for top-200 candidates.

### `label-anchor-room`

- Generates LLM thematic labels for anchored mood rooms (IN-463). Caches in `mood_room_anchor_labels` (migration 034). Called server-side from `render-foryou-rows`.
- Auth: `verify_jwt = true`. CORS: same allow-list as `render-foryou-rows`.

### `embed-new-titles`, `enrich-new-titles`, `refresh-service-fingerprints`, `sync-incremental`

- Cron-invoked via pg_cron from migration 039 (Phase 5 Vault-backed JWT). Not browser-facing — no CORS code.
- All set `verify_jwt = true` per-function (Phase 5 IN-XPS-011 codified the default).

## Conventions

- All functions have `search_path` pinned (`SET search_path = public, pg_temp`) per migration 027 to neutralise role-default redirection attacks.
- All functions are `SECURITY DEFINER` only where strictly needed (mood room and ranking RPCs, `username_available`, `delete_own_account`, `export_user_data`); data-quality functions are `SECURITY INVOKER`.
- New RPCs must have their definition in a version-controlled migration from the start. Don't repeat the `delete_own_account` source-of-truth gap (closed Phase 5.5).
- Auth-gated RPCs should raise on NULL `auth.uid()` inside the function body. The Supabase auto-grant on `public.*` functions means `REVOKE FROM PUBLIC, anon` doesn't stick — the body's null check is the actual gate. See migrations 042 and 043 for the pattern.

## Phase 5.5 follow-ups filed for Phase 6

- **IN-PX-52** — Regenerate Edge `_shared/database.types.ts` for typed RPC calls. The Edge tree currently uses `(client.from('titles') as any)` in `supabase/functions/render-foryou-rows/index.ts` and similar shapes — the kind of cast C1 cleaned up on the client side. The `<Database>` generic isn't applied to the Edge `createClient` either. Non-launch-blocking; current `as any` casts are correctness-equivalent, just type-unsafe.
- **IN-PX-54** — CI check that every public-schema table with a `user_id` column is referenced in both `delete_own_account` and `export_user_data`. Defensive against future schema drift adding a new user-scoped table without updating the RPCs.
