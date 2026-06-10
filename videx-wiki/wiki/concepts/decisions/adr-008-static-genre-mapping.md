---
title: ADR-008 — Static genre mapping retained over populating title_genres
type: concept
tags: [adr, decision, genres, locked, applied]
created: 2026-04-26
updated: 2026-06-10
sources:
  - raw/adrs/adrs-combined.md
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
related:
  - wiki/entities/codebase/database-schema.md
  - wiki/entities/codebase/module-map.md
---

# ADR-008 — Static genre mapping retained over populating `title_genres`

**Status:** locked, applied Phase 0.5.

## Context

`title_genres` table exists (migration 001) but was never populated. Genre rows and filters worked fine via the static `GENRE_NAMES` constant in `lib/constants/genres.ts`.

## Decision

Do not backfill `title_genres`. Resolve title → genres via the static TMDb genre mapping plus the `genre_ids` already on `titles`.

## Consequences

- Simpler enrichment pipeline.
- ~~`title_genres` remains as a future hook if multi-source genre data becomes useful.~~ **Superseded 2026-06-10 (REPO-1):** migration `046_drop_title_genres_credits.sql` drops `title_genres` and `title_credits` (written, not yet applied). The decision itself stands — static genre mapping remains the genre path.
- No per-title row explosion in a join table.

## Reference

Strategy v1.6.3 §4.0, parking lot IN-106.
