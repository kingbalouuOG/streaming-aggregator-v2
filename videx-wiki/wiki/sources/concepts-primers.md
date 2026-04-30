---
title: Source — Concept primers (raw/concepts/)
type: source
tags: [concepts, primers]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/concepts/cold-start-strategy.md
  - raw/concepts/embedding-model-primer.md
  - raw/concepts/hdbscan-primer.md
  - raw/concepts/justwatch-as-source.md
  - raw/concepts/rls-pattern.md
  - raw/concepts/signal-weighting-overview.md
  - raw/concepts/two-surface-architecture.md
  - raw/concepts/uk-streaming-market.md
related:
  - wiki/concepts/architecture/cold-start.md
  - wiki/concepts/techniques/embeddings.md
  - wiki/concepts/techniques/hdbscan.md
  - wiki/concepts/techniques/rls-pattern.md
  - wiki/concepts/architecture/signal-architecture.md
  - wiki/concepts/architecture/two-surface-architecture.md
  - wiki/concepts/domain/justwatch.md
  - wiki/concepts/domain/uk-streaming-market.md
---

# Source: Concept primers (raw/concepts/)

Eight primers under `raw/concepts/`. Per the brief's suggested ingest order, these are mostly already covered as wiki concept pages from earlier ingest passes (architecture, techniques). Treated as supplementary detail.

| Raw | Primary wiki concept |
|---|---|
| `cold-start-strategy.md` | [cold-start](../concepts/architecture/cold-start.md) |
| `embedding-model-primer.md` | [embeddings](../concepts/techniques/embeddings.md) |
| `hdbscan-primer.md` | [hdbscan](../concepts/techniques/hdbscan.md) |
| `justwatch-as-source.md` | [JustWatch as upstream source](../concepts/domain/justwatch.md) |
| `rls-pattern.md` | [RLS pattern](../concepts/techniques/rls-pattern.md) |
| `signal-weighting-overview.md` | [signal architecture](../concepts/architecture/signal-architecture.md) |
| `two-surface-architecture.md` | [two-surface architecture](../concepts/architecture/two-surface-architecture.md) |
| `uk-streaming-market.md` | [UK streaming market](../concepts/domain/uk-streaming-market.md) |

## Conflict notes

Two primers carry older terminology than v1.6.3 strategy and detail page spec v0.3.2:

- **`signal-weighting-overview.md`** says `detail_view` is "weak positive". Detail page spec v0.3.2 §3.1 corrects this to **NOT positive** (anchor only). Wiki signal-architecture page reflects current spec.
- **`signal-weighting-overview.md`** references "Surprising ↔ Safe" slider. Composition hypothesis v0.3 and strategy v1.6.3 use "Comfort Zone" (poles "Stick with what I like ↔ Surprise me"). Wiki sliders page reflects current naming.
- **`two-surface-architecture.md`** primer uses "Continue Exploring" as a row name; composition hypothesis v0.3 §3.2 uses "More From [Director/Actor]" and "Outside Your Usual" as the canonical names; wiki for-you-surface page reflects shipped Phase 4 names.

These are stale; raw/ files are read-only and the wiki pages above are authoritative for canonical content.

## Why it matters

Primers compress strategy material into educational snippets. They're useful for orienting new readers. Discrepancies surface where strategy versions advanced past primer authoring date.
