---
title: Source — Videx USP & Strategy Summary
type: source
tags: [usp, strategy-summary, design-review]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/Videx_USP_and_Strategy_Summary.md
related:
  - wiki/concepts/product/mission-and-pitch.md
  - wiki/concepts/architecture/two-surface-architecture.md
  - wiki/concepts/architecture/mood-rooms.md
  - wiki/sources/engine-strategy-v1-6-3.md
---

# Source: Videx USP & Strategy Summary

Top-level file at `raw/Videx_USP_and_Strategy_Summary.md`. Context brief for design review. Summarises what Videx is, who it's for, how it differentiates, and where it's going.

## Sections

1. **What Videx is** — UK-native, recommendation-first streaming discovery app. Target user: UK households paying for 2+ services.
2. **Four-pillar USP** — two-surface architecture, contextual ranking, subscription portfolio as prior, conversational discovery (post-v2).
3. **Core commitments** — privacy-forward, designed-in exploration, recommendation-first UX.
4. **Supporting features** — watchlist, Spend Dashboard, detail page deep links, Browse, Calendar.
5. **What v2 is building** — taste model + recommendation engine + onboarding + signal capture rebuild.
6. **Where it's going** — v2.5 mood rooms browse / iOS, v3 conversational discovery via Graphiti+Kuzu.
7. **Design implications** — Home vs For You feel different; Mood Rooms emotional centre; recommendation-first as visual stance; deep-linking is the success state.

## Wiki coverage

- USP pillars expanded in [strategy v1.6.3 source](engine-strategy-v1-6-3.md) and [two-surface-architecture](../concepts/architecture/two-surface-architecture.md).
- Differentiator table mirrored in [mission-and-pitch](../concepts/product/mission-and-pitch.md).
- Forward-planning v3 detail in [v3-conversational-discovery](../concepts/forward-planning/v3-conversational-discovery.md).

## Why it matters

This is the doc to read first if entering Videx for the first time. Strategy-v1.6.3 is the canonical specification; this summary is the design-review framing.

## Conflict notes

- Phase numbering listed in §5 ("Phase 0 → 1 → 3 → 4 → 5 → 6") omits 0.5, 2, 2.5, 2.6, 4.5. Strategy v1.6.3 §7.2 and the [phase-history](../concepts/operations/phase-history.md) page are the canonical sequence.
