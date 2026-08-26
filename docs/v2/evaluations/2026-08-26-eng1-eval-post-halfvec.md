# ENG-1 eval — post-halfvec retrieval check (migration 074)

**Date:** 2026-08-26 · **Trigger:** migration 074 changed `match_titles_by_vector`
(halfvec HNSW index + exact re-rank). Captured per the harness's own
instruction to record output in a dated eval doc.

## Verdict

Retrieval is **unchanged** by 074. But that conclusion comes from the A/B
below, *not* from the harness — see the caveat.

## `npm run eval:eng1`

```
══ A. Cluster-seed pairwise cosine matrix (τ selection) ══
  clusters: 16; pairs: 120
  pairwise cosine — min 0.3094, median 0.5598, max 0.7532
  τ=0.75 → 1 pair(s) would merge  (anime-animation × family-kids: 0.7532)
  τ=0.80 → 0 pair(s) would merge
  τ=0.85 → 0 pair(s) would merge
  active INTEREST_MERGE_TAU = 0.8

══ B. Synthetic multi-modal profile — recall@500 + coverage ══
  profile: feel-good-funny + anime-animation (cosine 0.6149)
  titles: 17 (train 15, held-out 2)
  k-means → K=3, weights [0.467, 0.333, 0.200]
  recall@500  single-centroid: 0.0% (0/2)
  recall@~200×3 multi-interest:  0.0% (0/2)
  gate: multi ≥ single → PASS
  coverage: top-20 of merged pool spans 3 interest(s) → PASS (gate ≥ 2)

══ C. Avoid-set penalty — γ sweep ══
  avoided: Brooklyn Nine-Nine (tv-48891)
  before: 2/10 avoided-neighbours and 0 held-out positives in top-20
  γ=0.10 / 0.15 / 0.20: 0/10 neighbours in top-20 (Δ−2); positives 0 (Δ0)
  gate: neighbour suppression > 0 at active γ with positives Δ ≥ 0 → PASS
```

All gates PASS.

## ⚠ Caveat: section B is a weak gate

`recall@500` is **0.0% on both arms**, so `multi ≥ single` passes as
`0 ≥ 0`. With a held-out set of **two titles**, this gate cannot
distinguish a healthy retriever from a broken one, and it would have
passed identically had 074 destroyed recall.

It should not be read as evidence about 074. Worth strengthening the
synthetic profile (more held-out positives) before relying on it as a
phase gate again.

## The check that actually verified 074

Brute-force **exact** search vs what `match_titles_by_vector` returns, same
query vector, run against live:

| Measure | Result |
|---|---|
| Overlap @200 | **200 / 200** |
| Overlap in top-20 | **20 / 20** |
| Identical *position* in top-20 | **20 / 20** |

Across five additional random query vectors, overlap@100 was
**98, 98, 100, 100, 97**. Those 1–3 differences are HNSW's own
approximation — present before 074 too — not halfvec precision.

Measured precision cost of the halfvec cast on two real embeddings:

```
exact  0.69766901055306
half   0.697668821958604
error  0.00000019
```

The exact re-rank in 074 (retrieve 2× candidates via the halfvec index,
re-rank at full precision) is what keeps returned distances exact.

## Follow-up

- Strengthen eval section B's held-out set so the recall gate has power.
- Re-run after any future change to the retrieval RPC.
