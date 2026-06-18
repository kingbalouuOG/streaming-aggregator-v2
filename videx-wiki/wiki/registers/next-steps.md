---
title: Next steps — internal-testing rollout → ENG-2
type: register
tags: [register, next-steps, internal-testing, search-semantic, eng-2, roadmap, native, launch]
created: 2026-04-26
updated: 2026-06-18
sources:
  - raw/v2-strategy/Videx_v2_Engine_and_Platform_Hardening_Brief_v0.2.md
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.8.md
  - raw/phase-summaries/phase-repo-1-summary.md
  - raw/phase-summaries/phase-eng-1-summary.md
  - raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_v0.7.md
  - docs/v2/native-4-cutover-runbook.md
related:
  - wiki/sources/ep-hardening-brief-v0-2.md
  - wiki/registers/pre-launch-blockers.md
  - wiki/registers/deferred-items.md
  - wiki/registers/acceptance-gates.md
  - wiki/registers/parking-lot.md
  - wiki/concepts/operations/phase-eng-1.md
  - wiki/concepts/operations/phase-repo-1.md
  - wiki/concepts/operations/phase-search-v2.md
  - wiki/concepts/operations/phase-history.md
---

# Next steps

The E&P Hardening track is **complete**: ENG-1 ✅ → REPO-1 ✅ → PLAT-1 ✅ → PLAT-2 ✅ → PLAT-3 ✅ → UX-1 ✅. The **NATIVE track is CLOSED** — the RN/Expo app is the live product (NATIVE-4 cutover done: app id `app.videx.streaming`, v2.0.0). The roadmap now is: **internal-testing rollout → ENG-2 (data-gated)**, then v3 / Phase 7.

## Now — internal-testing rollout

The app is the live product; the gating work is getting real users onto it and clearing the remaining launch blockers before a wider release.

| # | Task | Status |
|---|---|---|
| 1 | Internal-testing track on Play Console | The v2.0.0 release (app id `app.videx.streaming`, release-keystore signing per the [cutover runbook](../../../docs/v2/native-4-cutover-runbook.md)) goes to an internal/closed test track first. Real-traffic engagement here is what feeds the ENG-2 gate and the `search_semantic` fixture decision. |
| 2 | Clear hard launch blockers | The [pre-launch blockers register](pre-launch-blockers.md) still gates a **public** release — headline: IN-XPS-014 (UK solicitor review of Privacy Policy/ToS, hard blocker). Internal testing can proceed in parallel; public cannot. |
| 3 | NATIVE-4 docs sweep + deferred polish | Runbook §6 "Remaining" — docs sweep + a few deferred items; none block the cutover mechanics. |
| 4 | Feedback-loop triage | `app_feedback` (migration 047) + the native FeedbackSheet are live; internal-tester feedback lands here (service-role triage reads). |

## `search_semantic` global-flip gate

