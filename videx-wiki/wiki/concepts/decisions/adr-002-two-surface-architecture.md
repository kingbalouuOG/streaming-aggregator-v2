---
title: ADR-002 — Two-surface architecture (Home + For You)
type: concept
tags: [adr, decision, two-surface, home, for-you, locked]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/adrs/adrs-combined.md
related:
  - wiki/concepts/architecture/two-surface-architecture.md
  - wiki/concepts/architecture/home-surface.md
  - wiki/concepts/architecture/for-you-surface.md
---

# ADR-002 — Two-surface architecture (Home + For You)

**Status:** locked.

## Context

v1 used a single homepage that mixed trending, new releases, and personalised content. Every row competed for attention; the mental model was muddled.

## Decision

Split into Home (discovery, light personalisation) and For You (heavy personalisation, sliders, mood rooms). Both as primary bottom-nav tabs. Land users on For You after onboarding.

## Consequences

Clearer mental model per surface; allows aggressive personalisation in For You without distorting Home; doubles the surface count to design and maintain.

## Reference

[Composition Hypothesis v0.3 source](../../sources/home-foryou-composition-hypothesis-v0-3.md).
