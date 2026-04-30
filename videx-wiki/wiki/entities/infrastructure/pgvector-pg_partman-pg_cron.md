---
title: Postgres extensions (pgvector, pg_partman, pg_cron, pg_net)
type: entity
tags: [postgres, pgvector, pg_partman, pg_cron, pg_net, hnsw, partitioning, cron]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/infrastructure/pgvector-pg_partman-pg_cron.md
related:
  - wiki/entities/codebase/database-schema.md
  - wiki/entities/codebase/migrations.md
  - wiki/entities/infrastructure/supabase.md
  - wiki/concepts/decisions/adr-006-card-impressions-dedicated-table.md
  - wiki/concepts/decisions/adr-010-pg-partman-card-impressions.md
  - wiki/concepts/techniques/embeddings.md
---

# Postgres extensions

Four extensions Videx leans on, configured as Supabase Pro-compatible.

## pgvector

`vector` data type and similarity-search index types.

- **Column**: `titles.embedding vector(1536)` (matches `text-embedding-3-small`).
- **Index**: HNSW with `vector_cosine_ops` (cosine distance).
- **Build cost**: minutes for ~20K rows on Pro tier; one-time per major rebuild. Run as a dedicated Phase 1 operation.
- **Recall vs latency**: `ef_search` was originally too low; raised dynamically in `match_titles_by_vector` per migration 025.
- **Entry point**: `match_titles_by_vector(query_vector, k, ...)`. Do not write raw similarity queries from the client.

### HNSW vs IVFFlat

HNSW gives better recall at the same latency for our row count. IVFFlat needs more tuning of `lists` and reclustering when distribution shifts. HNSW is closer to set-and-forget at this scale.

## pg_partman

Declarative monthly partitioning of `card_impressions`.

- Parent table: `card_impressions` (migration 014).
- Template partition: `card_impressions_template` (seeds RLS on new partitions).
- Naming: `card_impressions_pYYYY_MM`.
- Cadence: monthly. New partitions created ahead of time by daily maintenance job.

### RLS replication problem

Postgres does not propagate RLS from a partitioned parent to child partitions. Two-step solution:

1. **Migration 015**: applies RLS to existing partitions via the template.
2. **Migration 016**: `ddl_command_end` event trigger (`card_impressions_rls_on_create` → `card_impressions_ensure_rls()`) fires on each new partition CREATE and copies policies from the template.

Both required: 015 covers existing partitions; 016 covers future ones automatically. The template's auto-propagation is for constraints and indexes, NOT RLS — caught empirically during Phase 0 Task 3 verification. See [phase-0](../../concepts/operations/phase-0.md), [ADR-010](../../concepts/decisions/adr-010-pg-partman-card-impressions.md), parking-lot IN-PX-01.

## pg_cron

Native Postgres cron. Schedules in `cron.job`.

- `sync-incremental` (06:00 UTC daily): pg_net → Edge Function. Migration 006.
- `enrich_new_titles` (06:30 UTC daily): SQL-only enrichment. `supabase/cron/enrich_new_titles.sql`.
- `embed_new_titles` (06:45 UTC daily): `supabase/cron/embed_new_titles.sql`.
- `card_impression_daily_totals` rollup: aggregates yesterday's impressions.

### Convention

Schema-evolution migrations live in `supabase/migrations/`. Operational schedule definitions live in `supabase/cron/` and are not part of the migration sequence. Established Phase 0.5.

## pg_net

HTTP client callable from SQL. Used by pg_cron to invoke Edge Functions:

```sql
SELECT net.http_post(
  url := 'https://<project>.supabase.co/functions/v1/sync-incremental',
  headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('vault.service_role_key'))
);
```

Service-role key currently lives in cron job definition; vault rotation tracked in IN-XPS-004.

## Health checks

- HNSW build: `SELECT * FROM pg_stat_progress_create_index;`
- Cron runs: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;`
- Partitions: `SELECT * FROM pg_inherits WHERE inhparent = 'card_impressions'::regclass;`
