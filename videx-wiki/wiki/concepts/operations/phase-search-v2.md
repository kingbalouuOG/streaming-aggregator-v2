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

#### `released` moved inside the vector scan (migration 082, 2026-09-09)

As a post-filter alone, *Newer* was applied to a pool chosen without knowing about it. Measured across the eval fixture's sixteen queries with `scripts/search/eval-released-pushdown.ts`:

| | survivors of 150 retrieved |
|---|---:|
| mean | **7.4** |
| queries under 20 survivors | **16 of 16** |

That is the same arithmetic recorded in the device-testing entry — of 150 candidates *Newer* left 7 — now measured across the whole fixture rather than one probe vector. The chip emptied the grid rather than narrowing it.

Migration 082 drops the two-argument `match_titles_by_vector` and creates a three-argument form taking `min_release_year integer DEFAULT NULL`, applied inside the candidates CTE. The two-argument form has to go rather than sit beside it: two overloads both accepting `(vector, integer)` make every existing two-argument call ambiguous (42725). `warm_recommendation_caches` calls it positionally and still resolves, and with `min_release_year` NULL the body is migration 076's unchanged.

**This widens the funnel; it does not close it.** pgvector applies a `WHERE` clause AFTER the HNSW traversal unless `hnsw.iterative_scan` is on, and it is not set anywhere in this database. A predicate keeping ~5% of the catalogue still under-returns: 150 rows behind a 5% filter needs roughly 3,000 candidates, and `ef_search` caps at 1,000 (migration 076). What the function does with a floor present is traverse to that ceiling instead of to 2× `match_limit`. Making the filter exact needs `hnsw.iterative_scan = 'relaxed_order'`, which is a separate change with its own latency profile.

This is **not** the same as raising `candidateLimit` to 1,000, which the device-testing entry costed and rejected. `match_limit` stays at 150, so the client still fetches metadata for at most 150 rows; only the internal graph traversal widens. The objection recorded there — a thousand rows of metadata per chip tap on a phone — does not apply.

The post-filter in `semanticCore` stays behind the push-down. It is a no-op when the RPC honoured the floor, and it is the only thing enforcing the floor when the call falls back to the two-argument form — which it does on any database predating 082, since PostgREST resolves an RPC by argument NAMES and would otherwise return an empty grid for a Worker deployed ahead of its migration.

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


## Addendum — The refine row (2026-09-09)

Session 4 of the same recommendation. The last of the four sessions, and the
one that makes the composed intent tappable.

### One block of controls, not three

Browse used to stack a category pill row (All / Movies / TV / Docs) and a
Filters/Sort row above the grid. Both are gone. `RefineRow` renders five
one-tap chips — *Just films*, *Newer*, *Under 2h*, *Free to watch*, *Higher
rated* — then a count line, *More filters* and *Sort*.

Every chip is one existing `BrowseFilters` field set to one value. No axis was
added, and the shape of `src/lib/content/refineChips.ts` makes adding one
awkward on purpose: a chip is `{ field, on, off, isOn }` over the existing
vocabulary.

### Why the pills had to go rather than move

They filtered Mode A's result list client-side. On the described route the
grid comes from the engine, which never sees `category`, so tapping *Movies*
changed nothing on screen while quietly re-running Mode A and writing a log
row (device testing, 2026-09-09 — three rows for one query, seven seconds
apart). Media type is `filters.contentType` now, which all three retrieval
paths honour where their results actually come from: client-side over Mode A,
endpoint-and-genre choice on `/discover`, and server-side on the semantic RPC.

`useSearch` lost its `SearchCategory` parameter with them. Post-filtering on
`item.type` was also the [§0.2 documentary bug](../architecture/home-surface.md)
in its original habitat: the TMDb adapters overwrite `type` with `'doc'`, so a
*Docs* segment hid every documentary series while *TV* hid documentary films.

### A chip refetches; it does not thin

