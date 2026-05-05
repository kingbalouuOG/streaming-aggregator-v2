---
title: ADR-011 — Edge Function shared modules duplicated into _shared/
type: concept
tags: [adr, decision, edge-functions, supabase, locked]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/adrs/adrs-combined.md
related:
  - wiki/concepts/operations/edge-function-deployment.md
  - wiki/entities/codebase/module-map.md
---

# ADR-011 — Edge Function shared modules duplicated into `_shared/`

**Status:** locked.

## Context

Supabase CLI cannot resolve TypeScript imports from outside `supabase/functions/` without Docker-based bundling, which is fragile on Windows and not always available locally.

## Decision

All shared code for Edge Functions lives in `supabase/functions/_shared/` as self-contained modules. Each function imports via `../_shared/`. Updates to shared code require redeploying every dependent function.

## Consequences

- Simpler deploys.
- Some duplication of logic between `_shared/` and `src/lib/`.
- Redeploy discipline required.

## Reference

Parking lot IN-105.
