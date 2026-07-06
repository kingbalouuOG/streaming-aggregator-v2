---
title: Monetisation strategy exploration v0.1 (forward-planning)
type: concept
tags: [forward-planning, exploratory, monetisation, affiliate, data-licensing]
status: superseded (absorbed into Product Strategy & Roadmap v1.0 §5, approved 2026-07-06)
horizon: post-v2 (12-24 months)
created: 2026-04-26
updated: 2026-07-06
sources:
  - raw/forward-planning/Videx_Monetisation_Strategy_Exploration_v0_1.md
related:
  - wiki/concepts/product/mission-and-pitch.md
  - wiki/concepts/domain/uk-streaming-market.md
---

# Monetisation strategy exploration v0.1

> **⚠ SUPERSEDED 2026-07-06** by the approved [Product Strategy & Roadmap v1.0](../../sources/strategy-roadmap-2026-07.md) §5, which absorbs and updates this exploration with July-2026 research: fair feature-backed **Premium (~£14.99/yr) gated at the ~5–8K-MAU break-even band** (this doc's blanket freemium rejection is retired — the approved model is its §3.6 "voluntary support" candidate upgraded with genuinely premium features; core never paywalled, arrival alerts free forever); affiliate as floor revenue (~£0.05–0.15/MAU/**yr**) via a server-side Worker `/out` redirector (settles this doc's ?tag=-preservation open question); any monetisation triggers the TMDb commercial licence (~$149/mo). The constraints below (esp. "revenue must not corrupt the engine" and "graceful zero") carry forward unchanged. Kept for historical reasoning.

## Constraints

Any future revenue model must satisfy:

1. **Low operational overhead** — solo-developer, spare-time operation.
2. **Product-aligned** — does not corrupt the recommendation engine or degrade UX for non-paying users.
3. **UK-focused viable** — works with UK streaming market structure (PSBs, affiliate coverage, smaller market than US).
4. **Non-exclusive** — multiple models can run in parallel where compatible.
5. **Graceful zero** — Videx survives and remains valuable if revenue is zero.

## Goal framing

Lifestyle revenue (modest income covering operating costs, rewarding effort) over venture-scale growth. An approach netting £20k/year low-overhead is more valuable than one theoretically netting £200k/year requiring full-time attention.

## Ruled out

- **Monthly subscriptions**: friction kills top-of-funnel before product validates.
- **Freemium**: forces tradeoff between crippling free tier (kills growth) or making paid redundant (kills conversion).
- **£1/year upfront**: payment step is the barrier, not the price. Conversion realistically 2-5% caps addressable user base at the moment the product is trying to grow.

## Product-monetisation tension

Videx promises "find stuff worth watching on services you already pay for". Most monetisation models (affiliate especially) pay the app for pushing users **into** new subscriptions. That pulls against the promise. JustWatch has this tension visibly. Principle: revenue features must be orthogonal to core product logic, visually distinct, or strictly opt-in.

## Candidate models (high-level)

| Model | Mechanics | Revenue potential | Product risk | Operational effort | Timing |
|---|---|---|---|---|---|
| **Passive affiliate (deep-link tag preservation)** | Wrap outbound deep links with affiliate tracking tag. No changes to home composition or ranking. | Modest. £50-300/month at 10K active users; £500-2000/month at 50K. Capped because iPlayer/ITVX/Channel 4/Netflix pay nothing. | Low if implemented passively. | Low: one-time programme application + tag-insertion + disclosure UI; ongoing minimal. | Six-month first-sale rule on Amazon Associates. Spike tag preservation through `@capacitor/app-launcher` first. |
| **Data licensing** | Aggregate, anonymised taste/engagement data licensed to streamers, research firms, distributors, PSBs, hedge funds. | Potentially significant; scale-gated. Often 100K+ MAU minimum. | Low if aggregate-only. Reputational if perceived invasive. | Not passive. Each customer is a B2B relationship. | 24+ months from v2 rollout. |
| **Published aggregate insights (free marketing asset)** | Quarterly "UK Streaming Taste Report". Free, drives press + acquisition. | Zero direct. Indirect: organic acquisition, reputation, SEO, prototypes for paid data. | None. | Moderate one-time per report; quarterly cadence. | Sooner — provides data-licensing groundwork. |

(Plus other models in the source: Pro tier for cosmetics/lists, sponsored title placements opt-in, etc. See raw doc for full survey.)

## Market context (per source)

- **JustWatch**: ~10M MAU, 283 staff. Affiliate + ads + cheap Pro + B2B "Audience as a Service" data licensing. Consumer revenue subsidises the data asset.
- **Reelgood**: ~10M MAU, $11M VC. Free consumer + B2B data licensing to ~50 customers (Roku, NY Post, smart TVs, hedge funds).
- **Smaller competitors** (Watchworthy, Simkl, TV Time): mostly free + ads + cheap Pro. None disclose revenue.
- **Letterboxd**: Pro £19/year, Patron £49/year, sponsored slots clearly labelled. Cleanest model in adjacent category.

Pattern: nobody credible charges mandatory upfront. Consumer revenue predominantly free + optional upgrade. The commercial asset is audience or data. B2B is where sustainable revenue lives.

## Key unknowns to validate before any commitment

- **Tag preservation through Capacitor `AppLauncher`** — does `?tag=videx-21` survive the OS handoff? Single biggest technical blocker for affiliate.
- **UK ASA / ICO disclosure requirements** in mobile-app context.
- **Whether Videx's embedding-based taste data is differentiated enough** to command a premium over JustWatch/Reelgood offerings.
- **Solo-developer bandwidth** for B2B sales and account management.

## Why this is forward-planning, not locked

Per Step 4 of the ingest brief, forward-planning material does not override locked v2 decisions. v2 is shipping with no revenue model. This document exists so that when monetisation becomes viable, there's a documented option set rather than a cold start.
