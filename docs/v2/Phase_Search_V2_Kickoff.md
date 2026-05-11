# Phase Search V2 — Kickoff Brief (for Claude Code)

**Status:** Brief v0.2 (2026-05-11) — design-approved, pending Joe's approval before CC plan-mode.
**Branch:** `phase-search-v2` (cut from `main` after Phase 5.5 closes).
**PR target:** Single PR back to `main`, two logically grouped commit clusters (A and B).
**Strategy source:** `videx-wiki/raw/v2-strategy/Videx_v2_Search_Strategy_Annex_v0.1.md`.
**Design source of truth:** `docs/v3-design/search/Phase_Search_V2_Implementation_Brief.md` + 8 artboards at `docs/v3-design/search/screens/01-search-empty.png` through `06-results-advanced.png` (plus `02b-typing-states.png`, `04b-mode-c-optin.png`). **Read both before writing any UI code.** Design takes precedence on visual spec; this brief takes precedence on retrieval / data / instrumentation.
**Forward planning:** `videx-wiki/raw/forward-planning/roadmap-search-v2-entity-and-signal.md`.
**Predecessor:** Phase 5.5 (Quality & Legal Hardening) must be merged first.

**Changes from v0.1:** design work resolved several open questions and added scope. Notable: FilterSheet is a full 11-section redesign (not "add 4 axes to existing"); filter state moves to URL query params; two new primitives confirmed (`<ServiceTile>`, `<ActiveFilterPill>`); `<ContentCard>` needs modification (service stack overlay + bookmark); "Browse by filter" CTA in empty state opens the sheet standalone; Mode C opt-in triggers on 0–2 Mode A results; recent searches confirmed local-storage with cap of 20.

---

## Section 0 — What CC needs to know before planning

Phase Search V2 ships filtered + semantic search as one phase, two clusters. Cluster A (structured filters) is unflagged and shippable standalone. Cluster B (semantic) ships behind a feature flag that defaults off until the eval rig is green.

The strategy annex is the authoritative reference. This brief covers scope, file paths, contracts, and verification gates — not strategy. If the annex and this brief disagree, escalate to Joe; do not resolve independently.

---

## Section 1 — Target outcomes

By phase close:

