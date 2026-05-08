---
title: Cold-start strategy
type: concept
tags: [cold-start, onboarding, bootstrap, service-fingerprints]
created: 2026-04-26
updated: 2026-05-08
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

## Bootstrap formula (cluster-dominant, 2026-05-08)

Initial taste vector = weighted blend by watched-grid selection count, with the cluster signal carrying 75% across every tier:

| Selections | Service fingerprints | Watched grid | Cluster (genre) |
|---|---|---|---|
| 0 | 0.25 | 0.00 | 0.75 |
| 1-4 | 0.13 | 0.12 | 0.75 |
| 5-12 | 0.09 | 0.16 | 0.75 |
| 13+ | 0.05 | 0.20 | 0.75 |

Strategy v1.5 specified static 0.40/0.40/0.20. Phase 3 shipped dynamic watched-grid-dominant 4-band. 2026-05-08 re-tuned to cluster-dominant after a 2,280-trial simulation sweep validated CAF +15% / Persona-Distinctness +760%. See [ADR-013](../decisions/adr-013-cluster-dominant-bootstrap-weights.md).

### Cluster representative pool

Cluster representatives drive the genre signal. Two changes shipped 2026-05-08 in `tasteClusters.ts`:

- **Dedup**: each title appears in exactly one cluster (previously Pulp Fiction, Forrest Gump, Shawshank, Toy Story, and Saving Private Ryan each appeared in two). Dedup increases centroid orthogonality across clusters.
- **TV reps added** to clusters that were movie-only:
  - `feel-good-funny`: The Office, Brooklyn Nine-Nine, Ted Lasso, The Good Place, Modern Family.
  - `anime-animation`: Naruto Shippuden, Demon Slayer, JJK, Spy x Family, Frieren.
  - `family-kids`: Avatar: The Last Airbender, Gravity Falls, Bluey, SpongeBob SquarePants, Adventure Time.
  - `reality-entertainment`: Hell's Kitchen, MasterChef.

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
