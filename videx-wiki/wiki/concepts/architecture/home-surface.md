---
title: Home surface
type: concept
tags: [home, surface, recency, hero-carousel, paid-titles]
created: 2026-04-26
updated: 2026-07-10
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

## Content-freshness pass (native, 2026-07-01)

Home felt static week-to-week: the native `Trending` ribbon had drifted to `discover?sort_by=popularity.desc` (a near-static global ranking) rather than the row-3 **intent** ("TMDb 7-day rolling popularity"), and nothing rotated day-to-day. Two native changes (`src/lib/api/tmdb.ts`, `native/src/hooks/useHomeFeed.ts`, `src/lib/utils/dailyShuffle.ts`):

- **#1 — real trending, re-scoped to services.** `fetchPopular` now calls `/trending/{movie,tv}/week` (`getTrendingMovies`/`getTrendingTV`) and **filters to the user's services** via `getAvailableTmdbIds` (trending has no provider filter of its own), backfilling from the old provider-scoped popularity query when the intersection is thin (`< 8`). Realigns the ribbon with the row-3 design intent.
- **#2 — daily UTC-seeded rotation.** `dailyShuffleTopN` reshuffles the top 20 of the trending pool each UTC day (moves ribbon + editorial spotlight); `dailyPick` rotates the hero ("Today's Pick") among the lead per-service row's top 5, leaving the ranked row intact. Seed `${salt}:${UTC-day}` — stable within a day (no re-render flicker), rotates at 00:00 UTC (aligns with the existing midnight-UTC cache invalidation).

Web got the `#2` shuffle only (`src/hooks/useHomeContent.ts`); `#1` is a follow-up there since web's popular row uses the paginated `useSectionData` path. Report: `docs/v2/phase-summaries/content-freshness-2026-07-01.md`.

## Paid-titles row + service-row paywall fix (native, 2026-07-10)

Founder beta feedback (2026-07-09): a title showed in e.g. the "Popular on Apple TV+" per-service row when its only availability on that service was rent/buy, so the user tapped in and hit an unexpected paywall. Two coupled changes (`src/lib/recommendations-v2/rows/home/perServiceChart.ts`, new `.../rows/home/paidRow.ts`, `native/src/hooks/useHomeFeed.ts`, `native/src/app/(tabs)/index.tsx`):

- **Per-service rows are now subscription/free only.** `fetchServiceRow` filters `stream_type IN ('subscription','free')` (was `('subscription','free','addon')`). `'addon'` is **excluded**: an add-on channel is a separate paid entitlement the user may not hold, same "surprise paywall" risk as rent/buy. Free-tier UK broadcasters surface via `'free'`, so they aren't re-suppressed. (Same rent/buy/addon exclusion the `send-notifications` alert queries already adopted — 2026-07-07 audit note 4.)
- **New "New to rent or buy" row** (`paidRow.ts`, shared lib): newest rent/buy titles on ANY of the user's services, `release_date DESC` (rent/buy inventory skews to new releases; `available_since` is only sparsely populated). Deduped against the recency/trending/free rows above it. Relocates the rent/buy content honestly rather than hiding it — the label warns it costs money.

**Native Home order is now exactly:** Recently added → Free tonight → Trending → Spotlight (editorial) → **New to rent or buy** → Genre spotlights → Calendar strip → Per-service rows. (The numbered brief list above is the Phase-4 web spec and predates the native render order; this note + `content-freshness` above are authoritative for native.) The hero, editor note and browse chips still lead. Row name chosen per [tone-and-voice](../product/tone-and-voice-guide.md): un-salesy, British English, tells the user the tap-in cost up front.
