---
title: Home surface
type: concept
tags: [home, surface, recency, hero-carousel, paid-titles, quick-filters]
created: 2026-04-26
updated: 2026-09-08
sources:
  - raw/v2-strategy/Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.3.md
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/phase-summaries/phase-4-summary.md
  - raw/plans/2026-09-08-002-recommendation-quick-filters-and-search-presets.md
related:
  - wiki/concepts/architecture/two-surface-architecture.md
  - wiki/concepts/architecture/for-you-surface.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/operations/phase-4.md
  - wiki/concepts/architecture/signal-architecture.md
---

# Home surface

Discovery mode. Recency-led, lightly personalised. Service-filtered. Maximum 7-9 rows. Shipped in Phase 4.

> **Label note (native, 2026-07-10):** the concept name stays "Home", but the tab is now user-labelled **"New"** and sits second (after For You) in the bottom nav — beta feedback 2026-07-09. File/route name (`(tabs)/index.tsx`) unchanged. See [two-surface](two-surface-architecture.md#naming-home-concept-new-label-native-2026-07-10).

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

## Quick filters (native, 2026-09-08)

The "Browse by" chip strip above Recently Added was decorative until now — five pills (`All · Movies · TV Shows · Docs · Anime`), every one of which pushed to `/browse`. It is now a filter over this page, per [recommendation 2026-09-08-002](../../../raw/plans/2026-09-08-002-recommendation-quick-filters-and-search-presets.md) §1.

**Four categories: `All · Movies · TV · Documentaries`.** Anime was dropped — it is a taste cluster and a mood room, not a content type, and defining it needs `original_language = 'ja'` + genre 16, which only the Supabase path populates. It is expressible again under the visibility rule below once that field lands on both paths.

**The page filters in place. Nothing refetches.** Every rail applies the predicate; a rail left with fewer than 4 survivors hides. This is a pure view over the already-cached `/v1/home` payload, so a chip tap costs no round trip and the KV key `home:v1:{user}:{services}:{clusters}` is untouched. A server-side filter would have multiplied KV entries by the number of chip states and defeated B2 pre-warming — and the whole point of the chip is that there is no spinner.

**Hero re-pick.** If the day's pick fails the predicate, the first passing item from the first per-service row is promoted, falling back to anything still on the page. The kicker names the filter (`Today's pick · Film`). Leaving a documentary in the largest card while the strip reads "Movies" would look like a bug.

**Hidden rails are named, not silent.** A rule divider lists them — *"Upcoming · Free tonight hidden — fewer than 4 films"*. Only rails that had enough items BEFORE filtering are listed; blaming the filter for a row the payload never carried would be a lie in the other direction.

**Empty state.** When every rail hides, one card: *"Not many documentaries on your services this week"* over a single button to Browse, seeded with the category via a `contentType` route param (`browse.tsx` reads it once, as the initial filter value). This is the only navigation a chip may cause, and only as an explicit second tap.

**One lazy backfill, Documentaries only.** Movies or TV leaves roughly half of every rail — comfortably above the threshold. Documentaries is a genre at ~5–8% of a general pool, so it goes thin nearly everywhere. On first tap only, `useDocumentariesBackfill` fetches one extra rail (TMDb discover, movie + TV, `with_genres=99`, scoped to the user's providers) under `['native','home','docsBackfill',services]` with `staleTime: Infinity`. It never runs on page open, so Workstream B's cold-open number is untouched.

**Chip visibility is data-driven (§1.5).** A chip renders only when the payload holds ≥ 8 matching items, counted across every rail rather than per rail. "All" always renders, and a strip left offering only "All" does not render at all. This resolves "same categories on both surfaces?" without a per-surface config.

See [for-you-surface](for-you-surface.md#quick-filters-native-2026-09-08) for the same strip over the taste rows, and [signal-architecture](signal-architecture.md) for what a chip change logs.
