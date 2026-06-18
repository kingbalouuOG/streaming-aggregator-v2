# NATIVE-3.5 Implementation Plan — Home composition completion

**Status:** Active (Joe pre-approved while out: "proceed with the next phase"; review on return).
**Branch:** `phase-native-3-5-home-composition` (stacked on NATIVE-3; PRs into `native-integration`).
**Trigger:** Joe's NATIVE-3 device test — native Home shows only per-service "Top On" charts; the web Home also has personalised/curated rows. Reference: `Pictures\Videx\Home + For You\Home.png`.

## Scope (what the web Home actually renders)

Mapped from `useHomeContent.ts`. Two curated row types are missing from native and worth adding; the rest are deferred or disabled:

| Web row | Add now? | Why |
|---|---|---|
| **Genre Spotlights** ("{Cluster}.") — `fetchGenreSpotlight`, driven by the user's `selectedClusters` | **YES** | The personalised "For You on Home" content Joe wants. |
| **Recently Added** ("Just In") — TMDb discover by release date | **YES** | Simple, high-signal, no engine deps. |
| Critically Acclaimed | NO | `CRITICALLY_ACCLAIMED_ROW_ENABLED = false` in `weights.ts` — disabled in the live app too. |
| Numbered Charts / Editorial Spotlight / Free Tonight / Calendar (Coming Up) | Deferred | Richer custom card types; a later polish item, not core. |

## Work items

- **W1 — Extend `useHomeFeed`:** in parallel with `fetchPerServiceCharts`, also fetch `buildFilterSets(services)` (→ `availableTmdbIds`; localStorage cache no-ops on native but the RPC works, React Query caches the payload), `getV2TasteProfile()` (→ `selectedClusters`), and a new native `fetchRecentlyAdded(services)` (discover movies+TV by release date, providers-filtered). Then fetch **3 genre spotlights** (`fetchGenreSpotlight` at offset 0/1/2) sequentially with cross-row dedup (exclude per-service-chart + prior-spotlight ids). Return them on the `HomeFeed`.
- **W2 — Render on Home** (`(tabs)/index.tsx`): insert the new rows into the existing approved structure. Order: hero → editor's note → browse chips → **Recently Added** → per-service "Top On" rows → **genre spotlights**. Reuse `ContentRow`; titles from the spotlight `clusterName` + a kicker. Empty rows are filtered.

## Notes / risks

- `buildFilterSets`/`getAvailableTmdbIds` reference bare `localStorage` inside try/catch → on Hermes that throws-and-is-caught (cache miss), so it degrades to an uncached RPC each cold load. Acceptable (React Query caches the Home payload). A `.native` storage-adapter shadow is a later optimisation if cold-load latency shows.
- Genre spotlights need a taste profile; a brand-new account has one post-onboarding. Pre-onboarding users never reach Home (the gate).
- Keep it to 3 spotlights (no infinite-scroll sentinel) for v1 — the web's lazy 16-cluster chain is deferred.

## Gates

Native tsc 0, `expo export` bundles, release APK builds. Web untouched (native-only changes + shared-lib reads).

**DEVICE-VERIFIED 2026-06-13:** signed-in Home renders "Just in / Recently added." plus personalised spotlights ("History & War.", "Feel-Good & Funny." with genre-appropriate titles, ordered by the account's selected clusters); dark nav bar confirmed (NATIVE-3 fix); hero status-bar scrim present; no crash. Joe's review on return.
