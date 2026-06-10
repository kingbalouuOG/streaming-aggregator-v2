---
title: Database Schema Snapshot
generated: 2026-06-10
source: supabase/migrations/001-046 + live production information_schema pull (post-046)
---

# Database Schema Snapshot

Consolidated view of the Videx Supabase schema as of migration 046 (REPO-1 close). Source of truth remains the migration files; this is a flattened reference regenerated from a live `information_schema` pull on 2026-06-10. RLS is enabled on **every** public table.

## Extensions

- `pg_cron` — scheduled jobs (daily sync 06:00, enrichment 06:30, embeddings 06:45 UTC, weekly fingerprints Sun 07:00; Vault-backed JWTs per migration 039).
- `pg_net` — HTTP calls from SQL (cron-triggered Edge Function invocations).
- `pg_partman` — declarative monthly partitioning of `card_impressions` (`part_config` / `part_config_sub` are its bookkeeping tables).
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

> `title_genres` and `title_credits` were **dropped in migration 046** (REPO-1, 2026-06-10) — empty since creation in 001; superseded by the denormalised `titles` columns from 017 and the ADR-008 static genre mapping.

### User layer

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | Per-user profile, FK `id` → `auth.users(id)`, created via `on_auth_user_created` trigger. | `username`, `onboarding_completed`, `is_test_user`, `age_range`, `viewing_context`, `theme_preference`, `region` |
| `taste_profiles` | Summary taste vector + sliders. | `taste_vector_v2 vector(1536)`, `taste_vector_updated_at`, `taste_vector_interaction_count`, `taste_vector_bootstrapped_from`, `selected_clusters[]`, `slider_{catalogue_age,comfort_zone,content_mix,variety}` |
| `user_interest_centroids` | **ENG-1 (044):** K ≤ 3 interest centroids driving multi-interest retrieval. Zero rows = single-vector fallback path. | PK `(user_id, slot 0–2)`, `centroid vector(1536)`, `weight`, `updated_at` (touch trigger) |
| `user_interactions` | Immutable event log — the taste system's source of truth. | `event_type` (CHECK-constrained), `content_id`, `media_type`, `session_id`, `source_surface`, `metadata jsonb` (deep-link confidence; position-at-click + origin_surface since ENG-1) |
| `card_impressions` | Partitioned impression log (pg_partman monthly; `_default` / `_template` / `template_public_*` are partman plumbing; RLS auto-propagated to new partitions via the 016 event trigger). 90-day raw retention then rollup. | `content_id`, `source_surface`, `position`, `session_id`, `shown_at`, `metadata jsonb` (anchor-room context; `exploration` since ENG-1) |
| `card_impression_daily_totals` | Daily rollup of expired raw impressions. | `date`, `user_id`, `source_surface`, `content_id`, `impression_count` |
| `watchlist` | Want-to-watch / watched + thumbs ratings. | `tmdb_id`, `media_type`, `status`, `rating`, `genre_ids[]` |
| `user_services` / `user_genres` | Selected services / genre prefs. | `service_id` / `genre_id` + `rank` |
| `user_feature_flags` | Per-user flags (041, Search V2 pattern). | PK `(user_id, flag_name)`, `enabled` |
| `onboarding_events` | Funnel instrumentation. | `event_name`, `metadata jsonb` |
| `availability_reports` | "Report incorrect availability" submissions. | `tmdb_id`, `service_id`, `report_type`, `notes` |

### Recommendation layer

| Table | Purpose | Key columns |
|---|---|---|
| `service_fingerprints` | Per-service catalogue centroids (weekly cron; `v1_popularity` active variant). | PK incl. `variant`, `centroid vector(1536)`, `title_count`, `source_title_ids[]` |
| `mood_rooms` | HDBSCAN cluster definitions (monthly recluster) + LLM anchor labels (034). | `centroid vector(1536)`, `label`, `anchor_label_text`, `title_count`, `version` |
| `mood_room_titles` | Cluster membership. | PK `(mood_room_id, tmdb_id, media_type)`, `centrality` |
| `clustering_runs` | Recluster audit (service_role only). | `status`, `cluster_count`, `catalogue_coverage_pct` |

## Views

- `v_training_examples` (**045**, `security_invoker = true`) — one row per impression LEFT JOIN the first same-session positive outcome; `label_positive`, `exploration`, `position`, `position_at_click`. The ENG-2 training dataset shape.

## RPCs (functions)

| Function | Purpose |
|---|---|
| `match_titles_by_vector(query_vector, match_limit)` | HNSW similarity search (dynamic `ef_search` since 025). Single-vector AND per-centroid multi-interest retrieval (ENG-1), detail-page "More Like This", semantic search. |
| `get_available_tmdb_ids(service_ids text[])` | Single-query availability lookup; JSONB-array return since 035 (cold-start fix). |
| `get_mood_rooms_for_user` / `get_mood_room_thumbnails` / `get_mood_room_detail` | Mood-room data access (031). |
| `username_available(check_username)` | SECURITY DEFINER signup check (038; replaced the wide-open anon policy). |
| `delete_own_account()` | GDPR Art. 17 (042); explicit DELETEs across **9** user-scoped tables since 044 added `user_interest_centroids`. |
| `export_user_data()` | GDPR Art. 20/15 (043); extended by 044. |
| `get_stale_titles/availability/ratings`, `check_*`, `run_data_quality_check()` | Sync data-quality probes (003/004/007). |
| `card_impressions_ensure_rls()` | Event-trigger fn applying RLS to new monthly partitions (016). |
| `handle_new_user()` | `auth.users` INSERT trigger → `profiles` row. |

## RLS policy pattern

- `anon` — SELECT on public content tables (titles, streaming_availability, streaming_history, mood_rooms, mood_room_titles).
- `authenticated` — SELECT on the same (the migration-005 lesson), plus owner-scoped access to user tables via `auth.uid() = user_id`.
- `service_role` — bypasses RLS (Edge Functions use `withUserScope` to re-impose user scoping manually — IN-466 contract).

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
- `editor_notes` — migration `040_editor_notes.sql` is in-repo (Phase 6 PR-AD) but **NOT applied**; apply before Phase 6 editorial features go live.
- The Supabase migration ledger has gaps (033, 036–046 applied via Studio/MCP): orchestration v0.8 §3.4 is the authoritative applied-status record. Never `supabase db push`.