1. **Empty state offers two parallel journeys.** Recent searches (local-storage, max 20, surface most-recent 5), a full-width "Browse by filter" CTA card (opens FilterSheet standalone with all services pre-selected), and a 2×2 mood-chip grid (each chip fires a Mode C semantic query). Per artboard 01.
2. **FilterSheet is a full 11-section scroll layout.** Pinned `Only on my services` toggle (defaults ON), then: STREAMING SERVICES, CONTENT TYPE, COST, RUNTIME *(new)*, GENRE, DECADE *(new)*, UK RATING *(new)*, MINIMUM RATING, SHOW WATCHED, LANGUAGE. 740px sheet height. All services pre-selected on first open (opt-out, not opt-in). Per artboard 05.
3. **Filter state lives in URL query params**, not just component state. Format per design brief §5: `?services=netflix,apple&type=movie&genre=drama,thriller&runtime=60-120&decade=70s,80s&rating=15,18&min=6.8&lang=en,ko`. Back button restores state; deep links work.
4. **Service-availability filtering moves pre-retrieval.** Replace per-item `getCachedServices` post-hoc badge filter in `useSearch.ts:60-106` with a pre-call to `get_available_tmdb_ids(service_ids)` (existing RPC, migration 028).
5. **`<ContentCard>` modified for search-page composition.** Top-left service stack overlay (18px badges, max 3) + top-right bookmark (28×28 glass pill, filled when saved). Bottom-right pill shows *either* rating *or* "Not on yours" — never both. Existing variants retained for other surfaces.
6. **Two new primitives shipped.** `<ServiceTile>` (56×56 logo, orange ring + tick badge when active, greyscale-faded when excluded; for FilterSheet) and `<ActiveFilterPill>` (small pill with × remove; for results-page active-filter strip).
7. **Active-filter chip strip on results page** when ≥ 1 filter is active. Kicker "N FILTERS · CLEAR", horizontally-scrolling chip strip (one `<ActiveFilterPill>` per active filter), count row "**N titles** match all M filters", "Edit filters" shortcut button. Per artboard 06.
8. **Semantic search (Mode C) shipped behind feature flag.** Free-text descriptive queries return ranked filtered results via query embedding + `match_titles_by_vector`. Flag defaults off until eval green.
9. **Mode A → Mode C opt-in CTA renders when Mode A returns 0–2 results** for a free-text query. Full-width orange-icon card "Search for '<query>' as a description" + subcopy "Find titles that feel like '<query>'". Below: "Nothing matches that phrase as a title. Try searching by description instead, or loosen a filter." Per artboard 04b.
10. **Mode C results header**: "Showing titles like '<query>'" italic Fraunces 13 + inline "Search keywords instead →" orange link to revert. Per artboard 04.
11. **Mode A results header**: "Results for '<query>' · N in your stack" — count "in your stack" is faint metadata to the right of the bolded query. Per artboard 03.
12. **Eval rig green before flag flip.** ~20 hand-written semantic queries with expected top-K title sets; CI regression check.
13. **Latency targets met.** Title typeahead suggestions render < 150ms post-debounce; Mode A submit < 400ms; Mode C submit < 700ms (warm). Debounce: 200ms on typing → suggestions; 300ms on filter changes → re-query.
14. **Instrumentation.** All search-result card impressions tagged `source_surface = 'search'` with `metadata: { mode: 'lookup' | 'semantic', query_hash, filter_set_hash }`. Filter-only searches (no text query) tagged with `mode = 'filter'`.
15. **`emitSearch` augmented** with `session_id` and `mode` (no taste-pipeline consumption yet — that's Phase 3 forward-planning).
16. **`shared-tree-drift` CI green throughout.** Any retrieval primitives that land in `_shared/` mirror correctly.

---

## Section 2 — Pre-cut hygiene

Before `git checkout -b phase-search-v2`:

- **H1.** Phase 5.5 merged and CI green on `main`.
- **H2.** Confirm the existing feature-flag pattern — search the codebase for `feature_flag`, `featureFlag`, `flags.`, or any boolean-gated experimental surface. Report findings before scoping the flag mechanism. If none exists, propose a minimal pattern (boolean column on `profiles` keyed by flag name, plus a typed accessor) for Joe to review.
- **H3.** Confirm `match_titles_by_vector` HNSW `ef_search` tuning is sane for runtime user queries (it was tuned for For You retrieval). Run a quick latency probe; report.
- **H4.** Confirm OpenAI API key + outbound network access from Edge functions for runtime (not just cron) embedding calls. The `embed-new-titles` cron uses the same key — verify it's available at runtime invocation, not just scheduled invocation.
- **H5.** Token-gap audit. Read `src/index.css` and confirm presence (or absence) of `--primary-soft`, `--primary-edge`, and any token corresponding to `#ff8d5a` (salmon) used in `<ActiveFilterPill>` per design. If absent, surface the gap to Joe + design before A4.
- **H6.** Inventory existing primitives the design assumes: `<SearchInput>`, `<SectionHead>` (with `kicker / title / sub / rightSlot` props), `<MoodChip>` (with `icon / label / sub / hue` props per design brief table 4), `<CategoryPills>`, segmented control, toggle row, slider, sheet primitive. Confirm each exists with the assumed API; if any are stub/missing, raise before Cluster A starts.
- **H7.** Distinct-value audit on `titles.content_rating`. Run `SELECT DISTINCT content_rating, count(*) FROM titles WHERE content_rating IS NOT NULL GROUP BY content_rating ORDER BY count(*) DESC;`. Surface the result so the UK RATING chip set in A2 matches reality, not the design's working assumption.

---

## Section 3 — Branch + commit plan

Single branch `phase-search-v2`, ~10 commits, single PR back to `main`.

### Cluster A — Structured filtered search (no flag)

#### A1 — `FilterState` schema + URL serialisation
Define the canonical filter state. Required shape (TypeScript):
```ts
interface FilterState {
  services: string[];          // provider_ids, defaults to user's services
  contentType: 'all' | 'movie' | 'tv' | 'doc';
  cost: 'all' | 'free' | 'in_plan' | 'rent_ok';
  runtime: 'any' | 'under_60' | '60_120' | 'over_120';
  genres: string[];
  decades: string[];           // '1960s' | '70s' | '80s' | '90s' | '00s' | '10s' | '20s'
  ukRatings: string[];         // U, PG, 12, 12A, 15, 18, TV-14, TV-MA
  minRating: number;           // 0–10, step 0.1
  showWatched: 'all' | 'hide' | 'only';
  languages: string[];
  onlyOnMyServices: boolean;   // defaults true
}
```
New module `src/lib/search/filterState.ts` exports `serialize(state) → URLSearchParams`, `deserialize(params) → FilterState`, `hash(state) → string` (for impression metadata), `isDefault(state) → boolean` (controls whether the active-filter strip renders), `defaultFor(userServices) → FilterState`.

Wire into `BrowsePage.tsx` via existing routing (state-based nav — no React Router yet, see v2.5 roadmap; use a serialised query-param mechanism on the in-memory search-page state object, persisted to URL hash or equivalent).

#### A2 — FilterSheet 11-section redesign
Reimplement `src/components/FilterSheet.tsx` to match artboard 05. Sections in design-brief §3.6 order. New section primitives:
- Pinned toggle row at top (Only on my services).
- Horizontally-scrolling row of `<ServiceTile>` (new primitive — A4).
- Three new chip-multi-select sections (DECADE, UK RATING) and one new segmented control (RUNTIME).

Header: kicker "REFINE" + Fraunces 24 "Filters" + count badge ("7" when 7 filters active). Footer: "Clear all" ghost left + "Apply" primary orange right. Apply closes the sheet and re-runs the query. Swipe-down on grabber / tap backdrop / × button all close *without* applying.

The sheet can be opened from two entry points: the filter button on the results page, OR the "Browse by filter" CTA on the empty state. The latter opens with the default state (all services pre-selected, nothing else set).

#### A3 — Search empty state
Implement artboard 01 in `BrowsePage.tsx`:
- Search input pinned, placeholder "Search titles, moods, descriptions". Orange `--primary` border ring when focused.
- `<SectionHead kicker="Recent" rightSlot={<ClearButton/>}/>` + up to 5 recent-search rows (clock icon, query text, × dismiss). Hide section entirely if zero recents.
- Full-width orange "Browse by filter" CTA card. Tap → opens FilterSheet standalone.
- `<SectionHead kicker="Or start with a feeling"/>` + 2×2 `<MoodChip>` grid. Tap chip → populate search input with the mood phrase, submit, render Mode C results (uses the Cluster B path; with flag off, falls back to Mode A).

#### A4 — New primitives: `<ServiceTile>` and `<ActiveFilterPill>`
- `src/components/ServiceTile.tsx`: 56×56 logo, orange ring + tick badge when active, greyscale + 50% opacity when excluded. Tap toggles. Used inside FilterSheet only.
- `src/components/ActiveFilterPill.tsx`: small pill, label + × remove button. Background `--primary-soft`, border `--primary-edge`, text `#ff8d5a` (or token equivalent — confirm with design before adding raw hex). Used in results-page active-filter strip only.

If the design tokens lack `--primary-soft` / `--primary-edge` / the salmon text colour, raise as a blocker before implementing — do not invent tokens.

#### A5 — `<ContentCard>` modification for search composition
Existing `src/components/ContentCard.tsx` gains an optional `searchVariant` prop (or new variant in the existing variant union). When enabled:
- Top-left: `<ServiceStack size={18} max={3}>` on glass-blur pill, with `--badge-glow` halo.
- Top-right: bookmark button (28×28) on `--scrim-glass-action` pill, filled when saved.
- Bottom-right: rating pill OR "Not on yours" pill (mutually exclusive).
- Off-services cards render with `opacity: 0.75` + "Not on yours" pill replacing rating pill.

Other variants (`default`, `wide`, `lead`, `mosaic`) unchanged. Snapshot tests for non-search variants to confirm zero regression.

#### A6 — As-you-type suggestions
New `<SearchSuggestions>` component below the search input. Trigger at ≥ 2 chars, 200ms debounce. Up to 5 rows: 40×60 poster + title (Fraunces or DM Sans per design brief §3.2 — confirm Fraunces 14 600 from artboard 02) + meta (year + media type, DM Sans 11 500 faint) + service stack + chevron.

`tooShort` state (1 char): "Keep typing…" italic Fraunces centred, recents list still visible underneath.
`loading` state: 5 skeleton rows of poster + title placeholders.

Tap routing: high-confidence exact match → detail page; otherwise → results page filtered to that title. **Threshold open per design brief §6 Q1 — confirm with Joe before implementing; default to "Levenshtein distance ≤ 2 on title prefix" if unanswered.**

#### A7 — Mode A results page
Implement artboards 03 and 06:
- Search input (current query) with × clear.
- Category pills All / Movies / TV / Docs.
- "Filters" button with count badge ("Filters · 3" when 3 filters active). Filled orange when active; ghost when not.
- Mode indicator row: `Results for '<query>'` (DM Sans 13 `--fg-soft`) + faint metadata `· N in your stack` when on-services filter active.
- 2-col `<ContentCard searchVariant>` grid.
- When filters active (artboard 06): kicker "N FILTERS · CLEAR" row + horizontally-scrolling `<ActiveFilterPill>` strip + thin divider + count row "**N titles** match all M filters" + "Edit filters" pill button.
- No-results state: "Nothing matches this combination. Loosen a filter?" + suggested-loosen action (drop most-restrictive filter automatically when tapped).

#### A8 — Service-availability via RPC, not post-hoc badges
Refactor `useSearch.ts` (`fetchBadgesInBackground`, lines 60-106): pre-fetch `get_available_tmdb_ids(serviceIds)` once on query, intersect with TMDb result IDs, drop unavailable items before `setResults`. Badge population stays per-item but no longer drives availability filtering. When `onlyOnMyServices = false`, skip the intersect; badge with "Not on yours" pill instead.

#### A9 — Recent-searches local-storage layer
New `src/lib/search/recentSearches.ts`. API: `get() → string[]`, `add(query) → void`, `remove(query) → void`, `clear() → void`. localStorage key `videx_recent_searches`, JSON array, max 20, dedupe by exact match (case-insensitive), most-recent-first. Clear on `signOut` via `AuthContext` hook (cross-user safety, same pattern as embedding cache from Phase 5.5).

#### A10 — Instrumentation
Add `source_surface = 'search'` and `metadata: { mode, query_hash, filter_set_hash }` to all card impressions emitted from search results. Augment `emitSearch` in `src/lib/storage/interactions.ts:124-129` with `session_id` and `mode` fields. Distinguish `mode: 'filter'` when there's no text query (FilterSheet-only entry).

#### A11 — Tests for new pure functions
Vitest. Cover: `filterState` serialise/deserialise round-trip, `filterState.hash` stability across irrelevant key-order changes, `recentSearches` cap + dedupe behaviour, suggestion-threshold routing logic. Mirror the Phase 5.5 pattern from `src/lib/recommendations-v2/__tests__/`.

### Cluster B — Semantic search behind flag

#### B1 — Feature flag mechanism
Implement per H2 outcome. If new pattern: migration adds `feature_flags jsonb` column to `profiles` (or a separate `user_feature_flags` table — Joe's call); typed accessor in `src/lib/featureFlags.ts`. Default value for `search_semantic`: false. Flag is read once on `BrowsePage` mount; no per-keystroke evaluation.

#### B2 — `embed-query` Edge function
New Edge function `supabase/functions/embed-query/index.ts`. Inputs: `{ query: string }`. Outputs: `{ embedding: number[], cached: boolean }`. Uses `_shared/openaiEmbeddings.ts:embedSingle`. In-memory LRU cache by query string, 1h TTL, ~1000 entry cap. JWT-protected (verify_jwt = true).

#### B3 — Semantic retrieval path
New function in `src/lib/recommendations-v2/search/semanticRetrieval.ts`: takes a query string + `FilterState`, calls `embed-query`, calls `match_titles_by_vector` with the returned embedding (and filter-derived `WHERE` clauses), applies post-retrieval filters not expressible in SQL, returns ranked candidates. Mirror to `_shared/recommendations-v2/search/`.

Ranking weights (from annex §4): 60% cosine relevance, 25% taste fit, 15% recency. Named constants for easy eval-driven tuning.

#### B4 — Mode dispatch
In `useSearch.ts`, three triggers for Mode C path (in priority order):
1. **Mood-chip tap from empty state.** Always Mode C, regardless of flag (renders Mode A fallback if flag off; the chip is a hint, not a hard requirement).
2. **Mode A → Mode C opt-in CTA tap.** User explicit. Re-runs as Mode C.
3. **Mode C revert ("Search keywords instead").** Re-runs as Mode A.

The opt-in CTA renders when Mode A returns 0–2 results for a free-text query (per artboard 04b). "Free-text" defined as: query length ≥ 3 chars AND no TMDb result has exact-substring match on the first 5 chars of the query. Tune the 0–2 threshold via a constant.

No automatic / silent Mode C dispatch. Mode C is always user-elected — never surprises the user.

#### B5 — Mode C UI affordances
Per artboards 04 and 04b, all spec'd in the design brief. Implementation hooks:
- Mode C results header: `<SearchModeIndicator mode="semantic">` renders italic Fraunces 13 "Showing titles like '…'" + orange link "Search keywords instead →".
- Mode C opt-in CTA: `<SearchSemanticCTA query={q}/>` — full-width card with `<SearchSparkleIcon>` (or design-supplied icon) on left, "Search for '<query>' as a description" + "Find titles that feel like '<query>'" subcopy. Apply `--scrim-glass-action` + `--scrim-glass-edge` treatment.

When flag is OFF in production, the opt-in CTA renders but tapping it shows a toast "Semantic search is in preview" rather than calling the embed path. (Avoids dead-button confusion during the eval-gated rollout.) Once eval green and flag flipped: the toast removed.

#### B6 — Eval rig
New script `scripts/test/search-semantic-eval.ts` and fixture `scripts/test/search-semantic-fixtures.json`. Fixture: 20 hand-written queries with expected top-10 title sets (Joe authors). Script: runs semantic retrieval for each query, computes precision@10 + MRR, fails CI if either drops below threshold (precision@10 ≥ 0.6, MRR ≥ 0.7 — initial; tune after first run).

CI: new workflow `.github/workflows/search-semantic-eval.yml` triggers on PRs touching `src/lib/recommendations-v2/search/**`, `supabase/functions/embed-query/**`, `_shared/recommendations-v2/search/**`, or the fixture file.

#### B7 — Mirror tree
Mirror the search retrieval module + types to `_shared/`. `shared-tree-drift` CI enforces.

---

## Section 4 — Mirror tree obligations

Every commit in Cluster B that touches `src/lib/recommendations-v2/search/*` MUST also update `supabase/functions/_shared/recommendations-v2/search/*` in the same commit. Same for any shared types.

Cluster A: src-only. `BrowsePage`, `FilterSheet`, `useSearch`, `ContentCard`, new primitives, `filterState.ts`, `recentSearches.ts`, `interactions.ts` — none mirror. Filter logic stays client-side; retrieval refactor uses an existing RPC.

---

## Section 5 — Migration sequencing

Migrations expected:

| # | Migration | Cluster | Apply order |
|---|---|---|---|
| 04X | `feature_flags` column or table | B | After flag pattern decided in H2/B1 |

Apply via Studio per the established protocol: CC writes SQL, Joe pastes into Studio, reports verification queries, only then proceed to next commit.

No other migrations expected unless H2 flag investigation surfaces a need.

---

## Section 6 — Verification

### Cluster A
- **Empty state:** all three journeys work — recents tap → submit, "Browse by filter" CTA → opens sheet standalone with services pre-selected, mood chip tap → triggers Mode C path (or Mode A fallback when flag off).
- **FilterSheet:** open from both entry points; toggle each section; verify URL updates; close via × / swipe / tap-backdrop discards changes; Apply commits + closes + re-runs.
- **URL state:** apply filters → copy URL → paste in fresh session → state restored. Back button after filter change restores prior state.
- **`<ContentCard searchVariant>`:** renders correctly across rating/no-rating/off-services states; non-search variants visually unchanged (snapshot test).
- **Active-filter strip:** appears when ≥ 1 filter active; pill × removes single filter; CLEAR drops all; "Edit filters" reopens sheet.
- **Suggestions:** typeahead under 150ms post-debounce; tooShort + loading states render.
- **Service availability:** off-services results hidden when `onlyOnMyServices=true`; visible-with-pill when false.
- **Card impressions:** `SELECT source_surface, metadata FROM card_impressions WHERE source_surface='search' LIMIT 10;` — populated with `mode`, `query_hash`, `filter_set_hash`. `mode='filter'` rows present for filter-only searches.
- `npx tsc --noEmit` clean. `npm test` green.

### Cluster B (eval-gated)
- `node scripts/test/search-semantic-eval.ts` — passes thresholds (precision@10 ≥ 0.6, MRR ≥ 0.7).
- **Mode C trigger logic:** Mode A returning 0–2 results for a free-text query renders the opt-in CTA; tapping calls embed path (with flag on) or shows preview toast (with flag off).
- **Mode C results UI:** mode indicator copy + revert link both render correctly; tap revert re-runs as Mode A.
- **Manual:** flip flag for self via Studio update, run all 20 fixture queries, inspect results subjectively.
- **Latency:** Mode C submit < 700ms warm; second identical query < 100ms (cache hit).

### Phase close
- Eval green. Flag stays OFF in production by default. Joe flips flag for himself, runs ~20 queries over 2 days. If acceptable, flag flipped on for prototype users.

---

## Section 7 — Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| OpenAI key not available at Edge runtime (vs cron) | Medium | H4 confirms before B2 starts. |
| `match_titles_by_vector` HNSW ef_search wrong for user queries | Low | H3 probe. Tune in B3 if needed. |
| Semantic results subjectively poor | Medium | Eval rig is the gate; flag stays off until thresholds met. Worst case: ship Cluster A, defer Cluster B to a follow-up phase. The opt-in CTA still renders (with preview toast) so the surface is consistent. |
| Query embedding cost at scale | Low | See annex §8 — effectively free up to 10K users. |
| `<ContentCard>` modification regresses other surfaces (Home, For You, Watchlist) | Medium | New behaviour gated behind `searchVariant` prop; snapshot tests on existing variants block accidental drift. |
| URL filter-state serialisation breaks state-based nav | Medium | Cluster A ships URL handling alongside the existing nav object; round-trip tests in A11; fall back to in-memory state if URL absent. |
| Two new primitives proliferate to other surfaces inappropriately | Low | `<ServiceTile>` and `<ActiveFilterPill>` are search-only; document at top of file; flag in any cross-surface PR review. |
| Token gap (`--primary-soft`, `--primary-edge`, salmon text) | Medium | A4 raises as blocker if missing; design must add or sub before Cluster A ships. |
| Feature flag pattern proliferates | Low | H2 + B1 establish a single pattern; subsequent flags reuse it. |
| Search captures sensitive query strings before retention policy exists | Medium | Phase 3 (forward planning) addresses retention. Until then, queries are RLS-protected the same as other `user_interactions` rows. |
| FilterSheet at 740px height clips on smaller iPhones (SE) | Low | Sheet is scrollable internally; verify on SE viewport in design QA. |

---

## Section 8 — Open questions for Joe (post-cut)

Resolved by design pass: empty-state taxonomy (mood chips + "Browse by filter" CTA, no decade/service shortcuts duplicated outside the sheet); editor's-note strip on empty state (dropped); off-services treatment (show with opacity 0.75 + "Not on yours" pill); FilterSheet layout (scroll, not split tabs); mode C revert affordance (inline link); match-% pill (debug only); search tab rename (out of scope for this phase per design — keep "Browse" or rename later).

Still open:

1. **Feature flag mechanism** (H2 outcome). Joe approves the pattern.
2. **Eval fixture authorship** (B6). Joe writes the 20 queries + expected top-10 sets, or delegates to Claude with review.
3. **Suggestion routing threshold** (A6 / design brief Q1). What title-match score sends the user straight to detail vs results-page-filtered-to-title? Default: Levenshtein ≤ 2 on title prefix unless Joe specifies otherwise.
4. **UK content rating set** (A2 / design brief Q2). Confirm exact set against `titles.content_rating` distinct values before A2 ships. Run: `SELECT DISTINCT content_rating FROM titles WHERE content_rating IS NOT NULL ORDER BY content_rating;`.
5. **Mode C trigger threshold** (B4 / design brief Q4). 0–2 results is the working figure; tune if too aggressive / too lax during eval.
6. **Token gap check** (A4). `--primary-soft`, `--primary-edge`, and the `#ff8d5a` text colour for `<ActiveFilterPill>` — confirm these exist in `src/index.css` or design supplies tokens before A4 implements.

---

## Section 9 — Time estimate

Updated upward from v0.1 — the design work expanded scope (full FilterSheet redesign, two new primitives, ContentCard modification, URL state, active-filter strip).

| Cluster | Commits | Effort |
|---|---|---|
| Cluster A | A1–A11 | ~4–5 days |
| Cluster B | B1–B7 | ~2–3 days (incl. eval rig) |
| **Total** | **~18 commits** | **~6–8 days** active work |

Single PR, single branch.

---

## Section 10 — Approval gate

- [ ] Joe reviews this brief.
- [ ] Joe answers Section 8 questions.
- [ ] H1–H4 hygiene complete.
- [ ] CC produces a plan-mode response covering the same scope; Joe reviews.
- [ ] Branch cut, execution begins.
