# Phase 4 Summary: Ranking Pipeline & Row Composition

**Branch:** `main` (direct commits, no phase branch)
**Duration:** April 17–19, 2026
**Commits:** 3 (Phase 4 core, review fixes, README update)
**Files changed:** 21 (2,652 insertions, 663 deletions — net +1,989 lines)

---

## What was delivered

### Core system replacement
- Replaced the Phase 3 cosine-only minimal ranker with a full **multi-stage recommendation pipeline** producing scored, diversified, service-spread results on a consistent numerical scale.
- All ranking weights, slider mappings, and feature flags consolidated into a **single source of truth**: `src/lib/recommendations-v2/weights.ts`.
- **Zero migrations** — all new logic is application-layer TypeScript.

### Pipeline core (6 new files + 2 updated)
- **`weights.ts`** — Stage 2 base weights (taste 62.5% / recency 25% / contextual 12.5%), 5 slider mapping functions, `CRITICALLY_ACCLAIMED_ROW_ENABLED` feature flag, scoring utilities (`parseRtScore`, `normalizePopularity`, `distanceToSimilarity`, `scoreToMatchPercentage`).
- **`recency.ts`** — two scoring functions: piecewise linear (Home surface, date anchor = `MAX(release_date, available_since)`) and exponential decay with 180-day half-life (For You surface, date anchor = `release_date`).
- **`contextual.ts`** — Phase 4 placeholder returning neutral 0.5 for all candidates. Pluggable function signature designed for Phase 5 drop-in replacement (device, time-of-day, viewing-context).
- **`diversity.ts`** — three post-processing functions: `applyGenreSpread` (two-level diversity with TMDb primary genre + taste cluster secondary signal), `deClusterByService` (positional max-2-consecutive constraint), `applyContentMixRatio` (movie/TV resampling with running-counter interleave).
- **`ranker.ts`** — full rewrite as pipeline orchestrator. Exports: `fetchCandidatePool` (shared 500-candidate retrieval + hard filters + extended metadata fetch), `scoreCandidates` (Stage 2 weighted scoring), `buildRowFromPool` (content-mix → genre-spread → de-cluster → ContentItem mapping), `fetchAnchorNeighbours` (per-anchor embedding retrieval for Because You Watched).
- **`types.ts`** — extended with `PipelineInput`, `CandidatePool`, `ExtendedTitleRow`, `ScoredCandidate`, `Stage2Weights`, `RowType`, `RowConfig`, `EXTENDED_TITLE_SELECT` constant.

### Home surface (7 rows)
Surface rebuilt top-to-bottom. Removed: "For You" row, "Hidden Gems" row, "Highest Rated" row, multi-genre `LazyGenreSection` rows. Final row composition:
1. **Hero Carousel** — 3-5 cards from popular titles with backdrop images, CSS scroll-snap, 6s auto-rotation, pause on touch with 3s resume, dot indicators. `FeaturedHeroCarousel` component with legacy single-item wrapper removed during cleanup.
2. **Recently Added to Your Services** — TMDb discover (date desc), via `useSectionData`.
3. **Trending Across Your Services** — TMDb discover (popularity desc), renamed from "Popular on Your Services".
4. **Coming Soon** — upcoming releases via `useUpcoming`. Titles table contains no future release dates, so this remains TMDb-backed (documented exception).
5. **Per-Service Charts** — one row per top-3 user service, ordered by `deep_link_click` count with fallback to onboarding service order. New `rows/home/perServiceChart.ts`.
6. **Critically Acclaimed** — gated behind `CRITICALLY_ACCLAIMED_ROW_ENABLED = false`. OMDB coverage query returned 0% RT / 12.3% IMDb on titles released in last 90 days — nowhere near the 80% gate. Row logic built and ready to enable via flag flip. New `rows/home/criticallyAcclaimed.ts`.
7. **Genre Spotlight** — weekly rotation across 16 taste clusters via `Math.floor(Date.now() / weekMs) % 16`. New `rows/home/genreSpotlight.ts`.