`useBrowseDiscover` and `useSemanticSearch` both key their queries on every
filter axis, so writing one field re-runs the query. That is the difference
from the pills, which thinned a fixed list of ~40 hits and got quieter with
each tap. The one path where a chip still post-filters is Mode A with the
semantic flag off, which is honest — and the row is hidden on the confident
title-hit layout, where post-filtering *would* mislead. It shipped still
post-filtering there anyway; see the review addendum below.

### Sync with the sheet, in both directions

The sheet edits `contentType`, `runtime` and `minRating`, so a sheet change
lights the matching chip. It does not edit `released` or `cost`, but it writes
the whole filter object, so a chip set on those axes survives an apply and
counts in the sheet's own Apply badge. `isOn` is a predicate rather than an
equality test for the same reason: a minimum rating of 8.5 chosen in the sheet
satisfies *Higher rated* and must light it. Switching that chip off then
clears the constraint outright rather than weakening it to 7.

### The empty state names what to undo

"Nothing matches this filter combination. Try loosening the filters" is true
and useless once five chips exist — it does not say which tap emptied the
grid, so the only recovery is to clear everything. `describeRefineEmptyState`
composes the active chips into a sentence and names the one added last:
*"Nothing free under two hours — try removing Under 2h."* Each chip declares
its part of speech, because "Nothing free films" reads as a bug; a noun chip
switches the opener to *No*. Two conditions on it were missing at ship and
added by the review follow-up: the copy needs evidence that filtering is what
emptied the grid, and it may not name a chip the grid in question cannot
apply.

### Browse finally records impressions (IN-SL-001 closed)

Browse rendered every result set through `PosterGridCard` and never called
`recordImpression`. A `search` row gave `result_count` and a later
`detail_view` gave the click, but there was no denominator for *which* results
were seen — so search CTR, the headline number of the measurement plan, could
not be computed at all. The grid and `TitleHitCard` now record on `'search'`
(text on screen) or `'browse'` (a preset or filters alone), stamped with the
route and the active chips so a refined result set is not silently mixed with
an unrefined one. The title-hit card is position 0 and the grid below it
starts at 1. Watchlist passes no surface and records nothing — a saved list is
not a ranked surface.

### Two logging changes worth knowing about

- **`route` replaced `category` in the settled-query identity.** The typed
  search log deduped on `(query, category)`; the field did not become dead,
  it changed occupant. Route answers the same question — *is this a second
  search over the same text?* — and genuinely varies, because *"Search titles
  instead"* re-answers one query two ways with two result counts over two
  retrieval paths.
- **The filter-intent log is no longer gated on `!semanticMode`.** That gate
  existed so a preset tap could not log twice, but `handlePreset` already sets
  exactly one intent. The gate meant a FilterSheet apply on the semantic path
  — and would have meant every refine toggle there — wrote nothing at all.

A chip that removes the last constraint with no text and no preset stages no
row: that lands on the empty state, and an empty state is not a search. Logging
it would enter a zero-result row for a user who had just cleared their filters,
which reads in the measurement plan as exactly the retrieval failure the
zero-result rate exists to catch.


## Addendum — What the review sent back (2026-09-09)

Four independent reviews of the four sessions' PRs (#131–#142), written up in
`docs/plans/2026-09-09-001-review-quick-filters-search-presets.md`. Nine
should-fix findings; the six that live on Browse and in the logging path were
fixed the same day on `fix/browse-logging-correctness`. The engine and web
findings are a separate follow-up.

