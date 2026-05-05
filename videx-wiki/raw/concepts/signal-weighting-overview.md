---
title: Signal Weighting Overview
generated: 2026-04-26
sources: [src/lib/recommendations-v2/weights.ts, docs/v2/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md §4-5]
---

# Signal Weighting Overview

A user-facing primer on how signals translate into ranking. The single source of truth for actual values is `src/lib/recommendations-v2/weights.ts`.

## Stage 2 base weights

The pipeline ranks candidates with three components summing to 1.0:

| Component | Base weight | Source signal |
|---|---|---|
| Taste | 0.625 (62.5%) | Cosine similarity between user's taste vector and title's embedding. |
| Recency | 0.250 (25%) | Linear or exponential decay against `release_date` or `available_since`. |
| Contextual | 0.125 (12.5%) | Phase 4: returns 0.5 for all (placeholder). Phase 5: device, time-of-day, viewing context. |

These are normalised from the brief's 50/20/10. Diversity (10%) and cross-service spread (10%) are post-processing stages, not scoring components.

## Slider mappings

Sliders modulate weights at request time. All linear interpolations of slider values 0.0–1.0 (default 0.5).

### Catalogue age slider → recency weight

```
raw_recency = 0.30 - slider * 0.20
// 0.0 ("New releases") → 0.30
// 1.0 ("Best match regardless of age") → 0.10
// 0.5 (default) → 0.20 (matches brief base)
```

After modulation, taste and contextual re-normalise proportionally to keep sum = 1.0, preserving the 5:1 taste:contextual ratio.

### Other sliders

- **Focused ↔ Varied:** modulates diversity post-processing (genre spread + service de-clustering aggressiveness).
- **Surprising ↔ Safe:** modulates the popularity floor in `hardFilters.ts`.

See `weights.ts` for the full mapping functions.

## Explicit signal weights (interaction → taste vector update)

| Signal | Weight |
|---|---|
| `thumbs_up` | strongly positive |
| `thumbs_down` | strongly negative |
| `marked_watched` | moderately positive |
| `watchlist_add` | moderately positive |
| `not_interested` | strongly negative + adds to dismissed list |
| `report_availability` | neutral (no taste impact) |

Exact weights live in `lib/taste-v2/interactionUpdate.ts` and follow Strategy §4.2 weight tables.

## Silent signal weights

| Signal | Default treatment | Notes |
|---|---|---|
| `detail_view` | weak positive | confidence: low |
| `dwell_event` (positive exit) | proportional to dwell | capped at saturation point |
| `dwell_event` (back_to_previous, short) | weak negative | session accumulator capped at -1.0 |
| `deep_link_click` (high confidence) | strong positive | reached the destination app |
| `deep_link_click` (low confidence) | weak positive | fell back to browser |
| `card_impression` | not interpreted in v2 | reserved for Phase 5 implicit-feedback work |

## Hard filters (gate before scoring)

Applied in `hardFilters.ts` before scoring:

- Title not in `not_interested` list.
- Title not in `thumbs_down` history.
- Title available on at least one selected service.
- Title meets minimum popularity floor (slider-modulated).
- Title not currently in user's "Watched" list (avoid re-recommending).

## Diversity post-processing

Run after scoring, before final row build:

- Genre spread: max N titles per genre per row.
- Service de-clustering: max M titles per service per row.
- Content-mix ratio: balance movies vs TV shows per row when both are available.

Aggressiveness modulated by Focused/Varied slider.