### For You surface (up to 7 rows, extracted to `ForYouPage.tsx`)
New hook `useForYouContent.ts` (472 lines) orchestrates all rows. Shared 500-candidate pool fetched once; taste-vector rows partitioned from the pool; conditional rows fetched in background (non-blocking first render). Row composition:
1. **Recommended For You** — top 20 after content-mix → genre-spread → de-cluster.
2. **Hidden Gems** — pool filtered by `HIDDEN_GEMS_FILTERS` (popularity 2-20, vote_count ≥ 50, vote_average ≥ 7.0), genre diversity cap 2 per genre, max 15.
3. **Because You Watched [Title]** — anchors = titles with BOTH positive engagement (`watchlist_add` OR `watched`) AND `thumbs_up` in last 60 days. Client-side intersection, top 2 anchors. Each anchor fetches neighbours via `fetchAnchorNeighbours` in parallel. Anchor title metadata fetched separately since watchlist hard filter excludes it from the main pool.
4. **More From [Director/Actor]** — person appearing in ≥2 of user's thumbs-up titles. Director preferred for movie-heavy users (≥60% movies); actor otherwise. Queries `titles WHERE director = name` or `cast_top_5 @> ARRAY[name]`. Minimum 5 available titles to render.
5. **Outside Your Usual** — bottom 30% cosine similarity but finalScore ≥ median + IMDb ≥ 7.0. Count modulated by Comfort Zone slider (5-15).
6. **From Your Watchlist** — unwatched watchlist items, recency-ordered.

(Mood Rooms position reserved for Phase 4.5 — not rendered in Phase 4.)

### Slider wiring (IN-401, 402, 403, 404 all ✅ incorporated)
- **`SliderTray.tsx`** — bottom-sheet pattern reusing `FilterSheet` motion.div + backdrop + spring animation. Contains same 4 sliders as `TuneRecommendationsPage`.
- **Haptic feedback** — `@capacitor/haptics` `ImpactStyle.Light` on every label boundary crossing (tracked via `prevLabelsRef`), fires once per change not continuously during drag.
- **Shared state** — `SliderTray` and `TuneRecommendationsPage` both read/write via `getSliderState()` / `saveSliderState()`. `invalidateV2ProfileCache()` called on save.
- **Debounced re-ranking** — 300ms debounce on `rerank()` call. In-memory re-scoring of cached candidate pool; no RPC re-call on slider change.
- **Debounced Supabase save** — 500ms on slider settle.

### Evaluation harness
- **`scripts/evaluation/rank-eval.ts`** — standalone Node script (no Vite runtime dependency). Accepts `--user-id <uuid>`, fetches taste vector + sliders + interactions, runs the full pipeline, outputs scored top-50 with per-component breakdowns + row assignments + diversity metrics. Not a test suite — a diagnostic tool.

### Deleted at phase end
- `src/hooks/useRecommendations.ts` (70 lines) — fully replaced by `useForYouContent`
- `src/hooks/useHiddenGems.ts` (70 lines) — fully replaced by `useForYouContent`
- Deprecated `rankTitles()` and `rankHiddenGems()` functions in `ranker.ts` (160 lines) — removed during review-fix commit
- Multi-genre `LazyGenreSection` block in `App.tsx` Home tab
- Legacy `FeaturedHero` single-item wrapper export

### Supabase typing (partially done, reverted)
- Attempted `createClient<Database>` generic on the shared Supabase client — exposed 47 pre-existing type mismatches across 6 files outside Phase 4 scope (supabaseStorage.ts, interactions.ts, analytics/logger.ts, reports/reportService.ts, taste-v2/bootstrap.ts, taste-v2/interactionUpdate.ts). Reverted with a doc-correction entry deferring full Database generic to Phase 5/6.
- Pipeline files handle typing via explicit `as unknown as ExtendedTitleRow` casts at result boundaries.

---

## Decisions made during execution

