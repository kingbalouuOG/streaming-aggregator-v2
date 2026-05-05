# Phase 2.6 Decision — Fingerprint Signal Refinement

**Gate failure, phase success.**

Phase 2.6 tested whether exclusivity-weighted centroids (v2) produce sharper service discrimination than popularity-ranked arithmetic means (v1). The answer is no. This is a successful evaluation outcome — the deliverable was a defensible decision, not a tuning.

---

## Recommendation

**Ship v1_popularity. Do not ship v2_exclusivity.**

---

## Evidence

### Variance Gate (WU-2): FAIL — 5 of 13 services improved (required >= 8)

| Service | v1 bottom-6 variance | v2 bottom-6 variance | Δ | Improved? |
|---------|---------------------|---------------------|---|----------|
| apple | 0.001879 | 0.002473 | +0.000594 | YES |
| bbc | 0.002344 | 0.002800 | +0.000456 | YES |
| channel4 | 0.001799 | 0.001597 | -0.000202 | no |
| discovery | 0.002131 | 0.001717 | -0.000414 | no |
| disney | 0.003226 | 0.002935 | -0.000291 | no |
| itvx | 0.003198 | 0.002594 | -0.000604 | no |
| mubi | 0.001952 | 0.002547 | +0.000594 | YES |
| netflix | 0.003300 | 0.002960 | -0.000340 | no |
| now | 0.001650 | 0.001435 | -0.000215 | no |
| paramount | 0.002171 | 0.002115 | -0.000056 | no |
| plutotv | 0.001334 | 0.001671 | +0.000338 | YES |
| prime | 0.002607 | 0.002420 | -0.000187 | no |
| skygo | 0.002282 | 0.002426 | +0.000144 | YES |

- **Mean v1 variance:** 0.002298
- **Mean v2 variance:** 0.002284
- **Mean delta:** -0.000014 (statistical noise)
- **Services improved:** 5 / 13

### Synthetic Cold-Start Gate (WU-3): SKIPPED

Early exit invoked. The variance gate failed decisively (5/13, not borderline), so the synthetic cold-start harness was not run. The early-exit clause was designed for this scenario — running WU-3 would either confirm what we already know or produce a contradictory data point that doesn't change the decision.

---

## What v2 Told Us

Exclusivity weighting is not a universal signal-sharpener. It trades discrimination quality between service types:

- **Niche/distinctive services gained** (apple, bbc, mubi, plutotv, skygo) — these already had differentiated catalogues, and upweighting their exclusive titles amplified that signal.
- **Mainstream services lost** (channel4, discovery, disney, itvx, netflix, now, paramount, prime) — downweighting the shared blockbusters didn't reveal a hidden distinctive core. It over-weighted whatever handful of exclusive titles sit in each service's top-150, which is near-arbitrary signal.

The original suggestion to "weight by exclusivity" was too generic. It assumed all services have a meaningful exclusive-content signal buried under shared mainstream titles. In practice, mainstream UK services share most of their popular catalogue, and their "exclusive" titles at the top-150 boundary are not systematically distinctive — they're just titles that happened to be licensed by one fewer service.

---

## Phase 3 Instructions

- **Hooks read `variant = 'v1_popularity'`** from `service_fingerprints`. This is the only populated variant after cleanup.
- **The `variant` column stays in the schema.** Cheap to keep, useful for future experiments without migration work.
- **`match_titles_by_vector` RPC** is Phase 3 inheritance — it implements Stage 1 retrieval. Do not delete. If Phase 3 needs a different signature, create `match_titles_by_vector_v2`.
- **The `--variant=exclusivity` flag** in `build-service-fingerprints.ts` is intentionally retained. If anyone wants to re-run the experiment with different parameters (e.g., different weighting formula, different title selection), the code is ready.

---

## Parking Lot Updates

### Additions
- **Curation-based refinement** (curated originals lists per mainstream service) — parked. Revisit only if Phase 3 cold-start testing shows mainstream-service users get weak recommendations.
- **BBC characterisation in strategy §4.4** — revise to reflect the broad mainstream-leaning reality per the Phase 2.5 finding. Joe handling separately.

### Discharges
- **Exclusivity weighting as a tuning option** — discharged. Tested in Phase 2.6, didn't improve discrimination for the mainstream cluster (8 of 13 services degraded). Evidence recorded. Do not re-propose without new information.

---

## Artifacts Retained

| Artifact | Retention | Rationale |
|----------|-----------|-----------|
| `match_titles_by_vector` RPC | Permanent | Phase 3 Stage 1 retrieval |
| `computeWeightedCentroid` in centroidMath.ts | Permanent | Harmless, potentially useful |
| `eval-bottom-half-variance.ts` | Permanent | Reusable for future fingerprint evaluations |
| `eval-synthetic-coldstart.ts` | Permanent | Built but not run in 2.6; ready for Phase 3 |
| `--variant=exclusivity` build flag | Retained | Re-runnable experiment code |
| `variant` column + CHECK constraint | Retained | Schema support for future experiments |
| v2_exclusivity rows | **Deleted** | Cleaned up post-decision |

---

## Verification Checklist

| Check | Result |
|-------|--------|
| Migration 022 applied (variant column + RPC) | PASS — 13 v1 rows |
| v2 build deterministic (two runs identical) | PASS — byte-identical centroids |
| Variance eval complete for all 13 services | PASS |
| Gate: v2 improves >= 8 services | FAIL (5/13) |
| WU-3 skipped per early-exit clause | Confirmed |
| Decision report states explicit recommendation | Ship v1, not hedged |
| `npx tsc --noEmit` | Clean |
| v2_exclusivity rows deleted | Done |
| v1_popularity rows unchanged | Confirmed (13 rows) |
| Edge Function writes v1_popularity only | Confirmed (deployed in WU-0) |
