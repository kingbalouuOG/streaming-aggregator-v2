# Phases NATIVE-4 (Profile) + NATIVE-POLISH (signals/gaps): Summary

**Status:** Code-complete 2026-06-13 (autonomous run on Joe's standing permission). Sign-out device-verified; the rest build-green (tsc 0, bundles, release APK builds), to be confirmed at Joe's design-review pass.
**Branches:** `phase-native-4-profile-settings` → `phase-native-polish-gaps` (stacked; PR into `native-integration`).

## NATIVE-4 — Profile & Settings

- **W1 — Profile page + Sign Out** (matches `V2 Profile_Profile Page.png`): avatar/identity, Watchlist/Watched/Services stat tiles, grouped action rows with the custom `GenreIconTile` glyphs, working **Sign Out** (→ `(tabs)` guard redirects to `/auth`). **Device-verified** — solved Joe's "can't log out" blocker; glyphs render (confirms the NATIVE-3 cluster-glyph fix too).
- **W2 — Sub-screens** (`profile/[section]`): **Streaming Services** (edit stack → `saveUserPreferences`, invalidates feeds), **Your Taste** (retune clusters → re-saves + re-bootstraps the taste vector), **Tune Recommendations** (4 sliders → `saveSliderState`), **Account Details** (read-only identity), **Appearance** (Dark; Light = coming soon). Monthly Spend + Privacy/Data remain stubs.
- **Fix — sign-in stuck** (`d5f727d`): the NATIVE-3 routing refactor made the redirect into `/auth` one-directional, so a successful sign-in left the user on the auth screen. `auth.tsx` now redirects to `/` once a session exists. (Account creation was unaffected — it uses the onboarding signUp path.)

## NATIVE-POLISH — Signal capture + gaps

An Explore pass confirmed the entire signal-capture stack is **portable as-is — zero web-only APIs**. So this was a WIRING phase.

- **W1 — Detail engagement (the engine feed):** `startDwell`/`emitDetailView` on mount, `exitDwell` on unmount; **thumbs up/down** → `trackTasteInteraction` (native mirror of the web taste hook: `emitContentInteraction` + `applyInteractionIncremental` EMA on the summary vector + nearest interest centroid) + best-effort `setWatchlistRating`; **Not interested** → `markNotInterested`; **availability ReportSheet** → `submitReport`; **deep-link tap** → `getCurrentDwellSeconds()` + `exitDwell('deep_link_click')`; **WatchlistActions** → `trackTasteInteraction('watchlist_add'/'watched')`. The native app now *learns* from engagement.
- **W2 — Impressions + click context:** `PosterCard` records an impression + stashes click-context on the ranked rows (Home `surface=home`, For You `surface=for_you`); the batcher auto-flushes via the native `appState` shadow + 10s interval. (Browse/Watchlist grid impressions deferred.)
- **W3 — Query persistence to MMKV:** `PersistQueryClientProvider` + a sync MMKV persister; `gcTime` raised to 24h. Home/For You paint from the last cached payload on cold start instead of a spinner (the UX-1 instant-feed lesson). Cache cleared on sign-out (no cross-user leakage).

## Deferred (documented — for the design review / a later phase)

Browse filter sheet + semantic mood chips; light "paper" theme; password recovery; re-onboarding; Monthly Spend / Privacy-&-Data Profile screens; Browse/Watchlist grid impressions; impression flush on tab/detail nav (interval + lifecycle flush covers it for now); username server-availability check.

## Gates

Native tsc 0, `expo export` bundles, release APK builds (incl. the slider + persist deps). Web untouched (native wiring + shared-lib reads). **Design-review pass (Joe) is the remaining gate** — fonts, nav spacing/icons, and a device run of the new screens + signals (a Supabase `user_interactions` row check confirms thumbs/dwell/not-interested fire).