Semantic mood search ships **behind the per-user `search_semantic` flag** (composite-PK `user_feature_flags`, migration 041) and is on for Joe/prototype users only. Native Browse moods route through it; **flag OFF falls back to the deterministic mood-filter presets** (see [Phase Search V2 native port](../concepts/operations/phase-search-v2.md#native-port-native-track--live-app)).

| Gate | Status |
|---|---|
| Shipped eval gate — `scripts/search/eval-moods.ts` | ✅ The native mood-quality floor mirrors it; it is the validation gate for the mood→vector path. |
| Broader flip gate — **IN-PX-40** (20-query semantic-eval fixture) | ⏳ Joe-owned. Gates the flip from Joe/prototype-only to all internal testers (and beyond). The B6 search-semantic fixture is still a 2-query stub. |
| IN-PX-41 — flag-flip UI surface or documented runbook | ⏳ Decide pre-rollout. |

## Done — E&P Hardening track + NATIVE cutover

Closed phases (full detail in [phase-history](../concepts/operations/phase-history.md)):

| Phase | Outcome |
|---|---|
| ENG-1 ✅ | Multi-interest retrieval (K≤3 `user_interest_centroids`, migration 044); `v_training_examples` (045) = the ENG-2 dataset shape. |
| REPO-1 ✅ | Hygiene + lint rules; migration 046 dropped empty `title_genres`/`title_credits`; `workers/api/` stub. Merged to main. |
| PLAT-1 ✅ | TanStack Query as the single server-state layer; code-splitting; virtualization; Zustand store. Landed via PR #16. |
| PLAT-2 ✅ | `videx-api` Cloudflare Worker — TMDb/OMDB proxy; keys server-side only (client bundle provably keyless). First non-Supabase production surface. |
| PLAT-3 ✅ | Single engine — `GET /v1/foryou` on the Worker imports `recommendations-v2/`/`taste-v2/` directly. **[ADR-014](../concepts/decisions/adr-014-single-server-engine.md)** supersedes ADR-011/012; the `_shared/` mirror + drift CI dissolved (the final parity run caught real month-old mirror drift). |
| UX-1 ✅ | First-load flash/twitch fixes (frame-forensics method); keep-alive tabs for Home + For You. |
| NATIVE-1→4 ✅ (track CLOSED) | RN/Expo rebuild (WebView perf ceiling: native p99 15ms vs Capacitor 57ms). Shipped the lazy service-badge resolver, Browse pre-search + filter-only `/discover` + semantic mood search, the in-app feedback loop (FeedbackSheet + `app_feedback` 047), loading skeletons, nav refinement. **NATIVE-4 cutover:** app id → `app.videx.streaming`, v2.0.0, release-keystore signing. |

## Phase 6 / public launch — remaining (parallel track)

The release **mechanics** (release keystore + `signingConfigs.release`, versionCode/Name bump to v2.0.0, app-id flip) are handled by the [NATIVE-4 cutover](../../../docs/v2/native-4-cutover-runbook.md). What remains gates a **wider public** release beyond internal testing: run the [pre-launch blockers register](pre-launch-blockers.md) (14 open at last refresh — headline: IN-XPS-014 UK solicitor review of Privacy Policy/ToS, hard blocker). Still open: `username_available` rate-limit (IN-PX-29), `extractUserIdFromJwt` defence-in-depth (IN-PX-30), cryptographic service-role JWT rotation (IN-XPS-004, pending Supabase tooling), IN-PX-50 (scheduled catalogue-gap backfill Edge Function). Apply `040_editor_notes.sql` before any editorial features go live.

## ENG-2 — Learned re-ranker (data-gated; lands last)

**Do not start before the gate: ≥5–10K impressions with ≥500 positive outcomes** in `v_training_examples` (real internal-testing / launch traffic — a model trained on two prototype users is noise). Brief §8. This is the payoff of the internal-testing rollout above.

| Task | Notes |
|---|---|
| Logistic regression v1 over existing pipeline features | Position included at training for debias, dropped at serve. GBDT only if LR plateaus. |
| Nightly training via GitHub Actions (HDBSCAN cron precedent) | Artifact = weights JSON in Supabase/KV; Stage-2 scorer loads it, falls back to 62.5/25/12.5 constants. |
| Offline eval before any serve change | AUC/NDCG vs fixed weights on a held-out week; dated eval doc per house convention. |
| Exploration CTR read | `exploration=true` impressions vs row baseline (ENG-1 tagging). |
| Observability | Per-row CTR / save-rate dashboard (`supabase/queries/` pattern). |
| Era refinements unlocked | Adaptive K (D3), recall@500 measurement at scale (carried from ENG-1), IN-PX-56 media_type decision if evals show the 0.8% noise matters. |

## Standing / time-triggered

| Trigger | Action |
|---|---|
| Any time (Joe-owned) | IN-PX-55: expand cluster rep lists to ~8–10 per cluster; re-run `eval:eng1` §A. IN-PX-40: author the 20-query semantic-eval fixture (gates the `search_semantic` flip beyond Joe/prototype users — see the global-flip gate above). |
| First month tick-over | Verify pg_partman auto-creates partitions (IN-XPS-003). |
| 3 monthly mood-room recluster runs | Re-evaluate coverage (IN-459). |
| `actions/setup-python` v6 ships | Upgrade workflow YAML (IN-460). |
| May 2026 cron *(overdue — check)* | Review `FORBIDDEN_WORDS` carve-outs (IN-461). |
| Quarterly | Refresh `platformPricing.ts` (IN-XPS-007) + provider IDs in `platforms.ts`. |

## Explicitly later

See [deferred items](deferred-items.md) — v2.5 cluster, v3/Phase 7 conversational discovery (still gated on the v2 metrics baseline from real traffic), CF at ~10K MAU, two-tower at ~50K MAU.
