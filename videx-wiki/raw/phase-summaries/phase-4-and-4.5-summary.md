# Phase 4 + 4.5 Combined Phase Summary

**Status:** Phase 4 closed 2026-04-19. Phase 4.5 closed 2026-04-27.
**Branches:**
- Phase 4: direct commits to `main` (no phase branch)
- Phase 4.5: `phase-4.5-mood-rooms` (Gates 1–4 + redirect)
**Total scope:** ranking pipeline + row composition (Phase 4) → mood rooms shipped twice (Phase 4.5 Gates 1–4: global HDBSCAN + Phase 4.5 redirect: title-anchored).
**Predecessor summaries:**
- [Phase 4 summary](phase-4-summary.md) — ranking pipeline core (April 17–19, 2026)
- [Phase 4.5 anchored rooms summary](phase-4.5-anchored-rooms-summary.md) — redirect (April 27, 2026)

This document is the **combined wrap-up** covering all Phase 4 / 4.5 work: the Phase 4 multi-stage ranker, the Phase 4.5 Gates 1–4 mood rooms infrastructure (HDBSCAN clustering + RPCs + the original global-rooms For You row), and the Phase 4.5 anchored rooms redirect that flipped the For You row mid-phase. Pre-launch blockers register item 21 ("Phase 4.5 end-of-phase summary doc") is closed by this file.

---

## Section 1 — Headline outcomes

By the end of Phase 4.5:

- **For You surface ships seven rows** (sliders entry → Recommended For You → **anchored Mood Rooms for Tonight** → Hidden Gems → up to two Because You Watched → More From [Director/Actor] → Outside Your Usual → From Your Watchlist).
- **Home surface ships seven rows** (Hero Carousel → Recently Added → Trending → Coming Soon → Per-Service Charts → Critically Acclaimed [gated] → Genre Spotlight).
- **Single source of truth for ranking weights** at `src/lib/recommendations-v2/weights.ts`. All sliders wired to pipeline parameters (haptic feedback, debounced re-rank, debounced Supabase save).
- **Global mood rooms infrastructure** persists for v2.5 browse + Phase 7 conversational discovery. 68 LLM-labelled clusters, monthly Python + GitHub Actions HDBSCAN cron, server-side RPCs.
- **Title-anchored mood rooms** ship as the For You row in v1, generated on demand from a tiered anchor ladder (behavioural intersection → cluster representatives → top-finalScore fallback). Reusable primitive at `src/lib/recommendations-v2/anchoredRoom.ts` enables Phase 6+ detail-page room generation (IN-464).
- **Instrumentation in place** for the Phase 6 onboarding decision (IN-OB-006) — migration 033 captures per-impression anchor metadata that telemetry agent at `trig_0136s6XZdr7L5gxj6CKTm4im` will read in two weeks.

Verification across both phases:
- `npx tsc --noEmit`: clean (0 errors).
- `npx vite build`: succeeds in ~3s; main chunk 519kB (Phase 4 baseline; redirect added no measurable size).
- `npx eslint src/`: 0 errors, 168 warnings (Phase 4 baseline 159 + 9 from new pipeline `as any` patterns matching existing convention).

---

## Section 2 — What landed in Phase 4 (ranking pipeline core, April 17–19)

Full detail in [phase-4-summary.md](phase-4-summary.md). Recap for completeness:

### Pipeline core
- `src/lib/recommendations-v2/weights.ts` — Stage 2 weights (taste 62.5% / recency 25% / contextual 12.5%), 5 slider mapping functions, scoring utilities.
- `recency.ts` — Home (piecewise linear) and For You (exp decay 180-day half-life) recency scoring.
- `contextual.ts` — Phase 4 placeholder returning 0.5; Phase 5 swap-in.
- `diversity.ts` — `applyGenreSpread`, `deClusterByService`, `applyContentMixRatio`.
- `ranker.ts` — `fetchCandidatePool`, `scoreCandidates`, `buildRowFromPool` orchestrator.
- `types.ts` — `PipelineInput`, `CandidatePool`, `ExtendedTitleRow`, `ScoredCandidate`.

