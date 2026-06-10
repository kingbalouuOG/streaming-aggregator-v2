---
title: Open questions register
type: register
tags: [register, open-questions, validate, e-p-track]
created: 2026-04-26
updated: 2026-06-10
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.8.md
  - raw/v2-strategy/Videx_v2_Engine_and_Platform_Hardening_Brief_v0.2.md
  - raw/plans/2026-06-10-001-feat-phase-eng-1-multi-interest-plan.md
  - raw/phase-summaries/phase-eng-1-summary.md
  - raw/phase-summaries/eng1-eval-2026-06-10.md
  - raw/phase-summaries/phase-5-summary.md
  - raw/phase-summaries/phase-search-v2-summary.md
  - raw/reference/risks-register.md
related:
  - wiki/sources/engine-strategy-v1-8.md
  - wiki/sources/ep-hardening-brief-v0-2.md
  - wiki/concepts/operations/risks-register.md
  - wiki/concepts/operations/phase-history.md
  - wiki/registers/pre-launch-blockers.md
  - wiki/registers/deferred-items.md
---

# Open questions register

Things to validate, with resolutions recorded as phases close them. Refreshed 2026-06-10 against Phases 5 → REPO-1, the E&P brief §9 locks, and the ENG-1 plan/eval.

## Resolved 2026-06-10 (E&P brief §9 — six decisions locked by Joe)

| Was open | Resolution |
|---|---|
| Engine-first or platform-first sequencing? | **D1: ENG-1 before PLAT-3** — pay the `_shared/` mirror tax one final time. |
| Proxy/feed infrastructure choice | **D2: Cloudflare Workers + Hono** (zero cold starts; wrangler dissolves ADR-011). |
| Interest-centroid K — fixed or adaptive? | **D3: fixed cap of 3**; adaptive K is ENG-2-era. |
| What happens to the client pipeline after PLAT-3? | **D4: fallback for one release, then deleted.** ADR at cutover supersedes ADR-011 + ADR-012. |
| Router adoption in PLAT-1? | **D5: `React.lazy` only** — router is YAGNI until web distribution matters. |
| Worker code location | **D6: plain `workers/api/` folder** (stub created in REPO-1). |

## Resolved 2026-06-10 (ENG-1 plan Q1–Q4 + eval)

