# Phase 3 Summary: User Taste Vector v2 & Hook-Level Rewrites

**Branch:** `phase-3-taste-vector`
**Duration:** April 14–16, 2026
**Commits:** 38
**Files changed:** 62 (7,441 insertions, 15,176 deletions — net -7,735 lines)

---

## What was delivered

### Core system replacement
- Replaced the v1 24-dimensional taste vector with a **1536-dimensional embedding-space taste vector** computed from user interactions and bootstrapped from onboarding signals
- New module: `src/lib/taste-v2/` (5 files) — types, vector math, bootstrap formula, interaction update (incremental + full recompute), Supabase CRUD with session cache
- New module: `src/lib/recommendations-v2/` (4 files) — minimal Stage-1-only ranker using `match_titles_by_vector` RPC, hard filters (service availability, dismissed, thumbs-down, watchlist), title adapter

### Hook rewrites (10 files)
All 9 hooks from IN-301 plus `useTasteProfile` (discovered during implementation):
- `useHomeContent` — removed v1 taste loading, genre affinities; derives genres from cluster `tmdbGenreIds`
- `useContentDetail` — batch query pattern (IN-302): single Supabase query for candidate embeddings, `JSON.parse(row.embedding as string)` wire format
- `useSectionData` — all scoring modes resolve to 'none' for Phase 3 (TMDb API ordering)
- `useRecommendations` / `useHiddenGems` — v2 ranker with shared filter sets from parent
- `useTasteProfile` — v2 profile lifecycle, incremental interaction blending, stale recompute
- `useUserPreferences` — v2 bootstrap on onboarding completion, cluster re-bootstrap
- `OnboardingFlow` — complete rewrite (see below)
- `ProfilePage` — complete rewrite (see below)
- `LazyGenreSection` — removed v1 taste vector props

### v2 5-step onboarding flow
1. **Account creation** — email, username, password, age range, viewing context (integrated auth sign-up, replaced separate SignUpScreen)
2. **Streaming services** — 2-column grid ordered by UK market size
3. **Watched grid** — 3 rounds of 6 titles (3×2 grid), popular titles from user's services, pre-fetched during Step 1
4. **Genre/cluster preferences** — 16 taste cluster chips, no selection cap
5. **Taste summary + sliders** — prose summary from cluster adjective/mood fields, stats card (genres/titles/services counts), 4 sliders with dynamic position labels

### Profile rebuild (7 sub-pages)
Sub-page router architecture with animated transitions:
- **Landing** — avatar, stats, 7 action rows with coloured icon backgrounds (rgba tints)
- **Account Details** — name/email edit, orange active Save button
- **Streaming Services** — 2-column grid, auto-save on toggle
- **Monthly Spend** — wraps existing SpendDashboard
- **Your Taste** — prose summary, cluster chips, refine preferences (cluster grid), retake taste profile (confirmation modal)
- **Tune Recommendations** — 4 sliders with orange fill, dynamic labels, custom `.videx-slider` CSS
- **Appearance** — Light/Dark/System radio options
- **Privacy & Data** — info modal ("What Videx learns"), download placeholder, delete account modal (UI only, wiring deferred)

### v1 system deletion
15 files deleted (~5,227 lines):
- 6 quiz components (`src/components/quiz/`)
- 7 v1 taste modules (`tasteVector`, `quizConfig`, `quizScoring`, `genreBlending`, `contentVectorMapping`, `computeContentVector`, `vectorSerialisation`)
- `src/lib/storage/tasteProfile.ts`
- `src/lib/utils/recommendationEngine.ts`
- 10 dead scripts (`scripts/taste-tests/`, quiz analysis scripts, interaction audit)

### Migrations
| # | Name | Type | Purpose |
|---|---|---|---|
| 023 | `taste_vector_v2` | Additive | Add v2 vector (1536D), slider columns, metadata to taste_profiles |
| 024 | `drop_legacy_taste_vector` | Destructive | Drop v1 24D columns, quiz_completed, quiz_answers, interaction_log, version |
| 025 | `fix_match_titles_rpc` | Fix | Set HNSW ef_search dynamically (was capped at 40 results) |
| 028 | `available_tmdb_ids_rpc` | Performance | Single-query DISTINCT availability lookup |

### Infrastructure
- **Tailwind v4 pipeline rebuilt** — installed `tailwindcss@4.2.2` + `@tailwindcss/vite`, replaced pre-compiled `index.css` with source file. All Tailwind classes now generated on demand.
- **Bottom nav** — added "For You" tab (Sparkles icon)
- **For You page** — renders Recommended For You + Hidden Gems rows

---

## Decisions made during execution

| Decision | Chosen | Why |
|---|---|---|
| Bootstrap weights | Dynamic 4-band by watched-grid count (0/1-4/5-12/13+) | Rewards engaged users who select more titles |
| Watched-grid algorithm | Popular titles from user's services (no centroid RPC) | Faster, better-known titles, pre-fetchable |
| Taste vector update | Hybrid: incremental on interaction + full recompute if stale >24h | Instant feedback + replayable from event log |
| Slider storage | Columns on taste_profiles (not separate table) | Simpler, co-loaded with taste vector |
| Decay | Lazy (applied at recompute time only) | Simpler for Phase 3; sufficient |
| Auth integration | OnboardingFlow Step 1 handles sign-up (replaces separate SignUpScreen) | Eliminates duplicate email collection |
| Cluster cap | Removed (unlimited selection) | Per Joe's feedback during testing |

