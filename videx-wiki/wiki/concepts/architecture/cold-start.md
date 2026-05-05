---
title: Cold-start strategy
type: concept
tags: [cold-start, onboarding, bootstrap, service-fingerprints]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/concepts/cold-start-strategy.md
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/phase-summaries/phase-3-summary.md
related:
  - wiki/concepts/architecture/onboarding-flow.md
  - wiki/concepts/architecture/service-fingerprints.md
  - wiki/concepts/architecture/taste-vector.md
---

# Cold-start strategy

A new user has no interaction history. v2 resolves this without showing empty rows.

## Three signal sources at day zero

1. **Service fingerprints** (Pillar 3) — selected services in onboarding Step 2 give pre-computed taste centroids. Even users who skip every other step get meaningful priors.
2. **Watched-grid signals** — onboarding Step 3 captures up to 18 titles (3 rounds × 6) the user has watched. Each contributes its embedding directly. Skippable per round.
3. **Genre/cluster preferences** — Step 4 selects ≥3 of 16 taste clusters. Each cluster maps to an aggregate embedding signal.

## Bootstrap formula (Phase 3 dynamic 4-band)

Initial taste vector = weighted blend by watched-grid selection count:

| Selections | Service fingerprints | Watched grid | Genre selections |
|---|---|---|---|
| 0 | 0.55 | 0.00 | 0.45 |
| 1-4 | 0.40 | 0.40 | 0.20 |
| 5-12 | 0.30 | 0.55 | 0.15 |
| 13+ | 0.20 | 0.70 | 0.10 |

Strategy v1.5 specified static 0.40/0.40/0.20. Phase 3 shipped dynamic 4-band weights. Strategy v1.6.3 §5.2 acknowledges the change.

## Confidence floor

First 20 interactions weighted 1.5x to accelerate convergence to "warm" state where behavioural signals dominate the bootstrap.

## Cold-start surface behaviour

| Surface | Behaviour |
|---|---|
| Home | Populates normally (not behaviour-dependent). Hero uses service-fingerprint cold-start prior. |
| For You | Recommended For You uses bootstrap vector. Mood Rooms populate (global). Hidden Gems populate. Because You Watched, More From [Person] hidden until signals exist. From Your Watchlist hidden until items added. |

## Designed-in exploration

20-25% of every recommendation surface reserved for exploration (sized by Comfort Zone slider 10-40%). Architected from day one to prevent filter bubbles, especially important at small user count where feedback loops amplify faster.

## Sliders default

All four sliders default to "Balanced" centre. Users can tune at Step 5; subsequent changes happen via Profile → Tune Recommendations or For You → SliderTray.
