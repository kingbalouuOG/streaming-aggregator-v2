---
title: Deferred items register
type: register
tags: [register, deferred, parked, post-v2, v2-5, v3]
created: 2026-04-26
updated: 2026-06-10
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/v2-strategy/Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.3.md
  - raw/v2-strategy/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md
  - raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md
  - raw/phase-summaries/phase-3-summary.md
  - raw/phase-summaries/phase-4-summary.md
  - raw/forward-planning/Videx_v3_Conversational_Discovery_Semantic_Search_Strategy_v0_1.md
related:
  - wiki/registers/parking-lot.md
  - wiki/registers/open-questions.md
  - wiki/registers/pre-launch-blockers.md
  - wiki/concepts/forward-planning/v3-conversational-discovery.md
  - wiki/concepts/forward-planning/monetisation-strategy.md
---

# Deferred items register

Things explicitly parked, with the trigger to revisit each. Distinct from [pre-launch blockers](pre-launch-blockers.md) (which must happen) and [open questions](open-questions.md) (which need validation).

## v2.5

| Item | Source | Trigger |
|---|---|---|
| Dedicated mood rooms browse surface (grid of all 30-60 rooms) | Strategy v1.6.3 §5.2; Composition Hypothesis v0.3 §3.6 | Once "Mood Rooms for Tonight" row engagement data is in. |
| Save for Later distinction (vs Watchlist) | Detail Page Signal Capture Spec v0.3.2 §2.8 | Onboarding/design tests surface a clear need. |
| iOS launch | Strategy v1.6.3 (Capacitor section); risks register R-012 | Android v1.0 ships and stabilises. |
| Spend Dashboard slider keyboard alternative | Accessibility checklist "Known gaps" | Pre-web-launch revisit. |
| `SliderTray` keyboard fallback | Accessibility checklist "Known gaps" | Pre-web-launch revisit. |

## Phase 5 (locked but not started)

| Item | Source | Trigger |
|---|---|---|
| Contextual scorer (replace `contextual.ts` placeholder returning 0.5) | Strategy §7.2 Phase 5; Phase 4 summary | Phase 5 kick-off. Re-evaluate 62.5/25/12.5 weight split when shipped. |
| MMR upgrade (currently genre-spread + taste-cluster secondary signal) | Phase 4 summary; Strategy §3.5 | Phase 5; pluggable signature already designed. |
| Hidden Gems threshold tuning (from observed engagement) | Phase 4 summary | Phase 5+, tune from real data. |
| Shared candidate pool size 500 — investigate 300 sufficiency | Phase 4 summary | Phase 5 perf review. |
| `useForYouContent` tab-switch preservation (IN-462) | Parking-lot IN-462 | Phase 5. |
| Phase 1.5 Videx tags (LLM-generated semantic enrichment) | Strategy §7.2 | When prioritised; no sequencing dependency. |

## Phase 5/6 cleanup

| Item | Source | Trigger |
|---|---|---|
| Consolidate `watched` / `marked_watched` and `removed` / `watchlist_remove` event types | Parking-lot IN-PX-02; Phase 4 summary | Phase 5/6 cleanup. CHECK constraint accepts both today. |
| Supabase `<Database>` generic on shared client | Phase 3 summary; Phase 4 summary | Phase 5/6 cleanup. 47 pre-existing errors across 6 files. |
| Availability page-count adaptive strategy (currently 20 parallel pages unconditionally) | Phase 4 summary | At ~100K titles before silent truncation. |
| `getAvailableTmdbIds` does not distinguish by `media_type` | Parking-lot IN-458 | Phase 5+. |
| Director extraction widening to `credits.crew[]` "Series Director" (IN-PX-06) | Phase 0.5 summary; Phase 1 cluster eval | Only if a future template revision adds director. |
| Director row-count gate split by `media_type` (IN-PX-07) | Phase 0.5 summary | Policy change for future phase briefs; no code impact. |
| Drop `title_genres` and `title_credits` empty tables | Strategy §4.0; ADR-008 | ✅ **Done (REPO-1, 2026-06-10)** — migration `046_drop_title_genres_credits.sql` written; awaiting Joe's apply (production DDL is an explicit-Joe action). |

## Post-v2 / v3

| Item | Source | Trigger |
|---|---|---|
| Conversational discovery (Pillar 4) | Strategy §2 Pillar 4, §7.2 Phase 7; v3 forward-planning doc | After v2 ships and Tier 1 metrics baseline established. Proposed: Graphiti + Kuzu embedded knowledge graph. |
| Recommendation explanation via knowledge graph | v3 forward-planning doc | Same as conversational discovery (shared infrastructure). |
| Natural-language search via knowledge graph | v3 forward-planning doc | Same. |
| Mood rooms as user-shareable "list-rooms" | Strategy §8.3 deferred strategic questions | After mood rooms are proven. |
| Collaborative filtering | Strategy §5.3, §8.3 | ~10K MAU with regular activity. |
| Train own item tower (two-tower neural model) | Strategy §5.3, §8.3 | ~50K MAU with 6+ months of interaction data. |
| Arthouse coverage (MUBI, BFI, Curzon) — broader integration | Strategy §8.3 | Later strategic question. |

