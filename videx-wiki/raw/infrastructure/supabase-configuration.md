---
title: Supabase Configuration
generated: 2026-04-26
sources: [.env.example, supabase/migrations/, supabase/functions/, docs/v2/Videx_v2_Project_Orchestration_v0.3.3.md]
---

# Supabase Configuration

Supabase backs auth, the content cache, the recommendation pipeline, and analytics. Single project, single region (London / `eu-west-2`).

## Tier and limits

- **Plan:** Pro (upgraded from Free in Phase 1 to support pgvector HNSW build, larger CPU window, and PITR).
- **Storage:** Postgres + extensions. No Storage buckets in use yet.
- **Compute:** small instance; HNSW build on ~20K rows takes minutes. Consider compute add-on if title count grows past 100K.

## Environment variables

| Var | Scope | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Client | Project URL. |
| `VITE_SUPABASE_ANON_KEY` | Client | Anon key for public reads via RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service role; bypasses RLS. Used by sync scripts and Edge Functions. |

The service-role key has rotation pending pre-launch. See parking lot IN-XPS-004.

## Extensions enabled

- `pg_cron` — scheduled jobs.
- `pg_net` — HTTP from SQL.
- `pg_partman` — declarative partitioning of `card_impressions`.
- `vector` (pgvector) — `vector(1536)` and HNSW.
- `pgcrypto` — UUID generation.

## RLS pattern

Three roles, three policy classes per user-touching table:

| Role | Content tables | User tables |
|---|---|---|
| `anon` | SELECT (where applicable) | none |
| `authenticated` | SELECT | INSERT/SELECT filtered by `user_id = auth.uid()` |
| `service_role` | ALL | ALL |

Critical lesson: omitting the `authenticated` SELECT policy returns empty results silently when JWT-bearing requests hit the table. See `docs/solutions/database-issues/authenticated-role-missing-rls-policy.md` and migration 005.

## Edge Functions

Located under `supabase/functions/`. Five live:

- `sync-incremental` — daily 06:00 UTC; pulls SA API `/changes`, writes deltas to `streaming_availability` and `streaming_history`.
- `embed-new-titles` — generates 1536D embeddings for titles missing one. Reads work-queue index (partial index from migration 018).
- `enrich-new-titles` — pulls keywords, cast_top_5, director, content_rating from TMDb for new titles.
- `refresh-service-fingerprints` — recomputes per-service centroids.
- `_shared/` — shared TypeScript modules.

### Deployment quirk

The Supabase CLI cannot resolve paths outside `supabase/functions/`. To share code between functions without a Docker-based build, code is copied into `supabase/functions/_shared/` as self-contained modules. Each function imports from `../_shared/`. See ADR (Edge Function shared modules) and parking lot IN-105.

## Cron schedule

| Job | Frequency | What it does |
|---|---|---|
| `sync-incremental` (Edge Function) | Daily 06:00 UTC | SA API delta sync. Defined in migration 006. |
| `enrich_new_titles` (SQL cron) | Daily 06:30 UTC | TMDb enrichment for new titles. Defined in `supabase/cron/enrich_new_titles.sql`. |
| `card_impression_daily_totals` rollup | Daily | Aggregates `card_impressions` into `card_impression_daily_totals`. |
| Mood room recluster (GitHub Actions) | Monthly | Python + psycopg2 directly into Postgres. Not pg_cron. |

## Backups

Pro tier provides automated daily backups with PITR (Point-in-Time Recovery) within the retention window. Manual snapshot recommended before any destructive migration (019, 024). See runbook `raw/runbooks/supabase-backup-restore.md`.

## Migration workflow

Migrations live in `supabase/migrations/NNN_descriptive_name.sql`. Apply via `supabase db push` from the local CLI. Numbering is monotonic with intentional gap at 021. See `migration-changelog.md`.

## Auth configuration

- Email/password enabled.
- Magic link disabled (deliberate; use password flow).
- Password reset email template customised to point to `/reset-password` route.
- Account deletion uses an Edge Function with service role to cascade remove user data.

## Performance notes

- HNSW index `ef_search` defaulted too low after migration 018; raised in 025 to fix recall in `match_titles_by_vector`.
- `get_available_tmdb_ids` (migration 028) returns JSON to bypass the PostgREST 1000-row cap.
- All user-defined functions have `search_path` pinned (migration 027).
