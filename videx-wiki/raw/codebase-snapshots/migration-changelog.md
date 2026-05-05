---
title: Migration Changelog
generated: 2026-04-26
source: supabase/migrations/
---

# Migration Changelog

Ordered list of every migration applied. Phase column tracks which v2 phase the migration belongs to. Migration 021 is intentionally skipped.

| # | File | Phase | Status | Purpose |
|---|---|---|---|---|
| 001 | `001_content_tables.sql` | B1 | applied | Creates the content cache: `titles`, `streaming_availability`, `title_genres`, `title_credits`, `sync_log`. RLS for `anon` and `service_role`. |
| 002 | `002_fix_constraints.sql` | B1 | applied | Fixes NULL-in-unique-constraint bug on `streaming_availability` (PG treats NULL ≠ NULL). |
| 003 | `003_monitoring_queries.sql` | C1 | applied | Read-only views for sync health monitoring. |
| 004 | `004_data_quality.sql` | E1 | applied | Cross-reference TMDb vs SA API coverage views. |
| 005 | `005_authenticated_read_policies.sql` | B1 | applied | **Critical fix.** Adds `authenticated` SELECT policies to all content cache tables; without this, signed-in users see empty results silently. |
| 006 | `006_cron_schedule.sql` | B1 | applied | pg_cron + pg_net schedule for daily 06:00 UTC `sync-incremental` Edge Function call. |
| 007 | `007_data_quality_checks.sql` | C1 | applied | DQ functions: `check_titles_without_availability`, `check_orphaned_availability`, `check_stale_availability`, `run_data_quality_check`. |
| 008 | `008_content_vectors.sql` | B1 | applied (legacy) | Adds `content_vector float4[24]` to `titles`. Dropped in migration 019 once embeddings replace it. |
| 009 | `009_streaming_history.sql` | C1 | applied | Append-only log of availability changes. Powers "leaving soon" and historical accuracy. |
| 010 | `010_user_interactions.sql` | C1 | applied | Immutable user event log with RLS. |
| 011 | `011_profiles_baseline.sql` | Pre-Phase 0 | applied | Codifies the manually-created `profiles` table. Idempotent against production. See parking lot IN-PRE-001. |
| 012 | `012_profiles_v2_onboarding_fields.sql` | Phase 0 | applied | Adds `age_range`, `viewing_context` for v2 onboarding Step 1. |
| 013 | `013_user_interactions_v2_expansion.sql` | Phase 0 | applied | Adds `session_id` and `source_surface` columns. Index on `session_id`. |
| 014 | `014_card_impressions_table.sql` | Phase 0 | applied | Creates `card_impressions` with pg_partman monthly partitioning, plus `card_impression_daily_totals` rollup and pg_cron rollup job. |
| 015 | `015_card_impressions_partition_rls.sql` | Phase 0 (deviation) | applied | Hardens RLS on existing partitions via template approach. Added in-phase. |
| 016 | `016_card_impressions_rls_event_trigger.sql` | Phase 0 (deviation) | applied | Event trigger that propagates RLS to new partitions automatically. Supersedes 015's template approach for new partitions. |
| 017 | `017_content_enrichment_columns.sql` | Phase 0.5 | applied | Adds `keywords`, `cast_top_5`, `director`, `content_rating` to `titles`, plus partial work-queue index. `runtime` already existed in 001 and was backfilled opportunistically. |
| 018 | `018_embeddings_pgvector.sql` | Phase 1 | applied | Enables pgvector extension. Adds `embedding vector(1536)` and HNSW work-queue index. |
| 019 | `019_drop_legacy_content_vector.sql` | Phase 1 close-out | applied | Destructive. Drops 24D `content_vector` column. Manual snapshot taken pre-apply. |
| 020 | `020_service_fingerprints.sql` | Phase 2 | applied | `service_fingerprints` table with `centroid vector(1536)`. RLS for authenticated read, service_role write. |
| 021 | (skipped) | — | — | Reserved during planning, rolled into 022. Numbering preserved for traceability. |
| 022 | `022_fingerprint_variant.sql` | Phase 2.6 | applied | Adds `variant` column. Adds `match_titles_by_vector` RPC for synthetic cold-start eval. |
| 023 | `023_taste_vector_v2.sql` | Phase 3 | applied | Adds 1536D taste vector and slider state to `taste_profiles`. Additive; v1 columns remain. |
| 024 | `024_drop_legacy_taste_vector.sql` | Phase 3 cleanup | applied | Destructive. Drops v1 24D taste vector and `interaction_log`. |
| 025 | `025_fix_match_titles_rpc.sql` | Phase 3 fix | applied | Raises pgvector `ef_search` so RPC returns enough results for service-overlap filtering. |
| 026 | `026_security_linter_fixes.sql` | Phase 3 | applied | Resolves Supabase linter findings (two classes, 2026-04-13). |
| 027 | `027_function_search_path_pin.sql` | Phase 3 | applied | Pins `search_path` on 10 user-defined functions to neutralise injection via role default. |
| 028 | `028_available_tmdb_ids_rpc.sql` | Phase 3 perf | applied | `get_available_tmdb_ids(text[])` returns JSON array; replaces 42 paginated REST calls. |
| 029 | `029_mood_rooms_table.sql` | Phase 4.5 | applied | `mood_rooms` and `clustering_runs` tables, indexes, RLS. |
| 030 | `030_mood_room_titles_table.sql` | Phase 4.5 | applied | `mood_room_titles` membership table. |
| 031 | `031_mood_rooms_rpcs.sql` | Phase 4.5 | applied | `get_mood_rooms_for_user`, `get_mood_room_thumbnails`, `get_mood_room_detail`. |
| 032 | `032_card_impressions_mood_room_surface.sql` | Phase 4.5 | applied | Allows `'mood_room'` value in `card_impressions.source_surface`. |

## Notes

- Schema-evolution migrations live here. Operational automation (cron job SQL definitions) lives in `supabase/cron/` rather than the migration sequence as of Phase 0.5.
- Phase 0 numbering deviated by +2 (migrations 015 and 016 inserted in-phase). All subsequent phase migrations were renumbered upward to preserve order.
