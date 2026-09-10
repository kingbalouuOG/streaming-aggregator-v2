---
title: Product Strategy & Roadmap v1.1 + the 10 September 2026 review
type: source
tags: [strategy, roadmap, h1, search, voice, services, ios-first, review]
created: 2026-09-10
updated: 2026-09-10
sources:
  - raw/forward-planning/Videx_Product_Strategy_and_Roadmap_v1.1_2026-09.md
  - raw/forward-planning/Videx_Roadmap_Review_2026-09-10.md
related:
  - wiki/sources/strategy-roadmap-2026-07.md
  - wiki/registers/next-steps.md
  - wiki/concepts/operations/phase-search-v2.md
  - wiki/concepts/evaluations/semantic-search-quality.md
  - wiki/concepts/architecture/notifications-v1.md
---

# Product Strategy & Roadmap v1.1 (10 September 2026)

**What it is.** A cut of the July roadmap made from a same-day review, approved by Joe on 10 Sept 2026. Source of truth: `docs/strategy/Videx_Product_Strategy_and_Roadmap_v1.1.md`; the review it came from: `docs/strategy/Videx_Roadmap_Review_2026-09-10.md`. v1.0 stays on disk as history. Strategy §1–§5 unchanged except operating principle 3.

**Why a review was needed.** H0's engineering finished on 13 July; its four people/admin gate items (ICO registration, the 12-tester/14-day Play closed test, the production-access application, App Store review) had not started by 10 Sept, while ~70 unplanned PRs landed (catalogue freeze repair, speed/freshness, search rebuild, OTA/CI). Production on 10 Sept: 14 profiles of which 1 is a real person; 2 sign-ins in 30 days; 35K titles; pipeline healthy. The July thesis — users are the critical path — was right and had been routed around.

## Decisions (Joe, 10 Sept 2026)

| # | Decision |
|---|---|
| 7 | Close H0 on dated actions: ICO this week; Play closed track starts now with 3 testers, recruit to 12; weekly ritual starts; tripwire 24 Sept → marketing beat moves to January if missed. |
| 8 | H1 replanned as two parallel tracks. Monetisation plumbing → H2 entry. |
| 9 | Operating principle 3 restated: **one question, any input** (was "recommendation-first, not search-first"). |
| 10 | Services wave 1: HBO Max, Discovery+, Crunchyroll, MUBI, Pluto TV (rows already in the DB). Wave 2: partial free-to-air coverage via TMDb watch-providers beats none. |
| 11 | Query understanding: Workers AI JSON mode first; Claude Haiku 4.5 behind a per-user flag via AI Gateway for A/B. |
| 12 | Marketing-beat fallback to January. |
| 13 | **iOS first.** App Store submission made 10 Sept as publicly available; Android follows its closed test; growth links to the App Store until Android clears. |

## H1 "Grow, and make it easy to ask" (Oct–Dec 2026)

User track: 1.1 community rollout + activation read + engine pulse (written branch unchanged) → 1.6 ASO/review prompts → 1.7 marketing beat, iOS-first, hook "describe it, or just say it". Search track: 1.2 query understanding + hybrid retrieval (small-model parse → `{filters, expanded_query}`, KV-cached; `tsvector` + RRF beside pgvector; bge reranker; title lookups bypass it) → 1.3 semantic for everyone, gated numerically (short-sentence eval ≥80%, zero-result <10%, p95 <1.5 s) → 1.4 voice (`expo-speech-recognition`, on-device first; transcript settles as typed text) → 1.5 services wave 1. Stretch: wave 2, calendar screen, importers, agent-connector pilot. New Tier-1 search metrics row. Handoffs: `docs/plans/2026-09-10-001-handoffs-search-track.md` (order: 1.5 → 1.4 → 1.2 → 1.3).

## Research the review rests on

- Discovery starts outside the app (friends 56–68%, platform rows ~50%, social ~43%; 87% of UK 16–24s started a show after a clip); in-app search is mostly retrieval; "easy search" the most-valued feature; failed search the abandonment point (19%, 29% of under-25s).
- Shipped "conversational" is describe-then-refine with prompt chips (Netflix TV Ask, YouTube Ask, Disney+ beta, Spotify Prompted Playlist); Netflix's mobile text-chat search stalled.
- Query understanding best practice: one small-LLM JSON call returning filters + a HyDE-style expanded synopsis, cached; hybrid FTS + vector with RRF; optional reranker. Workers AI parse ≈ $0.00003; Haiku 4.5 TTFT ≈ 0.8 s.
- Voice: `expo-speech-recognition` (Expo 56, new-arch safe, iOS ≥16.4), on-device where supported; `@react-native-voice/voice` fails on the new architecture; no on-device Whisper in v1.
- Vendor GB catalogue has 17 services incl. HBO Max (`hbo`), `all4`, `iplayer`; not Sky Go, Rakuten, My5, UKTV Play, STV, S4C; BritBox folded into ITVX (Apr 2024); Freevee closed (Aug 2025). JustWatch UK lists ~85–100 providers.

## Corrections made alongside

- `notifications-v1.md` had said delivery was blocked on FCM/APNs credentials since July; they were credentialed and device-verified on 13 July. Corrected.
- `next-steps.md` had stopped at 13 July; a 10 Sept "Now" block was added and the July section kept as history.
