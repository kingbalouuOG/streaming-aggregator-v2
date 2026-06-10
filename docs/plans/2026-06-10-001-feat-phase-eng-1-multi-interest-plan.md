# Phase ENG-1 — Multi-Interest Retrieval & Signal Quality: Implementation Plan

**Status:** DRAFT v1 — awaiting Joe's review. No code written.
**Branch:** `phase-eng-1-multi-interest` (created from `main` @ `095f72f`, 2026-06-10)
**Brief:** `docs/v2/Videx_v2_Engine_and_Platform_Hardening_Brief_v0.2.md` §3 (authoritative for scope)
**Orchestration:** `docs/v2/Videx_v2_Project_Orchestration_v0.8.md` (§3.4 rows 044–045, §11 E&P locks)
**Locked constraints honoured:** D1 (mirror tax paid one final time), D3 (K ≤ 3 fixed), ADR-004 (no embedding model/template changes), §3.7 out-of-scope list (no Stage-2 weight changes, no mood-room changes, no collaborative signals).

---

## 0. Objective recap

Four workstreams against the existing v2 pipeline, validated by the existing eval discipline:

- **A** — Replace the single 1536D taste centroid with up to 3 interest centroids (bootstrap grouping, nearest-centroid EMA, k-means batch refresh, per-centroid retrieval + proportional interleave, source-centroid scoring).
- **B** — Stop subtracting negative events from the taste vector; score-time avoid-set penalty instead.
- **C** — 1–2 deliberate exploration slots in Recommended For You, tagged in impressions.
- **D** — Position-at-click in interaction metadata + the training-extract SQL view, so the ENG-2 dataset accumulates correctly from launch day.

No behaviour change for users without centroid rows (fallback ladder, §A7). Stage 2 weights (62.5/25/12.5), MMR, de-clustering, sliders: untouched.

---

## 1. Migrations

### 1.1 Migration 044 — `user_interest_centroids` (+ GDPR RPC extensions)

```sql
CREATE TABLE public.user_interest_centroids (
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot        smallint    NOT NULL CHECK (slot BETWEEN 0 AND 2),   -- K ≤ 3, locked D3
  centroid    vector(1536) NOT NULL,
  weight      real        NOT NULL DEFAULT 0.3333 CHECK (weight > 0 AND weight <= 1),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, slot)
);
-- RLS: FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)
-- + service_role ALL (render-foryou-rows reads via service-role + withUserScope)
```

No index beyond the PK — per-user fetch is a 3-row PK-prefix scan. ~18KB/user, negligible (brief §10).

**Same migration, CREATE OR REPLACE:**
- `delete_own_account()` (042) — add `DELETE FROM public.user_interest_centroids WHERE user_id = v_user_id` to the belt-and-braces list. The FK cascade already covers it; 042's pattern is explicit deletes anyway, and we keep that contract.
- `export_user_data()` (043) — add a `user_interest_centroids` key (slot, weight, updated_at, centroid). Article 15 completeness; taste_profiles' vector is already exported, so the precedent is set.

### 1.2 Migration 045 — training-extract view

```sql
CREATE VIEW public.v_training_examples
WITH (security_invoker = true) AS
SELECT
  i.user_id, i.content_id, i.source_surface, i.position,
  i.session_id, i.shown_at,
  COALESCE((i.metadata->>'exploration')::boolean, false) AS exploration,
  o.event_type                  AS outcome_event,
  o.created_at                  AS outcome_at,
  (o.metadata->>'position')::int AS position_at_click,
  (o.event_type IS NOT NULL)    AS label_positive
FROM public.card_impressions i
LEFT JOIN LATERAL (
  SELECT u.event_type, u.created_at, u.metadata
  FROM public.user_interactions u
  WHERE u.user_id    = i.user_id
    AND u.content_id = i.content_id
    AND u.session_id = i.session_id
    AND u.event_type IN ('thumbs_up','watchlist_add','deep_link_click','watched')
    AND u.created_at >= i.shown_at
  ORDER BY u.created_at ASC
  LIMIT 1
) o ON true;
```