### Surface rebuilds
- Home: 7 rows (Hero Carousel, Recently Added, Trending, Coming Soon, Per-Service Charts, Critically Acclaimed [gated], Genre Spotlight).
- For You: 7 rows (Recommended For You, Hidden Gems, Because You Watched, More From, Outside Your Usual, From Your Watchlist + Mood Rooms position reserved).

### Slider tray + haptics
- `SliderTray.tsx` bottom-sheet pattern with debounced rerank (300ms), debounced Supabase save (500ms), shared state via `taste_profiles` slider columns. `@capacitor/haptics` `ImpactStyle.Light` on label boundary crossings.

### Evaluation harness
- `scripts/evaluation/rank-eval.ts` — diagnostic script outputting scored top-50 with per-component breakdowns + row assignments.

### Phase 4 deletions
- `useRecommendations.ts`, `useHiddenGems.ts`, deprecated `rankTitles()` / `rankHiddenGems()`, multi-genre `LazyGenreSection` block, legacy `FeaturedHero` wrapper.

### Phase 4 actuals
- 21 files changed (+2,652, −663 lines net +1,989).
- Zero migrations.
- 260ms time-to-first-render with warm filter sets (profile 75ms + pool 183ms).

---

## Section 3 — What landed in Phase 4.5 Gates 1–4 (global mood rooms, April 19–22)

This section was previously undocumented (pre-launch blockers item 21). Phase 4.5 originally shipped the For You "Mood Rooms for Tonight" row by globally clustering the catalogue, naming each cluster, and ranking those clusters by cosine distance to the user's taste vector. Below is the wrap-up.

### Gate 1 — schema (April 19)

- **Migration 029** (`mood_rooms` + `clustering_runs`): cluster metadata + `centroid vector(1536)` for frontend taste-fit scoring. Authenticated SELECT on `mood_rooms`, service_role only on `clustering_runs`.
- **Migration 030** (`mood_room_titles`): join table mapping cluster membership. `(mood_room_id, tmdb_id, media_type)` composite PK, `centrality REAL`. No FK to `titles` (matches project convention).
- Filed parking-lot **IN-458** (`getAvailableTmdbIds` does not distinguish by `media_type`) — pre-existing imprecision surfaced during Gate 1, deferred.

### Gate 2 — clustering pipeline (April 19–20)

- **Python script** `scripts/mood_rooms/recluster.py`, dependencies in `scripts/mood_rooms/requirements.txt`, GitHub Actions workflow `.github/workflows/mood-rooms-recluster.yml` scheduled `0 3 1 * *` (03:00 UTC, 1st of month).
- **psycopg2 direct connection** for bulk vector pulls (avoids PostgREST 1000-row cap; faster). **Two-scope connection model** to defer secret hostnames until late in run, hardened `redact()` against psycopg2 host-translation leaks.
- **UMAP preprocessing** (1536D → 10D, cosine metric) added after pure HDBSCAN failed (2 clusters / 10% coverage). With UMAP+HDBSCAN: **68 clusters at 53.5% catalogue coverage**.
- Four orthogonal tuning passes (UMAP `n_neighbors`, HDBSCAN `min_cluster_size`, `cluster_selection_method`, `max_cluster_size`) confirmed coverage plateau is structural at 51–58%. Hybrid HDBSCAN+kmeans rejected (would degrade quality). Documented in **Strategy v1.6.3 §5.2** and parking-lot **IN-457** / **IN-459**.
- Centroids and centrality computed in **original 1536D space** (UMAP for assignment only) so frontend scoring works against 1536D taste vectors.

### Gate 3 — labelling (April 20–21)

