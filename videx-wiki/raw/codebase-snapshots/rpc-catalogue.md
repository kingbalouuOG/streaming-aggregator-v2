---
title: Supabase RPC Catalogue
generated: 2026-04-26
source: supabase/migrations/
---

# RPC Catalogue

Every Supabase function callable via `supabase.rpc()`. Includes signature, return type, intended caller, and the migration that introduced or last modified it.

## Recommendation pipeline

### `match_titles_by_vector(query_vector vector(1536), k int, ...)`

- **Returns:** `setof title_match { tmdb_id, media_type, distance }`.
- **Caller:** `recommendations-v2/ranker` (For You retrieval), `useContentDetail` (More Like This).
- **Notes:** HNSW similarity search. `ef_search` raised in migration 025 to ensure enough results for service-overlap filtering. Built first in migration 022 (variant column), refined in 025.

### `get_available_tmdb_ids(service_ids text[]) returns json`

- **Returns:** JSON array of distinct `tmdb_id`s available on the given services.
- **Caller:** `recommendations-v2/hardFilters` (availability gate), Phase 3 hooks.
- **Notes:** Replaces 42 sequential paginated REST calls. Returns JSON to bypass PostgREST 1000-row cap. Migration 028.

## Mood rooms

### `get_mood_rooms_for_user(user_id uuid, limit int) returns setof mood_room`

- **Returns:** Mood rooms ranked by distance between room centroid and the user's taste vector.
- **Caller:** `useMoodRoomsRow`, For You surface.
- **Migration:** 031.

### `get_mood_room_thumbnails(mood_room_id uuid, limit int) returns setof thumbnail`

- **Returns:** Top-N most central titles by `centrality` for thumbnail rendering.
- **Caller:** `MoodRoomCard`.
- **Migration:** 031.

### `get_mood_room_detail(mood_room_id uuid, user_id uuid, limit int) returns json`

- **Returns:** Full payload for the mood room detail page (label, thumbnails, ranked title list filtered by user availability).
- **Caller:** `MoodRoomPage`.
- **Migration:** 031.

## Data quality

### `get_stale_titles(limit_count int default 100)`, `get_stale_availability(limit_count int default 100)`, `get_stale_ratings(limit_count int default 100)`

- **Returns:** Rows ordered by `last_verified_at ASC`.
- **Caller:** Sync scripts (`scripts/sync-content.ts`).
- **Migration:** 001.

### `check_titles_without_availability()`, `check_orphaned_availability()`, `check_stale_availability()`, `run_data_quality_check()`

- **Returns:** Counts and sample rows for each DQ probe.
- **Caller:** `scripts/sync-content.ts` post-stage; manual SQL Editor invocations.
- **Migration:** 007.

## Auth and lifecycle

### `handle_new_user() returns trigger`

- **Trigger:** `on_auth_user_created` on `auth.users` INSERT.
- **Action:** Inserts `(id, username)` into `profiles` from `NEW.raw_user_meta_data->>'username'`.
- **Migration:** 011 (codified existing production state).

### `card_impressions_ensure_rls() returns event_trigger`

- **Trigger:** Event trigger on table CREATE matching the `card_impressions_p*` partition naming.
- **Action:** Applies the user-scoped RLS policies from the template partition.
- **Migration:** 016.

## Conventions

- All functions have `search_path` pinned (`SET search_path = public, pg_temp`) per migration 027 to neutralise role-default redirection attacks.
- All functions are `SECURITY DEFINER` only where strictly needed (mood room and ranking RPCs); data-quality functions are `SECURITY INVOKER`.
- New RPCs must be added to `database.types.ts` regen step before client code can call them.
