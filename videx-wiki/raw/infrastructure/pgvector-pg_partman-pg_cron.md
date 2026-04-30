---
title: pgvector, pg_partman, pg_cron
generated: 2026-04-26
---

# Postgres Extensions (pgvector, pg_partman, pg_cron, pg_net)

The four extensions Videx leans on, and how each is configured.

## pgvector

Provides the `vector` data type and similarity-search index types.

- **Column:** `titles.embedding vector(1536)` (matches `text-embedding-3-small`).
- **Index type:** HNSW (Hierarchical Navigable Small World).
  - Build params: defaults from migration 018.
  - Operator: `vector_cosine_ops` (cosine distance).
- **Build cost:** minutes for ~20K rows on Pro tier; one-time per major rebuild. Run as a dedicated Phase 1 operation.
- **Recall vs latency:** `ef_search` was originally too low; raised in migration 025 to ensure `match_titles_by_vector` returns enough candidates for downstream filtering.
- **RPCs:** `match_titles_by_vector(query_vector, k, …)` is the only entry point; do not write raw similarity queries from the client.

### Why HNSW over IVFFlat

HNSW gives better recall at the same latency for our row count. IVFFlat needs more tuning of `lists` parameter and reclustering when data distribution shifts. HNSW is closer to set-and-forget at this scale.

## pg_partman

Declarative partitioning of `card_impressions` by month.

- **Parent table:** `card_impressions` (created in migration 014).
- **Template partition:** `card_impressions_template` (used to seed RLS on new partitions).
- **Partition naming:** `card_impressions_pYYYY_MM`.
- **Cadence:** monthly. New partitions created ahead of time by pg_partman maintenance job.

### RLS replication problem

Partitioned tables in Postgres do not automatically apply parent-table RLS to child partitions. Two-step solution:

1. **Migration 015** — applies RLS to existing partitions via the `card_impressions_template`.
2. **Migration 016** — installs an event trigger (`card_impressions_rls_on_create` → `card_impressions_ensure_rls()`) that fires on each new partition CREATE and copies the policies from the template. This handles future months automatically.

The two migrations were Phase 0 in-phase deviations; the parent migration counter shifted +2 from then on.

## pg_cron

Native Postgres cron. Stores schedules in `cron.job`.

- **`sync-incremental` (06:00 UTC daily):** uses `pg_net` to POST to the Supabase Edge Function URL with the service-role key. Defined in migration 006.
- **`enrich_new_titles` (06:30 UTC daily):** SQL-only enrichment. Defined in `supabase/cron/enrich_new_titles.sql` rather than as a numbered migration.
- **`card_impression_daily_totals` rollup:** aggregates yesterday's impressions into the rollup table.

### Convention

Schema-evolution migrations live in `supabase/migrations/`. Operational schedule definitions live in `supabase/cron/` and are not part of the migration sequence. Established in Phase 0.5.

## pg_net

HTTP client callable from SQL. Used by pg_cron to invoke Edge Functions:

```sql
SELECT net.http_post(
  url := 'https://<project>.supabase.co/functions/v1/sync-incremental',
  headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('vault.service_role_key'))
);
```

The service-role key is stored in Supabase Vault to keep it out of cron job definitions and audit logs. (Pending — currently lives in cron job definition; rotation tracked in IN-XPS-004.)

## Health checks

- HNSW build status: `SELECT * FROM pg_stat_progress_create_index;`
- Cron job runs: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;`
- Partition presence: `SELECT * FROM pg_inherits WHERE inhparent = 'card_impressions'::regclass;`
