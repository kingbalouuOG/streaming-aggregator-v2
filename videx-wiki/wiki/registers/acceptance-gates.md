---
title: Acceptance gates and thresholds
type: register
tags: [register, gates, thresholds, acceptance, evaluation, e-p-track]
created: 2026-04-26
updated: 2026-06-10
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.8.md
  - raw/v2-strategy/Videx_v2_Engine_and_Platform_Hardening_Brief_v0.2.md
  - raw/reference/eval-harness-reference.md
  - raw/phase-summaries/Videx_v2_Phase_0_5_End_of_Phase_Summary.md
  - raw/phase-summaries/phase-1-summary.md
  - raw/phase-summaries/phase-2-summary.md
  - raw/phase-summaries/phase-2.6-summary.md
  - raw/phase-summaries/phase-4-summary.md
  - raw/phase-summaries/eng1-eval-2026-06-10.md
  - raw/phase-summaries/phase-repo-1-summary.md
  - raw/runbooks/monthly-mood-room-recluster.md
related:
  - wiki/concepts/operations/eval-harness.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/operations/phase-eng-1.md
  - wiki/concepts/operations/phase-repo-1.md
  - wiki/sources/ep-hardening-brief-v0-2.md
  - wiki/sources/eng1-eval-2026-06-10.md
---

# Acceptance gates and thresholds

Every numerical threshold or pass/fail rule the wiki references, in one scannable place. Refresh when a phase summary or eval changes a threshold. E&P-track gates (2026-06-10 →) first, historical phase gates below.

## Phase ENG-1 — Eval gate (brief §3.6) — **PASSED** (2026-06-10, runs 1 + 2)

| Check | Gate | Result | Status |
|---|---|---|---|
| Coverage (multi-modal profile, top-20 distinct source interests) | ≥ 2 | **3** (single-centroid baseline leans 2) | ✅ PASS |
| `foryou-parity` probe vs live ENG-1 Edge | green | Determinism across consecutive calls (validates daily-seeded exploration), zero filter leaks, zero cross-row dupes; golden regenerated once | ✅ PASS |
| Avoid-set suppression, γ swept {0.10, 0.15, 0.20} | measurable suppression, zero positive regression | Full suppression at every γ; 0 positive Δ; **γ = 0.15 kept** | ✅ PASS |
| τ merge threshold from data (16-cluster pairwise matrix) | picked from data | Max pair 0.7532; zero merges at 0.80; **τ = 0.80 kept** (K-cap does the merging) | ✅ |
| Recall@500 multi ≥ single | strictly better on multi-modal profiles | 0/2 vs 0/2 — not meaningful at n=2; real profile below 10-positive floor | ↪ **Carried forward, not blocking** — honest at the ENG-2 data gate |
| `rank-eval.ts` + vitest | green throughout | Green; 40 new ENG-1 tests | ✅ |

## Phase REPO-1 — Acceptance (brief §4.5) — **MET** (2026-06-10)

| Criterion | Result |
|---|---|
| `npm test` single entry, green; bespoke tsx `test:*` gone | ✅ 146/146 across 14 files; 7 script entries deleted |
| `npm run lint` green; `no-explicit-any` at **error** | ✅ 0 errors after 72→0 burn-down (73 warnings: pre-existing exhaustive-deps + relaxed scripts profile) |
| No duplicate/orphaned docs | ✅ Dupes deleted, eval docs single-homed, script writers repointed |
| Wiki lint: zero unresolved contradictions | ✅ 10/10 resolved; 4 registers rebuilt at the 2026-06-10 re-snapshot ingest |
| `docs/CONVENTIONS.md` exists, linked from README | ✅ |

## Phase PLAT-1 — Acceptance (brief §5.3) — pending

| Criterion | Gate |
|---|---|
| Initial JS chunk | ≥ 30% reduction of eagerly-loaded JS (before/after from `vite build`) |
| Device cold-start | Before/after measured on the test phone |
| Request dedup | Zero duplicate concurrent identical requests on Home → Detail → Back → Detail |
| Virtualization | 500-item synthetic watchlist scrolls without jank |
| Behaviour | **No ranking change** — For You/Home output identical |

## Phase PLAT-2 — Acceptance (brief §6.4) — pending

| Criterion | Gate |
|---|---|
| Key removal | `grep` of `dist/` shows no TMDb/OMDB keys |
| Cache | Worker analytics shows high cache-hit ratio on `/v1/title/*` once warm |
| Latency | p95 detail-page data latency ≤ direct-to-TMDb baseline |
| Client third-party volume | TMDb/OMDB requests from clients ~zero |

## Phase PLAT-3 — Acceptance (brief §7.3) — pending

| Criterion | Gate |
|---|---|
| For You p95 first-paint | ≤ current warm-Edge path; **cold-start outliers (5–12s) eliminated as a category** |
| Parity | Probe green on final pre-cutover run (then retired) |
| Feed cache | Hit ratio measured; repeat loads within TTL (15–30 min) serve from cache |
| Simplification | LOC/CI deleted tracked in the phase summary as a first-class deliverable |