- `security_invoker = true` so base-table RLS applies to the querying role (avoids the Supabase security-advisor definer-view warning; ENG-2 training reads it with service role).
- **Known limitation, documented not fixed:** `card_impressions` has no `media_type` column, so the join is on `content_id` alone within a session — the same 0.8% movie/TV collision class as IN-458. Acceptable noise for a training extract; revisit only if ENG-2 evals show it matters. Filed to Parking Lot at close-out.
- Why two migrations when brief §12 said "one (044)": the view is an analytics surface over existing tables, the table is user data. Separate numbers keep them independently revertable per §3.3 of the orchestration doc. Flagged in orchestration v0.8 changes block.

**Apply timing:** 044 before commit 3 lands on the branch (code reads the table); 045 anytime before phase merge. Both via `supabase db push`. Additive only — no destructive DDL anywhere in this phase.

---

## 2. Workstream A — Multi-interest centroids

### A1. Storage + CRUD (`src/lib/taste-v2/`)

- `types.ts`: new `InterestCentroid { slot: number; centroid: TasteVectorV2; weight: number; updatedAt: string }`.
- `tasteProfileV2.ts`: `getInterestCentroids()`, `saveInterestCentroids(centroids[])` (delete-then-insert in one round trip via upsert + delete of orphaned slots), both behind the existing 5-min profile cache pattern (`invalidateV2ProfileCache()` clears both).
- Mirror: `_shared/taste-v2/tasteProfileV2.ts` gets the same functions with the DI'd client (existing Edge pattern).
- `taste_profiles.taste_vector_v2` write paths are **unchanged** — the single-centroid summary keeps being maintained everywhere it is today (brief: cheap to keep both; mood-room affinity + semantic search + fallback all still read it).

### A2. Bootstrap interest seeds (`bootstrap.ts`)

Today `bootstrapTasteVector` collapses 3–5 selected clusters into one `genreVector`. New sibling `bootstrapInterestCentroids(params)` (the existing function stays, still produces the summary vector):

1. Per selected cluster, fetch its representative-title embeddings (existing `fetchTitleEmbeddings`) and compute a per-cluster centroid — instead of one centroid over the union.
2. **Greedy agglomerative merge:** while seed count > 3 OR the closest pair has cosine ≥ τ, merge the closest pair (member-count-weighted mean, renormalise). Starting τ = **0.80**, tuned in the eval gate (§6) — the eval script prints the full pairwise cosine matrix over all 24 onboarding clusters so we pick τ from data, not vibes.
3. Blend service/watched signal into **each** interest at the existing validated band weights (`getBootstrapWeights` unchanged — same bands, same 75% cluster dominance; the cluster component is now the interest seed instead of the union centroid).
4. Initial `weight` = share of clusters merged into that interest, normalised; floor 0.15 then renormalise (a minority interest must never starve retrieval).
5. Caller: the onboarding completion path that currently calls `bootstrapTasteVector` also calls this and saves via A1. One user, two writes, same transaction-ish flow.

### A3. Retrieval (`recommendations-v2/ranker.ts` + `types.ts`)

`PipelineInput` gains optional `interests?: { centroid: number[]; weight: number; slot: number }[]`. `fetchCandidatePool`:

- **Multi path** (interests present): K parallel `match_titles_by_vector` RPC calls at **200 each** (vs 500 single). Dedupe on `(tmdb_id, media_type)`; a candidate in two pools keeps the assignment with the smaller distance. Tag `MatchedTitle.sourceSlot`. Interleave pools by weighted round-robin (weight = stored interest weight), preserving within-pool cosine order — so downstream `slice(0, 100)` metadata fetch and row-builders see a proportionally blended ranking.
- **Legacy path** (no interests): existing single-RPC behaviour, byte-for-byte.
- `CandidatePool` carries `interleaved: boolean` so the eval rig can assert which path ran.

Cost: up to 3 smaller RPCs per For You load instead of 1 — inside existing Pro compute (brief §10).

### A4. Scoring (`ranker.ts scoreCandidates`)