- **Two-pass GPT-4o labelling**: 20 most-central titles per cluster → 2-4 word name + 1-sentence description. First pass shipped 6 different "Echoes"/"Whispers" rooms; fixed by hand for the initial 68 rooms via one-off SQL relabel + permanent prompt rewrite that bans those words and threads previously-generated labels back into each subsequent prompt.
- **Stability preservation** via Jaccard ≥ 0.8 across monthly runs preserves cluster ID + label.
- Parking-lot **IN-460** filed (`actions/setup-python` upgrade when v6 ships, Node 20 deprecation).
- Parking-lot **IN-461** filed (review `FORBIDDEN_WORDS` compound-noun carve-outs after May cron — "Bedtime Fairy Tales" / "Stand-Up Showcase" are exceptions to the strict rule).
- psycopg2 UUID adapter registration fix landed mid-gate.

### Gate 4 — UX integration + hotfixes (April 21–22)

- **Components and hook (Context 3 integration)**:
  - `useMoodRoomsRow` (now removed, see Section 4) — weekly-pool localStorage cache with `featuredLastWeek` exclusion; time-of-day reorder.
  - `MoodRoomCard` (now removed) — 200×280 frame with 2×2 thumbnail grid.
  - `MoodRoomsRow` (now removed) — horizontal scroll row.
  - `MoodRoomPage` (preserved, refactored in redirect) — full per-room title list with impression batching, scroll preservation, pagination at 30 per page.
- **Migration 031** (Gate 4 hotfix): three server-side RPCs — `get_mood_rooms_for_user`, `get_mood_room_thumbnails`, `get_mood_room_detail`. Replaced a client-side data path that had been silently filtering most rooms out via PostgREST's 1000-row cap (only the 2 biggest rooms surfaced).
- **Migration 032** (Gate 4 hotfix): drop and recreate `card_impressions.source_surface` CHECK constraint to include `'mood_room'`. The original constraint from migration 014 had been silently rejecting every batch flush containing a mood_room row.
- Smaller Gate 4 fixes:
  - MoodRoomPage effect dep stability (parent re-renders on every scroll pixel were re-firing the data fetch).
  - MoodRoomPage grid card sizing.
  - Scroll restore + Android back button when navigating from MoodRoomsRow → MoodRoomPage → back.
- Parking-lot **IN-462** filed (For You tab-switch preservation — full pipeline re-fires on each tab bounce; Phase 5 fix).

### Gate 4 close — what shipped on the For You row

End of April 22: 5 globally-ranked rooms per user per week, weekly refresh with `featuredLastWeek` exclusion, time-of-day reorder. The user surface looked correct but the ranking quality was off — see Section 4.

---

## Section 4 — What landed in Phase 4.5 redirect (anchored rooms, April 22–27)

Full detail in [phase-4.5-anchored-rooms-summary.md](phase-4.5-anchored-rooms-summary.md). The Gates 1–4 row's ranking quality issue (centroid-flattening of niche cluster picks) was diagnosed in `Mood_Rooms_Ranking_Quality_Investigation_2026_04_22.md`, prototyped in `Mood_Rooms_Anchored_Probe_2026_04_26.md`, and resolved by flipping the For You row from global cosine ranking to title-anchored generation.

### What changed
- **For You row**: global rooms → title-anchored, 5 per user per week, "If you love {anchor}".
- **Anchor selection ladder** (`anchorSelection.ts`): Tier 1 behavioural intersection with three guards (combined-signal, similarity gate ≥ 0.55, cluster-coherence under cold-start), Tier 2 cluster representatives (one per cluster), Tier 3 top-finalScore fallback (≥ 0.65). Cross-tier collision rule prevents Tier 1 horror anchor coexisting with Tier 2 horror cluster anchor.
- **Reusable primitive** (`anchoredRoom.ts`): `buildAnchoredRoom(opts)`. Used by both the anchored mood rooms row and the Because You Watched row (the latter migrated from `fetchAnchorNeighbours`, which was deleted as a single-callsite duplicate).
- **MoodRoomPage parameterised** with `kind: 'global' | 'anchor'` discriminated union + swappable detail-fetcher. Global path preserved for v2.5 browse.
- **New components**: `AnchorMoodRoomCard`, `AnchorMoodRoomsRow`. Old global For You consumers (`useMoodRoomsRow`, `MoodRoomsRow`, `MoodRoomCard`) deleted as dead code.
- **Migration 033** (planned): `card_impressions.metadata jsonb` + `'anchor_room'` source_surface. Per-impression metadata captures `{ anchor_tmdb_id, anchor_media_type, anchor_tier, anchor_source_cluster_id, tier_1_inside_stated_cluster }`.
- **Code review fixes applied**: Tier 1 truncation moved post-guard, Tier 1 sequential embedding re-fetch eliminated (returns embedMap from `selectTier1`), `useAnchorMoodRooms` cancellation guard via `loadGenRef`, `poolReady` simplified to `pool != null`, defensive client-side filter on batch embedding fetch.

