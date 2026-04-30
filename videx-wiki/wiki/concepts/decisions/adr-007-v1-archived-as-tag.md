---
title: ADR-007 — v1 archived as Git tag, not run in parallel
type: concept
tags: [adr, decision, branching, v1-archive, locked]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/adrs/adrs-combined.md
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.3.3.md
related:
  - wiki/sources/project-orchestration-v0-3-3.md
  - wiki/sources/engine-strategy-v1-6-3.md
---

# ADR-007 — v1 archived as Git tag, not run in parallel

**Status:** locked.

## Context

v2 is a substantial restructure. Standard rebuild patterns (parallel run, feature flags, cutover ceremony, dedicated cleanup phase) add complexity. Videx has only two prototype users; the cost of breaking changes is low.

## Decision

Tag current main as `v1-archive`, build v2 forward on `main` as a series of phase branches, delete v1 code in the phase that replaces it.

## Consequences

- Simpler branching.
- No feature-flag infrastructure.
- No Phase 6.5 cleanup phase.
- Users re-onboard on v2.
- Cleanup is continuous as a side effect of each phase.

## Reference

Project Orchestration v0.3.3 §1, §2.
