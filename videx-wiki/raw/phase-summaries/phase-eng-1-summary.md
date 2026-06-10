# Phase ENG-1 — Multi-Interest Retrieval & Signal Quality: Summary

**Status:** Complete, 2026-06-10. Single-day phase (kickoff → implementation → eval → device verification → close-out).
**Branch:** `phase-eng-1-multi-interest` (kickoff + 8 implementation commits + device-test fixes + close-out).
**Brief:** `docs/v2/Videx_v2_Engine_and_Platform_Hardening_Brief_v0.2.md` §3. First phase of the E&P Hardening track (orchestration v0.8 §11).
**Plan:** `docs/plans/2026-06-10-001-feat-phase-eng-1-multi-interest-plan.md` — followed with the deviations listed in §4 below.
**Eval:** `docs/v2/phase-summaries/eng1-eval-2026-06-10.md` (runs 1 + 2) is authoritative for gate results.

## 1. What shipped

**Workstream A — multi-interest centroids.** `user_interest_centroids` (migration 044, K ≤ 3 per E&P D3, owner-RLS, GDPR RPCs extended). Bootstrap groups per-cluster seeds by greedy agglomerative merge (τ = 0.80, kept after the eval's pairwise-cosine matrix; the K-cap does the merging on today's 16-cluster taxonomy) with service/watched signal blended into each interest at the existing band weights; weights proportional to merged mass, floored at 0.15. Retrieval fans out one `match_titles_by_vector` RPC per centroid (200 each), dedupes keep-closest, and interleaves by smooth weighted round-robin — so the taste score is cosine-to-source-centroid by construction, with zero scoring-formula change. Incremental EMA updates the nearest centroid only (single-row write); the 24h batch recompute refreshes centroids via deterministic weighted k-means (k-means++ seeded from hashed content keys — replayable), skipping below 8 distinct positives. `taste_profiles.taste_vector_v2` continues everywhere it was (summary, mood rooms, semantic search, fallback). **Fallback ladder:** zero centroid rows → byte-identical legacy single-vector behaviour; users self-heal at next bootstrap/recompute — no backfill migration.

**Workstream B — avoid-set negative scoring.** Negative events no longer touch any vector (`INTERACTION_WEIGHTS` is positive-only; `watchlist_remove` is taste-neutral per the plan-review decision; historical vectors heal on their next 24h replay). The last 50 `thumbs_down` + `not_interested` titles form a per-user avoid set — derived from the event log per load, embeddings cached under the `videx_emb_avoid_` prefix (sign-out wipe inherited for free). Scoring applies `finalScore −= 0.15 · max(0, maxCos)` after the top-200 embedding fetch on client load, client re-rank, and Edge render. Documented trade-off: penalty reaches the top-200 (where rows draw from), not the full 500; RPC-side penalty is the escalation lever.

**Workstream C — exploration slot.** 2 positions (6 and 14, 1-indexed) in Recommended For You reserved for zero-prior-impression candidates from the 40–70th taste-percentile band, popularity-weighted, seeded from `userId + UTC day` (stable within a day — confirmed by the parity probe's determinism check — rotating daily). Tagged `metadata.exploration = true` in `card_impressions` for ENG-2's CTR read.

**Workstream D — training groundwork.** Position-at-click via a card-tap stash (`clickContext.ts`, searchAttribution pattern) merged into outcome-event metadata across ContentRow / Browse grid / MoodRoom grid; `v_training_examples` (migration 045, security_invoker) joins impressions to first same-session positive outcomes — the ENG-2 dataset accumulates in the right shape from day one.

**Eval harness.** `npm run eval:eng1` — self-contained (in-memory centroids via the production pure modules + live RPC), with τ-matrix, synthetic recall/coverage, γ sweep, and real-profile sections; cold-HNSW warmup + retry built in.

## 2. Eval gate outcomes (see eval doc for detail)

- **Coverage: PASS** — merged top-20 spans 3 interests vs the single-centroid baseline leaning 2. This is the brief's headline failure case, fixed.
- **Parity probe: PASS** against the live ENG-1 Edge function; golden regenerated once.
- **τ = 0.80 and γ = 0.15 confirmed from data** (γ insensitive across 0.10–0.20 with full neighbour suppression and no positive regression).
- **Recall@500: carried forward, not blocking** — synthetic holdout too small (n=2, bounded by rep-list curation) and the prototype account too fresh (8 distinct positives < 10 floor). Becomes honestly measurable as interactions accumulate; ENG-2's data gate covers it at scale.
- On-device verification by Joe: interest mixing, exploration slots, avoid suppression, instant slider re-rank.

## 3. Production state at close

Migrations 044 + 045 applied (Joe, via Studio — see §4 on the permission gate). `render-foryou-rows` deployed with the full ENG-1 `_shared` bundle (verified by marker scan). Prototype account live with 3 centroids, weights [0.6, 0.2, 0.2]. Parity golden current. Cost delta: £0 (per brief §10).

## 4. Deviations and process notes

1. **Production-mutation permission gates.** The harness denied CC's `apply_migration` and `functions deploy` calls — both correctly classed as production changes outside a general "proceed". Joe applied/deployed manually. Process note for future phases: migrations + Edge deploys are explicit Joe actions (or pre-authorised per-phase); `supabase db push` must NOT be used while the migration ledger has gaps (033, 036–039, 040, 042–045 absent from it) — it would replay applied migrations and apply the intentionally-unapplied `040_editor_notes.sql`.
2. **Two migrations, not one.** Brief §12 anticipated one; 044 (table) + 045 (view) split for independent revertability. Recorded in orchestration v0.8.
3. **Plan's "24 onboarding clusters" was wrong** — taxonomy has 16. Corrected in the eval doc.
4. **Pure-module refactor mid-phase:** `interestGrouping.ts` split from `bootstrap.ts` so the tsx eval harness evaluates the real grouping logic (`src/lib/supabase.ts` can't load under tsx — no `import.meta.env`).
5. **Device-test fixes beyond engine scope** (commit `ab79688`): two onboarding/profile slider-label bugs and the For You fingerprint card's contentMix axis inversion — the latter a pre-existing Phase 6 editorial bug that mirrored the slider on read and write (dragging "TV" to max wrote films-heavy values). Fixed in-phase because it inverted pipeline input during testing.
6. **IN-PX-54 honoured:** migration 044 extended both `delete_own_account` and `export_user_data` with the new user-scoped table at creation time.

## 5. Follow-ups filed

Parking Lot (v0.7, ENG-1 section): **IN-PX-55** (cluster rep-list curation breadth — 13/16 clusters define 2–4 reps; tmdb 273481 missing; Joe-owned), **IN-PX-56** (`card_impressions` media_type / training-extract collision class, pairs with IN-458), **IN-PX-57** (exploration seen-set recent-1000 cap; likely absorbed by PLAT-3).

## 6. What ENG-1 deliberately did not do (per brief §3.7)

No embedding model/template changes (ADR-004), no Stage-2 weight changes (ENG-2), no mood-room changes, no collaborative signals, no adaptive K (D3). The `_shared/` mirror tax was paid one final time (D1): every mirrored module updated in lockstep; PLAT-3 deletes the apparatus.

## 7. Bloat sweep

No new one-off scripts at `scripts/` root (eval harness lives in `scripts/evaluation/`); all docs touched by the phase updated (orchestration v0.8 rows flipped to Applied, parking lot, eval doc, this summary); wiki ingest rides this PR. vitest 50/50 (40 new ENG-1 tests across 5 suites), lint 0 errors, typecheck + production build green.
