---
title: User Personas
generated: 2026-04-26
status: stub
---

# User Personas

> Stub. Working personas inferred from product strategy. Replace with the validated set when user research lands.

## P1 — Multi-subscriber juggler

- 30-50, UK, household of 2-4.
- Pays for Netflix, Prime, plus one of (Disney+, NOW, Apple TV+).
- Watches 4-8 hours/week. Decision time is the biggest friction.
- Wants: a single feed showing "what's new and worth my time, on what I already pay for".
- Cares about: spend transparency, hidden costs, no recommendation slop.

## P2 — Public broadcaster loyalist

- 40-65, UK.
- Heavy iPlayer / ITVX user. May or may not also have Netflix.
- Discovers via word of mouth, Radio Times, occasionally the iPlayer app's own surface.
- Wants: an aggregator that respects iPlayer / ITVX / Channel 4 as primary, not afterthoughts.

## P3 — Cinephile hunter

- 25-45, UK.
- Subscribes selectively (often Apple TV+, MUBI elsewhere). Knows what is critically acclaimed.
- Active rater, would use thumbs up/down and lists meaningfully.
- Wants: discovery beyond major-platform algorithmic feeds; mood rooms, hidden gems, critically acclaimed gating.

## P4 — Drift-checker

- 25-40, UK.
- Subscribes to Netflix and one other; minimal active management.
- Opens an app, scrolls, gives up. Frequently watches the same 3 things on rotation.
- Wants: low-friction "what should I put on tonight" without thinking. Personalisation done for them.

## Anti-persona — Power list-maker

- Trakt-style "log every episode, sync three ratings sources" user.
- Not the target. Videx is intentionally not a personal media database; it's a discovery + decision tool.

## Behavioural inputs the engine assumes

| Persona | Key signal | Engine response |
|---|---|---|
| P1 | Service variety in subscription set | Service-spread enforcement in rows |
| P2 | High dwell on public broadcaster titles | Service fingerprint biases toward iPlayer/ITVX/Channel 4 |
| P3 | High volume of explicit signals (thumbs) | Faster transition cold → warm; mood rooms become richer |
| P4 | Low explicit signals, high impressions | Cold-start fallbacks (archetype + service fingerprint) carry longer |

> Validate with actual user research as soon as available.
