---
title: Supabase
type: entity
tags: [supabase, postgres, infrastructure, edge-functions, auth]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/infrastructure/supabase-configuration.md
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.3.3.md
related:
  - wiki/entities/codebase/database-schema.md
  - wiki/entities/codebase/migrations.md
  - wiki/entities/codebase/rpcs.md
  - wiki/entities/infrastructure/pgvector-pg_partman-pg_cron.md
  - wiki/concepts/decisions/adr-003-supabase-pro.md
  - wiki/concepts/decisions/adr-011-edge-function-shared-modules.md
  - wiki/concepts/operations/edge-function-deployment.md
---

# Supabase

Backs auth, content cache, recommendation pipeline, analytics. Single project, single region (London / `eu-west-2`).

## Tier

**Pro** (upgraded from Free in Phase 1). 8GB DB, dedicated compute, daily auto-backups (7-day retention), no inactivity pause. ~£20/month. PITR included. See [ADR-003](../../concepts/decisions/adr-003-supabase-pro.md).

Postgres 17.6 (not 15.x as some early docs assumed).

## Environment variables

| Var | Scope | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Client | Project URL. |
| `VITE_SUPABASE_ANON_KEY` | Client | Anon key for public reads via RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Bypasses RLS. Used by sync scripts, Edge Functions. Rotation pending pre-launch (IN-XPS-004). |

## Extensions

`pg_cron`, `pg_net`, `pg_partman`, `vector` (pgvector), `pgcrypto`. See [pgvector-pg_partman-pg_cron](pgvector-pg_partman-pg_cron.md).

Supabase installs `pg_partman` into `public`, not `partman` (Phase 0 lesson). Reference all pg_partman functions unqualified.

## Edge Functions

Located under `supabase/functions/`. Five live:

- `sync-incremental` — daily 06:00 UTC; SA API `/changes` → `streaming_availability` + `streaming_history`.
- `embed-new-titles` — generates 1536D embeddings for titles missing one. Reads work-queue partial index from migration 018. Cron 06:45 UTC.
- `enrich-new-titles` — pulls keywords/cast_top_5/director/content_rating from TMDb. Cron 06:30 UTC.
- `refresh-service-fingerprints` — recomputes per-service centroids. Cron Sunday 07:00 UTC.
- `_shared/` — shared TypeScript modules.

Edge Function shared code lives in `supabase/functions/_shared/` per [ADR-011](../../concepts/decisions/adr-011-edge-function-shared-modules.md). Each function imports from `../_shared/`. Cross-runtime (Node + Deno) handled transparently; CLI auto-uploads shared modules.

## Cron schedule

| Job | Frequency |
|---|---|
| `sync-incremental` | Daily 06:00 UTC (migration 006) |
| `enrich_new_titles` | Daily 06:30 UTC (`supabase/cron/enrich_new_titles.sql`) |
| `embed_new_titles` | Daily 06:45 UTC (`supabase/cron/embed_new_titles.sql`) |
| `card_impression_daily_totals` rollup | Daily (migration 014) |
| `refresh-service-fingerprints` | Sunday 07:00 UTC |
| Mood room recluster | Monthly via GitHub Actions (not pg_cron) |

Schema migrations live in `supabase/migrations/`. Operational schedules live in `supabase/cron/` (separate convention, established Phase 0.5).

## Backups

Pro: daily auto-backups, 7-day retention. PITR. Manual snapshots before destructive migrations (019, 024). See [supabase-backup-restore](../../concepts/operations/supabase-backup-restore.md).

## Migrations

`supabase/migrations/NNN_name.sql`. Apply via `supabase db push`. Monotonic numbering with intentional gap at 021. See [migrations](../codebase/migrations.md) and [supabase-migration-workflow](../../concepts/operations/supabase-migration-workflow.md).

## Auth

- Email/password enabled.
- Magic link disabled (deliberate; password flow only).
- Password reset email points to `/reset-password`.
- Account deletion uses Edge Function with service role for cascade delete (UI exists, wiring deferred per IN-XPS-006).

## Performance notes

- HNSW `ef_search` raised in migration 025 to fix recall.
- `get_available_tmdb_ids` (migration 028) returns JSON to bypass PostgREST 1000-row cap.
- All user-defined functions have `search_path` pinned (migration 027).
