---
title: Migration Changelog
type: entity
tags: [supabase, migrations, postgres]
created: 2026-04-26
updated: 2026-06-10
sources:
  - raw/codebase-snapshots/migration-changelog.md
  - docs/v2/Videx_v2_Project_Orchestration_v0.8.md
  - raw/phase-summaries/phase-5.5-summary.md
  - docs/v2/phase-summaries/phase-eng-1-summary.md
related:
  - wiki/entities/codebase/database-schema.md
  - wiki/concepts/operations/supabase-migration-workflow.md
  - wiki/concepts/decisions/adr-006-card-impressions-dedicated-table.md
  - wiki/concepts/decisions/adr-010-pg-partman-card-impressions.md
  - wiki/concepts/operations/service-role-jwt-rotation.md
---

# Migration Changelog

Chronological list of every applied migration. Source of truth: `supabase/migrations/`. Migration 021 intentionally skipped.

| # | File | Phase | Status | Purpose |
|---|---|---|---|---|
| 001 | `001_content_tables.sql` | B1 | applied | Content cache: `titles`, `streaming_availability`, `title_genres`, `title_credits`, `sync_log`. RLS for `anon` and `service_role`. |
| 002 | `002_fix_constraints.sql` | B1 | applied | NULL-in-unique-constraint fix on `streaming_availability`. |
| 003 | `003_monitoring_queries.sql` | C1 | applied | Read-only views for sync health monitoring. |
| 004 | `004_data_quality.sql` | E1 | applied | Cross-reference TMDb vs SA API coverage views. |
| 005 | `005_authenticated_read_policies.sql` | B1 | applied | **Critical fix.** Adds `authenticated` SELECT policies to all content cache tables; without this, signed-in users see empty results silently. |
| 006 | `006_cron_schedule.sql` | B1 | applied | pg_cron + pg_net schedule for daily 06:00 UTC `sync-incremental`. |
| 007 | `007_data_quality_checks.sql` | C1 | applied | DQ functions. |
| 008 | `008_content_vectors.sql` | B1 | applied (legacy) | `content_vector float4[24]` on `titles`. Dropped in 019. |
| 009 | `009_streaming_history.sql` | C1 | applied | Append-only log of availability changes. |
| 010 | `010_user_interactions.sql` | C1 | applied | Immutable user event log with RLS. |
| 011 | `011_profiles_baseline.sql` | Pre-Phase 0 | applied | Codifies the manually-created `profiles` table. Idempotent against production. |
| 012 | `012_profiles_v2_onboarding_fields.sql` | Phase 0 | applied | Adds `age_range`, `viewing_context`. |
| 013 | `013_user_interactions_v2_expansion.sql` | Phase 0 | applied | Adds `session_id`, `source_surface`. Index on `session_id`. |
| 014 | `014_card_impressions_table.sql` | Phase 0 | applied | `card_impressions` with pg_partman monthly partitioning, daily-totals rollup, pg_cron rollup job. |
| 015 | `015_card_impressions_partition_rls.sql` | Phase 0 (deviation) | applied | Hardens RLS on existing partitions via template. Added in-phase. |
| 016 | `016_card_impressions_rls_event_trigger.sql` | Phase 0 (deviation) | applied | Event trigger propagating RLS to new partitions automatically. |
| 017 | `017_content_enrichment_columns.sql` | Phase 0.5 | applied | Adds `keywords`, `cast_top_5`, `director`, `content_rating` to `titles` plus partial work-queue index. `runtime` already existed in 001. |
| 018 | `018_embeddings_pgvector.sql` | Phase 1 | applied | Enables pgvector. Adds `embedding vector(1536)` and HNSW work-queue index. |
| 019 | `019_drop_legacy_content_vector.sql` | Phase 1 close-out | applied | Destructive. Drops 24D `content_vector`. Manual snapshot taken pre-apply. |
| 020 | `020_service_fingerprints.sql` | Phase 2 | applied | `service_fingerprints` with `centroid vector(1536)`. RLS for authenticated read, service_role write. |
| 021 | (skipped) | — | — | Reserved during planning, rolled into 022. Numbering preserved for traceability. |
| 022 | `022_fingerprint_variant.sql` | Phase 2.6 | applied | Adds `variant` column. Adds `match_titles_by_vector` RPC for synthetic cold-start eval. |
| 023 | `023_taste_vector_v2.sql` | Phase 3 | applied | 1536D taste vector + slider state on `taste_profiles`. Additive; v1 columns remain. |
| 024 | `024_drop_legacy_taste_vector.sql` | Phase 3 cleanup | applied | Destructive. Drops v1 24D taste vector and `interaction_log`. |
| 025 | `025_fix_match_titles_rpc.sql` | Phase 3 fix | applied | Raises pgvector `ef_search` so RPC returns enough results for service-overlap filtering. |
| 026 | `026_security_linter_fixes.sql` | Phase 3 | applied | Resolves Supabase linter findings (two classes, 2026-04-13). |
| 027 | `027_function_search_path_pin.sql` | Phase 3 | applied | Pins `search_path` on 10 user-defined functions. |
| 028 | `028_available_tmdb_ids_rpc.sql` | Phase 3 perf | applied | `get_available_tmdb_ids(text[])` JSON return; replaces 42 paginated REST calls. |
| 029 | `029_mood_rooms_table.sql` | Phase 4.5 | applied | `mood_rooms` and `clustering_runs` tables, indexes, RLS. |
| 030 | `030_mood_room_titles_table.sql` | Phase 4.5 | applied | `mood_room_titles` membership table. |
| 031 | `031_mood_rooms_rpcs.sql` | Phase 4.5 | applied | `get_mood_rooms_for_user`, `get_mood_room_thumbnails`, `get_mood_room_detail`. |
| 032 | `032_card_impressions_mood_room_surface.sql` | Phase 4.5 | applied | Allows `'mood_room'` value in `card_impressions.source_surface`. |
| 033 | `033_card_impressions_anchor_room_metadata.sql` | Phase 4.5 (anchored rooms redirect, 2026-04-27) | applied | Two changes: extend `card_impressions.source_surface` CHECK with `'anchor_room'`; add `card_impressions.metadata jsonb` column. For anchored rooms, metadata captures `{ anchor_tmdb_id, anchor_tier, anchor_source_cluster_id, tier_1_inside_stated_cluster }`. |
| 034 | `034_mood_room_anchor_labels.sql` | Phase 4.5 (IN-463 fast-follow, April 2026) | applied | `mood_rooms.anchor_label_text`, `anchor_label_generated_at`. Backed by `label-anchor-room` Edge Function (LLM-generated thematic labels). |
| 035 | `035_available_tmdb_ids_rpc_array_return.sql` | Phase 4.5 (cold-start fix, April 2026) | applied | `get_available_tmdb_ids` return shape changed `TABLE` → JSONB array. Saves ~1.5–2s on Edge Function cold-starts (eliminates per-row PostgREST envelope cost). Consumers (`hardFilters.ts`, anchor rooms, BYW filtering) parse client-side. |
| 036 | `036_taste_profiles_rls.sql` | Phase 5 (2026-05-06) | applied | Enable RLS on `taste_profiles` with `FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)`. Pre-existing gap surfaced by Phase 4 security review M1 — table predates version-controlled migrations and never had RLS. Service-role bypass preserves Edge Function reads. Verified anon SELECT returns 0 rows. |
| 037 | `037_drop_marked_watched_from_check.sql` | Phase 5 (2026-05-06) | applied | Drop `'marked_watched'` from `user_interactions.event_type` CHECK constraint. Pre-flight count was 0 → clean DROP / ADD swap. Read-side filters (`useForYouContent.ts:511`, `render-foryou-rows/index.ts:468`) cleaned up in same PR. The `exit_reason` payload value (Detail Page Signal Spec v0.3.2) is unrelated and stays. |
| 038 | `038_profiles_username_lookup_rpc.sql` | Phase 5 (IN-XPS-002, 2026-05-06) | applied | Replace wide-open `FOR SELECT USING (true)` "Allow public username lookup" anon policy on `profiles` with `username_available(check_username text) RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE`. `AuthContext.checkUsernameAvailable` rewired. Anon SELECT on profiles now denied. |
| 039 | `039_cron_jobs_vault_jwt.sql` | Phase 5 (IN-XPS-004, 2026-05-06) | applied | **NOT a cryptographic rotation.** Move inline service-role JWT out of `006_cron_schedule.sql` and three `supabase/cron/*.sql` files into Supabase Vault. Same JWT value, different storage location. Re-create four cron jobs (`daily-content-sync`, `embed-new-titles`, `enrich-new-titles`, `refresh-service-fingerprints`) using `vault.decrypted_secrets` lookups. Full cryptographic rotation deferred to Phase 6 pending Supabase tooling — new opaque `sb_secret_…` tokens fail `verify_jwt = true` on Edge Functions. RPC body of `delete_own_account` flagged as a separate audit gap (lives in production but not in any version-controlled migration; capture in Phase 5.5 migration 041). |
| 040 | `040_editor_notes.sql` | Phase 6 (PR-AD) | **in repo, NOT applied** (verified 2026-06-10) | `editor_notes` table backing the Home/For You EditorsNote primitive. Landed via the v3 editorial-redesign PR but never pushed to remote — `public.editor_notes` absent in production (see `useHomeContent.ts:79` for the retained `as any` cast it requires). **The number was consumed by this file** — the IN-458 typed-pairs work (extend `get_available_tmdb_ids` to `(tmdb_id, media_type)` pairs, 0.8% collision fix, deferred from Phase 5) takes the next free number when it lands; shape must be additive (new function `get_available_tmdb_id_pairs`), never an in-place return-shape swap. |
| 041 | `041_user_feature_flags.sql` | Phase Search V2 (B1, 2026-05-13) | applied | Composite-PK `user_feature_flags (user_id, flag_name, enabled, created_at, updated_at)` table. RLS scoped to owning user via `auth.uid()` policies on SELECT + `FOR ALL`. `updated_at` trigger. Backs the `search_semantic` per-user flag (Cluster B opt-in). First per-user feature flag store — pattern is reusable for any future Joe-first / prototype-users rollout. |
| 042 | `042_delete_own_account.sql` | Phase 5.5 (IN-XPS-006, 2026-05-15) | applied | Captures the live `delete_own_account()` SECURITY DEFINER RPC in source control. **Pre-cut H5 audit found the live RPC body was a single-line `DELETE FROM auth.users WHERE id = auth.uid();`** relying entirely on FK cascade chains; cascade audit confirmed all 8 user-scoped tables have `ON DELETE CASCADE` either directly from `auth.users` (`profiles`, `user_feature_flags`) or chained via `profiles`. Live behaviour was GDPR-compliant. Migration ships the same semantics with defensive explicit DELETEs across `card_impressions`, `user_interactions`, `taste_profiles`, `user_services`, `user_genres`, `watchlist`, `onboarding_events`, `user_feature_flags`, then `profiles`, then `auth.users`. Survives a future cascade-rule regression. DROP FUNCTION IF EXISTS + CREATE OR REPLACE + SECURITY DEFINER + search_path pinned + raises if `auth.uid()` is NULL. C11 throwaway-account smoke test (113 `card_impressions` + 6 onboarding events + profile/taste/services): every count = 0 post-delete; `auth.users` row gone. **Studio implicit-transaction quirk:** first apply errored on a `||`-concatenated COMMENT string and rolled back the entire migration; fixup collapsed to a single-line string literal. Same fix applied to 043 preemptively. |
| 043 | `043_export_user_data.sql` | Phase 5.5 (IN-PX-35, 2026-05-15) | applied | GDPR Article 20 (data portability) + Article 15 (access). `export_user_data()` SECURITY DEFINER RPC returns a `jsonb` object keyed by user-scoped table, scoped to `auth.uid()` on every query: `profiles`, `taste_profiles`, `user_services`, `user_genres`, `watchlist`, `user_interactions`, `card_impressions` (capped to last 90 days — matches migration 014's daily-aggregate rollup), `onboarding_events`. Plus `_export_metadata` with version + generated_at + user_id. Empty tables return `'[]'::jsonb` via COALESCE so frontend iterates without null-guards. Same defensive pattern as 042 (DROP IF EXISTS, search_path pinned, NULL `auth.uid()` raise). Verified post-apply: `prosecdef = true`, `search_path = public,pg_temp`. Frontend wires `@capacitor/filesystem` Documents directory write on native, Blob download on web. |
| 044 | `044_user_interest_centroids.sql` | Phase ENG-1 (2026-06-10) | applied (by Joe via Studio) | `user_interest_centroids (user_id, slot 0–2, centroid vector(1536), weight, updated_at)`, PK `(user_id, slot)`, K ≤ 3 (E&P D3), owner-scoped RLS per 041 pattern, touch trigger, FK → `auth.users` CASCADE. Also CREATE OR REPLACEs `delete_own_account()` (042) and `export_user_data()` (043) to include the new user-scoped table (IN-PX-54 honoured at creation time). `taste_profiles.taste_vector_v2` continues as the single-centroid summary. Zero rows for a user = single-vector fallback path. |
| 045 | `045_training_extract_view.sql` | Phase ENG-1 (2026-06-10) | applied (by Joe via Studio) | `v_training_examples` (`security_invoker = true` — base-table RLS applies): one row per `card_impressions` row LEFT JOIN LATERAL the first same-session positive outcome (`thumbs_up`/`watchlist_add`/`deep_link_click`/`watched` at-or-after `shown_at`). Fields: `label_positive`, `exploration` (Workstream C tag), `position`, `position_at_click` (clickContext stash). The ENG-2 dataset shape, defined at ENG-1 per brief §3.5. Known limitation: joins on `content_id` only (impressions lack media_type) — IN-PX-56. |
| 046 | `046_drop_title_genres_credits.sql` | Phase REPO-1 (2026-06-10) | **in repo, NOT yet applied** | Drops the `title_genres` and `title_credits` tables — both created in 001, both intentionally never populated (static genre mapping per ADR-008; `cast_top_5`/`director` columns cover credits). Closes the deferred-items "drop when convenient" entry. Apply is an explicit-Joe action per the ENG-1 process note. |

## Notes

- Schema-evolution migrations live here. Operational automation (cron job SQL definitions) lives in `supabase/cron/` rather than the migration sequence as of Phase 0.5. **Phase 5.5 (IN-PX-31) resolved the source-of-truth duplication:** the three `supabase/cron/*.sql` files (`embed_new_titles`, `enrich_new_titles`, `refresh_service_fingerprints`) were deleted; migration 039 is the sole source of truth. `supabase/cron/README.md` documents the intentionally-empty directory convention.
- Phase 0 numbering deviated by +2 (migrations 015 and 016 inserted in-phase). All subsequent phase migrations were renumbered upward to preserve order. Strategy v1.6.3 records this renumbering.
- Phase 4.5 numbering: original Gates 1–4 plan was 029–032. Mid-phase redirect added 033 (anchored rooms metadata), 034 (LLM thematic labels via IN-463), 035 (cold-start fix). All applied April 2026.
- Phase 5 numbering: 036–039 applied 2026-05-06 via Studio SQL editor. 040 deferred.
- **Phase 5.5 numbering shift:** plan v3 named migrations 041 (delete) and 042 (export). Live numbering shifted to **042 / 043** because `041_user_feature_flags.sql` shipped earlier in Phase Search V2 (2026-05-13). Both 042 and 043 applied 2026-05-15.
- Workflow for adding new migrations: see [supabase migration workflow runbook](../../concepts/operations/supabase-migration-workflow.md).
- **Source-of-truth gap CLOSED Phase 5.5:** `delete_own_account` RPC is now captured in migration 042 with defensive explicit DELETEs.
- **Phase ENG-1 (2026-06-10):** 044 + 045 applied by Joe via Studio — CC's `apply_migration` was permission-gated (production DDL is an explicit-Joe action). **Do NOT use `supabase db push`** while the migration ledger has gaps (033, 036–039, 040, 042–045 are absent from it — applied via Studio/MCP): a push would replay applied migrations and apply the intentionally-unapplied `040_editor_notes.sql` and the not-yet-applied `046_drop_title_genres_credits.sql`. Orchestration v0.8 §3.4 is the authoritative applied-status table, not the ledger.
- **Phase REPO-1 (2026-06-10):** 046 written (drop `title_genres` + `title_credits`), awaiting Joe's apply.