---

## Deviations from the brief

1. **Step 3 grid size:** Brief proposed 18 titles (3×6). Design showed 6 (2×3). Built 6 per round in 3×2 grid per design.
2. **Step 4 uses taste clusters, not raw genres:** Design showed cluster chips matching TASTE_CLUSTERS, not TMDb genre names. Brief said "genre preferences" but meant clusters.
3. **Auth integrated into onboarding:** Brief's Step 1 design showed account creation fields. The existing separate SignUpScreen was merged into OnboardingFlow Step 1 during testing when the duplicate email collection was discovered.
4. **No separate step component files:** Plan proposed 5 step files + 8 profile sub-page files. Built all inline in OnboardingFlow.tsx and ProfilePage.tsx to reduce file count and simplify iteration.
5. **Hidden Gems thresholds:** Sanity query not run in Task 1 (database was not yet set up for the query at that point). Thresholds set from v1 values and adjusted during testing.
6. **Migration 024 applied early:** Applied alongside migration 025 during the For You debugging session, before the planned behavioural verification was complete.

---

## Documentation updates needed

- **Strategy doc §5.2:** Bootstrap formula weights are now dynamic (4-band), not static 0.40/0.40/0.20
- **Strategy doc §7.2:** Phase 3 scope now includes auth integration into onboarding
- **Orchestration doc §3.4:** Migrations 025 and 028 added (not originally planned)

---

## Open items carried forward to Phase 4

1. **For You page layout** — currently minimal (2 rows). Phase 4 adds full row composition, hero card, "Because You Watched", "Outside Your Usual"
2. **Slider pipeline modulation** — sliders save state but don't affect recommendations. Phase 4 wires values into Stage 2 weighting
3. **Scoring in genre sections** — all sections use TMDb API ordering (scoringMode='none'). Phase 4 reintroduces embedding-based reordering
4. **For You loading performance** — reduced from ~5s to ~1-2s. Further optimisation possible by moving availability filter into the pgvector RPC or adding persistent client-side cache
5. **Supabase type generation** — all new Supabase queries use `as any` casts because taste_profiles isn't in generated types. Running `supabase gen types typescript` would restore type safety
6. **Delete account wiring** — UI exists, button disabled with "not yet available" notice

---

## Parking lot entries

### New entries filed
- **IN-XPS-006:** Delete account wiring deferred. GDPR Article 17 cascading delete required before public launch. Modal UI exists in Privacy & Data sub-page.
- **IN-XPS-007:** Service pricing config (`src/lib/data/platformPricing.ts`) needs periodic review cadence or external data source. Last verified April 2026. Currently hardcoded UK prices.
- **IN-XPS-008:** Consider pre-building a curated onboarding watched-grid title pool (refreshed weekly) instead of querying live at onboarding time. Would enable editorial control and eliminate query latency. Needs user testing first to validate whether the current dynamic approach produces good enough results.

### Updated entries
- **IN-301** (Hook-level rewrite scope): ✅ Incorporated — all 9 files + useTasteProfile rewritten
- **IN-302** (Detail page batch query pattern): ✅ Incorporated — `JSON.parse(row.embedding as string)` pattern, single Supabase query
- **IN-303** (Quiz subsystem deletion): ✅ Incorporated — 15 files deleted, migration 024 drops v1 columns

---

## Verification results

### Schema ✅
- `taste_vector_v2 vector(1536)` present, v1 columns dropped
- Slider columns present with correct defaults
- Migrations 023–025, 028 applied cleanly

### Code ✅
- `npx tsc --noEmit`: clean
- `npx eslint`: 0 errors (warnings only — pre-existing `no-explicit-any`)
- `npx vite build`: succeeds in 2.58s
- Zero grep hits for deleted functions/files

### Behavioural ✅
- Onboarding 5-step flow completes end-to-end
- taste_vector_v2 IS NOT NULL after onboarding, interaction_count=0, bootstrapped_from='onboarding_v2'
- For You page renders with content
- Hidden Gems renders with content
- Home page renders all sections
- Detail page "More Like This" returns candidates
- Profile sub-pages all navigate correctly
- Sliders persist across page reloads
- Delete account modal shows deferral notice

### No regressions ✅
- Watchlist, Browse, Search all load correctly
- Bottom nav has 5 tabs (Home, For You, Browse, Watchlist, Profile)

---

## Observations for Phase 4

1. **The availability set is large (~17k tmdb_ids)** — consider moving the service filter into the pgvector RPC itself to avoid client-side intersection of 500 RPC results against 17k available IDs
2. **The Tailwind pipeline was rebuilt** — any future class additions will work. The inline style workarounds in ProfilePage modals can be cleaned up
3. **The `useSectionData` scoring modes are all 'none'** — Phase 4 needs to decide whether to reintroduce embedding-based reordering or rely entirely on the v2 ranker for all sections
4. **The taste vector bootstrap quality depends heavily on the watched-grid title pool** — if users consistently skip the grid, the bootstrap is service-fingerprint-heavy. Monitor during user testing.
5. **The `match_titles_by_vector` RPC now requires `ef_search` scaling** (migration 025) — this is a per-query cost. For high-frequency calls (e.g. multiple ranker invocations per page load), consider capping `ef_search` at 200-300 instead of matching `match_limit` exactly.
