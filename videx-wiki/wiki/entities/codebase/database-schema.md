---
title: Database Schema (Supabase)
type: entity
tags: [supabase, postgres, schema, pgvector, pg_partman]
created: 2026-04-26
updated: 2026-09-18
sources:
  - raw/codebase-snapshots/database-schema-snapshot.md
  - raw/codebase-snapshots/migration-changelog.md
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.8.md
  - supabase/migrations/047_app_feedback.sql
  - supabase/migrations/093_households.sql
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

Snapshot of the Videx Supabase schema **as of migration 047**, plus the household layer from **093** (applied 2026-09-18) (the live-production `information_schema` pull is REPO-1-era / migration 046, 2026-06-10; `app_feedback` from migration 047 added from the migration source for the NATIVE feedback loop). Source of truth: `supabase/migrations/` + orchestration v0.8 §3.4 for applied status. Use [migrations](migrations.md) for chronology, [RPC catalogue](rpcs.md) for callable functions. RLS is enabled on **every** public table.

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

### Household layer (Growth G2, migration 093)

Shared lists for households (plan `docs/plans/2026-09-17-004`, decisions D1–D7, D11–D13). **Additive: the personal `watchlist` above is untouched** (D1); its live definition, which no migration creates, is recorded in 093's header and re-captured by `supabase/queries/capture-watchlist-ddl.sql`.

| Table | Purpose | Key columns |
|---|---|---|
| `households` | A group sharing a list. Created only by `create_household()`; a person owns at most 3. | `id uuid`, `name` (1–40), `owner_id` → profiles cascade, `created_at` |
| `household_members` | Membership; cap 6 per household (enforced in `join_household`); a person may belong to several. | PK `(household_id, user_id)`, `role` `owner`\|`member`, `joined_at`; index `user_id` |
| `watchlists` | Shared lists. v1 creates exactly one per household (`'Shared'`); no constraint forbids more later (D3). | `id uuid`, `household_id`, `name`, `created_by` → profiles set null |
| `watchlist_items` | Titles on a shared list. | `id uuid`, `watchlist_id`, `tmdb_id`, `media_type`, `title`, `poster_path`, `added_by` → profiles **set null** (items outlive their adder, D12), `added_at`; UNIQUE `(watchlist_id, tmdb_id, media_type)` |
| `watchlist_reactions` | One reaction per member per item (D11). | PK `(item_id, user_id)`, `reaction` `up`\|`down`\|`tonight`, `created_at`, `updated_at` (touch trigger) |
| `household_invites` | Invite tokens (D4/D5): server-minted uuid, 7 days, `max_uses` 6, `uses`, `revoked_at`. **RLS on, no policies, no grants**: only the RPCs touch it. | PK `token`, `household_id`, `created_by`, `expires_at` |

Access: membership RLS for reads and the app's writes, SECURITY DEFINER RPCs for the edges (see [RLS pattern § Membership RLS](../../concepts/techniques/rls-pattern.md#membership-rls-households-migration-093)). anon holds no grant on any of the six tables.


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
| `delete_own_account()` / `export_user_data()` | GDPR Art. 17 / Art. 20+15 (042/043), re-emitted with every user-scoped table (latest 093: households via `household_leave_internal`; export v1.4 adds `households`, `watchlist_items` the caller added, `watchlist_reactions`). |
| `is_household_member(hid)` | **093.** SECURITY DEFINER, STABLE; the one membership test every household policy uses. |
| `create_household` / `create_invite` / `join_household` / `leave_household` / `household_members_view` | **093.** Household edges; each failure is a stable code in the exception message. Signatures and codes in the [RPC catalogue](rpcs.md) and 093's header. |
| `card_impressions_ensure_rls()` / `handle_new_user()` | Partition-RLS event trigger fn (016) / profiles trigger. |

## RLS policy pattern

- `anon` — SELECT on public content tables (titles, streaming_availability, streaming_history, mood_rooms, mood_room_titles).
- `authenticated` — SELECT on the same (the migration-005 lesson), plus owner-scoped access to user tables via `auth.uid() = user_id`.
- `service_role` — bypasses RLS (Edge Functions re-impose user scoping via `withUserScope` — IN-466 contract).
- **Membership** (093) — household tables are readable by members of the same household through `is_household_member()`; the first cross-user reads in the schema, and the only ones (live check 2026-09-18: every other user-scoped policy is owner-only).

See [RLS pattern](../../concepts/techniques/rls-pattern.md) and the [authenticated-role missing RLS solution](../../concepts/operations/solutions/authenticated-role-missing-rls.md).

## Triggers

- `on_auth_user_created` → `handle_new_user()` → `profiles` row.
- `card_impressions` partition event trigger (016) → RLS on new partitions.
- `updated_at` touch triggers on `user_feature_flags` (041), `user_interest_centroids` (044) and `watchlist_reactions` (093).
- `profiles_leave_households` (093) BEFORE DELETE on `profiles` → `household_leave_internal` for each membership, so D12 (ownership hand-over, sole-owner household deleted) holds however an account is removed.
- `notification_deliveries_nudge_list` (095) BEFORE INSERT on `notification_deliveries`: a `household_nudge` row must carry `list_id` (a CHECK could not require it, because `list_id` is `ON DELETE SET NULL`).

## Scheduled jobs (registrations live in migration 039 — `supabase/cron/` is intentionally empty)

- Daily 06:00 `daily-content-sync` · 06:30 `enrich-new-titles` · 06:45 `embed-new-titles` · weekly Sun 07:00 `refresh-service-fingerprints` (pg_cron + pg_net, Vault JWTs).
- Monthly HDBSCAN recluster via GitHub Actions (psycopg2 direct connection).
- `card_impressions_rollup` + `pg_partman_maintenance` (014).
- Daily 08:00 UTC `daily-send-notifications` (059) and, from 095, `send-nudges-15m` every 15 minutes (`send-nudges` Edge Function; quiet 22:00 to 08:00 Europe/London). Both use the Vault `service_role_key`.

### Notifications (056–059, 095)

`user_push_tokens`, `notification_preferences` (type CHECK `arrival`, `leaving_soon`, `household_nudge` since 095; absent row = enabled) and `notification_deliveries`. 095 made `tmdb_id` / `media_type` nullable and added `list_id` (→ `watchlists`, set null), `nudge_window`, `push_id` and `notification_deliveries_shape_check` (title rows: title columns, no list columns; nudge rows: `nudge_window`, no title columns), a second unique key `uq_notification_deliveries_nudge (user_id, notification_type, list_id, nudge_window)` and `idx_notification_deliveries_list`. Detail in [notifications-v1](../../concepts/architecture/notifications-v1.md). **095 status: written, apply pending (Joe); see [migrations](migrations.md).**

## Deviations and gaps

- Migration 021 intentionally skipped (rolled into 022).
- `editor_notes` — `040_editor_notes.sql` in repo (Phase 6 PR-AD) but **NOT applied**; apply before Phase 6 editorial features go live.
- The Supabase migration ledger has gaps (033, 036–047 applied via Studio/MCP): **orchestration v0.8 §3.4 is the authoritative applied-status record. Never `supabase db push`.**
- `app_feedback` (047) is GDPR-deleted via **FK CASCADE only** — migration 044 (which CREATE OR REPLACEd `delete_own_account()`/`export_user_data()`) predates it, so the RPCs' explicit-DELETE / export lists don't yet enumerate it. The CASCADE through `profiles` covers deletion; an export-coverage refresh is a candidate fast-follow.
