---
title: Phase ENG-1 — Multi-interest retrieval & signal quality
type: concept
tags: [phase, eng-1, multi-interest, centroids, avoid-set, exploration, training-extract, e-p-track]
created: 2026-06-10
updated: 2026-06-10
sources:
  - raw/phase-summaries/phase-eng-1-summary.md
  - raw/phase-summaries/eng1-eval-2026-06-10.md
  - raw/plans/2026-06-10-001-feat-phase-eng-1-multi-interest-plan.md
  - raw/v2-strategy/Videx_v2_Engine_and_Platform_Hardening_Brief_v0.2.md
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.8.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/operations/phase-repo-1.md
  - wiki/concepts/architecture/taste-vector.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/operations/eval-harness.md
  - wiki/entities/codebase/migrations.md
  - wiki/registers/acceptance-gates.md
  - wiki/sources/ep-hardening-brief-v0-2.md
  - wiki/sources/eng1-eval-2026-06-10.md
---

# Phase ENG-1 — Multi-interest retrieval & signal quality

Closed 2026-06-10. Branch `phase-eng-1-multi-interest` (kickoff + 8 implementation commits + device-test fixes + close-out). **Single-day phase.** First phase of the [E&P Hardening track](../../sources/ep-hardening-brief-v0-2.md) (brief §3; orchestration v0.8 §11). Migrations 044 + 045 applied by Joe via Studio. Cost delta £0.

## What was delivered

| Workstream | Shipped |
|---|---|
| **A — Multi-interest centroids** | `user_interest_centroids` table (044): K ≤ 3 (D3), PK `(user_id, slot 0–2)`, owner-RLS, GDPR RPCs extended in the same migration (IN-PX-54 honoured). Bootstrap: greedy agglomerative merge of per-cluster seeds at τ = 0.80, service/watched signal blended per-interest at existing band weights, weights ∝ merged mass floored at 0.15. Retrieval: per-centroid `match_titles_by_vector` fan-out (200 each) → keep-closest dedupe → smooth weighted round-robin interleave; taste score = cosine-to-source-centroid by construction (zero scoring-formula change). EMA updates nearest centroid only; 24h batch recompute = deterministic weighted k-means (k-means++ seeded from hashed content keys; skips < 8 distinct positives). `taste_vector_v2` summary maintained everywhere it was. **Fallback ladder:** zero centroid rows → byte-identical legacy behaviour; users self-heal at next bootstrap/recompute — no backfill migration. |
| **B — Avoid-set negative scoring** | Negative events removed from all vector paths (`INTERACTION_WEIGHTS` positive-only; `watchlist_remove` taste-neutral per plan-review Q1; historical vectors heal on next 24h replay). Avoid set = last 50 `thumbs_down` + `not_interested`, derived from the event log, embeddings cached under `videx_emb_avoid_`. Penalty `finalScore −= 0.15 · max(0, maxCos)` after the top-200 embedding fetch — client load, client re-rank, Edge render. Trade-off: penalty reaches top-200 not full 500; RPC-side penalty is the escalation lever. |
| **C — Exploration slot** | Positions 6 and 14 (1-indexed) of Recommended For You reserved for zero-prior-impression candidates from the 40–70th taste-percentile band, popularity-weighted, seeded `userId + UTC day` (stable within a day, rotates daily). Tagged `metadata.exploration = true` in `card_impressions` for ENG-2's CTR read. |
| **D — Training groundwork** | Position-at-click via card-tap stash (`clickContext.ts`, searchAttribution pattern) merged into outcome-event metadata across ContentRow / Browse grid / MoodRoom grid. `v_training_examples` (045, security_invoker) joins impressions to first same-session positive outcome — the ENG-2 dataset shape from day one. |
| **Eval harness** | `npm run eval:eng1` — self-contained (production pure modules in-memory + live RPC), τ-matrix, synthetic recall/coverage, γ sweep, real-profile mode, cold-HNSW warmup + retry. |

## Eval gate (authoritative: [eng1-eval source page](../../sources/eng1-eval-2026-06-10.md))

- **Coverage PASS** (top-20 spans 3 interests vs baseline's 2 — the brief's headline failure case, fixed). **Parity PASS** (live Edge + regenerated golden; determinism validates the daily-seeded exploration slot). **τ = 0.80 and γ = 0.15 confirmed from data.** **Recall@500 carried forward, not blocking** (synthetic n=2; prototype account below the 10-positive floor; ENG-2's data gate covers it at scale). On-device verification by Joe.

## Deviations and process notes

1. **Production-mutation permission gates:** CC's `apply_migration` / `functions deploy` denied; Joe applied/deployed manually. Standing rule: migrations + Edge deploys are explicit-Joe actions; **never `supabase db push`** while the ledger has gaps.
2. Two migrations (044 table + 045 view) vs the brief's one — independent revertability; recorded in orchestration v0.8.
3. Plan's "24 onboarding clusters" wrong — taxonomy has 16.
4. Mid-phase pure-module refactor: `interestGrouping.ts` split from `bootstrap.ts` so the tsx harness evaluates real grouping logic.
5. Device-test fixes beyond engine scope (`ab79688`): 2 slider-label bugs + the For You fingerprint-card **contentMix axis inversion** — a pre-existing Phase 6 editorial bug that mirrored the slider on read AND write (dragging "TV" to max wrote films-heavy values).
6. The `_shared/` mirror tax paid one final time (D1); PLAT-3 deletes the apparatus.

## Follow-ups filed

IN-PX-55 (cluster rep-list curation, Joe-owned), IN-PX-56 (impressions `media_type` collision class, pairs IN-458), IN-PX-57 (exploration seen-set 1000-cap, likely absorbed by PLAT-3). See [parking-lot register](../../registers/parking-lot.md).

## Out of scope (per brief §3.7)

No embedding model/template changes (ADR-004), no Stage-2 weight changes (ENG-2), no mood-room changes, no collaborative signals, no adaptive K.
