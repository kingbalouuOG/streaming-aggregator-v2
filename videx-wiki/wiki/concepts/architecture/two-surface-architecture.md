---
title: Two-surface architecture
type: concept
tags: [architecture, home, for-you, surfaces]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/v2-strategy/Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.3.md
  - raw/concepts/two-surface-architecture.md
related:
  - wiki/concepts/architecture/home-surface.md
  - wiki/concepts/architecture/for-you-surface.md
  - wiki/concepts/decisions/adr-002-two-surface-architecture.md
  - wiki/sources/home-foryou-composition-hypothesis-v0-3.md
---

# Two-surface architecture

Home (discovery) and For You (personalised) are split into two distinct primary tabs. Both filtered hard by user services. Different mental modes; different content treatment; different taste weight.

## Why two surfaces

v1's single homepage mixed trending, new releases, and personalised content in confusing ways. Every row competed for attention. v2 splits the question:

- **Home**: "what's available to watch right now across my services?" — recency-led, lightly personalised.
- **For You**: "what would I love that I might not find on my own?" — heavily personalised, sliders, mood rooms.

## Locked rules

- Both as primary bottom-nav tabs.
- Land on For You after onboarding (then last-used tab on subsequent sessions).
- Hard service filter on both surfaces.
- Light taste influence on Home: 15-20% on row ordering, 30-40% on Featured Hero.
- Heavy taste on For You: full ranking pipeline + sliders + mood rooms.
- Same title can appear on both (different contexts, not different titles).
- Impression batcher flushes on tab change to keep impressions correctly attributed (see [signal architecture](signal-architecture.md)).

## Cross-references

- Decision record: [ADR-002](../decisions/adr-002-two-surface-architecture.md)
- Per-surface specifics: [Home surface](home-surface.md), [For You surface](for-you-surface.md)
- Composition hypothesis source: [home-foryou-composition-hypothesis-v0-3](../../sources/home-foryou-composition-hypothesis-v0-3.md)
