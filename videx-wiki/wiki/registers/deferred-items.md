---
title: Deferred items register
type: register
tags: [register, deferred, parked, post-v2, v2-5, v3, e-p-track]
created: 2026-04-26
updated: 2026-06-10
sources:
  - raw/v2-strategy/Videx_v2_Engine_and_Platform_Hardening_Brief_v0.2.md
  - raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_v0.7.md
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.8.md
  - raw/v2-strategy/Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.4.md
  - raw/v2-strategy/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md
  - raw/phase-summaries/phase-5-summary.md
  - raw/phase-summaries/phase-5.5-summary.md
  - raw/phase-summaries/phase-search-v2-summary.md
  - raw/phase-summaries/phase-eng-1-summary.md
  - raw/phase-summaries/phase-repo-1-summary.md
  - raw/codebase-snapshots/database-schema-snapshot.md
related:
  - wiki/registers/parking-lot.md
  - wiki/registers/open-questions.md
  - wiki/registers/pre-launch-blockers.md
  - wiki/registers/next-steps.md
  - wiki/sources/ep-hardening-brief-v0-2.md
  - wiki/concepts/forward-planning/v3-conversational-discovery.md
  - wiki/concepts/forward-planning/monetisation-strategy.md
---

# Deferred items register

Things explicitly parked, with the trigger to revisit each. Distinct from [pre-launch blockers](pre-launch-blockers.md) (must happen) and [open questions](open-questions.md) (need validation). Refreshed 2026-06-10 against Phases 5 → REPO-1 + the E&P brief.

## Scheduled by the E&P track (deferred to a named phase)

| Item | Source | Lands at |
|---|---|---|
| Client recommendation pipeline deletion (keep as offline/error fallback first) | E&P brief §9 D4, §7.2 | **One release after PLAT-3 cutover**, then delete. ADR at PLAT-3 supersedes ADR-011 + ADR-012. |
| `_shared/` mirror + `shared-tree-drift` + `foryou-parity` + `warmup-foryou` deletion | E&P brief §7.2 | PLAT-3 (parity probe runs once as final validation, then retires). |
| Adaptive interest-centroid K (K fixed at 3 for now) | E&P brief §9 D3 | ENG-2 era. |
| Recall@500 measurement (carried forward from the ENG-1 eval — unmeasurable at 2-prototype-user scale) | eng1-eval 2026-06-10 | ENG-2 data gate (≥5–10K impressions). |
| IN-PX-56 — `card_impressions.media_type` (0.8% training-extract collision class; pairs with IN-458) | Parking lot v0.7 ENG-1 section | ENG-2, only if its evals show the noise matters. |
| IN-PX-57 — exploration seen-set recent-1000 cap (exact at prototype scale) | Parking lot v0.7 ENG-1 section | Post-launch telemetry; likely absorbed by PLAT-3's SQL anti-join. |
| IN-462 — For You tab-switch preservation via store | Parking lot | Absorbed by PLAT-1's Zustand app-state store. |
| IN-PX-32 / IN-467 — mirror-tree consolidation | Parking lot | Superseded by PLAT-3 (one engine — no mirror to consolidate). |
| `editor_notes` apply (`040_editor_notes.sql`, in repo NOT applied) | Orchestration v0.8 §3.4 | Before Phase 6 editorial features go live. |
| IN-PX-50 — scheduled catalogue-gap backfill Edge Function | Parking lot v0.7 | Phase 6 automation. |
| IN-PX-52 — Edge `_shared/database.types.ts` regen | Parking lot v0.7 | Phase 6 — but PLAT-3 deletes the `_shared/` tree; check before doing the work. |
| IN-PX-53 — Safari mobile embedding-cache quota (compress or cap top-100) | Parking lot v0.7 | Phase 6+ / pre-web-launch. |

## Engine items deferred on real-usage data

