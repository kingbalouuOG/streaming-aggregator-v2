---
title: ADR-009 — `dismiss` event renamed to `not_interested`
type: concept
tags: [adr, decision, events, dismiss, not-interested, locked, applied]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/adrs/adrs-combined.md
  - raw/v2-strategy/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md
related:
  - wiki/entities/codebase/event-taxonomy.md
  - wiki/concepts/architecture/signal-architecture.md
---

# ADR-009 — `dismiss` event renamed to `not_interested`

**Status:** locked, applied Phase 0.

## Context

v1 had two separate dismissal mechanisms: a `dismiss` event type in `user_interactions` and a localStorage dismissal list. Naming was confusing; "dismiss" suggested temporary hide rather than negative signal.

## Decision

Rename to `not_interested`. Rewrite `getDismissedIds()` to read from the unified event source. Migration 013 adds the new event type to the enum.

## Consequences

- Clearer semantics for users (button label) and engineers (event type).
- Transitional code keeps v1 behaviour intact through Phases 1-3.
- localStorage dismissal list cleared on first launch of Phase 0 build via `@videx_version` flag check.

## Reference

Strategy v1.6.3 §7.2, parking lot IN-007, IN-008. Detail Page Signal Capture Spec §2.7.
