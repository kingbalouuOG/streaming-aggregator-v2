---
title: Phase Search V2 — Filtered + Semantic Search
type: concept
tags: [phase, phase-search-v2, search, semantic, filtered, feature-flag, embeddings, mode-a, mode-c]
created: 2026-05-13
updated: 2026-09-09
sources:
  - docs/v2/phase-summaries/phase-search-v2-summary.md
  - docs/design/search/Phase_Search_V2_Kickoff.md
  - docs/design/search/Phase_Search_V2_Implementation_Brief.md
  - videx-wiki/raw/v2-strategy/Videx_v2_Search_Strategy_Annex_v0.1.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/operations/phase-5.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/architecture/signal-architecture.md
  - wiki/entities/codebase/migrations.md
  - wiki/entities/codebase/rpcs.md
  - wiki/entities/codebase/hooks.md
  - wiki/registers/parking-lot.md
---

# Phase Search V2 — Filtered + Semantic Search

Closed 2026-05-13. Branch `phase-search-v2` (PR #8 merged to main). Predecessor: Phase 5. Reordered ahead of Phase 5.5 (kickoff brief had 5.5 merging first; reality is 5.5 picks up after this phase closes).

Single PR. Two commit clusters: **Cluster A (A1–A11, unflagged)** ships structured filtered search; **Cluster B (B1–B6, flagged behind `search_semantic`)** ships opt-in semantic search behind a per-user feature flag.

## What was delivered

### Cluster A — structured filtered search (unflagged)

| Commit | Subject |
|---|---|
| A1 | `FilterState` schema + URL serialisation — typed shape with discriminated unions, lossless `serialize`/`deserialize`, FNV-1a `hash()` for impression `filter_set_hash`, URL hash sync via `useFilterUrlSync` (gated by hash short-circuit). |
| A4 | New primitives — `ServiceTile` (orange ring + tick when active, 50% greyscale when excluded), `ActiveFilterPill` (× removal), `MoodChip` (4-hue). Salmon tokens bumped: `--primary-soft` 0.10 → 0.14, `--primary-edge` 0.30 → 0.42, new `--primary-fg-on-soft: #ff8d5a`. |
| A5 | `<ContentCard>` 3-state — `onService` (rating pill BL), `onService rent/buy only` (price pill replaces rating pill BL with `£` glyph), `offService` (0.75 opacity tint + "Not on yours" pill BL). |
| A2 | FilterSheet 9-section rewrite — DECADE dropped post-A2 review (Joe call), UK RATING dropped per locked decision (no UK regulatory or App Store compliance need on an aggregator). |
| A8 | Service availability + per-item flow — originally landed as pre-call `getAvailableTmdbIds` RPC pass, **reverted mid-phase** to three-parallel-sources (TMDb movie + TV + Postgres `searchTitlesByText` ILIKE) + shared `useItemAvailability` hook after live testing surfaced p50 + round-trip-flash regressions. The Postgres source closes the compound-word gap TMDb's tokeniser misses ("salt" → "Saltburn"). |
| A3 | Search empty state — RECENT (when ≥1), Browse-by-filter CTA opening the sheet with services pre-selected, mood grid. |
| A6 | As-you-type suggestions — 200ms debounce, 5-row dropdown, exact-prefix → detail, fuzzy → results-filtered. |
| A7 | Mode A results page chrome — active-filter strip with × pills, Edit-filters + Sort row collapsed into a single flex row under the search bar, custom sort popover (no native `<select>`), Best-match taste-rank for filter-only mode via `useTasteRanking` (raw cosine, not the full For You pipeline — Joe's call after live testing). Auto-paginate caps split per-mode (12/6 for browse, 4/3 for search). Load More button covers both. |
| A9 | Recent searches — cap 20, dedupe case-insensitive, surface 5, clear on signOut. |
| A10 | Instrumentation — `emitSearch` augmented with `session_id` + `mode`. `card_impressions.metadata` carries `mode`, `query_hash` (FNV-1a, unsalted), `filter_set_hash`. Foundation for the out-of-scope Phase 3 search-as-signal. |
| A11 | Structural regression tests — Vitest covers `filterState` round-trip, `recentSearches` cap/dedupe, `ContentCard searchVariant` props. |

### Cluster B — semantic search (flag-gated)

| Commit | Subject |
|---|---|
| B1 | `user_feature_flags` table (migration 041, composite-PK, RLS to owner) + typed `getFlag(name, fallback)` accessor with module-scope Promise cache. First per-user feature flag store — reusable for any future Joe-first / prototype-users rollout. |
| B2 | `embed-query` Edge function — JWT-protected (`verify_jwt = true` via `config.toml` + `extractUserIdFromJwt` defence-in-depth), OpenAI `text-embedding-3-small`, in-memory LRU 1h TTL / 1000-entry cap, query length bounded 1..200 chars, returns `{embedding: number[1536], cached: boolean}`. |
| B3 | Semantic retrieval — single shared ranker at `supabase/functions/_shared/recommendations-v2/search/semanticRetrieval.ts` (imported directly by the client adapter — no mirror, drift-by-construction impossible). Weights 60/25/15 (relevance / taste-fit / recency). Post-filter from `FilterState`. |
| B4 | Mode dispatch in `useSearch` — accepts `{filters, userTasteVector, initialMode}`, returns `mode`, `setMode`, `shouldShowSemanticCTA`, `semanticCached`. Free-text + ≤2 Mode A results → CTA shown. `setMode(next, { dispatch: false })` arms mode without dispatching, for callers that change mode + query in the same tick (mood chip). |
| B5 | Mode C UI — `SearchModeIndicator` (italic Fraunces 13 *"Showing titles like '<query>'"* + revert link), `SearchSemanticCTA` (full-width card with `--scrim-glass-action` treatment, sparkle icon). Flag-off taps fire a sonner toast preview. |
| B6 | Eval rig — `scripts/test/search-semantic-eval.ts` (bypasses Edge function, calls OpenAI direct + `match_titles_by_vector` with service-role; computes precision@10 + MRR). `scripts/test/search-semantic-fixtures.json` (2-query stub at landing — 20-query authorship is IN-PX-40). `.github/workflows/search-semantic-eval.yml` with PR + `workflow_dispatch` triggers; requires `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` repo secrets. |

(B7 from kickoff brief folded into B3 — shared module lands with B3, `shared-tree-drift` CI catches any future drift if a mirror reappears.)

## Verification

- `npx tsc --noEmit` clean.
- `npm run build` clean.
- Migration 041 applied via `apply_migration` MCP tool; verification query returned one row for Joe's user_id after self-toggle.
- `embed-query` deployed to production; curl smoke test returned `{embedding: number[1536], cached: false}` < 200ms warm.
- `search-semantic-eval` workflow auto-triggered on PR #8 open. All three secrets confirmed working via per-query output. Eval **fails the threshold check** by design (stub fixture); per-query lines printing means infra is healthy.
- Mode C tested end-to-end live on Joe's profile post-flag-flip.

## Three-agent close-out review

| Agent | Verdict | Detail |
|---|---|---|
| `security-sentinel` | SAFE-TO-MERGE | All five focus areas PASS — JWT auth on `embed-query`, RLS on `user_feature_flags`, no PII regression (raw query writes to `user_interactions.metadata` are pre-Phase 0 behaviour, not Search V2), no API keys in client bundle, RPC respects RLS. |
| `kieran-typescript-reviewer` | SHIP-IT | URL state round-trip total, primitives precisely typed, no variant explosion on `ContentCard`, shared module is single-source (no drift), `useSearch` types tight. Two trivial fix-after-merge items filed: IN-PX-21 dependent (regenerate types to drop the `featureFlags.ts` `as any`), IN-PX-39 (replace two `catch (err: any)` with `unknown` + narrow). |
| `performance-oracle` | FIX-FIRST → fixed | URL serialisation gated, LRU O(1), no `ContentCard` re-render thrash. **Real bug found:** mood-chip flow had a `setQuery + rAF'd setMode` race — rAF'd `setMode` closed over stale (empty) query and either early-exited or dispatched wrong, while the debounced query effect quietly fired Mode A and overwrote results. Fixed in commit `9ec4868` via `setMode(next, { dispatch: false })` — mode is armed before `setQuery`, debounced effect picks up `modeRef.current === 'semantic'`. |

## Deviations from brief

1. **A8 reverted from pre-call RPC to per-item availability.** Brief proposed `getAvailableTmdbIds(service_ids)` as a one-shot pre-render filter; live testing showed unacceptable round-trip flash on detail-page navigation + p50 regression. Reverted to three-parallel-sources + shared `useItemAvailability` hook. `getAvailableTmdbIds` wrapper stays — consumed by filter-only browse for catalogue scoping.
2. **FilterSheet 9 sections, not 10.** Brief had DECADE; dropped post-A2 review.
3. **UK RATING chip set dropped from FilterSheet.** No regulatory or App Store compliance need on an aggregator. Deferred if parental controls land or user demand surfaces.
4. **Best-match sort uses raw cosine, not the full For You pipeline.** Joe liked the raw-cosine results during live testing; threading the full `scoreCandidates` pipeline through filter-only browse wasn't justified.
5. **Mode indicator + count row + inline Edit-filters pill removed** from results page mid-phase. The catalogue totals were unhelpful (often in the thousands, not the visible count); Edit filters moved under the search bar in a single flex row with Sort.
6. **B7 folded into B3.** Mirror lands with B3; a standalone audit commit is wasteful.

## Open items → Phase 5.5 / future

| Item | Status |
|---|---|
| IN-PX-21 dependent — regenerate `database.types.ts` to drop `featureFlags.ts` `as any` cast | ⏳ Filed (Phase 5.5) |
| IN-PX-39 — replace `catch (err: any)` in `useSearch.ts:138, 223` | ⏳ Filed (Phase 5.5) |
| IN-PX-40 — 20-query semantic-eval fixture authorship | ⏳ Filed (Joe — gates flag-flip from Joe-only to prototype users) |
| IN-PX-41 — flag-flip UI surface or documented runbook | ⏳ Filed (decide pre-rollout) |
| IN-PX-42 — primitive extraction when a 2nd consumer appears | 🅿 Parked |
| **IN-PX-43 — search-as-signal Level 1 (search-attribution boost)** | **✅ Incorporated (2026-05-14, `phase-search-v2-attribution-boost` branch)** |
| IN-PX-44 — search-as-signal Level 2 (embed query into vector) | ⏳ Filed (defer until IN-PX-40 lands) |
| IN-PX-45 — search-as-signal Level 3 (full Phase 3 pipeline) | ⏳ Filed (post family-tester data) |

See [parking-lot register](../../registers/parking-lot.md) for full status.

## Addendum — Search-as-signal Level 1 (2026-05-14)

Filed as IN-PX-43 after Joe asked which search data was actually feeding the taste vector. The Phase Search V2 plan deferred consumption to Phase 3 — at close-out, the honest answer was "none directly." Level 1 is the cheap fast-follow closing the smallest version of that gap.

**What it does:** A positive content interaction (`watched`, `watchlist_add`, `deep_link_click`, `thumbs_up`) within 60s of a `search` in the same session has its taste-vector weight multiplied by 1.3. Negative events are not boosted at Level 1.

**Two paths:**

| Path | Source of recent-search timestamps |
|---|---|
| Incremental update (`applyInteractionIncremental`) | Module-scope cache in `src/lib/taste-v2/searchAttribution.ts`, populated by `emitSearch` at emit time. Zero DB round-trips. |
| Batch recompute (`recomputeFromInteractions`, 24h cycle) | Two parallel `user_interactions` queries (taste events + search events), merged in-memory per session. |

**No new schema, no new event_type, no new privacy surface** — raw query already lives in `user_interactions.metadata` (Phase 0 behaviour).

**Constants live in `types.ts`** (mirrored to `_shared/taste-v2/`): `SEARCH_ATTRIBUTION_WINDOW_SECONDS=60`, `SEARCH_ATTRIBUTION_BOOST=1.3`, `SEARCH_ATTRIBUTION_BOOSTED_EVENTS` set. The helper module `searchAttribution.ts` is client-only — Edge Functions don't run incremental updates.

**Test coverage:** 13 pure-fn assertions at `src/lib/taste-v2/__tests__/searchAttribution.test.ts` — cache record/retrieve, session isolation, overwrite semantics, window boundary inclusive/exclusive, lower-bound guard against out-of-order replay.

**Levels 2 and 3 stay deferred** — see IN-PX-44 (embed query directly, gated on 20-query fixture maturity) and IN-PX-45 (full Phase 3, gated on family-tester engagement data).

## Native port (NATIVE track — live app)

The semantic-search machinery shipped here carried over to the RN/Expo app (now the live product post-NATIVE-4 cutover):

- **Browse moods → vector search behind `search_semantic`.** The native Browse mood path calls [`useSemanticSearch`/`useSemanticFlag`](../../entities/codebase/hooks.md#native-hooks), which reuses the **same** shared engine (`getFlag` → `embed-query` Edge fn → `match_titles_by_vector` → rank). The mood phrase **is** the query (`defaultFor([])` = no-op post-filter).
- **Presets are the OFF fallback.** When the `search_semantic` flag is OFF for the user, Browse falls back to the deterministic mood-filter **presets** — the same per-user opt-in gate as the web (composite-PK `user_feature_flags`, migration 041). No rebuild to enable — a DB flag flip.
- **Shipped eval gate = `scripts/search/eval-moods.ts`.** The native mood quality floor (rating>0, voteCount≥20, ≥40-min movies) mirrors this script, which is the **shipped** validation gate for the mood→vector path. This was distinct from **IN-PX-40** (the broader semantic-eval fixture gating the global flag-flip beyond Joe/prototype users) for as long as the B6 fixture stayed a 2-query stub. **That stub was replaced on 2026-09-09** — see the presets addendum below.

## Addendum — Presets, one-intent Browse and free-text routing (2026-09-09)

Session 3 of the [quick-filters and preset-search recommendation](../../sources/quick-filters-and-search-presets-recommendation-2026-09-08.md) (§2, §9). PR #139, branch `feat/native-presets-and-routing`. Sessions 1 (search-term logging) and 2 (quick filters) preceded it.

### Browse is one intent, not three modes

Before this, `browse.tsx` held three **mutually exclusive** states — typed search, semantic mood, filter-only discover — and each cleared the others: a mood tap called `setFilters(DEFAULT_FILTERS)`, typing called `setMood(null)`. The motivating sentence of the whole brief ("a new film I don't have to pay for that isn't cheesy crap") was therefore inexpressible, because its halves lived in different modes.

It is now a single `intent` object — `{ text, phrase, moodKey, filters }` — and nothing clears anything else. A preset tap **merges** its filter patch and sets its phrase; typing takes over the phrase and leaves the filters alone. "Clear all" resets the lot.

### The preset pool

`src/lib/content/presets.ts` — eight cards, four shown, chosen by `selectPresets({ hour, dow, selectedClusters, weekBucket })`:

| Slot | Rule | `selection_reason` |
|---|---|---|
| A | Vibe by time of day, via the pipeline's own `getContextualTimeBucket` so the card and the ranking agree | `time` |
| B | Vibe by taste-cluster affinity, rotating weekly and never repeating last week | `taste` / `rotation` |
| C | *New & actually good*, fixed | `fixed` |
| D | Constraint by time of day — cost on weekdays, audience Fri–Sun daytime, commitment after 21:00 on a weeknight | `time` |

No new persistence and no server round trip: it runs off the clock and the onboarding clusters the app already holds. The "not last week" property needs no storage either — the same question is asked of the previous week's seed and the answer excluded. Slot and reason are stamped on every preset-tap `search` row so §6 can judge whether the selection logic earns its keep.

**`Free to watch` carries `phrase: null` on purpose.** Cost is a fact about availability, not a feeling; embedding it returns titles *about* money. Tapping it keeps whatever phrase is already running and contributes only its filter — which is what makes *Comfort* + *Free to watch* one query with two constraints.

### Two new axes, and where `cost` is actually applied

`released: 'any' | 'last_12_months'` and `cost: 'any' | 'free'` joined `BrowseFilters`, which moved to `src/lib/content/browseFilters.ts` (native re-exports it) for the same reason `quickFilter.ts` did — the shared tree is where vitest can reach it.

`cost` is **server-side only**. Nothing on `ContentItem` carries a stream type, so `applyBrowseFilters` deliberately ignores it rather than guessing, and guessing would fail in the one direction that matters — hiding titles the user *can* watch.

| Path | How `cost: 'free'` is applied |
|---|---|
| `/discover` (`useBrowseDiscover`) | `with_watch_monetization_types=flatrate\|free\|ads`, ported from the web's `useBrowse` |
| Semantic (`semanticRetrieval`) | `subscription_included_titles` RPC (migration 080) over the retrieved candidate ids |

`released` is exact server-side (`primary_release_date.gte` / `first_air_date.gte`, and a `release_year` predicate on the semantic post-filter) and deliberately coarser client-side, where only `ContentItem.year` exists.

### Free text routes by shape

`src/lib/search/titleHit.ts` decides. A confident title hit renders the retrieval layout — `TitleHitCard`, with where-to-watch and the deep-link button first, other matches in the grid below, and no controls above it. Everything else, with `search_semantic` on, sends the text to the engine with the banner *"Reading that as a feeling, not a title"* and a one-tap *"Search titles instead"*.

The rule is conservative by design: a hit needs the query to actually appear in the title **and** the query not to read as a sentence. Partial matches are scaled by how much of the title the query covers, so "the" cannot name a film and "sever" does not open the *Severance* card before the word is finished.

### The measurement that matters

See [semantic-search-quality.md](../evaluations/semantic-search-quality.md). Two findings from the first real run of the eval fixture, both of which change how the flag should be treated:

1. **The preset `phrase` works; the short `sentence` does not.** The long descriptive phrases retrieve the right register. The short sentences a user would actually type match surface *words* instead.
2. **The eval rig was scoring rows no user can see** — it called the RPC raw, without the app's post-retrieval quality floor.

The free-text route ships as specified and stays safe: `search_semantic` is per-user and default-off, the banner is honest, and the escape is one tap. But flipping the flag on the strength of the preset path alone would be flipping it for free text too, and free text is the weaker half.

### Retired here

The web "Refine by feeling" mood refiner (`MOOD_CHIPS` / `MOOD_GLYPHS` / `MOOD_REFINER_ENABLED` in `ForYouPage.tsx`, plus the orphaned `MOOD_GLYPH_NAMES` map) — a fourth overlapping mood taxonomy that duplicated the Browse presets by label but not by definition, and had never been wired to anything. Closes IN-V3-003.


## Decisions resolved (locked during plan-mode)

1. **Salmon `#ff8d5a` token bump** app-wide. Minor visual drift on Calendar / Detail / Watchlist accepted.
2. **UK RATING chip set** dropped from FilterSheet.
3. **ContentCard rating position** stays bottom-left; search artboards diverge but they're aspirational.
4. **Per-user feature flag** via composite-PK `user_feature_flags` table + typed `getFlag` accessor (not a flag-service dependency, not Studio-only env vars).

Phase summary at [docs/v2/phase-summaries/phase-search-v2-summary.md](../../../../docs/v2/phase-summaries/phase-search-v2-summary.md) is authoritative.