No formula change needed: `taste = distanceToSimilarity(match.distance)` and in the multi path each match's `distance` **is** the cosine distance to its source centroid — exactly the brief's "cosine to the candidate's *source* centroid, not max-over-centroids". `ScoredCandidate` gains `sourceSlot?: number` (threads through to D's impression tagging and the eval coverage check). Stage-2 weights, MMR, de-clustering: untouched.

### A5. Incremental EMA → nearest centroid (`interactionUpdate.ts`)

New `applyInteractionToCentroids(centroids, tmdbId, mediaType, eventType, count, sessionId)`:
- Fetch the title embedding (as today), pick the centroid with max cosine to it, apply the **existing** learning rate (0.05), confidence floor, and search-attribution boost to that centroid only, renormalise it, bump its `updated_at` and recent-positive counter (feeds weight refresh).
- `useTasteProfile.ts` calls it alongside the existing single-vector incremental update (both run; summary vector stays warm). Negative events: none reach either path after Workstream B.

### A6. Batch refresh → k-means in the 24h recompute (`interactionUpdate.ts`, client path only)

The >24h-stale recompute lives in `useTasteProfile.ts:34` (client; the Edge never recomputes — verified). Alongside `recomputeFromInteractions`, new `recomputeInterestCentroids()`:
- Collect positively-interacted title embeddings from the event log (decay-weighted, same half-lives).
- If positives < 8: keep existing centroids (or bootstrap seeds), skip k-means — too little signal to cluster.
- Else k-means k = min(3, distinct-enough signal), k-means++ init seeded deterministically (sort keys → stable, replayable), ≤ 10 iterations over ≤ a few hundred 1536D points — milliseconds, no library needed (~60 lines, unit-tested; `vectorOps.ts` already has the primitives).
- Refresh `weight` = each centroid's share of decay-weighted positive interactions (floor 0.15, renormalise). Save via A1.

### A7. Fallback ladder (rollout safety)

`useForYouContent` + `render-foryou-rows` read centroids; if **zero rows** → legacy single-vector pipeline, identical to today. Existing users get centroids on their next 24h recompute or onboarding retake — self-healing, **no backfill migration**. Every commit in §7 keeps the app shippable in this mode.

### A8. Mirror updates (ADR-011, D1 — final time)

Touched in `_shared/`: `recommendations-v2/{ranker,types,weights}.ts`, `taste-v2/{tasteProfileV2,types}.ts`, plus new `recommendations-v2/{avoidSet,exploration}.ts` (below). `bootstrap.ts`/`interactionUpdate.ts` are client-only (not in the mirror — Edge doesn't update vectors) and stay that way. `shared-tree-drift` passes by construction (both trees touched every commit that touches either).

---

## 3. Workstream B — Avoid-set negative scoring

### B1. Remove negatives from the vector paths

- `types.ts`: `INTERACTION_WEIGHTS` — `thumbs_down` and `watchlist_remove` removed from the table (events still logged, still hard-filtered); `NEGATIVE_EVENTS` retired from the update paths.
- `applyInteractionIncremental` / `applyInteractionToCentroids` / `recomputeFromInteractions`: negative branch deleted — replay is clean because the log is the source of truth (re-running the recompute heals every existing vector; the 24h cycle does this automatically, no migration).
- **Decision point for Joe (Q1):** brief §3.3 names the avoid set as `thumbs_down` + `not_interested` (N=50). `watchlist_remove` (−0.4 today) is also a negative-weight event. Recommendation: remove it from the vector path too (same "moving away ≠ avoiding" argument) but do **not** put it in the avoid set — un-saving a title is housekeeping, not aversion. It becomes taste-neutral.

### B2. Avoid-set derivation + cache (`recommendations-v2/avoidSet.ts`, new, mirrored)

- `fetchAvoidSet(client, userId)`: last **N = 50** `thumbs_down` + `not_interested` rows from `user_interactions`, batch-fetch their embeddings (≤ 50 vectors, Float32Array + cached norms, same shape as `embeddingCache`). Fully derived from the event log — replayable, no backfill (brief §3.3).
- Cache: client localStorage 24h keyed `userId : latest-negative-created_at` (an interaction that adds a negative naturally busts it); Edge per-instance Map, same key. Both mirror the proven embedding-cache pattern incl. `clearOnSignOut`.

### B3. Scoring-time penalty

`applyAvoidPenalty(scored, avoidSet, embeddingMap, gamma)` — runs **after** `fetchEmbeddingsForCandidates` (top-200) and before row building, on both client and Edge paths: `finalScore −= γ · max_cosine(candidate, avoidSet)`, then re-sort. γ = **0.15** starting value in `weights.ts` (`AVOID_PENALTY_GAMMA`), tuned in the eval gate.

**Deliberate trade-off:** the penalty covers the top-200 (where `embeddingMap` already exists), not all 500 — penalising the full pool would require the ~3MB full-pool embedding fetch that Phase 5 deliberately avoided. Rows draw from the top ~100, so suppression lands where it's visible; the eval's avoid-set check (§6) measures exactly this. If recall@top-20 suppression proves insufficient, the fallback lever is penalising inside the RPC (SQL max-cosine against 50 vectors) — noted, not built.

---

## 4. Workstream C — Exploration slot

### C1. Seen-set (`recommendations-v2/exploration.ts`, new, mirrored)

"Zero prior impressions for this user" = distinct `content_id` from the user's own `card_impressions`, last 90 days (matches the raw-row retention window). Client queries own rows under RLS; Edge via service-role + `withUserScope`. Session-scoped module cache.

### C2. Selection

From the post-penalty scored pool: band = **40th–70th cosine percentile** (constants `EXPLORATION_BAND` in `weights.ts`); drop seen + watchlisted; fetch `popularity` for the band ids (light 3-column query — band ranks ~150–300 sit outside the top-100 metadata fetch); popularity-weighted sample of **2** without replacement, RNG seeded `hash(userId + yyyymmdd)` — stable within a day (no slot-flicker on re-render or Edge/client divergence within the parity probe's run), rotates daily. Full metadata fetched for the ≤ 2 picks only.

### C3. Placement + tagging

- Build Recommended For You at `limit − 2` as normal, then splice exploration picks at positions **6 and 14** (1-indexed; visible without displacing the head). Constants, not magic numbers. Picks join the cross-row dedupe set.
- `ContentItem` gains optional `exploration?: boolean`; `ContentRow.tsx` passes `metadata: { exploration: true }` into the existing `recordImpression` metadata plumbing (jsonb column from migration 033 — zero DDL). The Edge response already serialises `ContentItem`s; flag rides through `edgeRender` (mapping verified to preserve the field, test added).
- ENG-2 reads exploration CTR straight from `v_training_examples.exploration`.

This formalises inside the flagship row what "Outside Your Usual" gestures at; that row itself is unchanged this phase.

---

## 5. Workstream D — Training-data groundwork

### D1. Position-at-click

`card_impressions` already logs `position`/`source_surface`/`session_id`. The gap is on the **interaction** side. New `src/lib/instrumentation/clickContext.ts` (the `searchAttribution` stash pattern, proven in Phase Search V2):
- `setCardClickContext({ contentKey, position, surface })` called from the card-tap handlers in `ContentRow.tsx`, `BrowsePage.tsx`, `MoodRoomPage.tsx` (the exact three components that already call `recordImpression` — they have index + surface in hand; no prop-drilling through six pages).
- `emitInteraction` (`storage/interactions.ts:58`) merges `{ position, source_surface }` into `metadata` for taste-relevant events whose contentKey matches the stash within a 30-min window; stash replaced on next card tap. ContentKey matching makes cross-contamination structurally impossible.
- Positional bias handling stays an ENG-2 training-time concern; ENG-1's job is only that the field is reliable from day one (brief §3.5).

### D2. The view — see migration 045 (§1.2).

---

## 6. Eval gate (phase exit — brief §3.6)

New `scripts/evaluation/eng1-eval.ts` (joins `rank-eval.ts` in the existing harness; `npm run eval:eng1`), driven by the `taste-profile-tester` rig for synthetic profiles + the two prototype accounts:

| Check | Method | Pass bar |
|---|---|---|
| Recall@500 | Hold out last 20% of positive interactions; rebuild centroids from first 80%; candidate-pool recall of held-out titles, multi vs single-centroid | Multi ≥ single (strictly better on multi-modal profiles) |
| Coverage | Synthetic comedy+thriller profile; top-20 of Recommended For You; distinct `sourceSlot` count | ≥ 2 interests (baseline demonstrably fails) |
| Avoid-set | Nearest-neighbours of thumbs-downed titles in top-20 before/after; recall on positives | Measurable suppression, zero positive-recall regression; γ swept 0.10/0.15/0.20 |
| τ merge threshold | Pairwise cosine matrix over all 24 onboarding clusters + merge outcomes at τ ∈ {0.75, 0.80, 0.85} | Picked from data; recorded in eval doc |
| Parity | `foryou-parity` probe | Green on final commit (golden regenerated once via `--update-golden` after behaviour is verified — output legitimately changes; the probe's job is Edge ≡ client, which the lockstep mirror preserves) |
| Regression | `rank-eval.ts` + vitest suites (`npm test`) | Green throughout |

Results land in a dated eval doc per house convention; γ and τ finals get recorded in `weights.ts` comments + the phase summary.

---

## 7. Commit sequence (each leaves the app shippable; mirror updated in the same commit)

1. **Migration 044** + `InterestCentroid` types + CRUD (client + `_shared`) + GDPR RPC extensions. Apply 044.
2. **Bootstrap seed grouping** (`bootstrapInterestCentroids` + unit tests; onboarding wire-up).
3. **Retrieval + scoring**: per-centroid pools, dedupe, interleave, `sourceSlot` (ranker/types, client + Edge callers, fallback ladder).
4. **EMA nearest-centroid + k-means batch refresh** (+ unit tests for both; deterministic k-means++ seeding).
5. **Workstream B**: negatives out of vector paths, `avoidSet.ts`, γ penalty in both pipelines (+ tests).
6. **Workstream C**: `exploration.ts`, row splice, `ContentItem.exploration`, impression metadata, Edge payload test.
7. **Workstream D**: `clickContext.ts`, `emitInteraction` merge, **migration 045**. Apply 045.
8. **Eval + close-out**: `eng1-eval.ts`, golden regen, dated eval doc, phase summary in `docs/v2/phase-summaries/`, parking-lot entries (impressions media_type caveat; anything else surfaced), wiki ingest riding this PR, **in-phase bloat sweep** (no one-off scripts left at `scripts/` root, docs touched by the phase updated).

Joe reviews this plan → implementation → eval gate → summary → merge `--no-ff` (per §12 process notes and orchestration §4.4 — the plan-review gate is why this document exists).

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Interleave changes For You feel for existing single-interest users | Single-cluster onboarding profiles merge to K=1 → behaviour ≈ today's; fallback ladder covers un-migrated users; coverage eval only demands multi-interest where the profile is genuinely multi-modal |
| k-means instability on thin data | <8 positives → skip; deterministic seeding; weights floored at 0.15 |
| Avoid penalty top-200 scope misses deep-pool offenders | Eval measures top-20 suppression (what users see); RPC-side penalty is the documented escalation lever |
| Golden-probe churn | Regen once, last commit, after eval green — not per-commit |
| 3× RPC fan-out latency | Parallel `Promise.all`; 3×200 ≤ the old 1×500 row volume; measured in eval doc before/after |

## 9. Open questions for Joe (answers gate the matching commit, not the phase start)

1. **`watchlist_remove`** — drop from vector path, keep out of avoid set (recommended, §B1)?
2. **Two migrations (044 + 045)** vs brief's "expects one" — split recommended (§1.2); orchestration v0.8 already words it this way.
3. **Exploration placement** — 2 slots at positions 6 and 14 with daily-seeded rotation: happy with positions/count?
4. **Interest-weight floor 0.15** — guarantees a minority interest ~30 of 600 retrieval slots; confirm or adjust.
