---
title: Home surface
type: concept
tags: [home, surface, recency, hero-carousel]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.3.md
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/phase-summaries/phase-4-summary.md
related:
  - wiki/concepts/architecture/two-surface-architecture.md
  - wiki/concepts/architecture/for-you-surface.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/operations/phase-4.md
---

# Home surface

Discovery mode. Recency-led, lightly personalised. Service-filtered. Maximum 7-9 rows. Shipped in Phase 4.

## Row composition (in order)

1. **Featured Hero Carousel** — 3-5 cards, CSS scroll-snap, 6s auto-rotation, pause-on-touch with 3s resume. Pool = titles released or added to services in last 14 days, available on at least one user service, with vote/popularity thresholds. Rank by `popularity × taste_fit`. Taste weight: 30-40%.
2. **Recently Added to Your Services** — `earliest_available_on_services >= now() - 30d` OR `release_date >= now() - 30d`. Lazy-loaded 10 → +5 → cap 50.
3. **Trending Across Your Services** — TMDb 7-day rolling popularity, smoothed against historical baseline. Deduped across services.
4. **Coming Soon** — `release_date BETWEEN now() AND now() + 30d`, sorted ASC. TMDb-backed (`titles` doesn't carry future release dates).
5. **Per-Service Charts** — top-3 user services by `deep_link_click` count, fallback to onboarding service order. One row per service.
6. **Critically Acclaimed New Releases** — RT ≥ 80%, IMDb ≥ 7.5, vote_count above floor, last 90 days. **Gated on OMDB coverage ≥ 80%.** Currently disabled behind `CRITICALLY_ACCLAIMED_ROW_ENABLED = false` (Phase 4 found 0% RT / 12.3% IMDb on titles released in last 90 days).
7. **Genre Spotlight** — weekly rotation across 16 taste clusters, `Math.floor(Date.now() / weekMs) % 16`.

## Locked rules

- Hard-filtered by user services.
- Light taste 15-20% on rows; 30-40% on Featured Hero.
- Recency-dominant: "what's new" takes precedence over "what's popular".
- Familiar structure (rows + scroll, recognisable from Netflix/Disney+/JustWatch).
- Shallow personalisation: no "because you watched X", no Hidden Gems, no mood rooms.

## Edge cases

- 0-interaction post-onboarding user: hero uses service-fingerprint cold-start; all rows populate normally.
- 1-service user: not optimised for; cross-service rows degrade to single-service.
- 5+ services: top 3 charts shown, rest collapsed under "See all".
- Dismissed (`not_interested`) titles never appear, even if trending.

## Caching

Rendered row content cached per user 30-60 minutes. Underlying TMDb/OMDB/SA API data not re-fetched on every load. Invalidated by service change, midnight UTC rollover, or pull-to-refresh.

## Phase 4 deviations from brief

- Removed v3 Phase 3 rows (For You, Hidden Gems, Highest Rated, multi-genre LazyGenreSection) — moved to For You or subsumed by new rows.
- Critically Acclaimed ships disabled behind feature flag.
