---
title: Phase 3 — User taste vector v2 + hook rewrites
type: concept
tags: [phase, phase-3, taste-vector, onboarding, hooks]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/phase-summaries/phase-3-summary.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/architecture/taste-vector.md
  - wiki/concepts/architecture/onboarding-flow.md
  - wiki/concepts/architecture/profile-restructure.md
  - wiki/entities/codebase/hooks.md
  - wiki/entities/codebase/migrations.md
---

# Phase 3 — User taste vector v2 + hook rewrites

Branch: `phase-3-taste-vector`. April 14-16, 2026. 38 commits. 62 files changed: 7,441 insertions / 15,176 deletions = net **−7,735 lines** (v1 quiz subsystem deleted).

## What was delivered

### Migrations

| # | Type | Purpose |
|---|---|---|
| 023 | additive | `taste_vector_v2 vector(1536)`, slider columns, metadata on `taste_profiles`. |
| 024 | destructive | Drop v1 24D columns, `quiz_completed`, `quiz_answers`, `interaction_log`, `version`. |
| 025 | fix | `match_titles_by_vector` recreated as plpgsql with dynamic `hnsw.ef_search` (was capped at 40 results). |
| 028 | perf | `get_available_tmdb_ids` JSON RPC; replaces 42-page paginated REST calls. |

### New modules

- `src/lib/taste-v2/` (5 files): types, vectorOps, bootstrap, interactionUpdate (incremental + full recompute), Supabase CRUD with session cache.
- `src/lib/recommendations-v2/` (4 files, minimal Phase 3 ranker): types, weights, hardFilters, titleAdapter — Stage-1-only via `match_titles_by_vector`.

### Hooks rewritten (10 files)

`useHomeContent`, `useContentDetail` (batch query + `JSON.parse(row.embedding as string)`), `useSectionData` (scoring='none'), `useRecommendations`, `useHiddenGems`, `useTasteProfile` (added during implementation, beyond brief's 9), `useUserPreferences`, `OnboardingFlow.tsx` (full rewrite with auth integrated into Step 1), `ProfilePage.tsx` (full rewrite, 7 sub-pages, animated transitions), `LazyGenreSection.tsx`.

### v2 onboarding (5 steps)

1. Account: email/username/password, age range, viewing context. Auth sign-up integrated (replaces separate SignUpScreen).
2. Streaming services grid (UK market order).
3. Watched grid: 3 rounds × 6 titles (3×2 grid), popular titles from user's services, pre-fetched during Step 1.
4. Genre/cluster preferences: 16 taste cluster chips, no upper cap.
5. Taste summary + 4 sliders.

### Profile rebuild (7 sub-pages)

Sub-page router with animated transitions: Landing, Account Details, Streaming Services, Monthly Spend, Your Taste, Tune Recommendations (4 sliders), Appearance, Privacy & Data.

### v1 deletion

15 files (~5,227 lines): 6 quiz components, 7 v1 taste modules (`tasteVector`, `quizConfig`, `quizScoring`, `genreBlending`, `contentVectorMapping`, `computeContentVector`, `vectorSerialisation`), `tasteProfile.ts`, `recommendationEngine.ts`, 10 dead scripts.

### Infrastructure

- Tailwind v4 pipeline rebuilt (`tailwindcss@4.2.2` + `@tailwindcss/vite`); pre-compiled `index.css` replaced with source.
- Bottom nav: "For You" tab added (Sparkles icon).
- For You page: minimal — Recommended For You + Hidden Gems only (Phase 4 fills it out).

## Decisions made during execution

| Decision | Chosen | Why |
|---|---|---|
| Bootstrap weights | Dynamic 4-band by watched-grid count (0/1-4/5-12/13+) | Rewards engaged users selecting more titles. |
| Watched-grid algorithm | Popular titles from user's services (no centroid RPC) | Faster, better-known, pre-fetchable. |
| Taste vector update | Hybrid: incremental on interaction + full recompute if stale > 24h | Instant feedback + replayable. |
| Slider storage | Columns on `taste_profiles` (not separate table) | Co-loaded with taste vector. |
| Decay | Lazy (applied at recompute time only) | Simpler for Phase 3. |
| Auth | Integrated into Step 1 | Eliminates duplicate email collection. |
| Cluster cap | Removed (unlimited selection) | Per Joe's feedback. |

## Deviations

1. Step 3 grid: brief said 18 (3×6); design showed 6 (2×3 per round); built 6.
2. Step 4: clusters not raw genres (design showed cluster chips matching `TASTE_CLUSTERS`).
3. Auth integrated into Step 1 (not in brief).
4. No separate step component files — built inline in `OnboardingFlow.tsx` and `ProfilePage.tsx`.
5. Hidden Gems thresholds set from v1 values, not run from sanity query (DB not yet ready).
6. **Process breach: Migration 024 applied alongside 025 during For You debugging session, before behavioural verification was complete.**

## Documentation updates

- Strategy §5.2: bootstrap weights are dynamic 4-band, not static 0.40/0.40/0.20.
- Strategy §7.2: Phase 3 includes auth integration into onboarding.
- Orchestration §3.4: migrations 025 and 028 added (not originally planned).

## Open items → Phase 4+

- For You full row composition.
- Slider pipeline modulation (sliders save state but don't affect ranking yet).
- Scoring in genre sections (currently `'none'`).
- Loading performance (~1-2s after reduction from ~5s).
- Supabase type generation (`as any` casts pending `supabase gen types typescript`).
- Delete account wiring (UI exists, button disabled).

## Parking-lot adds

IN-XPS-006 (delete account / GDPR Article 17 cascading delete pre-launch), IN-XPS-007 (`platformPricing.ts` periodic review cadence), IN-XPS-008 (curated onboarding watched-grid pool).
