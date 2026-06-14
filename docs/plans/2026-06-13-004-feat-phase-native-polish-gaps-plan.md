# NATIVE-POLISH Implementation Plan — Signal capture + gaps

**Status:** Active (Joe's standing permission to run profile sub-screens + polish/gaps autonomously, then he joins for the design-review pass).
**Branch:** `phase-native-polish-gaps` (stacked on NATIVE-4; PRs into `native-integration`).

## Why

The native app is a **read-only recommender** — it renders For You but captures none of the engagement (impressions, dwell, ratings, not-interested) that makes the engine *learn*. An Explore pass confirmed the entire signal-capture stack (`instrumentation/*`, `interactions.ts`, `interactionUpdate.ts`, `reportService.ts`, `dwellTimer`, `sessionId`, `clickContext`, `impressionBatcher`) is **portable as-is — zero web-only APIs**. So this is a WIRING phase, not a port.

## Scope (highest-value, cleanest subset)

- **W1 — Detail engagement.** Wire the detail route to the shared signals: `emitDetailView` + `startDwell`/`exitDwell` lifecycle; **thumbs up/down** (→ `setWatchlistRating` + a native `trackInteraction` = `emitContentInteraction` + `applyInteractionIncremental`/`applyInteractionToCentroids` EMA → `saveV2TasteVector`/`saveInterestCentroids`); **Not interested** (`markNotInterested` + `exitDwell('not_interested')`); **availability Report** sheet (`submitReport`); deep-link tap passes `getCurrentDwellSeconds()` + `exitDwell('deep_link_click')`. Also wire `trackInteraction('watchlist_add'/'watched')` into the existing WatchlistActions.
- **W2 — Impressions + click context.** `recordImpression({contentId, sourceSurface, position})` from the Home/For You/Browse/Watchlist cards; `setCardClickContext` on tap. The batcher auto-flushes via the native `appState` shadow (already exists) + `flushNow()` on tab/detail nav.
- **W3 — Query persistence to MMKV.** `PersistQueryClientProvider` + an MMKV-backed persister so Home/For You paint instantly on cold start (the UX-1 instant-For-You lesson).

## Deferred (documented, not done)

Browse filter sheet + semantic mood chips, light "paper" theme, password recovery, re-onboarding, Monthly Spend / Privacy-&-Data Profile screens. These are either lower-value or larger than a polish pass; flagged for a future phase.

## Gates

Native tsc 0, `expo export` bundles, release APK builds. Device-verify thumbs/not-interested/report fire (Supabase row check via MCP) + cold-start paints from cache. Web untouched (native wiring + shared-lib reads). Joe's design-review pass on return.
