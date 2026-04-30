---
title: Onboarding flow (5 steps)
type: concept
tags: [onboarding, taste-vector, cold-start, steps]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/v2-strategy/Videx_v2_Design_Reference_v0.1.md
  - raw/phase-summaries/phase-3-summary.md
related:
  - wiki/concepts/architecture/taste-vector.md
  - wiki/concepts/architecture/cold-start.md
  - wiki/concepts/architecture/sliders.md
  - wiki/concepts/architecture/service-fingerprints.md
---

# Onboarding flow (5 steps)

5 steps, ~90s target. Designed to maximise signal capture per step while minimising friction. Auth integrated into Step 1 (Phase 3 deviation from brief; eliminated duplicate email collection).

## Step 1 — Create Account

- Email, username, password (required).
- Terms of Service + Privacy Policy acknowledgement (implicit on Continue tap).
- Age range dropdown labelled "(optional)".
- "How do you usually watch?" dropdown labelled "(optional)" — Solo / With a partner / With family / Mix.
- Copy: *"This helps us recommend the right content for how you watch. Entirely optional."*

## Step 2 — Your Services

- Multi-select grid in UK market share order: Netflix → Prime Video → Disney+ → BBC iPlayer → ITVX → Channel 4 → NOW → Sky Go → Apple TV+ → Paramount+.
- "Select All" affordance.
- Selection counter at bottom.
- **Minimum 1 service required.**
- Drives service-fingerprint cold-start (Pillar 3).

## Step 3 — What have you watched?

- 6-title grid (3×2) with real TMDb poster art, multi-select per round.
- 3 rounds with differentiated slices:
  - Round 1: broadly popular, recognisable mainstream.
  - Round 2: recent prestige content from user's selected services.
  - Round 3: deeper-cut content matching emerging signals from Rounds 1-2.
- Each round: "See different titles" affordance + "I haven't watched any of these — skip this round" affordance.
- Cold-start can still proceed if all 3 rounds are skipped (relies on Step 4 + service fingerprints).
- **Optional per round.**

Phase 3 implementation: Step 3 uses popular titles from user's selected services (no centroid RPC). Faster, better-known titles, pre-fetchable during Step 1.

## Step 4 — What do you watch? (Genre/cluster preferences)

- 16 taste cluster chips (`TASTE_CLUSTERS`).
- **Minimum 3 selections required, no upper cap** (cap removed during Phase 3 testing).
- Phase 3 ships clusters, not raw genres (design showed cluster chips matching `TASTE_CLUSTERS`; brief said "genre preferences" but meant clusters).

## Step 5 — Here's what we've learned (Sliders + Summary)

- Taste summary card at top — natural-language summary describing inferred content identity.
- Stats card (genres / titles / services counts).
- 4 delivery sliders, defaults "Balanced". See [sliders](sliders.md).
- Continuous sliders with dynamic position labels.
- Auto-save on release.

## Locked rules

- Total steps: 5. Target: ~90 seconds end-to-end.
- Progress indicator visible throughout ("Step 2 of 5").
- No skip paths.
- Back button on each step preserves state.

## Bootstrap weights (Phase 3 dynamic 4-band)

| Watched-grid selections | Service fingerprints | Watched grid | Genre selections |
|---|---|---|---|
| 0 | 0.55 | 0.00 | 0.45 |
| 1-4 | 0.40 | 0.40 | 0.20 |
| 5-12 | 0.30 | 0.55 | 0.15 |
| 13+ | 0.20 | 0.70 | 0.10 |

## Onboarding events (analytics)

`onboarding_started`, `services_completed`, `clusters_completed`, `quiz_started`/`quiz_completed`/`quiz_skipped` (legacy v1, no longer emitted), `onboarding_completed`, `first_home_view`. See [event taxonomy](../../entities/codebase/event-taxonomy.md).
