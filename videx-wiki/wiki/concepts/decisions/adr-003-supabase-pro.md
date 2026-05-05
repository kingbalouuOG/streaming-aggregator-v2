---
title: ADR-003 — Supabase Free → Pro tier
type: concept
tags: [adr, decision, supabase, infrastructure, locked, applied]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/adrs/adrs-combined.md
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.3.3.md
related:
  - wiki/entities/infrastructure/supabase.md
  - wiki/concepts/operations/supabase-backup-restore.md
---

# ADR-003 — Supabase Free → Pro tier

**Status:** locked, applied Phase 1.

## Context

Free tier compute is insufficient for HNSW index build on 20K+ embeddings, and PITR requires Pro.

## Decision

Upgrade to Pro for the duration of v2 build and beyond. Compute add-ons reserved for HNSW rebuild windows.

## Consequences

- ~£25/month baseline cost (£20 in §3.2 of orchestration; £25 cited in ADR — both ~£20-25 range).
- PITR enabled.
- Larger CPU window during index builds.
- Daily auto-backups, 7-day retention.

## Reference

[Project Orchestration v0.3.3 source](../../sources/project-orchestration-v0-3-3.md).