| Item | Source | Trigger |
|---|---|---|
| Hidden Gems threshold tuning (still Phase 3 values) | Phase 4 summary | Post-launch observed engagement. |
| Shared candidate pool size 500 — investigate 300 sufficiency | Phase 4 summary | PLAT-3 perf review (server-side feed makes measurement easy). |
| Stage-2 weight re-evaluation (62.5/25/12.5) | Phase 4/5 summaries; E&P brief §8 | ENG-2 — the learned re-ranker makes the fixed split the *fallback*, not the law. |
| Search-as-signal Level 2 (embed query into taste vector, IN-PX-44) | Search V2 close | After IN-PX-40 fixture lands (ground truth on embedding quality first). |
| Search-as-signal Level 3 (IN-PX-45) | Search V2 close | Phase 7 pipeline. |
| Phase 1.5 Videx tags (LLM semantic enrichment) | Strategy §7.2 | When prioritised; no sequencing dependency. |
| `watched`-era event-type cleanup remainder (`removed` / `watchlist_remove` consolidation) | Parking-lot IN-PX-02 | Phase 6 cleanup. `marked_watched` already dropped (migration 037). > ⚠ unverified — current CHECK-constraint membership of `removed` not re-checked this pass. |

## v2.5

| Item | Source | Trigger |
|---|---|---|
| Dedicated mood rooms browse surface (grid of all global rooms) | Strategy §5.2; Composition Hypothesis v0.4 §3.6 (uses **global** HDBSCAN rooms, not anchored) | Once anchored-row engagement data is in. |
| Save for Later distinction (vs Watchlist) | Detail Page Spec v0.3.2 §2.8 | Onboarding/design tests surface a clear need. |
| iOS launch | Strategy (Capacitor section); risks register R-012 | Android v1.0 ships and stabilises. (Would also fix the Prime Video deep-link gap — Universal Links work on iOS.) |
| Spend Dashboard slider keyboard alternative | Accessibility checklist | Pre-web-launch. |
| `SliderTray` keyboard fallback | Accessibility checklist | Pre-web-launch. |

## Post-v2 / v3 (thresholds reaffirmed by E&P brief §11, 2026-06-10)

| Item | Source | Trigger |
|---|---|---|
| Collaborative filtering | Strategy §5.3/§8.3; E&P brief §11 | **~10K MAU** with regular activity — unchanged. |
| Train own item tower (two-tower neural model) | Strategy §5.3/§8.3; E&P brief §11 | **~50K MAU + 6 months interaction data** — unchanged. |
| Embedding model/template swap (taste-vs-text-semantics gap) | E&P brief §11; ADR-004 | Lock stands; the fix (learned projection on co-engagement pairs) needs users first. |
| Conversational discovery (Pillar 4 / Phase 7 / v3 — Graphiti + Kuzu) | Strategy §2/§7.2; v3 forward-planning doc | After v2 ships + Tier 1 metrics baseline. Untouched by the E&P track. |
| Recommendation explanation + NL search via knowledge graph | v3 forward-planning doc | With conversational discovery (shared infra). |
| Mood rooms as user-shareable "list-rooms" | Strategy §8.3 | After mood rooms are proven. |
| Arthouse coverage (MUBI, BFI, Curzon) | Strategy §8.3 | Later strategic question. |

## Done since last refresh (kept one cycle for the record)

| Item | Resolution |
|---|---|
| Drop `title_genres` + `title_credits` | ✅ **Done — migration 046 (REPO-1) written 2026-06-10 and applied** (regenerated schema snapshot is a live production pull post-046). |
| Contextual scorer (placeholder 0.5) | ✅ Phase 5 — real three-component scorer (time 40 / viewing 40 / device 20). |
| MMR upgrade (genre-spread interim) | ✅ Phase 5 — MMR over 1536D embeddings; genre-spread retained as fallback (5.5 added partial-coverage bail). |
| Supabase `<Database>` generic | ✅ Phase 5 (52 errors closed) + Phase 5.5 typegen-check CI. |
| IN-465 backfill (~3,807 → 5,446 missing tmdb_ids) | ✅ Phase 5.5 C18 — 2,698 upserted, 2,748 TMDb-404 (stay missing, correct). Recurring half → IN-PX-50. |
| Negative weights into the taste vector | ✅ Removed — ENG-1 Workstream B (avoid set replaces them). |

## Discharged (will not do)

