---
title: ADR-013 — Cluster-dominant bootstrap weights
type: concept
tags: [adr, decision, bootstrap, cold-start, taste-vector, simulation, locked, applied]
created: 2026-05-08
updated: 2026-05-08
sources:
  - scripts/simulate-quiz.ts
  - scripts/simulate-profile-quality.ts
  - scripts/simulate-profile-sweep.ts
  - scripts/simulate-validate-winner.ts
related:
  - wiki/concepts/architecture/onboarding-flow.md
  - wiki/concepts/architecture/cold-start.md
  - wiki/concepts/architecture/taste-vector.md
  - wiki/concepts/architecture/service-fingerprints.md
---

# ADR-013 — Cluster-dominant bootstrap weights

**Status:** locked, applied 2026-05-08 (interphase, between Phase 5 and Phase 5.5).

## Context

Phase 3 shipped dynamic 4-band bootstrap weights biased toward the watched-grid signal (e.g. 5-12 taps tier: service 0.30 / watched 0.55 / genre 0.15). A simulation sweep over 6 personas × 7 weight configurations × 3 representative-pool variants × 10-30 trials (2,280 total) showed those weights produced profiles that drifted toward whichever canonical anchor titles a user happened to tap, regardless of their declared cluster preferences. In practice every persona ended up looking like the same Marvel / Avengers archetype because those titles dominate any popularity-ordered watched grid.

Two collateral causes were identified in the same investigation:

1. Several anchor titles (Pulp Fiction, Forrest Gump, Shawshank, Toy Story, Saving Private Ryan) appeared in two clusters each, blurring centroid orthogonality.
2. Four clusters were movie-only (`feel-good-funny`, `anime-animation`, `family-kids`, `reality-entertainment`), so users with TV-leaning tastes had no representative TV signal in the cluster centroid.

## Decision

Three coordinated changes, all shipped 2026-05-08:

1. **Bootstrap weights flipped to cluster-dominant** in `src/lib/taste-v2/bootstrap.ts`. Cluster signal carries 75% across every tap-count tier; service fingerprints and watched-grid signal share the remaining 25%, with watched-grid ramping 0 → 0.20 as taps accumulate.

   | Watched-grid taps | Service | Watched | Cluster |
   |---|---|---|---|
   | 0     | 0.25 | 0.00 | 0.75 |
   | 1-4   | 0.13 | 0.12 | 0.75 |
   | 5-12  | 0.09 | 0.16 | 0.75 |
   | 13+   | 0.05 | 0.20 | 0.75 |

   Genre-weight fallback retained: if no clusters selected, the 0.75 redistributes to service.

2. **Cluster representative dedup** in `src/lib/taste-v2/tasteClusters.ts` — every title now in exactly one cluster.