**Three of the nine were one defect wearing different clothes: a later session
wrote metadata that an earlier session's rule read as intent.** That is worth
more than the individual fixes — see
[signal-architecture](../architecture/signal-architecture.md#not-every-search-row-earns-the-attribution-boost)
for the attribution rule as it now stands, including the `refine` exclusion.

### The routing decision now waits for Mode A

`describedRoute` was computed while the lookup was still in flight, and
`titleHit` is null for as long as that lasts. So every settled query took the
described branch for a moment: the embed round trip fired and was paid for
even on a confident title hit, and the *"Reading that as a feeling"* banner
and the refine row flashed on screen before the title card replaced them.
Gating on `results !== undefined` costs nothing — retrieval still never waits
on an embedding, it is the routing *decision* that waits — and typing
"severance" now makes zero embed calls.

### The title-hit grid is not filtered

"Other matches" sat below the title card with `applyBrowseFilters` running
over it, while the refine row and *More filters* were both hidden by that same
layout. Filters carried in from a preset thinned the grid with no control
anywhere on screen to undo them — the category-pill defect one layout along.
The grid is now unfiltered there. Sort stays applied: reordering hides
nothing, and `'best'`, the value a user who never opened the control still
has, is identity.

### The empty state stopped blaming chips that were not at fault

Two ways it did. It named a chip to remove whenever one was lit, before
checking whether Mode A had returned anything — so gibberish with *Newer* lit
read *"try removing Newer"*, one tap further from an answer. It now needs
`tightened` (results existed before filtering) or `!searching`. And on the
Mode A grid it could name *Free to watch*, which `applyBrowseFilters` ignores;
`describeRefineEmptyState` now takes the same `clientSideOnly` flag
`orderedRefineChips` does and drops those chips from the sentence entirely.

### The banner names the query, not the last tap

`moodKey` is the lit card and was overwritten by every tap, including
phrase-less ones. Tapping Comfort then *Free to watch* runs Comfort's phrase
under the banner *"Titles that feel like Free to watch"*. `intent.phraseKey`
now tracks the card the running phrase came from; only a card that brings a
phrase renames the banner.

### The semantic error path logs nothing

A failed embed or RPC left `semantic.data` undefined, `shown` empty and
`loading` false — indistinguishable to the loggers from a query the engine
answered with nothing, so an outage wrote `result_count: 0` into the one
metric the plan reads as a retrieval failure. Both loggers now receive
`undefined` on error and hold.

### One deletion

`selectPresets` carried a "not the same as last week" guard that re-asked
`pickTasteVibe` of the previous week's seed. It could not fire: the rotation
indexes its band by `weekBucket % length`, so consecutive weeks differ
whenever the band holds more than one card, and when it holds exactly one
there is nowhere else to go. The tests that looked like they covered it passed
on the rotation alone. Branch gone, property asserted directly.


### Half-remembered titles (2026-09-09, evening)

`titleMatchScore` measured a partial match by its share of the title's
CHARACTERS. "hail mary" is nine of the seventeen in "project hail mary" and
does not start it, so it scored 0.32 against a 0.5 floor — less than "sever"
scores against "Severance", the case the floor exists to reject. A user who
had named two of a title's three words did worse than one who had typed half
of one word, and the grid they got instead was then emptied by filters
carried in from two preset taps.

The scorer now recognises a contiguous run of WHOLE title words and treats it
like a prefix, since a prefix is that same run starting at word 0. Coverage
is the larger of the character share and the word share, so nothing that
passed before can fail now: "project hail" is unchanged at 0.60, "hail mary"
goes 0.32 → 0.567, "sever" stays at 0.47. Adjacency and order are required,
so "mary hail" falls to the weaker reordering rung. Prominence still has to
supply the rest of the confidence for any partial name.

The eight known-title fixtures and the eight preset sentences are now asserted
against this module directly. `titleHit.ts` had always said its thresholds were
calibrated against them; nothing had held that true.


## Decisions resolved (locked during plan-mode)

1. **Salmon `#ff8d5a` token bump** app-wide. Minor visual drift on Calendar / Detail / Watchlist accepted.
2. **UK RATING chip set** dropped from FilterSheet.
3. **ContentCard rating position** stays bottom-left; search artboards diverge but they're aspirational.
4. **Per-user feature flag** via composite-PK `user_feature_flags` table + typed `getFlag` accessor (not a flag-service dependency, not Studio-only env vars).

Phase summary at [docs/v2/phase-summaries/phase-search-v2-summary.md](../../../../docs/v2/phase-summaries/phase-search-v2-summary.md) is authoritative.