### Documentation bumped
- Strategy **v1.6.3 → v1.7** (§5.2.1 anchored ranking layer, §9.3 commits, §8.2 open question on guard thresholds).
- Project Orchestration **v0.3.3 → v0.4** (§3.4 migration 033, §3.4 Phase 4.5 description rewritten, §11 confirmed decisions).
- Composition Hypothesis **v0.3 → v0.4** (§3.2 row 2 rewritten, §3.6 v2.5 confirmed global).
- Parking Lot **v0.3.4 → v0.4** (IN-463 LLM labels, IN-464 detail-page rooms, IN-465 catalogue-sync gap, IN-OB-006 onboarding cluster review).
- Diagnostic doc closed with resolution-path footer + correction of probe's "79.2% coverage" framing.
- Wiki concepts (`mood-rooms.md`, `for-you-surface.md`) updated.

---

## Section 5 — Migrations applied across both phases

| Migration | Title | Applied | Phase |
|---|---|---|---|
| 029 | mood_rooms + clustering_runs | 2026-04-19 | 4.5 Gate 1 |
| 030 | mood_room_titles | 2026-04-19 | 4.5 Gate 1 |
| 031 | mood_rooms server-side RPCs | 2026-04-21 | 4.5 Gate 4 hotfix |
| 032 | card_impressions 'mood_room' source_surface | 2026-04-22 | 4.5 Gate 4 hotfix |
| 033 | card_impressions 'anchor_room' + metadata jsonb | ⏳ Planned | 4.5 redirect |

Five migrations total across Phase 4 and 4.5 (Phase 4 itself shipped zero migrations).

---

## Section 6 — Decisions made across both phases

### Phase 4 (full table in [phase-4-summary.md](phase-4-summary.md))
- 3-component scoring (62.5/25/12.5) + 2 post-processing stages, not literal 5-component sum.
- Genre-spread heuristic instead of MMR for diversity (Phase 5 swap).
- One shared 500-candidate pool for taste-vector rows; separate calls for Because You Watched + More From.
- No RPC modifications — application-layer pipeline.
- Hero carousel: CSS scroll-snap + custom hook, no library.
- Critically Acclaimed gated disabled (OMDB coverage 0% RT / 12.3% IMDb on recent releases at phase end).
- Supabase `<Database>` generic reverted (47 pre-existing errors out of scope).

### Phase 4.5 Gates 1–4
- **HDBSCAN over k-means** for cluster shape (parking-lot IN-451).
- **UMAP preprocessing** to escape curse-of-dimensionality on raw 1536D (Strategy §5.2 + IN-457).
- **Python via GitHub Actions monthly cron** because HDBSCAN has no production-quality TypeScript implementation (ADR-005).
- **psycopg2 direct connection** for bulk vector pulls, avoiding PostgREST 1000-row cap.
- **Coverage prioritised quality over coverage** — hybrid HDBSCAN+kmeans rejected. Plateau at 53.5% accepted as structural.
- **Two-pass LLM labelling** with editorial override + permanent prompt rewrite + `FORBIDDEN_WORDS` check (post-Echoes-collision incident).
- **Server-side RPCs (migration 031)** required mid-phase when client-side ranking tripped over PostgREST cap.

