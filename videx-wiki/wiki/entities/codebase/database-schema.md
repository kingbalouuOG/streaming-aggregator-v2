---
title: Database Schema (Supabase)
type: entity
tags: [supabase, postgres, schema, pgvector, pg_partman]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/codebase-snapshots/database-schema-snapshot.md
  - raw/codebase-snapshots/migration-changelog.md
related:
  - wiki/entities/codebase/migrations.md
  - wiki/entities/codebase/rpcs.md
  - wiki/entities/codebase/event-taxonomy.md
  - wiki/entities/infrastructure/supabase.md
  - wiki/concepts/techniques/rls-pattern.md
  - wiki/concepts/decisions/adr-006-card-impressions-dedicated-table.md
  - wiki/concepts/decisions/adr-010-pg-partman-card-impressions.md
---

# Database Schema (Supabase)

Snapshot of the Videx Supabase schema as of migration 032. Source of truth: `supabase/migrations/`. Use [migrations](migrations.md) for chronology, [RPC catalogue](rpcs.md) for callable functions.

## Extensions

- `pg_cron` — daily 06:00 UTC sync, monthly recluster.
- `pg_net` — HTTP calls from SQL (cron-triggered Edge Function invocations).
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
| `title_genres` | Schema exists, intentionally not populated. Static genre mapping used instead (see [ADR-008](../../concepts/decisions/adr-008-static-genre-mapping.md)). | `tmdb_id`, `genre_id` |
| `title_credits` | Schema exists, intentionally not populated; covered by `cast_top_5`/`director` columns on `titles`. | `tmdb_id`, `person_id`, `role` |
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

## Canonical column names (post v1.6.3)

- `event_type` (not `interaction_type`)
- `content_id` (not `tmdb_id` on `card_impressions` since v1.6.1; older docs may say `tmdb_id`)

## Triggers

- `on_auth_user_created` on `auth.users` INSERT → `handle_new_user()` → inserts row into `profiles` using `NEW.raw_user_meta_data->>'username'`.
- `card_impressions_rls_on_create` event trigger → `card_impressions_ensure_rls()` → applies RLS policies to new pg_partman monthly partitions.

## Scheduled jobs

- Daily 06:00 UTC: `sync-incremental` Edge Function (pg_cron + pg_net).
- Daily 06:30 UTC: enrichment cron (`supabase/cron/enrich_new_titles.sql`).
- Monthly: HDBSCAN recluster via GitHub Actions (psycopg2 → Supabase).

## RLS pattern

Every user-scoped or content table has policies for three roles: `anon` (SELECT on public content), `authenticated` (SELECT on content + scoped INSERT/SELECT on user tables filtered by `user_id = auth.uid()`), `service_role` (ALL on every table). The `authenticated` policies were added in migration 005 after a silent-empty bug. See [RLS pattern](../../concepts/techniques/rls-pattern.md) and [authenticated-role missing RLS solution](../../concepts/operations/solutions/authenticated-role-missing-rls.md).

## Deviations and gaps

- Migration 021 intentionally skipped (numbering reserved for a Phase 2.5 step that was rolled into 022).
- `title_genres` and `title_credits` exist as empty tables for forward compatibility; current paths use static genre mapping and `cast_top_5`/`director` columns on `titles`.
- `service_fingerprints.variant` added in migration 022 to support synthetic cold-start evaluation.
