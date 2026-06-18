---
title: Database Schema (Supabase)
type: entity
tags: [supabase, postgres, schema, pgvector, pg_partman]
created: 2026-04-26
updated: 2026-06-18
sources:
  - raw/codebase-snapshots/database-schema-snapshot.md
  - raw/codebase-snapshots/migration-changelog.md
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.8.md
  - supabase/migrations/047_app_feedback.sql
related:
  - wiki/entities/codebase/migrations.md
  - wiki/entities/codebase/rpcs.md
  - wiki/entities/codebase/event-taxonomy.md
  - wiki/entities/infrastructure/supabase.md
  - wiki/concepts/techniques/rls-pattern.md
  - wiki/concepts/decisions/adr-006-card-impressions-dedicated-table.md
  - wiki/concepts/decisions/adr-010-pg-partman-card-impressions.md
  - wiki/concepts/operations/phase-eng-1.md
  - wiki/concepts/operations/phase-repo-1.md
---

# Database Schema (Supabase)

Snapshot of the Videx Supabase schema **as of migration 047** (the live-production `information_schema` pull is REPO-1-era / migration 046, 2026-06-10; `app_feedback` from migration 047 added from the migration source for the NATIVE feedback loop). Source of truth: `supabase/migrations/` + orchestration v0.8 §3.4 for applied status. Use [migrations](migrations.md) for chronology, [RPC catalogue](rpcs.md) for callable functions. RLS is enabled on **every** public table.

## Extensions

- `pg_cron` — scheduled jobs (daily sync 06:00, enrichment 06:30, embeddings 06:45 UTC, weekly fingerprints Sun 07:00; Vault-backed JWTs per migration 039).
- `pg_net` — HTTP calls from SQL (cron-triggered Edge Function invocations).
- `pg_partman` — declarative monthly partitioning of `card_impressions` (`part_config` / `part_config_sub` are its bookkeeping).
- `vector` (pgvector) — `vector(1536)` columns + HNSW index.
- `pgcrypto` — UUID generation.

## Tables

### Content cache layer

| Table | Purpose | Key columns |
|---|---|---|
| `titles` | Cached UK-available titles (~22.8K rows, 98.6% embedded). | `tmdb_id`, `media_type`, `embedding vector(1536)`, `keywords[]`, `cast_top_5[]`, `director`, `content_rating`, `runtime`, `popularity`, `release_date`, `imdb_id`, `rt_score`, `imdb_rating` |
| `streaming_availability` | Per-service availability, deep links, rent/buy pricing. | `tmdb_id`, `media_type`, `service_id`, `stream_type`, `deep_link_url`, `price_*`, `tmdb_confirmed`, `available_since` |
| `streaming_history` | Append-only availability-change log from the daily sync. | `tmdb_id`, `service_id`, `event_type`, `recorded_at`, `sync_run_id` |
| `sync_log` | Sync-run audit. | `sync_type`, `source`, `titles_processed/added/updated/removed`, `status` |

> `title_genres` and `title_credits` were **dropped in migration 046** (REPO-1, 2026-06-10, applied) — empty since creation in 001; superseded by the denormalised `titles` columns from 017 and the [ADR-008](../../concepts/decisions/adr-008-static-genre-mapping.md) static genre mapping.

### User layer

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | Per-user profile, FK `id` → `auth.users(id)`, created via `on_auth_user_created` trigger. | `username`, `onboarding_completed`, `is_test_user`, `age_range`, `viewing_context`, `theme_preference`, `region` |
| `taste_profiles` | Summary taste vector + sliders. | `taste_vector_v2 vector(1536)`, `taste_vector_updated_at`, `taste_vector_interaction_count`, `taste_vector_bootstrapped_from`, `selected_clusters[]`, `slider_{catalogue_age,comfort_zone,content_mix,variety}` |
| `user_interest_centroids` | **ENG-1 (044):** K ≤ 3 interest centroids driving multi-interest retrieval. Zero rows = single-vector fallback path. | PK `(user_id, slot 0–2)`, `centroid vector(1536)`, `weight`, `updated_at` (touch trigger) |
| `user_interactions` | Immutable event log — the taste system's source of truth. | `event_type` (CHECK-constrained), `content_id`, `media_type`, `session_id`, `source_surface`, `metadata jsonb` (deep-link confidence; position-at-click + origin_surface since ENG-1) |
| `card_impressions` | Partitioned impression log (pg_partman monthly; RLS auto-propagated to new partitions via the 016 event trigger). 90-day raw retention then rollup. | `content_id`, `source_surface`, `position`, `session_id`, `shown_at`, `metadata jsonb` (anchor-room context; `exploration` since ENG-1) |
| `card_impression_daily_totals` | Daily rollup of expired raw impressions. | `date`, `user_id`, `source_surface`, `content_id`, `impression_count` |
| `watchlist` | Want-to-watch / watched + thumbs ratings. | `tmdb_id`, `media_type`, `status`, `rating`, `genre_ids[]` |
| `user_services` / `user_genres` | Selected services / genre prefs. | `service_id` / `genre_id` + `rank` |
| `user_feature_flags` | Per-user flags (041, Search V2 pattern). | PK `(user_id, flag_name)`, `enabled` |
| `onboarding_events` | Funnel instrumentation. | `event_name`, `metadata jsonb` |
| `availability_reports` | "Report incorrect availability" submissions. | `tmdb_id`, `service_id`, `report_type`, `notes` |
| `app_feedback` | **NATIVE (047):** in-app product feedback backing the native FeedbackSheet — deliberate written commentary (distinct from the `user_interactions` behavioural log). Immutable (no UPDATE/DELETE). FK `user_id` → `profiles(id)` CASCADE. | `message` (1–2000 chars, required), `rating` (1–5, optional), `context jsonb` (surface/platform triage hints), `created_at` |

