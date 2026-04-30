---
title: ADR-004 — 24D archetype vector replaced by 1536D embedding
type: concept
tags: [adr, decision, embeddings, taste-vector, locked, applied]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/adrs/adrs-combined.md
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
related:
  - wiki/concepts/techniques/embeddings.md
  - wiki/concepts/architecture/taste-vector.md
  - wiki/concepts/architecture/mood-rooms.md
  - wiki/entities/codebase/migrations.md
---

# ADR-004 — 24D archetype vector replaced by 1536D embedding

**Status:** locked, applied Phases 1-3.

## Context

v1 used a hand-designed 24D vector (19 genre + 5 meta dimensions). Coverage of taste nuance was poor; new genres or themes required schema changes.

## Decision

Replace with `text-embedding-3-small` 1536D embeddings, computed from a locked template (title, year, media type, genres, overview, keywords, cast, runtime). User taste vector lives in the same space.

## Consequences

- Much higher fidelity.
- Mood rooms become natural (HDBSCAN over the embedding space).
- HNSW dependency.
- Per-title embedding cost negligible at this catalogue size (~£0.20 backfill, ~£0.50/month ongoing).
- Coordinated regen needed if model deprecated.

## Reference

Strategy v1.6.3 §4.1, §5.2. Migrations 018 (add column + HNSW index) and 019 (drop legacy 24D `content_vector`).