## Discharged (will not do)

| Item | Source | Why |
|---|---|---|
| Exclusivity-weighted service fingerprints (`v2_exclusivity` variant) | Phase 2.6 decision; parking-lot IN-260 | Tested. 5/13 services improved (gate ≥ 8 failed). 8 mainstream services degraded. Code retained for re-runnable experiment but variant not shipped. |
| Hybrid HDBSCAN + k-means on noise (mood rooms coverage workaround) | Strategy §5.2; Phase 4.5 | Would buy coverage at cost of incoherent synthetic rooms. Quality prioritised over coverage. |
| Phase 6.5 dedicated cleanup phase | Strategy §7.2; ADR-007; orchestration v0.3.3 | v1 archived as Git tag (not parallel-run); cleanup happens in-phase. |
| Feature flag infrastructure | Strategy §5.3; ADR-007 | Two prototype users; not needed. |
| A/B rollout framework | Strategy §5.3 | Same. |
| Migration path for v1 users | Strategy §5.3 | Two prototype users re-onboard on v2 at cutover. |
| Quiz subsystem (24D handcrafted quiz) | Strategy §4.2 (v1 → v2 weights table); Phase 3 summary; ADR-004 | Replaced by 5-step onboarding (watched-grid + cluster + sliders). 15 files deleted in Phase 3 (~5,227 lines). |
| Server-side `match_titles_by_vector_v2` for "More Like This" | Strategy §5.2 alternatives considered | Splits scoring across TS/SQL; invites divergence bugs. Batch query + client-side cosine wins. |
| Simplified client-side heuristic for "More Like This" without taste vector | Strategy §5.2 alternatives considered | Regression from v1. |
| Scroll depth as recommendation signal | Strategy §4.1 deferred signals; Detail Page Signal Spec §3.3 | Deferred to post-v2. |
| Trailer playback signal | Strategy §4.1 | Not applicable — Videx has no in-app trailers. |
| "Back-from-rec bounces" as separate signal | Strategy §4.1 | Subsumed into dwell + exit outcome model. |
| Share signal in weight tables | Strategy v1.6 changelog; detail page spec v0.3.1 | Not implementable in v1 codebase (no share button). |
| Per-signal toggles in UI | Detail Page Signal Capture Spec §1.2 | Add UX friction and invite paranoia without improving outcomes. |
| "Pause learning" mode | Detail Page Signal Capture Spec §8.6 | Deferred. |
| Partial watch / progress tracking | Detail Page Signal Capture Spec §8.7 | Binary only for v2; "From Your Watchlist" row meets the equivalent need. |
| Continue-watching tracking (per-episode state) | Composition Hypothesis v0.3 §2.4, §9.11 | Not in v2; would require progress tracking infrastructure. |
| `dismissRecommendation`, `isDismissed`, `cleanExpiredDismissals`, `getDismissedRecommendations` (localStorage v1 dismissal API) | Detail Page Signal Capture Spec §2.7 step 4; Phase 0 summary | Deleted Phase 0; replaced by `not_interested` event in `user_interactions`. |
| Special handling for single-service users | Composition Hypothesis v0.3 §2.5; Q6 §7 | Edge case in UK market; not target audience. |

## Parked (revisit on trigger)

| Item | Trigger |
|---|---|
| Curation-based fingerprint refinement (IN-261) | If Phase 3 cold-start underperforms for mainstream-service users. |
| Pre-built onboarding watched-grid title pool (IN-XPS-008) | After user testing validates whether dynamic approach is good enough. |
| Retake Taste Profile beyond cluster selection (IN-XPS-009) | Phase 4/5 touches the relevant files OR user feedback indicates retake quality is a problem. |
| Mood room coverage re-evaluation (IN-459) | After 3 monthly clustering runs (post-launch). |
| `actions/setup-python` upgrade (IN-460) | When v6 ships (Node.js 20 deprecation). |
| `FORBIDDEN_WORDS` compound-noun carve-outs review (IN-461) | After May 2026 cron. |
| "Updated your recommendations" feedback toast | If users ask "is this doing anything?" |

## Categorisation summary

| Bucket | Count |
|---|---|
| v2.5 | 5 |
| Phase 5 | 6 |
| Phase 5/6 cleanup | 7 |
| Post-v2 / v3 | 7 |
| Discharged (will not do) | 17 |
| Parked (trigger-based) | 7 |
| **Total** | **49** |
