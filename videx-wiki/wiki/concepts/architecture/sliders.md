---
title: Delivery sliders (Option C dual-access)
type: concept
tags: [sliders, ui, ranking, tune-recommendations]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/v2-strategy/Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.3.md
  - raw/phase-summaries/phase-4-summary.md
related:
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/architecture/for-you-surface.md
  - wiki/concepts/architecture/onboarding-flow.md
---

# Delivery sliders (Option C dual-access)

Four continuous sliders that tune **how recommendations are served**, not what is in the taste vector. Sliders modify pipeline parameters; they do **not** modify the taste vector itself.

## The four sliders

| Slider | Poles | What it modifies |
|---|---|---|
| Catalogue Age | New releases ↔ Best match regardless of age | Recency weight in Stage 2 (default 25%, range 10-30%, proportional re-norm of taste/contextual) |
| Comfort Zone | Stick with what I like ↔ Surprise me | Exploration ratio in Stage 3 (default 20-25%, range 10-40%); also sizes Outside Your Usual row (5-15) |
| Content Mix | Focus on films ↔ Focus on TV series | Stage 1 retrieval filter (films-weighted vs TV-weighted) |
| Focused ↔ Varied | Go deeper ↔ See more variety | Stage 3 row composition (deeper similar-content rows vs broader variety) |

## Naming history

The fourth slider was originally "Depth vs breadth" with poles "Finish what I start ↔ Try lots of things". Renamed to "Focused ↔ Varied" in strategy v1.6 because Videx has no episode-level progress tracking; the original framing implied something the mechanism doesn't do. The slider modulates row composition, not progression.

## Locked rules

- Continuous, not snap-to-state. Each has a descriptive state label that updates dynamically as the user drags.
- Auto-save on release.
- Sliders **do not** modify the taste vector; only pipeline parameters.

## Option C dual-access

Sliders live in BOTH locations:

- **Profile → Tune Your Recommendations** sub-page — canonical settings home.
- **For You → "Tune your recommendations"** entry point — collapsed at top of surface, opens as bottom-sheet tray (`SliderTray.tsx`).

Both read/write via `getSliderState()` / `saveSliderState()`; state is shared. Slider changes from either location persist in both.

## Phase 4 implementation

`SliderTray.tsx` reuses `FilterSheet` motion.div + backdrop + spring animation. `@capacitor/haptics` `ImpactStyle.Light` fires once per label boundary crossing (tracked via `prevLabelsRef`), not continuously during drag.

- 300ms debounced re-rank: in-memory re-scoring of cached 500-candidate pool, no RPC re-call on slider change.
- 500ms debounced Supabase save.
- `invalidateV2ProfileCache()` on save.

## Storage

Slider state lives as columns on `taste_profiles` (added in migration 023). Co-loaded with the taste vector for efficiency.

## Cold-start defaults

All four sliders default to "Balanced" centre on onboarding Step 5.
