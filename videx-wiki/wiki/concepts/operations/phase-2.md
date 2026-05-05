---
title: Phase 2 — Service fingerprints
type: concept
tags: [phase, phase-2, service-fingerprints, cold-start]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/phase-summaries/phase-2-summary.md
  - raw/evaluations/phase-2-service-discrimination-eval.md
  - raw/evaluations/phase-2-service-discrimination-baseline.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/architecture/service-fingerprints.md
  - wiki/concepts/architecture/cold-start.md
  - wiki/concepts/evaluations/phase-2-service-discrimination-eval.md
  - wiki/entities/codebase/migrations.md
---

# Phase 2 — Service fingerprints

Branch: `phase-2-service-fingerprints`. Completed 2026-04-12.

## What was delivered

Migration 020: `service_fingerprints` table with `vector(1536)` centroid, `CHECK (title_count > 0 AND title_count = array_length(source_title_ids, 1))`, authenticated-only RLS (no anon).

New code: `supabase/functions/_shared/centroidMath.ts` (`computeCentroid`, `cosineSimilarity`, `l2Norm`), `refresh-service-fingerprints` Edge Function (Sunday 07:00 UTC), `scripts/fingerprints/build-service-fingerprints.ts` (one-time bulk build), `eval-service-discrimination.ts`, 13 test cases.

## Result

10 services fingerprinted (apple, channel4, discovery, disney, itvx, mubi, netflix, paramount, plutotv, prime). Top-150 titles per service by `popularity DESC` (with `vote_count >= 50` noise filter).

3 services absent: BBC iPlayer (zero rows in `streaming_availability` — SA API empty catalogue despite listing it), NOW TV (591 rows all classified `addon`), Sky Go (not in SA API). Filed as IN-250 → resolved in Phase 2.5.

## Verification

| Metric | Threshold | Result | Status |
|---|---|---|---|
| Max pairwise cosine | ≤ 0.92 | 0.9779 | CONDITIONAL PASS |
| Mean pairwise cosine | ≤ 0.75 | 0.8882 | CONDITIONAL PASS |
| Build sanity (L2 norms vary, first-3 unique) | — | PASS | |
| RLS authenticated-only, service_role write | 2 policies, no anon | PASS | |
| `tsc --noEmit`, 13/13 tests | clean | PASS | |

Threshold exceedance reflects genuine catalogue overlap among mainstream UK services (top-150 titles on Netflix/Prime/Disney+ are largely identical blockbusters), not model or build failure. MUBI (arthouse) and Discovery+ (factual) discriminate clearly.

## Deviations

1. Selection criterion: `popularity DESC` only (no recency decay). Brief proposed `exp(-age_years/5)` citing strategy §5.2, but §5.2 describes user-taste decay and Stage 2 ranking recency, not fingerprint title selection. §4.4 says "by popularity/ratings".
2. `deep_links` table doesn't exist; brief referenced it but actual table is `streaming_availability`.
3. RLS tightened to authenticated-only (brief specified anon read; review found onboarding Step 2 happens after Step 1 sign-up so user is always authenticated).
4. `title_count` CHECK constraint added (not in brief; review required to prevent zero-row centroids).
5. Idempotent `DROP POLICY IF EXISTS` before each `CREATE POLICY` added.
6. Dry-run checkpoint bug fixed: build script was writing `completed_services` during `--dry-run`.
7. 10 services fingerprinted, not the expected ~10. Discovery, mubi, plutotv weren't in brief's list; BBC/NOW/SkyGo absent.

## Observations

- BBC iPlayer gap is critical for Phase 3 cold-start; Phase 2.5 (IN-250) should run before Phase 3.
- Catalogue overlap is structural; finer discrimination via service-exclusivity weighting was tested and rejected in Phase 2.6.
- MUBI is the discrimination anchor (lowest similarity with every mainstream service).
- Discovery+ (13 titles) and MUBI (47 titles) are low-confidence fingerprints — monitor after Phase 2.5.
