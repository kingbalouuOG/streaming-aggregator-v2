---
title: ADR-001 — WatchMode replaced by Streaming Availability API
type: concept
tags: [adr, decision, sa-api, watchmode, locked, applied]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/adrs/adrs-combined.md
related:
  - wiki/entities/apis/streaming-availability-api.md
  - wiki/entities/codebase/database-schema.md
  - wiki/concepts/operations/solutions/sa-api-uk-service-coverage-gaps.md
---

# ADR-001 — WatchMode replaced by Streaming Availability API

**Status:** locked, applied (B1-E1, March 2026).

## Context

WatchMode provided UK availability data and deep links but had a small UK service catalogue, no rent/buy pricing, and a deprecated v1 API. Streaming Availability API (Movie of the Night) covers more UK services with deeper data and exposes pricing.

## Decision

Remove WatchMode entirely. Use SA API as the source of UK deep links and rent/buy pricing. Cache SA API data in Supabase; client reads from Supabase, not directly from SA API. SA API key is server-side only.

## Consequences

- Pros: deep links + pricing for 8/10 UK services; durable Supabase cache; no client-side quota burn.
- Cons: BBC iPlayer empty, Sky Go absent (upstream gaps); requires ongoing sync infrastructure.

## Reference

`docs/context-update-b1-e1.md`, `docs/solutions/integration-issues/sa-api-uk-service-coverage-gaps.md`.
