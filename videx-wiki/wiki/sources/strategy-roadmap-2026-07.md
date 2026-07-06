---
title: Product Strategy & Roadmap v1.0 (July 2026)
type: source
tags: [strategy, roadmap, vision, monetisation, launch, h0, h1, h2, h3]
created: 2026-07-06
updated: 2026-07-06
sources:
  - raw/forward-planning/Videx_Product_Strategy_and_Roadmap_v1.0_2026-07.md
related:
  - wiki/registers/next-steps.md
  - wiki/registers/deferred-items.md
  - wiki/registers/pre-launch-blockers.md
  - wiki/concepts/forward-planning/monetisation-strategy.md
  - wiki/concepts/forward-planning/v3-conversational-discovery.md
  - wiki/concepts/product/mission-and-pitch.md
---

# Product Strategy & Roadmap v1.0 (July 2026)

**The working strategy + roadmap, approved by Joe 2026-07-06.** Source of truth: `docs/strategy/Videx_Product_Strategy_and_Roadmap_v1.0.md`. Rendered copy: https://claude.ai/code/artifact/1ec8d533-7d33-45b8-9f11-ae2e128f0fc4. Notion carries a working summary that points here.

## Why it matters

First product-level (not engine-level) strategy since the v2 build. Built from production evidence (5 users at time of writing), full July-2026 market research (Barb/Ofcom/Kantar/Gracenote/YouGov, competitor teardowns, monetisation benchmarks), and hardened by three adversarial critique passes + an independent H3 vision review. Supersedes the Feb-2026 Notion roadmap, the Monetisation Exploration v0.1, and the v3 Conversational Discovery Strategy v0.1.

## Key claims

- **Thesis: the engine is ahead of the audience.** All remaining engine milestones (ENG-2, CF, two-tower) are data-gated; users are the critical path.
- **North star: Weekly Watch Decisions** (deep-link clicks + attributed mark-watched), plus WWD/WAU. Measurable from day one — `deep_link_click` telemetry already carries service/position/surface.
- **Horizons:** H0 Jul–Sep "Prove it & equip it" (legal, measurement fixes, taste dedup, **notifications v1 + share v1/title pages built into v1**, friends-&-family shakeout, quiet store release — no press) → H1 Oct–Dec "Grow & learn" (community rollout vs live listing, activation read + engine pulse with written pivot branch, monetisation plumbing, semantic flip, pre-Christmas marketing beat) → H2 Jan–Mar 2027 (rotation coach "worth it this month", Premium £14.99/yr gated at the ~5–8K-MAU break-even band, ENG-2 if its gate passes) → H3 vision bets.
- **Monetisation:** fair feature-backed Premium (never paywall the core; arrival alerts free forever; leaving-soon/price-drop/stats anchor Premium); affiliate ≈ £0.05–0.15/MAU/**yr** floor via a Worker `/out` redirector; **any monetisation triggers the TMDb commercial licence (~$149/mo)** — hence the MAU gate; no programmatic ads ever. Entitlements must be server-verified (RevenueCat webhook → SELECT-only RLS) — `user_feature_flags` is client-writable and must NOT gate Premium.
- **H3 rebuilt around four bets** (independent review, 6 Jul): (1) agent-callable taste layer — Videx MCP server, "Videx answers you anywhere"; Graphiti+Kuzu demoted to implementation option; (2) subscription autopilot — DMCCA easy-cancel lands spring 2027; (3) group "Tonight" links — guest-first web voting; (4) availability verification network — own the UK availability truth. Flywheel: Videx Rewind (Wrapped with a cost-per-watch blade). Sports hardened to a plain no.
- **Joe's six decisions (resolved 6 Jul):** Premium MAU-gated, no early experiment · core never paywalled · ~6–16 hrs/wk capacity, organic growth only (no ad spend until traction) · store-first rollout (quiet v1 release before community recruiting; TestFlight reads as friction/dodgy) · smart mark-watched only · **solicitor review deferred to the H2 monetisation gate** (H0 does DIY launch compliance: ICO registration, contact details, accuracy updates, hosted policy URLs, store forms; residual risk accepted).

## Register impact

- [next-steps](../registers/next-steps.md) — rewritten around H0 (2026-07-06).
- [deferred-items](../registers/deferred-items.md) — roadmap now owns sequencing; register keeps engine-item detail.
- [pre-launch-blockers](../registers/pre-launch-blockers.md) — items 15–18 were closed by the NATIVE-4 cutover; IN-XPS-014 re-scoped by Decision 6 (DIY compliance in H0; paid review at the H2 monetisation gate).
