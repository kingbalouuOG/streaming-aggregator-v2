---
title: Source — Brief: quick filters + preset search categories (2026-09-08)
type: source
tags: [browse, search, filters, presets, brief, product]
created: 2026-09-08
updated: 2026-09-08
sources:
  - raw/plans/2026-09-08-001-brief-quick-filters-and-search-presets.md
related:
  - wiki/sources/quick-filters-and-search-presets-recommendation-2026-09-08.md
  - wiki/concepts/architecture/signal-architecture.md
  - wiki/concepts/product/privacy-and-gdpr.md
  - wiki/registers/parking-lot.md
---

# Source: Brief — quick filters + preset search categories

Joe's problem statement, 2026-09-08. Deliberately **not** a solution document: it states verified current state, the outcome wanted, and the open questions. Answered by the [recommendation](quick-filters-and-search-presets-recommendation-2026-09-08.md), which supersedes it on two points.

## The single goal

> Get people to what they actually want without making them open a filter page.

Both halves are the same problem at different grain. The stated end state is **conversational** search; everything in the brief is a stopgap toward that and should not become an obstacle to it.

## Part 1 — quick filters on New and For You

- The chips **already exist and already do nothing**. `native/src/components/BrowseChips.tsx` renders `All · Movies · TV Shows · Docs · Anime`; `index.tsx:163` discards the selection and routes to `/browse`. The component takes an `active` prop nothing passes. Its own comment says the wiring "lands with the Browse screen" — deferred, never picked up. So this is finishing a stub, not starting a feature.
- **New** (`(tabs)/index.tsx`, tab titled "New") composes heterogeneous rails from TMDb discover/trending, Supabase charts/spotlights, and derived items (hero, editorial). They share no filtering mechanism.
- **For You** is one `/v1/foryou` Worker payload, KV-cached on user + taste freshness + sliders + services.
- Filter vocabulary already exists in `browseFilters.ts` (`BrowseFilters.contentType`), and a quick filter should reuse it rather than invent a parallel one.
- Good looks like: one tap, reflow in place, no modal, no navigation, no spinner.

## Two claims the brief gets wrong

Flagged in the brief's own status line once the recommendation landed:

1. **"There is no search-term logging anywhere today."** The *mechanism* exists (`emitSearch`, shared lib, called by web since 2026-05); only native was unwired. See [signal-architecture](../concepts/architecture/signal-architecture.md#search-events).
2. **"Cost is not filterable."** It is, via the web's monetization mapping.

## Why it matters

It is the origin document for the search-term logging shipped 2026-09-08, and it frames quick filters and presets as stopgaps toward conversational search — which is the constraint any later filter work has to respect.
