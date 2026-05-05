---
title: ADR-010 — pg_partman + monthly partitions for card_impressions
type: concept
tags: [adr, decision, pg_partman, partitioning, locked, applied]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/adrs/adrs-combined.md
related:
  - wiki/concepts/decisions/adr-006-card-impressions-dedicated-table.md
  - wiki/entities/infrastructure/pgvector-pg_partman-pg_cron.md
  - wiki/entities/codebase/database-schema.md
  - wiki/entities/codebase/migrations.md
---

# ADR-010 — pg_partman + monthly partitions for `card_impressions`

**Status:** locked, applied Phase 0.

## Context

Impression cardinality is high. Without partitioning, queries against `card_impressions` would scan an ever-growing table.

## Decision

Use pg_partman with monthly range partitions (`card_impressions_pYYYY_MM`). Template partition seeds RLS; event trigger replicates RLS to new partitions automatically.

## Consequences

- Partition pruning keeps queries fast.
- Old partitions can be detached/dropped for retention.
- RLS replication required two migrations to nail down (015 partition RLS hardening, 016 event trigger).

## Reference

Strategy v1.6.3 §6.4, parking lot IN-005. Migrations 014, 015, 016.