| Decision | Chosen | Why |
|---|---|---|
| Weight interpretation | 3-component scoring (62.5/25/12.5) + 2 post-processing stages | Brief's 5-component table describes intent; diversity and cross-service spread are inherently post-processing (MMR + positional de-clustering), not scoring components. Flagged in Strategy §5.2. |
| Diversity algorithm | Genre-spread heuristic with taste-cluster secondary signal | MMR requires 500 × 1536D embeddings client-side (~3MB transfer + ~23M float ops). Genre-spread achieves visual diversity with metadata already available. Netflix uses genre-level diversity rather than embedding MMR for within-row ordering. Pipeline designed as pluggable for Phase 5 MMR upgrade. |
| Candidate pool strategy | One shared 500-candidate pool for taste-vector rows + separate calls for anchor rows | Avoids 3× RPC cost for For You surface. Because You Watched uses per-anchor embeddings (different vector than user taste); More From uses SQL by person name (no RPC). |
| RPC modification | None (no migration) | The 500-result intersection against ~17K availability IDs is O(500) lookups — instant. The expensive part (building the availability set) is already parallelised + session-cached. |
| ef_search cap | None | Sub-100ms at current scale (~10K embedded titles). Revisit only if multiple RPC calls cause visible lag. |
| Hero carousel library | None — CSS scroll-snap + custom hook | Simple interaction; native mobile momentum scrolling is free with `scroll-snap-type: x mandatory`. Saves a dependency. |
| Per-service ordering | Query `deep_link_click` events, group by `metadata->>'service_id'` | Already available in `user_interactions`. Fallback to onboarding service order for new users. |
| Because You Watched query | Two separate queries + client-side intersection | Avoids a migration for a new RPC. At user scale (<1,000 interactions) the intersection is instant. Also broadened from `watchlist_add` alone to `watchlist_add OR watched` after discovering the emission pathway. |
| Event type naming | Accept `watched` (what's actually emitted) and `marked_watched` (what brief assumed) | `emitContentInteraction` emits `'watched'` — Phase 4 query accepts both. Cleanup filed in doc-corrections. |
| Critically Acclaimed row | Ships disabled behind feature flag | OMDB coverage check: 0% RT / 12.3% IMDb on recent releases. Joe flips flag when coverage reaches 80%. |
| `as any` cleanup scope | Pipeline files only, not the global client | Global `Database` generic exposed 47 pre-existing errors across 6 out-of-scope files. |

---

## Deviations from the brief

1. **Weight table interpretation.** Brief §3.2 lists 5 weights summing to 1.0 (taste 50% / recency 20% / contextual 10% / diversity 10% / cross-service 10%) with a `Final score = Σ (component × weight)` formula. Implementation uses 3 scoring components (62.5/25/12.5) + 2 post-processing passes. This was raised in plan review and approved.
2. **MMR deferred to Phase 5.** Brief §3.5 specifies MMR with λ parameter. Implementation uses genre-spread + taste cluster secondary signal. Pipeline's `applyGenreSpread` function signature designed so Phase 5 can swap in MMR without touching the orchestrator. Approved in plan review.
3. **Home surface row deletions.** Brief §4.1 lists 7 Home rows. Implementation removed additional Phase 3 rows from Home that weren't in the brief: For You, Hidden Gems, Highest Rated, multi-genre LazyGenreSection. These either moved to For You surface or were subsumed by new rows (Critically Acclaimed replaces Highest Rated when enabled; Genre Spotlight replaces multi-genre).
4. **Critically Acclaimed gated disabled.** OMDB coverage insufficient at phase end — ships with feature flag false, logic complete.
5. **Supabase `<Database>` generic reverted.** Exposed 47 pre-existing errors outside Phase 4 scope. Deferred to Phase 5/6 cleanup.

---

## Process deviations

1. **Mid-phase slider tuning after user testing.** Joe tested the first build and reported slider clunkiness + 6.3s For You load. Two rounds of fixes applied mid-phase: increased rerank debounce 150ms → 300ms, capped metadata fetch at top-100 candidates (cut candidate pool from 5.3s to ~180ms), fixed `watched` event name bug, parallelised anchor fetches. Not a process breach — these were implementation bugs surfaced by testing, not scope creep.
2. **Review fixes in a second commit.** Phase 4 core committed first (20 files), then a separate commit applied architecture/security/performance review findings (7 files) before phase close-out. Keeps the review feedback loop auditable in git history.

---

## Documentation updates needed (applied at phase close-out)

- **Strategy doc §5.2:** Added Phase 4 implementation note explaining the 3-component weighted sum + 2 post-processing interpretation of the 5-weight table.
- **Strategy doc §7.2:** Phase 4 entry updated to ✅ Complete with implementation details. Phase 5 entry updated to reference Phase 4's contextual placeholder and weight re-evaluation requirement.
- **Orchestration doc §3.4:** Added Phase 3 and Phase 4 actuals notes. Added planned migration 029 for `taste_profiles` RLS (pre-launch blocker).
- **Parking Lot IN-401, IN-402, IN-403, IN-404:** all marked ✅ Incorporated with implementation details.

---

## Open items carried forward to Phase 4.5 / 5 / 6

1. **Mood Rooms for Tonight row** (Phase 4.5) — position reserved on For You surface, not rendered.
2. **MMR upgrade** (Phase 5) — current genre-spread heuristic is pluggable; swap in MMR if visual diversity needs more nuance.
3. **Contextual scorer** (Phase 5) — `contextual.ts` placeholder returns 0.5. Phase 5 replaces with device/time/context scoring. When shipped, re-evaluate the 62.5/25/12.5 weight split.
4. **`taste_profiles` RLS** (Phase 5/6 pre-launch) — table has no `ENABLE ROW LEVEL SECURITY`. Security review M1 finding. GDPR/privacy blocker.
5. **Supabase `<Database>` generic** (Phase 5/6 cleanup) — 47 pre-existing type mismatches in 6 out-of-scope files block the global generic. Full cleanup is a multi-file tidy-up.
6. **`watched` vs `marked_watched` event type** (Phase 5/6 cleanup) — `user_interactions` check constraint accepts both; `emitContentInteraction` only emits `'watched'`. Drop `marked_watched` from constraint.
7. **Availability page-count adaptive strategy** (Phase 5/6 scale) — `getAvailableTmdbIds` fires 20 parallel pages unconditionally. At 100K+ titles this will silently truncate.

---

## Verification results

### Schema ✅
- Zero Phase 4 migrations (as planned)
- Migration 028 (`get_available_tmdb_ids`) still active from Phase 3

### Code ✅
- `npx tsc --noEmit`: clean (0 errors)
- `npx eslint src/`: 0 errors, 159 pre-existing warnings (mostly `as any` patterns documented for Phase 5/6)
- `npx vite build`: succeeds in ~2.4s
- Zero grep hits for `scoringMode: 'none'` in composed-row code paths (acceptable exception for TMDb-backed utility rows documented)
- All ranking weights sourced from `weights.ts`

### Behavioural ✅
- Cold-start user: Recommended For You populated from bootstrap vector; conditional rows absent
- Mature user (Joe): all 3 taste-vector rows + Because You Watched [Sinners] + From Your Watchlist populated
- Hero carousel: swipes manually, auto-rotates every 6s, pauses on touch, resumes after 3s, loops
- Content Mix slider at extremes: 0.0 shows mostly movies, 1.0 shows mostly TV
- Catalogue-age slider: modulates recency weight visibly (new releases at 0.0, back catalogue at 1.0)
- Cross-service de-clustering: no 3+ consecutive same-service titles observed
- Haptic feedback: fires at threshold boundaries on device
- "Not Interested" button: Phase 0 wiring verified end-to-end during audit
- Performance: 260ms time-to-first-render with warm filter sets (profile 75ms + pool 183ms)

### Evaluation harness ✅
- Script runs end-to-end against real user data
- Outputs scored top-50 with per-component breakdowns, row assignments, and diversity metrics

### No regressions ✅
- Watchlist, Browse, Search, Coming Soon all load correctly
- Bottom nav 5 tabs (Home, For You, Browse, Watchlist, Profile)
- Sliders persist across page reloads and across Profile ↔ For You locations

---

## Observations for Phase 5

1. **The contextual placeholder is load-bearing for the weight table.** When Phase 5 replaces `computeContextualScore()` with a real scorer, the 62.5/25/12.5 split needs re-evaluation. The contextual component currently carries 12.5% weight but has zero ranking influence (always 0.5). A real signal will absorb weight from taste and recency.
2. **Coming Soon data source limitation.** The `titles` table sync pipeline doesn't fetch future release dates. Coming Soon remains TMDb-backed via `useUpcoming`. If Phase 5 wants to add contextual signals to Coming Soon (e.g., "releases this week on your favourite service"), the sync pipeline needs a companion fetcher for unreleased titles.
3. **Per-Service Charts depends on Supabase `streaming_availability` data.** If Supabase availability data is sparse for a service (BBC iPlayer empty catalogue per Phase 2 findings), the row won't populate. Current fallback is the service order from onboarding.
4. **Hidden Gems thresholds are still the Phase 3 values** (popularity 2-20, vote_count ≥ 50, vote_average ≥ 7.0). Worth tuning during Phase 5 based on observed user engagement with the row.
5. **Shared candidate pool size (500) is untuned.** Chosen as a round number. Phase 5 could investigate whether 300 is sufficient for all row selection needs — would reduce per-query cost.