## Phase ENG-2 — Data gate + ship gate (brief §8) — waiting on launch traffic

| Gate | Threshold |
|---|---|
| **Data gate (do not start before)** | **≥ 5–10K impressions with ≥ 500 positive outcomes** (click/watchlist/deep-link) in `v_training_examples` |
| Ship gate | Offline AUC / NDCG vs the fixed-weight scorer on a held-out week — ship only if better; dated eval doc |
| Exploration read | CTR on `exploration=true` vs row baseline (tagging live since ENG-1) |

## Phase 0.5 — Content enrichment row-count gates

| Field | Gate | Phase 0.5 result | Status |
|---|---|---|---|
| `keywords` populated | ≥ 80% | 100.0% | ✅ |
| `cast_top_5` populated | ≥ 80% | 100.0% | ✅ |
| `runtime` populated | ≥ 80% | 81.4% | ✅ |
| `director` overall | ≥ 80% (legacy) | 77.2% | ⚠ Miss; accepted as structural TV gap. Policy split per IN-PX-07. |
| `director` movies | ≥ 95% (proposed split) | 99.7% | ✅ |
| `director` TV | best-effort, no floor | 54.9% | accepted |
| `content_rating` populated | ≥ 60% (brief tolerance) | 65.4% | ✅ |

## Phase 1 — Cluster coherence eval

| Metric | Threshold | Phase 1 result | Status |
|---|---|---|---|
| Within-cohort mean cosine | ≥ 0.5 | 0.4714 (Nolan, weakest) | ⚠ Conditional pass — director-driven cohort, director not in template |
| Between-cohort baseline | ≤ 0.3 | 0.5152 (mean) | ⚠ Conditional pass — action-adjacent cohorts share genuine genre overlap |
| Gap (min within − max between) | ≥ 0.2 | −0.2206 | ⚠ Negative due to Nolan × MCU (0.69) |
| Control set mean cosine | ≤ 0.3 | 0.3033 | ⚠ Marginal — at boundary; reflects baseline embedding-space similarity |

Verdict: CONDITIONAL PASS. 4/5 real cohorts pass within-cohort; Nolan miss expected (director not in template); between-cohort threshold of 0.3 unrealistic for genre-overlapping cohorts.

## Phase 2 / 2.5 — Service discrimination eval

| Metric | Threshold | 10-service (P2) | 13-service (P2.5) | Status |
|---|---|---|---|---|
| Max pairwise cosine | ≤ 0.92 | 0.9779 (netflix × prime) | 0.9775 (prime × skygo) | ⚠ Conditional pass |
| Mean pairwise cosine | ≤ 0.75 | 0.8882 | 0.9047 | ⚠ Conditional pass |
| Anchor BBC × MUBI in bottom 3 | hard gate | N/A (BBC absent) | 0.8908 (NOT in bottom 3) | ⚠ Conditional pass — BBC catalogue genuinely broad |
| Cosine drift on original 10 (P2 → P2.5) | < 0.02 | — | 0.0027 | ✅ |
| L2 norms vary across services | std dev > floor | 0.0188 (10s); similar (13s) | — | ✅ |
| First-3 dimensions unique per service | hard gate | 10/10 | 13/13 | ✅ |

Verdict: CONDITIONAL PASS. Threshold exceedance reflects genuine catalogue overlap (top-150 popular titles on Netflix/Prime/Disney+ are largely identical), not model failure. MUBI and Discovery+ discriminate clearly.

## Phase 2.6 — Variance gate

| Metric | Threshold | Result | Status |
|---|---|---|---|
| Services where v2 (exclusivity) > v1 (popularity) on bottom-half variance | ≥ 8 of 13 | 5/13 | 🛑 FAIL |

Verdict: FAIL. Decision: ship v1_popularity. WU-3 (synthetic cold-start) skipped per early-exit clause.

## Phase 4.5 — Mood room clustering gates

Workflow fails (skips upsert) if any of:

| Metric | Limit | Phase 4.5 actual |
|---|---|---|
| Cluster count | 10 ≤ N ≤ 200 | 68 |
| Mean cluster size | 20 ≤ size ≤ 500 | 30-800 range observed (within bounds) |
| Noise fraction | ≤ 50% | ~46.5% (53.5% coverage) |

Failed runs leave previous version live. Audit row appended with `outcome='failed'`.

## Strategy targets vs Phase 4.5 actuals

| Target (Strategy v1.6.3 §5.2) | Actual |
|---|---|
| 30-60 mood rooms | 68 (slight overshoot; monitor stability across runs 2-3) |
| 30-800 titles per cluster | within range |
| 50-60% catalogue coverage (revised target) | 53.5% |
| Original 70-80% coverage estimate | proved structurally optimistic |

## Phase 4 ranking weights (shipped)