| Item | Source | Why |
|---|---|---|
| Exclusivity-weighted fingerprints (`v2_exclusivity`) | Phase 2.6 decision; IN-260 | Variance gate FAIL (5/13, needed ≥8); 8 mainstream services degraded. Code retained as re-runnable experiment. |
| Hybrid HDBSCAN + k-means on noise | Strategy §5.2; Phase 4.5 | Coverage at the cost of incoherent synthetic rooms; quality prioritised. |
| Phase 6.5 dedicated cleanup phase | ADR-007; orchestration | Cleanup in-phase; E&P brief adds the standing in-phase bloat sweep. |
| Feature-flag *infrastructure* / A/B rollout framework | Strategy §5.3; ADR-007 | Two prototype users. (Per-user `user_feature_flags` table from Search V2 is the lightweight pattern instead.) |
| Migration path for v1 users | Strategy §5.3 | Prototype users re-onboard. |
| Quiz subsystem (24D handcrafted) | Strategy §4.2; ADR-004 | Deleted Phase 3 (15 files, ~5,227 lines). |
| Server-side `match_titles_by_vector_v2` for "More Like This" | Strategy §5.2 alternatives | Batch query + client-side cosine wins. |
| Simplified non-taste "More Like This" heuristic | Strategy §5.2 alternatives | Regression from v1. |
| Scroll depth / trailer playback / back-from-rec-bounce signals | Strategy §4.1; Detail Page Spec | Post-v2 / not applicable / subsumed into dwell+exit. |
| Share signal in weight tables | Strategy v1.6 changelog | No share button in codebase. |
| Per-signal toggles UI / "Pause learning" mode | Detail Page Spec §1.2, §8.6 | UX friction without outcome improvement / deferred. |
| Partial watch / progress / continue-watching tracking | Detail Page Spec §8.7; Composition v0.4 §2.4 | Binary only for v2; "From Your Watchlist" meets the need. |
| v1 localStorage dismissal API | Detail Page Spec §2.7; Phase 0 | Deleted Phase 0; `not_interested` event replaced it. |
| Special handling for single-service users | Composition v0.4 §2.5 | Edge case; not target audience. |
| LLM-as-ranker for the core feed | E&P brief §11 | Slow, expensive, worse than the pipeline at ranking. |
| React Native rewrite | E&P brief §11 | Stay Capacitor; PLAT-1 closes most of the perceived-performance gap. |

## Parked (revisit on trigger)

| Item | Trigger |
|---|---|
| IN-PX-55 — expand cluster rep lists (~8–10 per cluster, Joe-owned curation; re-run `eval:eng1` §A after) | Any time pre-launch; pairs with ENG-2-era bootstrap review. |
| IN-PX-40 — 20-query semantic-eval fixture (Joe-owned) | Gates `search_semantic` flag-flip beyond Joe. |
| Curation-based fingerprint refinement (IN-261) | If cold-start underperforms for mainstream-service users. |
| Pre-built onboarding watched-grid title pool (IN-XPS-008) | After user testing of the dynamic approach. |
| Retake Taste Profile beyond cluster selection (IN-XPS-009) | Relevant files touched OR retake-quality feedback. |
| Mood room coverage re-evaluation (IN-459) | After 3 monthly clustering runs (post-launch). |
| `actions/setup-python` upgrade (IN-460) | When v6 ships. |
| `FORBIDDEN_WORDS` carve-outs review (IN-461) | After May 2026 cron *(now due)*. |
| "Updated your recommendations" feedback toast | If users ask "is this doing anything?" |
| IN-464 — detail-page "Make a room from this title" | Phase 6+. |
| IN-468 — Variant B SWR For You snapshot | Superseded in spirit by PLAT-3's feed cache; revisit only if PLAT-3 slips and warm p95 > 1.0s. |
| IN-OB-006 — onboarding cluster taxonomy review | After 3 months of anchored-rooms telemetry (Phase 6 review). |

## Categorisation summary

| Bucket | Count |
|---|---|
| Scheduled by the E&P track | 12 |
| Engine items on real-usage data | 7 |
| v2.5 | 5 |
| Post-v2 / v3 | 7 |
| Done since last refresh | 6 |
| Discharged (will not do) | 16 |
| Parked (trigger-based) | 12 |
