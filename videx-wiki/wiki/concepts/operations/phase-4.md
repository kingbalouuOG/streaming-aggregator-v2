---
title: Phase 4 — Ranking pipeline & row composition
type: concept
tags: [phase, phase-4, ranker, pipeline, sliders, rows]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/phase-summaries/phase-4-summary.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/architecture/home-surface.md
  - wiki/concepts/architecture/for-you-surface.md
  - wiki/concepts/architecture/sliders.md
  - wiki/entities/codebase/module-map.md
---

# Phase 4 — Ranking pipeline & row composition

April 17-19, 2026. 3 commits (Phase 4 core, review fixes, README update). 21 files changed, +2,652 / −663 = +1,989 lines. **Zero migrations.**

## What was delivered

### Pipeline core

- **`src/lib/recommendations-v2/weights.ts`** — single source of truth. Stage 2 base weights (taste 62.5% / recency 25% / contextual 12.5%), 5 slider mapping functions, `CRITICALLY_ACCLAIMED_ROW_ENABLED` feature flag, scoring utilities.
- **`recency.ts`** — piecewise linear (Home, anchor `MAX(release_date, available_since)`) and exponential decay 180-day half-life (For You, anchor `release_date`).
- **`contextual.ts`** — Phase 4 placeholder returning neutral 0.5. Pluggable signature for Phase 5.
- **`diversity.ts`** — `applyGenreSpread` (TMDb primary genre + taste cluster secondary), `deClusterByService` (max-2-consecutive constraint), `applyContentMixRatio`.
- **`ranker.ts`** — pipeline orchestrator. `fetchCandidatePool` (shared 500-candidate retrieval), `scoreCandidates`, `buildRowFromPool`, `fetchAnchorNeighbours`.
- **`types.ts`** — extended with `PipelineInput`, `CandidatePool`, `ExtendedTitleRow`, `ScoredCandidate`, `RowConfig`.

### Home surface (7 rows, rebuilt)

1. **Hero Carousel** (`FeaturedHeroCarousel`) — 3-5 cards, CSS scroll-snap, 6s auto-rotation, pause-on-touch with 3s resume, dot indicators.
2. Recently Added to Your Services (TMDb discover, date desc).
3. Trending Across Your Services (TMDb discover, popularity desc).
4. Coming Soon (`useUpcoming`, TMDb-backed because `titles` has no future release dates).
5. Per-Service Charts (top-3 user services by `deep_link_click` count, fallback to onboarding order). New `rows/home/perServiceChart.ts`.
6. Critically Acclaimed (gated behind `CRITICALLY_ACCLAIMED_ROW_ENABLED = false`; OMDB coverage 0% RT / 12.3% IMDb on recent releases — nowhere near 80%). New `rows/home/criticallyAcclaimed.ts`.
7. Genre Spotlight (weekly rotation across 16 taste clusters via `Math.floor(Date.now() / weekMs) % 16`). New `rows/home/genreSpotlight.ts`.

Removed from Home: For You, Hidden Gems, Highest Rated, multi-genre LazyGenreSection.

### For You surface (up to 7 rows)

`useForYouContent.ts` (472 lines) orchestrates. Shared 500-candidate pool fetched once; conditional rows fetched in background.

1. Recommended For You — top 20 after content-mix → genre-spread → de-cluster.
2. Hidden Gems — popularity 2-20, vote_count ≥ 50, vote_average ≥ 7.0; genre cap 2 per genre; max 15.
3. Because You Watched [Title] — anchors = (`watchlist_add` OR `watched`) AND `thumbs_up` in last 60 days. Top 2 anchors. Per-anchor neighbours via `fetchAnchorNeighbours` in parallel.
4. More From [Director/Actor] — person in ≥2 thumbs-up titles. Director preferred for movie-heavy users (≥60% movies); else actor. Min 5 available titles.
5. Outside Your Usual — bottom 30% cosine but finalScore ≥ median + IMDb ≥ 7.0. Count modulated by Comfort Zone slider (5-15).
6. From Your Watchlist — unwatched, recency-ordered.

(Mood Rooms position reserved for Phase 4.5; not rendered in Phase 4.)

### Slider wiring

`SliderTray.tsx` (bottom-sheet pattern reusing `FilterSheet`), `@capacitor/haptics` `ImpactStyle.Light` on label boundary crossings, shared state via `getSliderState()` / `saveSliderState()`, 300ms debounced re-rank (in-memory re-scoring of cached pool, no RPC re-call), 500ms debounced Supabase save.

### Eval harness

`scripts/evaluation/rank-eval.ts` — standalone Node script. Accepts `--user-id <uuid>`, runs full pipeline, outputs scored top-50 with per-component breakdowns + row assignments + diversity metrics.

### Deleted

`useRecommendations.ts`, `useHiddenGems.ts`, deprecated `rankTitles()` and `rankHiddenGems()` in `ranker.ts` (160 lines), multi-genre LazyGenreSection block in App.tsx Home tab, legacy `FeaturedHero` single-item wrapper.

## Deviations

1. **Weight interpretation: 3-component scoring + 2 post-processing stages.** Brief §3.2 lists 5 weights summing to 1.0; implementation uses 3 (62.5/25/12.5) + diversity/cross-service as post-processing (genre-spread, de-clustering). Approved in plan review. Diversity and cross-service spread are inherently post-processing.
2. **MMR deferred to Phase 5.** Loading 500 × 1536D embeddings client-side for MMR similarity computation would add ~3MB transfer + ~23M float ops per page load. Genre-spread heuristic with taste-cluster secondary signal achieves visual diversity using metadata already available. Pluggable signature for Phase 5.
3. **Home surface row deletions** beyond brief: For You, Hidden Gems, Highest Rated, multi-genre LazyGenreSection. Either moved to For You or subsumed.
4. **Critically Acclaimed gated disabled.** OMDB coverage insufficient (0% RT / 12.3% IMDb on titles released in last 90 days).
5. **Supabase `<Database>` generic reverted.** Exposed 47 pre-existing type mismatches across 6 out-of-scope files. Deferred to Phase 5/6 cleanup.
6. **Mid-phase tuning** after user testing: rerank debounce 150 → 300ms; metadata fetch capped at top-100 candidates (5.3s → 180ms); `watched` event name bug fix; parallelised anchor fetches.

## Performance

~260ms time-to-first-render with warm filter sets (profile 75ms + pool 183ms).

## Open items → Phase 4.5 / 5 / 6

1. Mood Rooms for Tonight row (Phase 4.5).
2. MMR upgrade (Phase 5) — current genre-spread is pluggable.
3. Contextual scorer (Phase 5) — `contextual.ts` placeholder returns 0.5; replace then re-evaluate 62.5/25/12.5 split.
4. `taste_profiles` RLS (Phase 5/6 pre-launch) — security review M1 finding, GDPR/privacy blocker.
5. `<Database>` generic cleanup (47 errors across 6 files).
6. `watched` vs `marked_watched` event-type consolidation.
7. Availability page-count adaptive strategy (currently 20 parallel pages unconditionally; will silently truncate at 100K+ titles).