### Phase 4.5 redirect
- **Title-anchored over global cosine** for For You row (resolution to centroid-flattening diagnostic).
- **Single migration 033 with two changes** (extend CHECK + add metadata column) — one DDL.
- **Generic metadata jsonb column** so future surfaces don't need another migration.
- **Watchlist exclusion off for anchored rooms, on for BYW** — semantic difference per brief §1.4 step 5.
- **Renumber parking-lot IDs** (brief assumed IN-455/456 next-available; both taken; used IN-463/464/465).
- **Refactor BYW to shared primitive** rather than maintain near-duplicate.
- **Delete legacy For You-only consumers** rather than leave dead code.
- **`source_surface='anchor_room'` over metadata-only disambiguation** for clean indexable per-row CTR.

---

## Section 7 — Process deviations

- **Phase 4** mid-phase slider tuning after user testing (slider clunkiness + 6.3s For You load → fixes applied: rerank debounce 150→300ms, metadata fetch capped at top-100, `watched` event name bug fixed, anchor fetches parallelised). Implementation bugs surfaced by testing, not scope creep.
- **Phase 4.5 Gate 2** four orthogonal tuning passes ran inside the gate (UMAP/HDBSCAN parameter sweep) before accepting the coverage plateau. Documented in IN-457 + Strategy §5.2 + Phase 4.5 close-out. Not a process breach — the alternative was shipping 2 clusters / 10% coverage.
- **Phase 4.5 Gate 4** hotfixes (RPCs migration 031, source_surface CHECK migration 032) discovered during smoke testing. Two unplanned migrations landed mid-gate.
- **Phase 4.5 redirect** triggered by post-Gate-4 quality observation rather than pre-planning. Diagnostic + probe ran in dialogue; redirect implementation followed the kick-off brief without further deviations.

---

## Section 8 — Open items carried to Phase 5 / 6 / pre-launch

These are the items inherited from Phase 4 that remain open, plus new ones surfaced in Phase 4.5:

| ID | Item | Phase target | Source |
|---|---|---|---|
| IN-463 | LLM thematic labelling for anchored rooms | 4.5 fast-follow | redirect |
| IN-464 | Detail-page "Make a room from this title" | 6+ | redirect |
| IN-465 | Catalogue-sync gap (3,807 missing tmdb_ids) | post-4.5 | redirect (probe correction) |
| IN-OB-006 | Onboarding cluster taxonomy review under v2 engine | 6 review | redirect (telemetry-driven) |
| IN-458 | `getAvailableTmdbIds` media_type imprecision | 5/6 | Gate 1 |
| IN-459 | Re-evaluate mood room coverage after 3 monthly runs | post-launch | Gate 2 |
| IN-460 | Upgrade `actions/setup-python` when v6 ships | time-triggered | Gate 3 |
| IN-461 | Review `FORBIDDEN_WORDS` compound-noun carve-outs after May cron | May 2026 | Gate 3 |
| IN-462 | For You tab-switch preservation | 5 | Gate 4 |
| MMR upgrade (Phase 5) | Genre-spread → MMR | 5 | Phase 4 |
| Contextual scorer (Phase 5) | `contextual.ts` placeholder → real signal | 5 | Phase 4 |
| `taste_profiles` RLS | Pre-launch GDPR blocker | 5/6 pre-launch | Phase 4 security review |
| Supabase `<Database>` generic | 47 pre-existing errors cleanup | 5/6 cleanup | Phase 4 |
| `watched` vs `marked_watched` | Drop one from CHECK constraint | 5/6 cleanup | Phase 4 |
| `getAvailableTmdbIds` page-count adaptive | 100K+ titles silent truncation | 5/6 scale | Phase 4 |

Pre-launch blockers register also tracks the security/GDPR/operational items not specific to a phase.

---

## Section 9 — Telemetry status

**Migration 033 not yet applied** — that's the gating step before any anchored rooms data accumulates. Once applied:

- Per-impression metadata (`anchor_tier`, `anchor_source_cluster_id`, `tier_1_inside_stated_cluster`) lands on every visible-card impression in MoodRoomPage for `kind='anchor'`.
- `useAnchorMoodRooms` returns `perAnchorLatencyMs: number[]` per render — currently exposed on the React hook surface but not persisted to a queryable store. The first telemetry agent run will flag this as a follow-up if needed.

