---
title: Phase NATIVE-3.5 — Home composition completion
type: concept
tags: [react-native, expo, capacitor-migration, native, home, composition, genre-spotlight]
created: 2026-06-18
updated: 2026-06-18
sources:
  - docs/plans/2026-06-13-002-feat-phase-native-3-5-home-composition-plan.md
  - docs/v2/phase-summaries/phase-native-3-summary.md
related:
  - wiki/concepts/operations/phase-native-3.md
  - wiki/concepts/operations/phase-native-4-and-polish.md
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/architecture/two-surface-architecture.md
---

# Phase NATIVE-3.5 — Home composition completion

Mid-track addition between [NATIVE-3](phase-native-3.md) and [NATIVE-4](phase-native-4-and-polish.md). Trigger: Joe's NATIVE-3 device test — native Home rendered only the per-service "Top On" charts, but the web Home (`useHomeContent`) also shows personalised/curated rows. Decision: port those in a dedicated 3.5 phase AFTER NATIVE-3 merges and BEFORE the NATIVE-4 cutover, to keep onboarding cohesive. Branch `phase-native-3-5-home-composition` (stacked on NATIVE-3; PRs into `native-integration`). **Device-verified 2026-06-13.**

## Scope — what to port from the web Home

Mapped from `useHomeContent.ts`. Two curated row types were worth adding; the rest deferred or disabled:

| Web row | Added? | Why |
|---|---|---|
| **Genre Spotlights** ("{Cluster}.") — `fetchGenreSpotlight`, driven by the user's `selectedClusters` | YES | The personalised "For You on Home" content Joe wanted. |
| **Recently Added** ("Just In") — TMDb discover by release date | YES | Simple, high-signal, no engine deps. |
| Critically Acclaimed | NO | `CRITICALLY_ACCLAIMED_ROW_ENABLED = false` in `weights.ts` — disabled in the live app too. |
| Numbered Charts / Editorial Spotlight / Free Tonight / Calendar (Coming Up) | Deferred | Richer custom card types; a later polish item, not core. |

## Work items

- **W1 — Extend `useHomeFeed`:** in parallel with `fetchPerServiceCharts`, also fetch `buildFilterSets(services)` (→ `availableTmdbIds`), `getV2TasteProfile()` (→ `selectedClusters`), and a new native `fetchRecentlyAdded(services)` (discover movies + TV by release date, providers-filtered). Then fetch **3 genre spotlights** (`fetchGenreSpotlight` at offset 0/1/2) sequentially with cross-row dedup (exclude per-service-chart + prior-spotlight ids). Return them on the `HomeFeed`.
- **W2 — Render on Home** (`(tabs)/index.tsx`): insert the new rows into the existing approved structure. Order: hero → editor's note → browse chips → **Recently Added** → per-service "Top On" rows → **genre spotlights**. Reuse `ContentRow`; titles from the spotlight `clusterName` + a kicker. Empty rows are filtered.

## Notes / gotchas

- `buildFilterSets`/`getAvailableTmdbIds` reference bare `localStorage` inside try/catch → on Hermes that throws-and-is-caught (cache miss), so it degrades to an uncached RPC each cold load. Acceptable (React Query caches the Home payload). A `.native` storage-adapter shadow is a later optimisation if cold-load latency shows.
- Genre spotlights need a taste profile; a brand-new account has one post-onboarding. Pre-onboarding users never reach Home (the gate).
- Kept to **3 spotlights** (no infinite-scroll sentinel) for v1 — the web's lazy 16-cluster chain is deferred.

## Verification

- **Device-verified 2026-06-13:** signed-in Home renders "Just in / Recently added." plus personalised spotlights ("History & War.", "Feel-Good & Funny." with genre-appropriate titles, ordered by the account's selected clusters); dark nav bar confirmed (the NATIVE-3 fix); hero status-bar scrim present; no crash.
- Gates: native tsc 0, `expo export` bundles, release APK builds. Web untouched (native-only changes + shared-lib reads).