| Was open | Resolution |
|---|---|
| Q1 — `watchlist_remove` treatment | Out of the vector path AND out of the avoid set — **taste-neutral** (un-saving is housekeeping, not aversion). |
| Q2 — one migration or two | **Two (044 table + 045 view)** for independent revertability. |
| Q3 — exploration placement | **2 slots at positions 6 and 14**, daily-seeded rotation — confirmed, then verified on device. |
| Q4 — interest-weight floor | **0.15 confirmed** (minority interest keeps ~30 of 600 retrieval slots). |
| τ merge threshold | **0.80, picked from data** (eval §A: zero merges on today's 16-cluster taxonomy; the K-cap does the merging). |
| Avoid-set γ | **0.15 confirmed** (insensitive across 0.10–0.20; full neighbour suppression, zero positive regression). |

## Resolved by earlier phases (recorded this refresh)

| Was open | Resolution |
|---|---|
| Will Phase 5 contextual scoring ship before launch? (risks register) | ✅ Yes — Phase 5 shipped the real scorer (time 40 / viewing 40 / device 20). |
| Supabase `<Database>` generic (47 pre-existing errors) | ✅ Phase 5 closed them; Phase 5.5 added `typegen-check` CI. |
| For You loading performance (~1–2s, Phase 3) | Largely answered: IN-466 server-side render + Phase 5.5 embedding cache. Residual cold-start outliers (5–12s) are PLAT-3's acceptance target ("eliminated as a category"). |
| Negative dwell signal calibration (strategy §8.2 #8) | Reshaped by ENG-1: negative events no longer enter any vector; aversion is the avoid-set penalty (γ = 0.15, eval-confirmed). > ⚠ unverified — whether dwell-derived negative *behavioural* weights still feed anything was not re-checked this pass; the eval covers thumbs_down/not_interested only. |
| When does the 62.5/25/12.5 split get re-evaluated? (Phase 4) | Scheduled: ENG-2 learned re-ranker demotes it to fallback; offline AUC/NDCG gate before any serve change. |

## Still open — engine & data

| # | Question | When to validate |
|---|---|---|
| 1 | Do service fingerprints meaningfully improve cold-start? (Strategy §8.2 #1) | Real cold-start UX data post-launch; discrimination eval was a conditional pass. |
| 2 | Does the exploration slot earn its 2 positions? | ENG-2 — CTR on `exploration=true` impressions vs row baseline (tagging live since ENG-1). |
| 3 | Multi-interest recall@500 vs single centroid | Carried forward from the ENG-1 eval (unmeasurable at n=2 / 8-positive profiles). Honest at the ENG-2 data gate (≥5–10K impressions). |
| 4 | Does τ = 0.80 survive expanded rep lists? | Re-run `eval:eng1` §A after IN-PX-55 curation (the decision assumed current seed geometry). |
| 5 | Slider → pipeline mapping weight ranges (Strategy §8.2 #3) | Real usage, post-launch. |
| 6 | Watched-grid title selection algorithm (Strategy §8.2 #4; IN-OB-002) | Onboarding usage data. |
| 7 | Genre taxonomy validation (Strategy §8.2 #7; IN-OB-001/IN-OB-006) | Phase 6 review after 3 months anchored-rooms telemetry. |
| 8 | Auto-generated taste summary quality (Strategy §8.2 #6) | Pre-launch qualitative review. |
| 9 | Is the 0.8% media_type collision (IN-458 / IN-PX-56) actual training noise? | ENG-2 evals decide whether to add the column. |
| 10 | Anchored-rooms cluster-coherence guard: 0.40 cosine-distance threshold + 5-interaction window (Strategy v1.7 §8.2) | Early real usage; tunable in `anchorSelection.ts`. |

## Still open — platform & ops

| # | Question | When to validate |
|---|---|---|
| 11 | Is pg_partman auto-creating monthly partitions? (IN-XPS-003) | First month tick-over check — **overdue; verify**. |
| 12 | Workers free-plan 10ms CPU cap headroom for PLAT-2 proxy endpoints | PLAT-2 — brief expects comfortable fit; measure. |
| 13 | Feed-cache TTL (15–30 min) and hit ratio | PLAT-3 acceptance measurement. |
| 14 | Does PLAT-2 need to proxy Supabase content-cache reads too? | Only if measurement says so (brief §6.3-5). |
| 15 | Phase 1.5 Videx tags — when does it get prioritised? | Unsequenced (Phase 1 summary). |
| 16 | Between-cohort cosine ratio thresholds for future evals | Next embedding-eval revision (Phase 1 summary). |

## Still open — product

- Critically Acclaimed Home row: manual curation needed on top of OMDB gating? (OMDB coverage still below the 80% gate at last check.)
- iOS launch timing (Capacitor currently Android-only; would fix the Prime deep-link gap).
- Mood Room labels as user-editable favourites — future phase.
- "Updated your recommendations" toast — ship if users ask "is this doing anything?"
- Save for Later vs Watchlist distinction — v2.5 unless tests surface a need.

## Deferred strategic questions (triggers unchanged; reaffirmed by E&P brief §11)

| Question | Trigger |
|---|---|
| Collaborative filtering viability | ~10K MAU with regular activity |
| Train our own item tower | ~50K MAU + 6 months interaction data |
| Arthouse coverage (MUBI, BFI, Curzon) | Later strategic question |
| Mood Rooms → user-shareable "list-rooms" | After mood rooms are proven |

## How to use this register

1. Scan for items relevant to the current phase.
2. When closing one, mark it resolved in the originating source (strategy doc, brief, phase summary), then move it to a Resolved section here with the resolution + source.
3. New questions append to the relevant source first; this register is regenerated from those.