**Telemetry agent armed** at routine `trig_0136s6XZdr7L5gxj6CKTm4im` for Mon 2026-05-11 09:00 UTC. Runs once, attached to Supabase MCP, opens a PR with findings on a fresh branch. Priority order baked into the prompt:
1. Tier distribution stratified by interaction count (red flag: Tier 3 >5% in any bucket)
2. `tier_1_inside_stated_cluster` ratio (>30% outside → Phase 6 onboarding signal)
3. Per-tier CTR (Tier 2 > Tier 1 = surprising; Tier 3 > either = very surprising)
4. Per-anchor latency p50/p95/p99 (>500ms p95 flag)
5. Anchor diversity over 2 weeks (week 1 vs week 2 distinctness)

---

## Section 10 — Documents updated across both phases

Phase 4:
- Strategy §5.2, §7.2 (Phase 4 entry → ✅ Complete; Phase 5 entry referenced).
- Orchestration §3.4 (Phase 3 + 4 actuals; planned migration 029 for `taste_profiles` RLS).
- Parking lot IN-401, IN-402, IN-403, IN-404 → ✅ Incorporated.

Phase 4.5 Gates 1–4:
- Strategy v1.6.3 (§5.2 mood rooms section).
- Orchestration v0.3.3 (§3.4 migrations 029–032).
- Parking lot IN-451 to IN-462 filed.

Phase 4.5 redirect:
- Strategy v1.6.3 → **v1.7** (§5.2.1 + §9.3 + §8.2 changes).
- Orchestration v0.3.3 → **v0.4** (§3.4 migration 033 + Phase 4.5 description + §11 commits).
- Composition Hypothesis v0.3 → **v0.4** (§3.2 row 2 + §3.6).
- Parking lot v0.3.4 → **v0.4** (IN-463, IN-464, IN-465, IN-OB-006).
- Diagnostic doc closed with resolution-path footer.
- Wiki concepts (`mood-rooms.md`, `for-you-surface.md`) updated.

---

## Section 11 — Verification at close-out (2026-04-27)

- `npx tsc --noEmit`: clean.
- `npx vite build`: succeeds in 2.77s. Main chunk 519kB (Phase 4 baseline; redirect added no measurable size).
- `npx eslint src/`: 0 errors, 168 warnings (Phase 4 baseline 159 + 9 from new pipeline files matching existing `as any` convention).
- Code review (TypeScript reviewer agent) ran post-implementation:
  - **3 issues flagged + applied**: Tier 1 sequential embedding re-fetch eliminated; Tier 1 truncation moved post-guard; `useAnchorMoodRooms` cancellation guard added.
  - **2 issues flagged + applied (smaller)**: `poolReady` simplified to `pool != null`; defensive client-side filter on batch embedding fetch.
  - 6 polish items deferred (rename suggestions, `as any` tightening, Tier 3 double-iteration refactor) — none are correctness issues.
- Pre-launch blockers register **item 21** ("Phase 4.5 end-of-phase summary doc") closed by this file.

---

## Section 12 — What this enables next

1. **Migration 033 deploy** is the gating step. Once applied, telemetry accumulates from session 1 and the scheduled telemetry agent (2026-05-11) gets useful signal.
2. **IN-463 (LLM labelling)** is unblocked: the anchored row is live; replacing literal labels with thematic ones is a self-contained Edge Function + label-cache project.
3. **IN-464 (detail-page room generator)** is unblocked: the primitive is exported. Phase 6+ work.
4. **IN-OB-006 (onboarding cluster review)** has its data source: 3 months of `card_impressions.metadata` will tell us whether Step 4's clusters are pulling weight.
5. **Phase 5** can begin with the contextual scorer, MMR upgrade, and the inherited cleanup items (taste_profiles RLS, Database generic, marked_watched normalisation).
6. **v2.5 dedicated mood rooms browse surface** can be built on top of the preserved `MoodRoomPage kind='global'` interface and the existing `mood_rooms` / `mood_room_titles` infrastructure.
