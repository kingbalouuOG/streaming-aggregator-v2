---
title: Source — Engine & Platform Hardening Brief v0.2 (E&P track)
type: source
tags: [strategy, e-p-track, eng-1, repo-1, plat-1, plat-2, plat-3, eng-2, cloudflare-workers]
created: 2026-06-10
updated: 2026-06-10
sources:
  - raw/v2-strategy/Videx_v2_Engine_and_Platform_Hardening_Brief_v0.2.md
related:
  - wiki/sources/project-orchestration-v0-8.md
  - wiki/sources/engine-strategy-v1-8.md
  - wiki/sources/phase-eng-1-summary.md
  - wiki/sources/phase-repo-1-summary.md
  - wiki/concepts/operations/phase-eng-1.md
  - wiki/concepts/operations/phase-repo-1.md
  - wiki/concepts/decisions/adr-011-edge-function-shared-modules.md
  - wiki/concepts/decisions/adr-012-server-side-foryou-render.md
  - wiki/registers/next-steps.md
  - wiki/registers/acceptance-gates.md
  - wiki/registers/deferred-items.md
---

# Source: Engine & Platform Hardening Brief v0.2 (E&P track)

New strategy doc, approved by Joe 2026-06-10 with all six decisions locked (§9). Authoritative for the scope of every E&P phase. Origin: June 2026 full-codebase architecture review + recommendation-engine deep-dive. Sits after Phase 5.5 (closed 2026-05-15) and before any v3 / Phase 7 work; Phase 6 launch prep runs in parallel (not absorbed).

## The track in one table (§2)

| Phase | Name | Thread | Gate to start | Size |
|---|---|---|---|---|
| ENG-1 | Multi-interest retrieval & signal quality | Engine | Brief approved ✅ | 2–3 wk (actual: 1 day) |
| REPO-1 | Documentation & repo hygiene | Hygiene | ENG-1 merged | ~1 wk (actual: 1 day) |
| PLAT-1 | Client data layer & rendering | Platform | REPO-1 merged (lint rules in force) | ~2 wk |
| PLAT-2 | API edge & content proxy | Platform | PLAT-1 merged | 1–2 wk |
| PLAT-3 | Single engine, server-side feed + cache | Platform | PLAT-2 merged | 2–3 wk |
| — | Phase 6 launch | — | Pre-launch blockers cleared (parallel track) | — |
| ENG-2 | Learned re-ranker | Engine | **Data gate: ≥5–10K impressions, ≥500 positive outcomes** | 1–2 wk + gate wait |

## Three threads

- **Engine (ENG):** turn the retrieval-then-heuristics system into a learning system. ENG-1: multi-interest centroids (K ≤ 3), avoid-set negative scoring, exploration slot, training-extract groundwork. ENG-2: logistic-regression re-ranker over `card_impressions` → outcomes (62.5/25/12.5 becomes the fallback, not the law).
- **Platform (PLAT):** PLAT-1 TanStack Query + code-split (`React.lazy` only, D5) + TanStack Virtual + image lazy-load + Zustand; PLAT-2 Cloudflare Workers + Hono proxy (TMDb/OMDB keys out of the client bundle, CDN-cached `/v1/title|discover|search|trending`); PLAT-3 one server-side engine (`GET /v1/foryou` Worker importing `src/lib/recommendations-v2/` directly), feed cache keyed `userId : taste_vector_updated_at : sliderHash`, deletion of the ADR-011 mirror + `shared-tree-drift` + parity apparatus + `warmup-foryou` + the 1.5s fallback dance.
- **Hygiene (REPO):** bounded docs/scripts/test/lint cleanup landing before PLAT-1; thereafter every phase checklist ends with an in-phase bloat sweep.

## §9 locked decisions (D1–D6, confirmed by Joe 2026-06-10)

| # | Decision |
|---|---|
| D1 | ENG-1 before PLAT-3 — pay the `_shared/` mirror tax one final time (mechanical, CI-protected) |
| D2 | Cloudflare Workers + Hono for proxy + feed (zero cold starts; wrangler bundles from anywhere in the repo, dissolving ADR-011) |
| D3 | Interest-centroid K fixed at 3; adaptive K is ENG-2-era |
| D4 | Client pipeline kept as fallback for **one release after PLAT-3 cutover, then deleted**; ADR required (supersedes ADR-011 + ADR-012) |
| D5 | No router in PLAT-1 — `React.lazy` + Suspense only; tab-state + Capacitor back-button stack stays |
| D6 | Worker code in a plain `workers/api/` folder (created in REPO-1); workspace split only if a second app target appears |

## Cost impact (§10)

£0 until PLAT-3; from PLAT-3 one new line item ~£4/mo (Workers Paid — feed assembly exceeds the free 10ms CPU cap). Relief elsewhere: CDN-cached proxy defers the paid OMDB tier; PLAT-3 removes warmup pings + Edge invocations and cuts Supabase egress.

## Explicitly not in the track (§11)

v3/Phase 7 (still gated on v2 metrics baseline), collaborative filtering (<10K MAU stands), two-tower (<50K MAU + 6mo), embedding model/template swap (ADR-004 lock stands), LLM-as-ranker, React Native rewrite, mood-room expansion / v2.5 deferred items.

## Why it matters

Defines the current roadmap — the [next-steps register](../registers/next-steps.md) is built around it, the [acceptance-gates register](../registers/acceptance-gates.md) carries its §5.3/§6.4/§7.3/§8.1 criteria, and orchestration v0.8 §11 records the lock. ENG-1 and REPO-1 are complete (both 2026-06-10, single-day phases); PLAT-1 is next.
