---
title: Source — Phase ENG-1 Summary
type: source
tags: [phase-summary, eng-1, multi-interest, avoid-set, exploration, training-extract]
created: 2026-06-10
updated: 2026-06-10
sources:
  - raw/phase-summaries/phase-eng-1-summary.md
related:
  - wiki/concepts/operations/phase-eng-1.md
  - wiki/sources/eng1-eval-2026-06-10.md
  - wiki/sources/ep-hardening-brief-v0-2.md
  - wiki/concepts/architecture/taste-vector.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/entities/codebase/migrations.md
---

# Source: Phase ENG-1 Summary

End-of-phase summary for Phase ENG-1 (multi-interest retrieval & signal quality), complete 2026-06-10 — a single-day phase (kickoff → implementation → eval → device verification → close-out) on branch `phase-eng-1-multi-interest`. First phase of the E&P track (brief §3). The [eng1-eval doc](eng1-eval-2026-06-10.md) is authoritative for gate results.

## Key claims

- **Workstream A:** `user_interest_centroids` (migration 044, K ≤ 3 per D3, owner-RLS, GDPR RPCs extended). Bootstrap groups per-cluster seeds by greedy agglomerative merge at τ = 0.80; weights ∝ merged mass, floored 0.15. Retrieval fans out one `match_titles_by_vector` RPC per centroid (200 each), keep-closest dedupe, smooth weighted round-robin interleave — taste score is cosine-to-source-centroid by construction. EMA updates nearest centroid only; 24h batch recompute runs deterministic weighted k-means (skips below 8 distinct positives). Zero centroid rows → byte-identical legacy single-vector behaviour (no backfill migration).
- **Workstream B:** negatives no longer touch any vector (`INTERACTION_WEIGHTS` positive-only; `watchlist_remove` taste-neutral). Avoid set = last 50 `thumbs_down` + `not_interested`; penalty `finalScore −= 0.15 · max(0, maxCos)` on top-200, client + Edge. Escalation lever: RPC-side penalty.
- **Workstream C:** exploration slots at positions 6 and 14 of Recommended For You — zero-prior-impression, 40–70th taste-percentile, popularity-weighted, seeded `userId + UTC day`; tagged `metadata.exploration = true`.
- **Workstream D:** position-at-click via card-tap stash (`clickContext.ts`); `v_training_examples` (migration 045, security_invoker) — the ENG-2 dataset accumulates correctly from day one.
- Production at close: 044 + 045 applied (Joe via Studio), Edge function deployed, prototype account live with 3 centroids weights [0.6, 0.2, 0.2], parity golden current, cost delta £0.

## Process notes worth remembering

1. **Production-mutation permission gates:** harness denied CC's `apply_migration` / `functions deploy` — migrations + Edge deploys are explicit Joe actions. **Never `supabase db push`** while the migration ledger has gaps.
2. Two migrations (044 + 045) instead of the brief's anticipated one — split for independent revertability.
3. Plan said "24 onboarding clusters"; the taxonomy has **16** (corrected in the eval doc).
4. Device-test fixes beyond engine scope (commit `ab79688`): two slider-label bugs + the For You fingerprint-card contentMix axis inversion (pre-existing Phase 6 editorial bug that inverted pipeline input on read AND write).
5. Follow-ups filed: IN-PX-55 (rep-list curation, Joe-owned), IN-PX-56 (impressions media_type collision, pairs with IN-458), IN-PX-57 (exploration seen-set 1000-row cap, likely absorbed by PLAT-3).