3. **Movie-only clusters gain TV reps**: `feel-good-funny` (The Office, Brooklyn Nine-Nine, Ted Lasso, The Good Place, Modern Family); `anime-animation` (Naruto Shippuden, Demon Slayer, JJK, Spy x Family, Frieren); `family-kids` (Avatar: The Last Airbender, Gravity Falls, Bluey, SpongeBob SquarePants, Adventure Time); `reality-entertainment` (Hell's Kitchen, MasterChef).

The onboarding watched-grid candidate pool was tightened and restructured in the same change-set (`OnboardingFlow.tsx`):

- **Dual query**: top 36 movies (`vote_count ≥ 5000`) and top 36 TV (`vote_count ≥ 1500` AND `popularity ≥ 20`) pulled separately, both ordered by `vote_count` DESC, then interleaved 1:1.
- **Service-availability filter dropped** — a title the user has seen elsewhere (cinema, friend's house, lapsed subscription) is still a valid taste signal.
- **`vote_count` over `popularity`** as the canonical signal — popularity is daily-trending and surfaces currently-airing US procedurals above true cultural canon.

Old: `popularity ≥ 30`, `vote_count ≥ 200`, single union query, ordered by `popularity` DESC.

## Rationale

Headline metrics from the validation sweep:

- **Cluster-Alignment Fidelity (CAF)**: 1.06 → 1.22 (+15%). Profiles now align reliably with declared cluster preferences instead of with whichever popular titles got tapped.
- **Persona-Distinctness**: 0.022 → 0.190 (+760%). Six simulated personas with very different declared tastes now produce six clearly separable taste vectors, not six near-identical ones.
- **Tap-count robustness**: light (4 taps), normal (7), heavy (10) all produce equivalent profiles. A disengaged user who taps four titles ends up with the same quality of profile as an engaged user who taps ten.
- **Profile variance**: ≤ 0.0008 across N=30 repeats per persona — extremely stable.

The watched-grid signal is downweighted, not eliminated: it still contributes 5-20% as taps accumulate, just no longer dominant. Service fingerprints now only carry meaningful weight for users who select zero clusters (where the cluster slot collapses into service via the `hasGenres` redistribution branch).

## Consequences

- **Existing taste profiles do not auto-rebootstrap.** `bootstrapTasteVector` is only called from onboarding (`useUserPreferences.ts:123`) and manual taste retake (`:199`). The 24h `recomputeFromInteractions` path (`interactionUpdate.ts:155`) uses the *saved* `bootstrapVector` as its anchor and replays interactions on top — it never re-runs `getBootstrapWeights`. Existing prototype users carry the Phase 3 anchor indefinitely. **Migration required**: a backfill script gated on `bootstrapped_from`, re-running `bootstrapTasteVector` with the new weights and then `recomputeFromInteractions` on top, then bumping `bootstrapped_from` to `'reweight_2026_05'`. Pre-check: confirm raw inputs (selected services, watched-grid `tmdb_id`s, cluster picks) are durably stored per user — without them, deterministic re-bootstrap is impossible and a soft path (prompt for retake, or one-shot blend toward `selected_clusters` centroid) is the fallback.
- **Strategy doc divergence.** Strategy v1.6.3 §5.2 documents Phase 3 watched-grid-dominant weights. Strategy v1.9 should record the cluster-dominant retune as the active configuration.
- **Cluster representative quality matters more.** With 75% weight, any sloppy cluster (mismatched anchor, missing genre coverage) propagates harder. Future cluster edits should re-run `simulate-validate-winner.ts` before merging.
- **Watched-grid pool is tighter.** Movie floor `vote_count ≥ 5000` and TV floor `vote_count ≥ 1500` exclude long-tail titles — at the edge a niche-leaning user may see fewer "deeper-cut" Round 3 candidates. Acceptable: in cluster-dominant mode the watched grid is mostly an anchor / dedup signal, not the primary taste source.
- **Re-runnable validation.** Simulation scripts retained at `scripts/simulate-quiz.ts`, `simulate-profile-quality.ts`, `simulate-profile-sweep.ts`, `simulate-validate-winner.ts`. Future weight retunes should rerun the full sweep and report CAF + Persona-Distinctness deltas.

## Alternatives considered

- **Keep Phase 3 weights, fix the watched-grid pool only.** Rejected: pool tightening alone improved CAF marginally in simulation but did not fix the persona-collapse problem — the centroid of any popularity-ordered grid still pulls every persona toward the same blockbuster cluster.
- **50/50 cluster vs watched-grid split.** Rejected: still produced visible persona collapse in simulation. The transition point at which declared cluster preferences begin to dominate the result was empirically in the 0.65–0.80 cluster-weight band.
- **Drop watched-grid entirely.** Rejected: zero-weighting wastes signal that becomes valuable for refining cluster-tied centroids and would force a UI change to remove Step 3.

## Reference

Source change: `src/lib/taste-v2/bootstrap.ts:77`, `src/lib/taste-v2/tasteClusters.ts`, `src/components/OnboardingFlow.tsx:164`. Validation scripts under `scripts/simulate-*.ts`. Phase history entry 2026-05-08.
