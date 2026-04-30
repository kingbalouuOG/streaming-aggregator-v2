---
title: Database Schema Snapshot
generated: 2026-04-26
source: supabase/migrations/001-032
---

# Database Schema Snapshot

Consolidated view of the Videx Supabase schema as of migration 032. Source of truth remains the migration files; this document is a flattened reference.

## Extensions

- `pg_cron` — scheduled jobs (daily sync at 06:00 UTC, monthly recluster).
- `pg_net` — HTTP calls from SQL (used by cron-triggered Edge Function invocations).
- `pg_partman` — declarative monthly partitioning of `card_impressions`.
- `vector` (pgvector) — `vector(1536)` column type and HNSW index.
- `pgcrypto` — UUID generation for `mood_rooms` and related tables.

## Tables

### Content cache layer

| Table | Purpose | Key columns |
|---|---|---|
| `titles` | Cached TMDb titles (~20K rows). One row per title regardless of media type. | `tmdb_id`, `media_type`, `imdb_id`, `embedding vector(1536)`, `runtime`, `keywords`, `cast_top_5`, `director`, `content_rating`, `popularity`, `release_date`, `available_since` |
| `streaming_availability` | Cached SA API deep links and pricing (~40K rows). One row per title-service-type-quality combo. | `tmdb_id`, `media_type`, `service_id`, `link`, `type`, `quality`, `price_amount`, `price_currency`, `last_verified_at`, `expires_soon` |
| `streaming_history` | Append-only log of availability changes (added/removed). | `tmdb_id`, `service_id`, `event_type`, `event_time` |
| `title_genres` | Schema exists, intentionally not populated. Static genre mapping used instead (see ADR-008). | `tmdb_id`, `genre_id` |
| `title_credits` | Schema exists, intentionally not populated for v2; covered by `cast_top_5`/`director` columns on `titles`. | `tmdb_id`, `person_id`, `role` |
| `sync_log` | Sync run audit. | `started_at`, `stage`, `status`, `rows_processed` |

### User layer

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | Per-user profile, FK `id` → `auth.users(id)`. Created via `on_auth_user_created` trigger. | `id`, `username`, `theme_preference`, `onboarding_completed`, `region`, `is_test_user`, `age_range`, `viewing_context` |
| `user_interactions` | Immutable event log (thumbs, watchlist, dwell, deep-link clicks). | `user_id`, `event_type`, `content_id`, `metadata jsonb`, `session_id`, `source_surface`, `created_at` |
| `card_impressions` | Partitioned table (pg_partman, monthly) for impression tracking. RLS replicated to each new partition via event trigger. | `user_id`, `content_id`, `surface`, `position`, `session_id`, `shown_at` |
| `card_impression_daily_totals` | Aggregation rollup of `card_impressions` for fast lookups. | `user_id`, `date`, `surface`, `count` |
| `card_impressions_template` | Template partition used to seed RLS on new partitions. | (same as `card_impressions`) |

### Recommendation layer

| Table | Purpose | Key columns |
|---|---|---|
| `service_fingerprints` | Per-service taste centroids derived from popular titles per service. Used for cold-start service-bias modelling. | `service_id`, `variant`, `centroid vector(1536)`, `title_count`, `version` |
| `mood_rooms` | HDBSCAN cluster definitions, regenerated monthly. | `id uuid`, `version`, `label`, `centroid vector(1536)`, `title_count`, `created_at` |
| `mood_room_titles` | Cluster membership. | `mood_room_id`, `tmdb_id`, `centrality` |
| `clustering_runs` | Audit log of monthly mood room reclustering. | `version`, `started_at`, `parameters jsonb`, `outcome` |

## RPCs (functions)

| Function | Purpose |
|---|---|
| `get_stale_titles(limit)` | Returns titles with old `last_verified_at`. |
| `get_stale_availability(limit)` | Same for `streaming_availability`. |
| `get_stale_ratings(limit)` | Titles with missing/old OMDB data. |
| `check_titles_without_availability()` | Data-quality probe. |
| `check_orphaned_availability()` | Data-quality probe. |
| `check_stale_availability()` | Data-quality probe. |
| `run_data_quality_check()` | Master quality check. |
| `card_impressions_ensure_rls()` | Event-trigger function applying RLS to new monthly partitions. |
| `handle_new_user()` | Trigger on `auth.users` INSERT; populates `profiles`. |
| `match_titles_by_vector(query_vector, k, ...)` | HNSW similarity search. Used by ranker and detail-page "More Like This". Capped at high `ef_search` post migration 025. |
| `get_available_tmdb_ids(service_ids text[])` | Single-query availability lookup. Replaces 42 paginated calls. Returns JSON array to bypass PostgREST 1000-row cap. |
| `get_mood_rooms_for_user(user_id, limit)` | Server-side mood room ranking by centroid distance. |
| `get_mood_room_thumbnails(mood_room_id, limit)` | Thumbnail title sampler. |
| `get_mood_room_detail(mood_room_id, user_id, limit)` | Full detail page payload for a single mood room. |

## RLS policy pattern

Every user-scoped or content table has policies for three roles:

- `anon` — SELECT on public content tables (titles, streaming_availability, streaming_history, mood_rooms, mood_room_titles, service_fingerprints).
- `authenticated` — SELECT on the same tables, plus user-scoped INSERT/SELECT on `user_interactions` and `card_impressions` (filtered by `user_id = auth.uid()`).
- `service_role` — ALL on every table (used by Edge Functions and sync scripts).

The authenticated policies were added in migration 005 after a silent-empty bug; see `docs/solutions/database-issues/authenticated-role-missing-rls-policy.md`.

## Triggers

- `on_auth_user_created` on `auth.users` INSERT → `handle_new_user()` → inserts row into `profiles` using `NEW.raw_user_meta_data->>'username'`.
- `card_impressions_rls_on_create` event trigger → `card_impressions_ensure_rls()` → applies RLS policies to new pg_partman monthly partitions.

## Scheduled jobs

- Daily 06:00 UTC: `sync-incremental` Edge Function (pg_cron + pg_net).
- Daily 06:30 UTC: enrichment cron (`supabase/cron/enrich_new_titles.sql`).
- Monthly: HDBSCAN recluster via GitHub Actions (psycopg2 → Supabase).

## Deviations and gaps

- Migration 021 is intentionally skipped (numbering reserved for a Phase 2.5 step that was rolled into 022).
- `title_genres` and `title_credits` exist as empty tables for forward compatibility; current code paths use static genre mapping and the `cast_top_5`/`director` columns on `titles`.
- `service_fingerprints` has a `variant` column added in migration 022 to support synthetic cold-start evaluation.
