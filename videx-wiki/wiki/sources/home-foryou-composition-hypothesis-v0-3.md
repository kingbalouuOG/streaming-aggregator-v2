---
title: Source — Home and For You Composition Hypothesis v0.3
type: source
tags: [home, for-you, surfaces, composition]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.3.md
related:
  - wiki/concepts/architecture/two-surface-architecture.md
  - wiki/concepts/architecture/home-surface.md
  - wiki/concepts/architecture/for-you-surface.md
  - wiki/concepts/architecture/sliders.md
  - wiki/concepts/architecture/mood-rooms.md
---

# Source: Home and For You Composition Hypothesis v0.3

Defines composition logic, row types, ordering rules, and cold-start behaviour for the two primary surfaces.

## v0.3 corrections

- §3.2 fourth slider renamed "Depth vs breadth" → "Focused ↔ Varied" (no episode-level progress tracking exists).
- §2.2 row 6 "Critically Acclaimed New Releases" gated on OMDB backfill ≥80% of titles released in last 90 days.
- §3.2 row 3 "Mood Rooms for Tonight" cross-references HDBSCAN execution model (Python + GitHub Actions monthly cron).
- §5.2 cache TTL clarified: refers to rendered row content, not underlying data.

## Headline content

| Surface | Rows in order |
|---|---|
| Home | Featured Hero Carousel (3-5) → Recently Added → Trending → Coming Soon → Per-service charts (top 3) → Critically Acclaimed New Releases (gated) → Genre Spotlight. Max 7-9 rows. Hard-filtered by services; light taste 15-20% on rows / 30-40% on Hero. |
| For You | Sliders entry point (collapsed) → Recommended For You → Mood Rooms for Tonight → Hidden Gems → Because You Watched [X] (max 2 rows, requires watchlist+thumbs_up) → More From [Director/Actor] (≥2 signals) → Outside Your Usual (sized by Comfort Zone) → From Your Watchlist. Max 7-8 rows. Heavy personalisation. |

## Phase implementation notes (per inline annotations)

- Phase 3 shipped a minimal For You with 2 rows: Recommended + Hidden Gems.
- Phase 4 expanded to 7 rows. Mood Rooms for Tonight position reserved for Phase 4.5. Sliders wired with bottom-sheet tray + haptic feedback. Home rebuilt to match §2.2 row composition.

## Locked rules

- Land on For You after onboarding (then last-used tab).
- Slider Option C dual-access: canonical state in Profile, contextual access from For You via modal/tray. Shared state.
- Mood rooms appear on For You only in v2 MVP. Dedicated browse surface deferred to v2.5.
- Mood rooms refresh weekly (Spotify Discover Weekly model), shuffled within the week. Time-of-day reorders the same weekly pool.
- "Because You Watched" requires BOTH watchlist AND thumbs-up.
- No continue-watching tracking; "From Your Watchlist" is the equivalent need.
- No special handling for single-service users.
- Impression batcher flushes on tab change to prevent buffer drift.

## Why it matters

The architecture's product surface. Every wiki page about Home or For You rows derives from this doc.
