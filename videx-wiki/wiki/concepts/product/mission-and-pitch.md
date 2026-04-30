---
title: Mission and pitch
type: concept
tags: [mission, pitch, product, positioning]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/product/mission-and-pitch.md
  - raw/Videx_USP_and_Strategy_Summary.md
related:
  - wiki/concepts/product/user-personas.md
  - wiki/concepts/architecture/two-surface-architecture.md
  - wiki/concepts/architecture/mood-rooms.md
  - wiki/concepts/domain/uk-streaming-market.md
---

# Mission and pitch

> Stub. Pending the canonical short pitch.

## One-liner

Videx is a UK-first mobile streaming aggregator that tells you what to watch tonight across the services you already pay for, with deep links straight into the right app.

## Why it exists

UK households subscribe to 2-3 services on average and lose hours every month searching across them. Generic aggregators (JustWatch, Reelgood) over-index on US catalogue and undersell UK public broadcasters. Videx's bet:

- Personalisation that rewards repeat use (taste vector, mood rooms).
- Deep linking that lands the user inside the streaming app, not on a search page.
- UK-first: BBC iPlayer, ITVX, Channel 4 treated as first-class peers to Netflix and Prime.
- Spend transparency so users see what they actually pay for.

## Differentiators

| | JustWatch | Reelgood | Trakt | Videx |
|---|---|---|---|---|
| UK public broadcaster coverage | thin | thin | thin | first-class |
| Personalised recommendations | weak | weak | manual lists | embedding-based + mood rooms |
| Deep linking confidence | medium | medium | low | high (AppLauncher with confidence tagging) |
| Spend tracker | no | no | no | yes |
| Mobile-first | secondary | secondary | secondary | primary |

## Four-pillar USP

1. **Two-surface architecture** — Home (discovery) and For You (personalised) as distinct primary tabs.
2. **Contextual ranking** — context shapes ranking; never filters content out.
3. **Subscription portfolio as prior** — services reveal taste before any rating.
4. **Conversational discovery (post-v2)** — generative "describe what you want" assistant on top of v2 infrastructure.

See [strategy v1.6.3 source](../../sources/engine-strategy-v1-6-3.md) §2 for full detail and the [USP and strategy summary source](../../sources/usp-and-strategy-summary.md) for the design-review framing.

## Target users

UK adults with 2-4 active streaming subscriptions, frustrated by browsing multiple apps for "what to watch tonight", comfortable with mobile-first surfaces, care about discovery beyond the same-five-trending-titles UX of major services. See [user-personas](user-personas.md).

## Out of scope (initially)

Linear TV / EPG / live programming. US, EU, AU regions (UK only at launch). Web version (mobile app first; possible future surface). Social / sharing.