| Component | Weight | Notes |
|---|---|---|
| Taste-vector similarity | 62.5% | Phase 4 ship; intent in strategy was 50%. |
| Recency | 25% | Modulated 10-30% by Catalogue-age slider with proportional re-norm. Intent 20%. |
| Contextual fit | 12.5% (placeholder) | Returns 0.5 for all. Phase 5 to ship real scorer; re-evaluate split. Intent 10%. |
| Genre spread | post-processing | Modulated by Focused ↔ Varied slider. Intent 10% as scoring component. |
| Cross-service spread | post-processing | Max-2-consecutive-same-service. Intent 10% as scoring component. |

## Detail page signal weights (per Detail Page Spec v0.3.2 §4)

### Explicit signals

| Signal | Weight |
|---|---|
| Watched + thumbs_up combined | +1.5 |
| Thumbs up | +1.0 |
| Mark as watched | +0.5 |
| Watchlist add | +0.3 |
| Watchlist remove | −0.4 |
| Thumbs down | −0.6 |
| Not interested | hard filter only, no taste update |

### Behavioural (interpretation matrix)

| Dwell duration | Exit outcome | Weight |
|---|---|---|
| < 3s | any | ignored |
| 3-10s | back, no action | −0.15 |
| 10-30s | back, no action | −0.25 |
| 30s+ | back, no action | −0.35 |
| any | deep_link_click (high confidence) | +0.8 |
| any | deep_link_click (low confidence) | +0.4 |
| any | app_backgrounded (not expected) | ignored until session resumes |

### Combination rules

- Dedup within 24h (highest-weight wins).
- Replace, don't add, for explicit signals on same title.
- Decay: 90d behavioural, 180d explicit (lazy at recompute time per Phase 3).
- Confidence floor: first 20 interactions weighted 1.5x.
- Negative session cap: −1.0 cumulative per session.

## Cold-start bootstrap weights (Phase 3 dynamic 4-band)

| Watched-grid selections | Service fingerprints | Watched grid | Genre selections |
|---|---|---|---|
| 0 | 0.55 | 0.00 | 0.45 |
| 1-4 | 0.40 | 0.40 | 0.20 |
| 5-12 | 0.30 | 0.55 | 0.15 |
| 13+ | 0.20 | 0.70 | 0.10 |

## Slider mappings (per IN-403, `weights.ts`)

| Slider | Function | Mapping | Default at slider=0.5 |
|---|---|---|---|
| Catalogue Age | `getCatalogueAgeRecencyWeight()` | `0.30 - slider × 0.20` | 0.20 (matches strategy 20% baseline) |
| Comfort Zone | `getComfortZoneRowCount()` | `5 + round(slider × 10)` | 10 |
| Content Mix | `getContentMixMovieRatio()` | `0.80 - slider × 0.60` | 0.50 |
| Focused ↔ Varied | `getVarietyGenreWindow()` | `1 + round(slider × 4)` | 3 |

All linear interpolation. Sliders modify pipeline parameters only — never the taste vector.

## Hidden Gems filters (Phase 3 + Phase 4)

| Filter | Value |
|---|---|
| Popularity range | 2-20 |
| Vote count | ≥ 50 |
| Vote average | ≥ 7.0 |
| Genre diversity cap | max 2 per genre |
| Row size | max 15 |

## Rank-eval thresholds (per `rank-eval.ts`)

| Metric | Threshold |
|---|---|
| Mean nDCG@10 | ≥ 0.30 |
| Mean genre spread per row | ≥ 0.6 |
| Mean service spread per row | ≥ 0.5 |
| Mean novelty | ≥ 0.2 |

## Critically Acclaimed Home row gating

| Source | Threshold | Phase 4 OMDB coverage check | Status |
|---|---|---|---|
| Rotten Tomatoes score | ≥ 80% | 0% on titles released in last 90 days | 🛑 Below gate |
| IMDb rating | ≥ 7.5 | 12.3% | 🛑 Below gate |
| Vote count | ≥ floor (titles released last 90 days) | — | — |
| OMDB coverage of relevant pool | ≥ 80% | 0% RT / 12.3% IMDb | 🛑 Below gate |

Row ships disabled behind `CRITICALLY_ACCLAIMED_ROW_ENABLED = false` until OMDB coverage reaches 80% (per Composition Hypothesis v0.3 §2.2).

## North Star metrics (Tier 1, must ship-and-monitor per Strategy §6.1)

| Metric | Direction | How |
|---|---|---|
| Detail-view rate @ 10 | ↑ vs v1 baseline | Of top-10 recs shown, % clicked into detail |
| Watchlist conversion rate @ 10 | ↑ vs v1 baseline | Of top-10 recs shown, % added to watchlist |
| Deep-link click-through rate | ↑ vs v1 baseline | Of detail views from recs, % clicked deep link |

These are the three metrics v2 must improve. If they don't, v2 isn't better than v1.

## Tier 2 / Tier 3 metrics

See [eval-harness](../concepts/operations/eval-harness.md) and Strategy §6.2 / §6.3.
