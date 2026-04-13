# Phase 2.6 Summary — Fingerprint Signal Refinement

**Date:** 2026-04-13
**Branch:** `phase-2.6-fingerprint-signal-refinement`
**Scope:** Backend only. Evaluation phase — no production behavior changes.
**Outcome:** Gate failure, phase success. Ship v1_popularity.

---

## 1. Goal

Decide whether exclusivity-weighted centroids (v2) produce meaningfully sharper service discrimination than popularity-ranked arithmetic means (v1). Deliverable is a decision artefact, not a tuning.

## 2. Deliverables

| Artifact | Path | Status |
|----------|------|--------|
| Migration 022 | `supabase/migrations/022_fingerprint_variant.sql` | Applied |
| `computeWeightedCentroid` | `supabase/functions/_shared/centroidMath.ts` | Added (7 tests) |
| Build script `--variant` flag | `scripts/fingerprints/build-service-fingerprints.ts` | Added |
| Bottom-half variance eval | `scripts/fingerprints/eval-bottom-half-variance.ts` | Created, run |
| Variance eval report | `docs/v2/phase-2-6-variance-eval.md` | Generated |
| Decision report | `docs/v2/phase-2-6-decision.md` | Written |
| `match_titles_by_vector` RPC | Migration 022 | Applied (Phase 3 inheritance) |

## 3. Work Unit Results

| WU | Description | Result |
|----|-------------|--------|
| WU-0 | Migration 022 (variant column + RPC) | PASS — applied, verified, Edge Function redeployed |
| WU-1 | Build v2_exclusivity centroids | PASS — 13 services, determinism check passed |
| WU-2 | Bottom-half variance eval | FAIL — 5/13 services improved (gate: >= 8) |
| WU-3 | Synthetic cold-start harness | SKIPPED — early exit, variance gate failed decisively |
| WU-4 | Decision report | Ship v1_popularity |

## 4. Key Finding

Exclusivity weighting is not a universal signal-sharpener. It trades discrimination quality between service types:

- **Improved** (5): apple, bbc, mubi, plutotv, skygo — smaller/more distinctive catalogues
- **Degraded** (8): channel4, discovery, disney, itvx, netflix, now, paramount, prime — mainstream services

Downweighting shared blockbusters for Netflix/Prime/Disney+ doesn't reveal a hidden distinctive core. It over-weights whatever handful of exclusive titles sit in each service's top-150, which is near-arbitrary signal.

## 5. Phase 3 Inheritance

| Asset | Status | Notes |
|-------|--------|-------|
| `match_titles_by_vector` RPC | Permanent | Stage 1 retrieval — do not delete |
| `variant` column on `service_fingerprints` | Retained | Cheap, useful for future experiments |
| `--variant=exclusivity` build flag | Retained | Re-runnable experiment code |
| `computeWeightedCentroid` | Retained | Harmless, potentially useful |
| `eval-bottom-half-variance.ts` | Retained | Reusable for future evaluations |

Phase 3 hooks should read `variant = 'v1_popularity'` from `service_fingerprints`.

## 6. Parking Lot Updates

- **IN-250** (TMDb provider backfill): ✅ Done (Phase 2.5)
- **IN-260** (Exclusivity weighting): ✅ Discharged — tested, didn't work
- **IN-261** (Curation-based refinement): ⏳ Parked — revisit if Phase 3 cold-start underperforms for mainstream users

## 7. Verification Checklist

| Check | Result |
|-------|--------|
| Migration 022 applied | PASS (13 v1 rows, variant column, RPC function) |
| v2 build deterministic | PASS (two runs byte-identical) |
| Variance eval complete for all 13 | PASS |
| Gate: v2 improves >= 8 services | FAIL (5/13) |
| WU-3 skipped per early exit | Confirmed |
| Decision report explicit | Ship v1, not hedged |
| `npx tsc --noEmit` | Clean |
| Edge Function updated for new PK | PASS (variant: v1_popularity added) |
| v2 rows deleted | Done (13 rows removed) |
| v1 rows unchanged | Confirmed (13 rows) |
