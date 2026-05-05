---
title: Two-Surface Architecture (Home + For You)
generated: 2026-04-26
sources: [docs/v2/Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.3.md]
---

# Two-Surface Architecture

V1 ran a single homepage that mixed trending, new releases, and personalised content. V2 splits this into Home (discovery) and For You (personalised) as two equal primary tabs.

## Surface intents

| Surface | Mental model | Lean | Personalisation level |
|---|---|---|---|
| Home | "What's happening across my services?" | Recency, trending, zeitgeist | Light: filter hard by services, order softly by taste. |
| For You | "What should I watch that matches me?" | Taste, mood, deep catalogue | Heavy: full ranking pipeline, sliders, mood rooms. |

## Why two surfaces and not one

One surface forced every row to compete for attention and produced a muddled mental model. Users in different states (curious vs decisive) saw the same mixed grid. Splitting lets each surface optimise for its intent without cross-contamination.

## Bottom navigation

Both are primary tabs. No hierarchy between them. Users move freely.

## Landing surface after onboarding

For You. Onboarding is an investment in personalisation; the most honest payoff is to show the personalised surface immediately. After the first session, last-used tab persists.

## Home composition

Six rows in canonical order:

1. Featured Hero (3-5 cards, auto-rotating).
2. Recently Added across user's services.
3. Trending Across Your Services.
4. Coming Soon (next 30 days, user's services).
5. Per-service popularity (up to 3 services chosen by user; each its own row).
6. Critically Acclaimed New Releases — gated on OMDB coverage ≥ 80% of last 90 days.
7. Weekly Genre Spotlight — rotating cluster.

Personalisation enters via row ordering and per-row scoring, not via gating titles.

## For You composition

Driven by the user's taste vector and slider state. Rows include:

1. Top Matches.
2. Mood Rooms for Tonight (HDBSCAN clusters).
3. From Genres You Love.
4. Hidden Gems (low-popularity titles with high taste affinity).
5. Continue Exploring (titles related to recent thumbs-ups).
6. Service-spread variety row.

Sliders adjust pipeline weights:
- Focused ↔ Varied (renamed from "Depth vs breadth" in v0.3; Videx has no episode-level progress so the original name was misleading).
- Surprising ↔ Safe.
- New releases ↔ Best match regardless of age (modulates recency weight).
- ... see Composition Hypothesis §3.2 for the full set.

## Cold-start strategy

For a brand-new user with no signals, For You falls back gracefully:

- Bootstrap taste vector from selected onboarding archetypes (16 clusters in `tasteClusters.ts`).
- Surface service fingerprints to bias toward services the user actually subscribes to.
- Mood Rooms remain available (computed offline).
- Slider state defaults to neutral (0.5).

After ~10 explicit interactions, the engine moves from cold-start mode to warm.
