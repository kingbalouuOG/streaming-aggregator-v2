# Phase Search V2 Summary — Filtered + Semantic Search

**Status:** Phase Search V2 closed 2026-05-13.
**Branch:** `phase-search-v2` (PR #8).
**Predecessor:** [Phase 5 summary](phase-5-summary.md).
**Successor:** Phase 5.5 (deferred items from Phase 5) — picks up after this phase closes.
**Brief (retrieval/data/instrumentation):** `docs/design/search/Phase_Search_V2_Kickoff.md`.
**Brief (visual spec/copy):** `docs/design/search/Phase_Search_V2_Implementation_Brief.md` + 8 artboards.
**Strategy context:** `videx-wiki/raw/v2-strategy/Videx_v2_Search_Strategy_Annex_v0.1.md`.
**Plan:** `~/.claude/plans/we-re-starting-phase-search-steady-sketch.md`.

Phase Search V2 converted Browse from a thin TMDb `/search/movie` + `/search/tv` wrapper into a proper filtered-search surface (Cluster A, unflagged) and shipped an opt-in semantic mode behind the per-user `search_semantic` feature flag (Cluster B). Estimated 6–8 days; landed in one focused push.

Note: Phase Search V2 was reordered to run **before** Phase 5.5 (the kickoff brief assumed 5.5 would merge first). Phase 5.5 picks up after this phase closes.

---

## Section 1 — Headline outcomes

By Phase Search V2 close:

- **Mode A (filtered search) is real.** Replaces the previous post-hoc TMDb search wrapper with a typed `FilterState`, URL-serialised, applied via a redesigned 9-section FilterSheet. Three parallel retrieval sources (TMDb movie + TV + Postgres ILIKE) close the compound-word gap TMDb's tokeniser misses ("salt" → "Saltburn"). Availability flows through a shared `useItemAvailability` hook (filter-only browse uses it too). `<ContentCard searchVariant>` gains a 3-state vocabulary (on-service / on-service-rent-or-buy / off-service tint).
- **Mode C (semantic search) shipped behind the `search_semantic` flag.** Free-text descriptive queries that return ≤2 Mode A results trigger an opt-in CTA. Tapping it dispatches an OpenAI `text-embedding-3-small` round-trip via the new `embed-query` Edge function, then ranks candidates with the 60/25/15 (relevance/taste-fit/recency) shared ranker. Flag-off users see a preview toast.
- **Per-user feature flag pattern established.** Migration 041 (`user_feature_flags`) is the first composite-PK `(user_id, flag_name)` flag store, RLS-scoped to the owning user. `src/lib/featureFlags.ts:getFlag<T>(name, fallback)` is the typed accessor; module-scope cache keeps the flag read down to one RPC per mount.
- **Search-as-signal instrumentation foundation laid.** `emitSearch` augmented with `session_id` and `mode`; `card_impressions.metadata` now carries `mode`, `query_hash` (FNV-1a, unsalted), `filter_set_hash` for search-surface impressions. This is the data Phase 3 (search-as-signal, out of this phase's scope) will consume.
- **Semantic-search eval rig + CI workflow shipped.** `scripts/test/search-semantic-eval.ts` runs precision@10 + MRR against `search-semantic-fixtures.json` via direct OpenAI + `match_titles_by_vector` (bypasses the Edge function to avoid auth gymnastics; same embedding model so model drift still surfaces). `.github/workflows/search-semantic-eval.yml` triggers on PRs touching the watched paths. **Fixture is a 2-query stub at landing-time** — Joe authors the 20-query set as a separate deliverable; it gates flag-flip for non-Joe users, not the B6 commit.
- **Cluster B is OFF by default in production.** Joe self-toggles via Studio for personal testing. Flag-flip to other prototype users is gated on the eval going green against the real 20-query fixture.

Verification:
- `npx tsc --noEmit` clean.
- `npm run build` clean.
- Migration 041 applied via `apply_migration` MCP tool; verification query returned one row for Joe's user_id after self-toggle.
- `embed-query` deployed to production; smoke test via curl returns `{embedding: number[1536], cached: false}` < 200ms warm.
- `search-semantic-eval` workflow triggered automatically on PR #8 open — all three secrets (OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) confirmed working via per-query output. Eval FAILS the threshold check (expected — stub fixture).
- Mode C tested end-to-end live on Joe's profile post-flag-flip.

---

## Section 2 — Pre-Phase hygiene

These predated the branch cut:

- Phase 5 (`phase-5-contextual-signals`) merged to main 2026-05-06.
- v3 editorial redesign (`v3-editorial-redesign`) merged 2026-05-08.
- v3 mobile refinements + repo cleanup committed to main 2026-05-09 / 2026-05-10.
- `phase-search-v2` branch cut from clean main 2026-05-11.

---

## Section 3 — Cluster A: structured filtered search (no flag)

11 commits, dependency-sequenced `A1 → A4 → A5 → A2 → A8 → A3 → A6 → A7 → A9 → A10 → A11`.

### 3.1 A1 — `FilterState` schema + URL serialisation

New `src/lib/search/filterState.ts` defines the typed `FilterState` (discriminated unions for `contentType`, `costFilter`, `showWatched`), `defaultFor()` / `isDefault()`, `serialize()` / `deserialize()` (lossless round-trip via base64-encoded JSON), and `hash()` for `card_impressions.metadata.filter_set_hash`. Wired into `src/App.tsx`'s URL hash on Browse tab; back-button restores state. The legacy `contentType: string`, `showWatched: boolean` shape from BrowsePage is migrated via a shim in App.tsx's filter wiring.

### 3.2 A4 — new primitives + H5 tokens

Three new primitives:
- `src/components/ServiceTile.tsx` — orange ring + tick when active, 50% opacity greyscale when excluded.
- `src/components/ActiveFilterPill.tsx` — pill with `×` removal action; renders the active-filter strip on results.
- `src/components/MoodChip.tsx` — 4-hue mood chip used in the empty-state mood grid.

H5 resolution: three salmon-tone token updates landed in `src/index.css`:
- `--primary-soft` bumped from 0.10 → 0.14.
- `--primary-edge` bumped from 0.30 → 0.42.
- New `--primary-fg-on-soft: #ff8d5a` for foreground on soft-primary surfaces.

Accepted: minor visual drift on existing surfaces (CalendarPage, DetailPage, WatchlistPage) — the tokens are app-wide.

### 3.3 A5 — `<ContentCard searchVariant>` 3-state

`src/components/ContentCard.tsx` gains a `searchVariant` prop and a `notOnYours` prop. State vocabulary:

| State | Rendering |
|---|---|
| On-service (free) | Standard card, rating pill bottom-left, service stack TL, bookmark TR |
| On-service (rent/buy only) | Standard card, **rent/buy price pill replaces rating pill** bottom-left, off-service tint NOT applied |
| Off-service | 0.75 opacity tint, **"Not on yours" pill replaces rating pill** bottom-left |

The rent/buy price uses the `£` glyph (not the `GBP` ISO suffix that `Intl.NumberFormat('en-GB', { style: 'currency' })` produces by default). When no price is available, the pill renders just "Rent" or "Buy" as a fallback label. Rating position stays bottom-left per locked decision #3 (search artboards diverge from `design-system.md` anatomy; artboards are aspirational, not pixel-perfect — soft note to design to update artboards post-phase).

Snapshot tests on the four pre-existing variants (`default`, `wide`, `lead`, `mosaic`) confirm zero pixel diff.

### 3.4 A2 — FilterSheet 9-section redesign

`src/components/FilterSheet.tsx` full rewrite. 9 sections (kickoff brief said 10; **DECADE axis dropped post-A2 review** — Joe's call, unlikely to be reached for, runtime + genre + minRating already cover the "what to watch tonight" question; the **UK RATING chip set was also dropped from FilterSheet** per locked decision #2 — no UK regulatory or App Store compliance requirement on an aggregator; deferred to a later phase if parental controls land or user demand surfaces).

Consumes `<ServiceTile>` from A4. Two entry points: from the search bar (existing) and from the new empty-state "Browse by filter" CTA (A3). Count badge accurate; Apply commits + closes + re-queries; × / swipe / backdrop close without applying.

### 3.5 A8 — service availability + per-item flow

Initially landed as a pre-call `getAvailableTmdbIds(service_ids)` RPC pass in `src/hooks/useSearch.ts` (migration 028, live since Phase 4.5). Live testing surfaced two practical problems that drove a revert to a parallel + per-item approach (commits `eb36e69` → `7736027` → `5ddbdef`):
- Pre-call RPC + TMDb serially doubled warm p50.
- Round-trip navigation through detail page lost the precomputed availability map, producing a flash on return.

Final shape (current `main` of branch):
- Three parallel sources in `search()` via `Promise.all`: TMDb `/search/movie`, TMDb `/search/tv`, Postgres `searchTitlesByText` (ILIKE substring against the ~20K UK-available titles cache).
- Postgres source closes the compound-word gap TMDb's word-boundary tokeniser misses ("salt" never matches "Saltburn" through `/search/movie`).
- Availability moved to per-item `useItemAvailability` hook (extracted commit `9dad6f4`), shared with filter-only browse. 200ms-coalesced flushes against the in-memory service cache; no extra Supabase round-trip on the warm path.
- When `onlyOnMyServices=true`, off-services rows are filtered out before render. When `=false`, off-services rows render with the "Not on yours" pill from A5.

`getAvailableTmdbIds` wrapper stays in `src/lib/api/supabaseContent.ts` (consumed by the filter-only browse mode for catalogue scoping).

Additional fixes in the same cluster (commits `a5a9c93` … `8101942`):
- Tier-aware availability — `getCachedServices()` returns `{free, rent, buy}` per-tier. Earlier in this phase a "free-only" overshoot incorrectly marked LotR (rentable on Prime but free on Sky Go) as off-service. Final fix: keep all tiers in the aggregation, make `useSearch`'s per-item flow tier-aware via `getServiceProviders`, prioritising on-service-rent over off-service-tint.
- Rent/buy price-pill stuck pending after final batch flush — race between the batch reader and the final-flush write. Fixed.
- Rent/buy price format — pound glyph (`£`), not the `GBP` ISO suffix `Intl.NumberFormat('en-GB', { style: 'currency' })` produces by default.

Per-tier `ServiceProviders` shape in `src/lib/utils/serviceCache.ts`, `CACHE_VERSION` bumped to 7 to invalidate stale caches.

### 3.6 A3 — search empty state

`src/components/search/SearchEmptyState.tsx` composes: RECENT (when ≥1 recent), a "Browse by filter" CTA opening the sheet with services pre-selected and nothing else set, and a mood grid (`<MoodChip>` from A4). Zero-recents hides the RECENT section. Recents tap submits and routes to results.

Mood-chip submission arms Mode C via `setMode('semantic', { dispatch: false })` *before* `setQuery(phrase)` runs, so the debounced query effect picks up `modeRef.current === 'semantic'` when its timer fires. The initial rAF approach (setQuery + rAF'd setMode) had a closure bug — `setMode` ran with a stale empty query and either early-exited or dispatched wrong; the debounced Mode A then clobbered results. Fixed during the performance-oracle review pass on close-out. Flag-off taps fall through to Mode A.

### 3.7 A6 — as-you-type suggestions

`src/components/search/SearchSuggestions.tsx` + suggestion-path hook in `useSearch`. 200ms debounce. Three states: tooShort (<3 chars), loading, populated (up to 5 rows). Exact-prefix matches route to detail; fuzzy matches route to results-page-filtered.

Suggestion-click race fix: input blur was unmounting suggestions before the `onClick` fired. Fix: `onMouseDown={(e) => e.preventDefault()}` on the suggestions container.

### 3.8 A7 — Mode A results page chrome

`BrowsePage.tsx` results layout: active-filter strip when ≥1 filter active; CLEAR drops all; Edit-filters reopens sheet; no-results loosens most-restrictive filter and re-queries. Adds a Docs (documentary) media-type category since the FilterSheet contentType section accommodates it.

Late-stage UX iteration (driven by live testing):
- Mode indicator + count row + inline Edit filters pill **removed** per Joe — the catalogue totals were unhelpful (often in the thousands, not the visible count).
- "Edit filters" pill moved under the search bar; combined with "Sort" into a single flex row, Edit filters left, Sort right, equal heights.
- Sort dropdown native `<select>` replaced with custom popover matching the `--primary-soft` / `--primary-edge` pill family.
- Best-match taste-rank added for the filter-only mode (no search query) via `useTasteRanking`. Raw cosine ranking against `taste_vector_v2`, not the full For You pipeline — see Section 5 for the trade-off.
- Auto-paginate caps split per-mode: `MIN_VISIBLE_BROWSE = 12` / `MAX_AUTO_FETCH_PAGES_BROWSE = 6` (search stays 4/3). Load More button covers both modes.

### 3.9 A9 — recent searches

`src/lib/search/recentSearches.ts` — cap 20, dedupe case-insensitive, surface most-recent 5. `clearAllData` in `AuthContext.tsx` invokes `resetRecentSearches()` on signOut.

### 3.10 A10 — instrumentation

`emitSearch` in `src/lib/storage/interactions.ts` augmented with `session_id` and `mode`. Card-impression emit sites in BrowsePage carry `mode`, `query_hash` (FNV-1a from `filterState.ts:hashString`), `filter_set_hash` in `card_impressions.metadata`.

Note: raw query string still writes to `user_interactions.metadata` via `emitSearch` (pre-existing Phase 0 behaviour, not a Phase Search V2 regression). Card-impression rows only carry the hash.

### 3.11 A11 — regression tests

Three Vitest files for the pure fns:
- `src/lib/search/__tests__/filterState.test.ts` — round-trip serialise/deserialise/equal.
- `src/lib/search/__tests__/recentSearches.test.ts` — cap, dedupe, signOut clear.
- `src/lib/search/__tests__/contentCardSearchProps.test.ts` — structural regression check for `searchVariant` + `notOnYours` prop combinations.

`npm test` green; coverage on the pure fns ≥ 90%.

---

## Section 4 — Cluster B: semantic search (flag-gated)

6 commits, sequenced `B1 → B2 → B3 → B4 → B5 → B6`.

### 4.1 B1 — `user_feature_flags` + `getFlag` accessor

Migration `041_user_feature_flags.sql`: composite-PK `(user_id, flag_name)` table, RLS scoped to the owning user. `updated_at` trigger. RLS enables read + write only when `user_id = auth.uid()`; service-role retains full access. Verified: a user cannot read or modify another user's flags.

`src/lib/featureFlags.ts:getFlag<T>(name, default)` — typed accessor with module-scope Promise cache. `resetFlagCache()` wired into `clearAllData` on signOut.

Flag is read once on `BrowsePage` mount — no live subscription. Manual Studio toggle of a profile takes effect on next remount (tab switch away and back, or hard reload). Acceptable for the Joe-first / prototype-users rollout pattern in the kickoff brief.

**Type-cast carry-over:** `getFlag` casts through `any` for the `.from('user_feature_flags')` call because `database.types.ts` has not been regenerated to include migration 041. Filed as a follow-up to **IN-PX-21** ("Regenerate database.types.ts and delete `as any` casts") — Phase 5.5 will pick up the regeneration pass and remove this cast alongside the existing ones.

### 4.2 B2 — `embed-query` Edge function

`supabase/functions/embed-query/index.ts` — JWT-protected (`verify_jwt = true` via `config.toml`, defence-in-depth via `extractUserIdFromJwt` in the handler). LRU cache: `normaliseQuery()` (trim/lowercase/whitespace collapse), 1h TTL, 1000-entry cap. Query length bounded 1..200 chars. Uses the existing `_shared/openaiEmbeddings.ts:embedSingle` helper. Returns `{embedding: number[1536], cached: boolean}`.

**Known cold-start behaviour:** Supabase Edge isolates scale to zero. Two requests with any meaningful idle gap hit fresh workers; the in-memory cache earns its keep during burst traffic, not solo curl tests. Acceptable — the cache is a cost optimisation for repeated queries within a session, not a correctness primitive.

Deployment requires the `OPENAI_API_KEY` Edge runtime secret (already configured for Phase 1 `embed-new-titles`).

### 4.3 B3 — semantic retrieval + shared mirror

Shared ranker at `supabase/functions/_shared/recommendations-v2/search/semanticRetrieval.ts` — bit-for-bit mirrored at `src/lib/recommendations-v2/search/semanticRetrieval.ts`. Weights constants live in both copies:

```
WEIGHT_RELEVANCE = 0.60   // 1 - cosineDistance / 2  (from pgvector <=>)
WEIGHT_TASTE     = 0.25   // cosine(itemEmbedding, userTasteVector), 0.5 neutral when no vector
WEIGHT_RECENCY   = 0.15   // soft floor at 1960, linear ramp to current year
```

Client adapter at `src/lib/recommendations-v2/search/semanticRetrieval.ts` calls `embed-query` via `supabase.functions.invoke`, then `match_titles_by_vector` (migration 022, live since Phase 2.6), then applies the post-filter (`contentType`, `genres`, `languages`, `minRating`, `runtime`) before scoring. Pure shared ranker is taste-vector-tolerant: when no taste vector is present, taste-fit defaults to 0.5 (neutral).

`shared-tree-drift` CI workflow enforces parity between the two trees.

### 4.4 B4 — mode dispatch in `useSearch`

`src/hooks/useSearch.ts` accepts new options `{filters, userTasteVector, initialMode}` and returns `mode`, `setMode`, `shouldShowSemanticCTA`, `semanticCached`. The hook branches `search()` between the TMDb path (Mode A) and `semanticSearch` from B3 (Mode C).

`shouldShowSemanticCTA` is true when:
- The flag is on (semantic ready) OR off (preview-only CTA).
- The query length is ≥ 3.
- The query is "free-text" — no result title contains the first 5 chars of the query.
- Mode A returned ≤ `SEMANTIC_OPT_IN_THRESHOLD = 2` results.

Three Mode C triggers exist: the opt-in CTA tap, the mood-chip submission (with the rAF-deferred `setMode`), and direct `setMode('semantic')` calls if any future surface wants it.

### 4.5 B5 — Mode C UI affordances

- `src/components/search/SearchModeIndicator.tsx` — italic Fraunces 13 *"Showing titles like '<query>'"* + revert link with `ArrowLeft` icon → `setMode('lookup')`.
- `src/components/search/SearchSemanticCTA.tsx` — full-width card with `--scrim-glass-action` treatment, sparkle icon + *"Search for '<query>' as a description — Find titles that feel like '<query>'"*.
- `BrowsePage.tsx` renders them; flag-off taps fire a sonner toast preview (*"Semantic search isn't on for you yet"*) — reuses the existing sonner toast pattern from the Phase 5.5 delete-account flow.

### 4.6 B6 — eval rig + CI workflow

- `scripts/test/search-semantic-eval.ts` — bypasses the `embed-query` Edge function deliberately (CI doesn't need an authenticated round-trip; direct OpenAI call exercises the SAME embedding model the function uses, so model drift still surfaces). Calls `match_titles_by_vector` with service-role. Computes mean precision@10 + mean MRR across the fixture. Exit 1 on threshold failure, 2 on env/system error.
- `scripts/test/search-semantic-fixtures.json` — 2-query stub at landing. Joe authors the 20-query set as a separate deliverable (see Section 7).
- `.github/workflows/search-semantic-eval.yml` — PR trigger on the four watched path globs + `workflow_dispatch` for manual runs. Requires `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` GitHub Actions secrets.

(B7 from the kickoff folded into B3 — mirror lands with B3, `shared-tree-drift` CI runs on every commit so a standalone audit commit is wasteful.)

---

## Section 5 — Decisions resolved during the phase

Locked during plan-mode, not filed as parking-lot IN-XXX entries (resolved before any code):

1. **H5 — Salmon `#ff8d5a` token.** Three app-wide tokens added in A4 (see §3.2). Soft mass-rename across CalendarPage / DetailPage / WatchlistPage accepted as collateral; no design-system.md update needed.
2. **H7 — UK RATING chip set.** Dropped from FilterSheet for Phase 1. No regulatory or App Store compliance requirement on an aggregator. Deferred to a later phase if parental controls land, user demand surfaces, or the catalogue mapping problem can be solved cleanly.
3. **A5 — ContentCard rating position.** Stays bottom-left (matches current implementation and `design-system.md` anatomy). Search artboards diverge — they're aspirational, not pixel-perfect.
4. **B1 — Feature-flag pattern.** Separate composite-PK `user_feature_flags(user_id, flag_name, enabled)` table per migration 041. Typed accessor `getFlag<T>(name, default)`. Per-user toggling supports the Joe-first / prototype-users rollout pattern in the kickoff brief.

Late-stage scope reductions (driven by live testing rather than planning):
5. **DECADE axis dropped from FilterSheet** post-A2 review. Brief had 10 sections; ended at 9. Add either back when real signal surfaces.
6. **Mode indicator + count row + inline Edit filters pill removed** from results page. The catalogue totals in the indicator were unhelpful (often in the thousands, not the visible count); the row added vertical chrome without information value. Joe's call after live testing.
7. **Best-match sort uses raw cosine, not the full For You pipeline.** Filter-only browse mode taste-ranks via `useTasteRanking` — direct cosine of item embedding against `taste_vector_v2`. The richer For You pipeline (`scoreCandidates` with contextual + MMR) was considered and dropped — Joe liked the raw-cosine results during live testing and the implementation cost of threading the full pipeline through a browse-only mode wasn't justified.

---

## Section 6 — Behaviour changes prototype users will see

When Joe rebuilds the prod APK and his prototype users open the app post-deploy:

1. **Browse tab feels different.** The FilterSheet is rewritten; the empty state is a curated grid with recents + Browse-by-filter CTA + mood chips; results show an active-filter strip with × pills + Edit filters + Sort.
2. **Off-services titles render with 0.75 tint + "Not on yours" pill** when `onlyOnMyServices=false`. Previously off-services rows were post-hoc-filtered (or flashed in then disappeared). Now they're either pre-filtered out (toggle on) or rendered consistently with the tint state.
3. **Rent/buy price pill replaces rating pill** for on-service rent-or-buy-only titles. Bottom-left position unchanged. Pound glyph (£), not "GBP" suffix.
4. **As-you-type suggestions** appear in a 5-row dropdown after 200ms typing pause. Exact-prefix → detail page. Fuzzy match → filtered results.
5. **No Mode C affordances for non-Joe profiles.** The `search_semantic` flag is OFF by default. Other prototype users see Mode A only.
6. **Joe's own profile (flag ON) sees the Mode C opt-in CTA** when descriptive queries return ≤2 Mode A results. Tapping it dispatches semantic search; an italic Fraunces mode indicator appears at the top with a revert link.

No other surfaces (Home, For You, Watchlist, Detail) changed in this phase. The salmon-tone token bump from H5 produces minor visual drift on existing surfaces using `--primary-soft` / `--primary-edge` — accepted.

---

## Section 7 — Deferred to Phase 5.5 / future

| Item | Reason for deferral | Pickup |
|---|---|---|
| **20-query semantic-eval fixture** | Authoring the curated top-N expected-IDs set is a Joe deliverable. The B6 commit landed a 2-query stub so the script + CI workflow are runnable. Eval gates **flag-flip to non-Joe users**, not the B6 commit or Joe's own usage. | Joe, at own pace. Update `scripts/test/search-semantic-fixtures.json` + push to `phase-search-v2` (or main post-merge); CI re-runs and goes green when thresholds met. |
| **`database.types.ts` regeneration for migration 041** | One `as any` cast in `src/lib/featureFlags.ts:47` for the `user_feature_flags` table. Flagged by `kieran-typescript-reviewer`. Filed as a follow-up to **IN-PX-21**. | Phase 5.5 |
| **`catch (err: any)` cleanup in `useSearch.ts`** | Two sites (L138, L223) in fail-soft paths. Flagged by `kieran-typescript-reviewer`. Replace with `unknown` + narrowing helper. Trivial. | Phase 5.5 |
| **Cluster B prod APK rebuild + install** | The current install is the live-reload dev APK pointing at Joe's machine. Production APK rebuild + smoke-test of all 5 search surfaces (lookup, filter-only, mood chip, suggestion-routing, semantic CTA) is the deployment milestone. | Post-merge, before declaring phase fully shipped. |
| **Flag-flip to other prototype users** | Gated on the eval going green against the real fixture. | Joe, after he runs the 20-query fixture over 2 days subjectively. |
| **Phase 2 search (entity / Mode B)** | Out of scope per `videx-wiki/raw/forward-planning/roadmap-search-v2-entity-and-signal.md`. | Future Search phase. |
| **Phase 3 search-as-signal** | Out of scope per the same roadmap doc. This phase laid the instrumentation foundation (`mode`, `query_hash`, `filter_set_hash` in `card_impressions.metadata`); Phase 3 will consume it. | Future Search phase. |
| **`SearchInput`, `<CategoryPills>`, segmented control, toggle row, slider, sheet primitive extraction** | Per kickoff §7 H6 risk note, the new primitives were kept narrow (`<ServiceTile>`, `<ActiveFilterPill>`, `<MoodChip>`). Sheet, toggle, segmented, slider stay inlined in FilterSheet. | Extract later if a 2nd consumer appears. |
| **UK RATING chip set** | Dropped from FilterSheet per locked decision #2. | Add back if parental controls land, user demand surfaces, or catalogue mapping is solved. |
| **DECADE axis** | Dropped post-A2 review. | Add back when real signal surfaces. |

---

## Section 8 — Phase Search V2 actuals summary

- **Total commits on PR #8:** 38 (Cluster A 11 + B 6 + UX iteration + post-review fixes + CI tweak + entity fix + mood-chip race fix).
- **Files added:** ~20 (new files in `src/lib/search/`, `src/lib/recommendations-v2/search/`, `src/components/search/`, `src/components/ServiceTile.tsx`, `src/components/ActiveFilterPill.tsx`, `src/components/MoodChip.tsx`, `supabase/migrations/041_user_feature_flags.sql`, `supabase/functions/embed-query/`, `supabase/functions/_shared/recommendations-v2/search/`, `scripts/test/search-semantic-eval.ts`, fixtures, workflow).
- **Files modified:** ~15 including `BrowsePage.tsx`, `FilterSheet.tsx`, `ContentCard.tsx`, `useSearch.ts`, `App.tsx`, `interactions.ts`, `supabaseContent.ts`, `serviceCache.ts`, `AuthContext.tsx`.
- **Migrations applied to production:** 1 (041). Applied via `apply_migration` MCP tool.
- **Edge Function redeploys:** 1 (`embed-query`, new).
- **Net-new dependencies:** 0 (reused `@supabase/supabase-js`, `sonner`, `lucide-react`).
- **Type-check status:** clean.
- **CI workflows added:** `search-semantic-eval.yml`.
- **Specialist agent review pass:** `security-sentinel` SAFE-TO-MERGE (zero blockers, one minor pre-existing note about raw query in `user_interactions.metadata` — pre-Phase 0 behaviour); `kieran-typescript-reviewer` SHIP-IT (two trivial fix-after-merge items: regenerate `database.types.ts` to drop the `featureFlags.ts as any` cast; replace two `catch (err: any)` in `useSearch.ts` with `unknown` + narrow); `performance-oracle` FIX-FIRST → fixed during close-out (mood-chip race, commit `9ec4868`).
- **Time budget:** brief estimated 6–8 days active work. Landed in one focused push with substantial mid-flight UX iteration driven by live testing.

---

## Section 9 — Sequencing for merge + deploy

1. **PR #8 review + merge** — agent review passes complete (Section 8); flip PR from draft to ready; merge with `--no-ff` per Orchestration §4.1.
2. **`embed-query` Edge Function deploy already done** — function shipped during Step 1 of the phase-close walkthrough (2026-05-13), not blocked on merge.
3. **Production APK rebuild + install** — `npm run build && npx cap sync android && cd android ; ./gradlew assembleDebug` then `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.
4. **Smoke-test all 5 search surfaces on the prod APK** — lookup (e.g. "Saltburn"), filter-only (services + Movies + Rent), mood chip (empty-state grid), suggestion-routing (exact-prefix vs fuzzy), semantic CTA (Joe's profile only).

Skipping step 2 means new clients call the un-deployed function. Already addressed pre-merge — step 2 listed for traceability.

---

## Section 10 — Pending runtime checks

- **Flag-flip to prototype users.** Gated on Joe authoring the 20-query fixture and running it subjectively for 2 days.
- **20-query eval going green.** Once authored, `search-semantic-eval` workflow re-runs on the next PR touching the watched paths (or via `workflow_dispatch`). If thresholds still fail with a real fixture, tuning knobs are: ranker weights in `_shared/recommendations-v2/search/semanticRetrieval.ts` (currently 60/25/15), the post-filter shape, the fixture's threshold values themselves.
- **Cold-start LRU cache hit rate on `embed-query`.** Real users hitting the same query within a burst should see `cached: true` on the 2nd+ call. Solo testers with idle gaps will see `cached: false` consistently — expected.
- **Search-as-signal data shape.** Phase 3 (out of scope) will consume `card_impressions.metadata.{mode, query_hash, filter_set_hash}`. The hash function is FNV-1a, unsalted — fine for analytics, not adversarial.
- **`as any` cast in `featureFlags.ts`.** Will lift once `database.types.ts` is regenerated under Phase 5.5.

---

## Phase Search V2 closed.

Browse is now a real filtered-search surface for all prototype users; Joe has a working semantic-search loop on his own profile to test as a flag-gated opt-in. Foundation laid for Phase 3 (search-as-signal). Phase 5.5 picks up next.

---

## Addendum — Search-as-signal Level 1 (search-attribution boost) — 2026-05-14

Filed as **IN-PX-43** after Joe asked which search signals were actually feeding the taste vector. The honest answer at Phase Search V2 close-out: **none directly** — Phase 3 search-as-signal was explicitly out of scope, so search-confirmed engagements (search → bookmark) contributed only at the bookmark's existing weight, with no boost for the search context.

Level 1 closes the smallest version of that gap as a follow-up branch (`phase-search-v2-attribution-boost`):

- **Window**: 60s (`SEARCH_ATTRIBUTION_WINDOW_SECONDS`).
- **Boost**: 1.3× the base weight (`SEARCH_ATTRIBUTION_BOOST`).
- **Boosted events**: `watched`, `watchlist_add`, `deep_link_click`, `thumbs_up`. Negative events are deliberately not boosted at Level 1 — "search → hated everything" is real signal but more nuanced; deferred to Level 2 (IN-PX-44).
- **Two surfaces**:
  - Incremental update (`applyInteractionIncremental`) — module-scope cache in `src/lib/taste-v2/searchAttribution.ts` populated by `emitSearch` at search-emit time. Zero DB round-trips on the hot path.
  - Batch recompute (`recomputeFromInteractions`) — fetches `search` rows from `user_interactions` in parallel with the existing taste-event query, walks the merged timeline per-session.
- **No new schema**, **no new event_type**, **no new privacy surface** (raw query text already persists in `user_interactions.metadata` as Phase 0 behaviour).
- **Test coverage**: 13 pure-fn assertions in `src/lib/taste-v2/__tests__/searchAttribution.test.ts` (cache record/retrieve, session isolation, overwrite semantics, window boundary inclusive/exclusive, lower-bound guard against out-of-order replay).
- **Constants mirrored** to `supabase/functions/_shared/taste-v2/types.ts` per ADR-011, even though the helper module itself is client-only (Edge Functions never run incremental updates).

**Levels 2 and 3 stay deferred**:
- **Level 2 (IN-PX-44)** — embed the query directly into the taste vector. Deferred until the 20-query semantic-eval fixture (IN-PX-40) gives subjective ground truth on query-embedding quality; embedding noisy queries amplifies noise rather than signal.
- **Level 3 (IN-PX-45)** — full Phase 3 search-as-signal pipeline. Its own phase. Pickup post family-tester engagement data.

This addendum is the canonical record of the Level 1 follow-up. Wiki page [phase-search-v2](../../../videx-wiki/wiki/concepts/operations/phase-search-v2.md) and parking-lot are kept in sync.
