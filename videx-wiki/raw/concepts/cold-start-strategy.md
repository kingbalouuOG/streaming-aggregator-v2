---
title: Cold-Start Strategy
generated: 2026-04-26
sources: [docs/v2/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md §5.2, src/lib/taste-v2/bootstrap.ts]
---

# Cold-Start Strategy

A new Videx user has no interaction history and the recommender cannot rely on collaborative filtering. Cold start is solved with three layered fallbacks: explicit onboarding signals, archetype seeding, and service fingerprints.

## Layer 1 — Onboarding signals

Five-step onboarding captures:

1. **Account creation.** Username, region (default GB), age range, viewing context.
2. **Service selection.** Which streaming services the user subscribes to. Becomes a hard availability filter.
3. **Watched grid.** 3 rounds of 6 titles. User taps any they have seen and rated positively. Each tap contributes a strong positive signal toward the title's embedding.
4. **Cluster selection.** 16 taste archetypes (`tasteClusters.ts`); user picks 1-4 they identify with. Provides bootstrap centroids for the taste vector.
5. **Slider tuning.** Focused/Varied, Surprising/Safe, New/Catalogue. Sets initial slider state on `taste_profiles`.

Each signal carries a weight; bootstrap is weighted average of:
- Watched-grid taps (highest weight).
- Selected archetype centroids.
- Default centroid (small contribution to avoid degenerate vectors).

## Layer 2 — Archetype centroids

The 16 archetypes in `lib/taste-v2/tasteClusters.ts` are precomputed centroids over curated title sets. Each is a `vector(1536)`. Examples (illustrative, not exhaustive):

- Prestige Drama
- Comfort Sitcoms
- Action Spectacle
- Mind-Bending Sci-Fi
- True Crime
- Animation for Adults
- Cosy Comfort
- Slow Burn International
- ...

The user's selection seeds their taste vector before any interaction.

## Layer 3 — Service fingerprints

Each service has a precomputed centroid (`service_fingerprints.centroid`) reflecting the average taste profile of its catalogue. For users who give weak archetype signals but strong service signals, the system biases toward catalogue centroids of selected services to ensure first-row recommendations are at least available.

Computed offline by the `refresh-service-fingerprints` Edge Function, refreshed when catalogue shifts materially.

## Transition to warm

After ~10 high-confidence interactions (thumbs, watchlist add, completed views), the bootstrap signals are diluted to <20% of the taste vector. After ~50 interactions, bootstrap is effectively zero and the vector is fully behavioural.

The transition is implicit (running weighted mean), not gated.

## Failure modes

- **User skips onboarding cluster step:** falls back to default centroid plus service fingerprints. Recommendations will be generic but still scoped to user's services.
- **User picks contradictory archetypes:** bootstrap vector lands in low-density region; HNSW search still returns nearest titles, but ranking quality is lower until interactions accumulate.
- **User selects no services:** no availability filter; Browse/Home become global. ProfilePage prompts user to add services.

## Critically Acclaimed and other gated rows

Some surfaces require additional data and are hidden until conditions met:

- Critically Acclaimed New Releases: hidden until OMDB coverage ≥ 80% of titles released in last 90 days.
- Mood Rooms: available immediately (computed offline; user's vector matches against cluster centroids regardless of warm/cold state).
- Hidden Gems: requires ≥ 5 explicit signals before surfacing.
