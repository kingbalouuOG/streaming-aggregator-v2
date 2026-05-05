---
title: ADR-006 — card_impressions is a dedicated partitioned table
type: concept
tags: [adr, decision, card-impressions, partitioning, locked, applied]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/adrs/adrs-combined.md
  - raw/v2-strategy/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md
related:
  - wiki/concepts/decisions/adr-010-pg-partman-card-impressions.md
  - wiki/entities/codebase/database-schema.md
  - wiki/entities/codebase/event-taxonomy.md
---

# ADR-006 — `card_impressions` is a dedicated partitioned table, not a JSONB extension of `user_interactions`

**Status:** locked, applied Phase 0.

## Context

Impression events are high-cardinality (every card shown). Putting them in `user_interactions.metadata jsonb` would balloon the table and slow every signal query.

## Decision

Dedicated `card_impressions` table with pg_partman monthly partitioning. Client batches and flushes impressions in groups. Daily rollup into `card_impression_daily_totals`.

## Consequences

- Clean separation of impression-scale data from low-frequency signals.
- Partition pruning makes queries fast.
- RLS replication to new partitions requires the event-trigger pattern (migrations 015 + 016).

## Reference

Detail Page Signal Capture Spec §5.1, parking lot IN-005, IN-007, IN-010, IN-011. Migrations 014 (table), 015 (partition RLS hardening), 016 (event trigger), 032 (`mood_room` source surface).