### Recommendation layer

| Table | Purpose | Key columns |
|---|---|---|
| `service_fingerprints` | Per-service catalogue centroids (weekly cron; `v1_popularity` active variant). | PK incl. `variant`, `centroid vector(1536)`, `title_count`, `source_title_ids[]` |
| `mood_rooms` | HDBSCAN cluster definitions (monthly recluster) + LLM anchor labels (034). | `centroid vector(1536)`, `label`, `anchor_label_text`, `title_count`, `version` |
| `mood_room_titles` | Cluster membership. | PK `(mood_room_id, tmdb_id, media_type)`, `centrality` |
| `clustering_runs` | Recluster audit (service_role only). | `status`, `cluster_count`, `catalogue_coverage_pct` |

## Views

- `v_training_examples` (**045**, `security_invoker = true`) — one row per impression LEFT JOIN the first same-session positive outcome; `label_positive`, `exploration`, `position`, `position_at_click`. The ENG-2 training dataset shape.

## RPCs (headline — full list in the [RPC catalogue](rpcs.md))

| Function | Purpose |
|---|---|
| `match_titles_by_vector` | HNSW similarity search (dynamic `ef_search` since 025). Single-vector AND per-centroid multi-interest retrieval (ENG-1), "More Like This", semantic search. |
| `get_available_tmdb_ids` | Single-query availability lookup; JSONB-array return since 035. |
| `get_mood_rooms_for_user` / `get_mood_room_thumbnails` / `get_mood_room_detail` | Mood-room data access (031). |
| `username_available` | SECURITY DEFINER signup check (038). |
| `delete_own_account()` / `export_user_data()` | GDPR Art. 17 / Art. 20+15 (042/043); both cover **9** user-scoped tables since 044. |
| `card_impressions_ensure_rls()` / `handle_new_user()` | Partition-RLS event trigger fn (016) / profiles trigger. |

## RLS policy pattern

- `anon` — SELECT on public content tables (titles, streaming_availability, streaming_history, mood_rooms, mood_room_titles).
- `authenticated` — SELECT on the same (the migration-005 lesson), plus owner-scoped access to user tables via `auth.uid() = user_id`.
- `service_role` — bypasses RLS (Edge Functions re-impose user scoping via `withUserScope` — IN-466 contract).

See [RLS pattern](../../concepts/techniques/rls-pattern.md) and the [authenticated-role missing RLS solution](../../concepts/operations/solutions/authenticated-role-missing-rls.md).

## Triggers

- `on_auth_user_created` → `handle_new_user()` → `profiles` row.
- `card_impressions` partition event trigger (016) → RLS on new partitions.
- `updated_at` touch triggers on `user_feature_flags` (041) and `user_interest_centroids` (044).

## Scheduled jobs (registrations live in migration 039 — `supabase/cron/` is intentionally empty)

- Daily 06:00 `daily-content-sync` · 06:30 `enrich-new-titles` · 06:45 `embed-new-titles` · weekly Sun 07:00 `refresh-service-fingerprints` (pg_cron + pg_net, Vault JWTs).
- Monthly HDBSCAN recluster via GitHub Actions (psycopg2 direct connection).
- `card_impressions_rollup` + `pg_partman_maintenance` (014).

## Deviations and gaps

- Migration 021 intentionally skipped (rolled into 022).
- `editor_notes` — `040_editor_notes.sql` in repo (Phase 6 PR-AD) but **NOT applied**; apply before Phase 6 editorial features go live.
- The Supabase migration ledger has gaps (033, 036–047 applied via Studio/MCP): **orchestration v0.8 §3.4 is the authoritative applied-status record. Never `supabase db push`.**
- `app_feedback` (047) is GDPR-deleted via **FK CASCADE only** — migration 044 (which CREATE OR REPLACEd `delete_own_account()`/`export_user_data()`) predates it, so the RPCs' explicit-DELETE / export lists don't yet enumerate it. The CASCADE through `profiles` covers deletion; an export-coverage refresh is a candidate fast-follow.
