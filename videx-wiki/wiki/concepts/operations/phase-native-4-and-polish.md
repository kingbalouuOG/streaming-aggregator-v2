---
title: Phase NATIVE-4 + POLISH — Profile/settings, signal capture, and the live cutover
type: concept
tags: [react-native, expo, capacitor-migration, native, profile, signals, instrumentation, cutover, migration-047]
created: 2026-06-18
updated: 2026-06-18
sources:
  - docs/v2/phase-summaries/phase-native-4-and-polish-summary.md
  - docs/v2/native-4-cutover-runbook.md
related:
  - wiki/concepts/operations/phase-native-3.md
  - wiki/concepts/operations/phase-native-3-5.md
  - wiki/concepts/operations/phase-history.md
  - wiki/entities/codebase/migrations.md
---

# Phase NATIVE-4 + POLISH — Profile/settings, signal capture, and the live cutover

Final phases of the Capacitor → React Native migration. NATIVE-4 adds Profile/Settings (incl. the Sign Out that unblocked Joe); NATIVE-POLISH wires the engine-feeding signal-capture stack; the **NATIVE-4 cutover** flips the app to `app.videx.streaming` v2.0.0 and merges to main — making the native app the live product. Code-complete 2026-06-13 (autonomous run on Joe's standing permission); cutover runbook authored 2026-06-17. Branches `phase-native-4-profile-settings` → `phase-native-polish-gaps` (stacked; PR #27→#28 into `native-integration`). Sign-out device-verified; the rest build-green (tsc 0, bundles, release APK builds) pending Joe's design-review pass.

## NATIVE-4 — Profile & Settings

- **W1 — Profile page + Sign Out** (matches `V2 Profile_Profile Page.png`): avatar/identity, Watchlist/Watched/Services stat tiles, grouped action rows with the custom `GenreIconTile` glyphs, working **Sign Out** (→ `(tabs)` guard redirects to `/auth`). **Device-verified** — solved Joe's "can't log out" blocker; glyphs render (confirms the NATIVE-3 cluster-glyph fix too).
- **W2 — Sub-screens** (`profile/[section]`): **Streaming Services** (edit stack → `saveUserPreferences`, invalidates feeds), **Your Taste** (retune clusters → re-saves + re-bootstraps the taste vector), **Tune Recommendations** (4 sliders → `saveSliderState`), **Account Details** (read-only identity), **Appearance** (Dark; Light = coming soon). Monthly Spend + Privacy & Data were stubs at NATIVE-4 but **shipped post-NATIVE-4** (`ProfileSpend`/`ProfilePrivacy`; Privacy still defers data-export + policy links — see the summary's *Shipped since*).
- **Fix — sign-in stuck** (`d5f727d`): the NATIVE-3 routing refactor made the redirect into `/auth` one-directional, so a successful sign-in left the user on the auth screen. `auth.tsx` now redirects to `/` once a session exists. (Account creation was unaffected — it uses the onboarding signUp path.)

## NATIVE-POLISH — Signal capture + gaps

An Explore pass confirmed the entire signal-capture stack is **portable as-is — zero web-only APIs**. So this was a WIRING phase. **Migration 047 (`app_feedback`) landed here** (the in-app feedback loop table; RLS authenticated insert/read-own).

- **W1 — Detail engagement (the engine feed):** `startDwell`/`emitDetailView` on mount, `exitDwell` on unmount; **thumbs up/down** → `trackTasteInteraction` (native mirror of the web taste hook: `emitContentInteraction` + `applyInteractionIncremental` EMA on the summary vector + nearest interest centroid) + best-effort `setWatchlistRating`; **Not interested** → `markNotInterested`; **availability ReportSheet** → `submitReport`; **deep-link tap** → `getCurrentDwellSeconds()` + `exitDwell('deep_link_click')`; **WatchlistActions** → `trackTasteInteraction('watchlist_add'/'watched')`. The native app now *learns* from engagement.
- **W2 — Impressions + click context:** `PosterCard` records an impression + stashes click-context on the ranked rows (Home `surface=home`, For You `surface=for_you`); the batcher auto-flushes via the native `appState` shadow + 10s interval. (Browse/Watchlist grid impressions deferred.)
- **W3 — Query persistence to MMKV:** `PersistQueryClientProvider` + a sync MMKV persister; `gcTime` raised to 24h. Home/For You paint from the last cached payload on cold start instead of a spinner (the UX-1 instant-feed lesson). Cache cleared on sign-out (no cross-user leakage).

## NATIVE-4 cutover — native → live app (v2.0.0)

Per `docs/v2/native-4-cutover-runbook.md` (2026-06-17). The appId/version flip + signing happen as **ONE release** so the `com.videx.app.dev` dev-test loop keeps working until cutover. Pre-flight: multi-agent pre-launch audit run, blockers fixed (semantic id-collision, Free Tonight), mediums fixed (badge cache key, skeleton de-dup, genre attribution), security verified (no secrets in client, RLS correct, JWT-gated Edge fn).

1. **App identity flip** (`native/app.json`): `expo.android.package` `com.videx.app.dev` → **`app.videx.streaming`**; `expo.version` 1.0.0 → **2.0.0**; `versionCode` bumps above the live Play track; add `"allowBackup": false` (so MMKV refresh tokens aren't backed up). Then `npx expo prebuild --platform android`.
2. **Release signing:** today the `release` buildType signs with the **debug** keystore — replace with a real `release` signingConfig on Joe's existing keystore (creds from env / `gradle.properties`, never committed). **The keystore SHA must match the one registered with Google Play** or the listing is unrecoverable.
3. **Build:** `./gradlew bundleRelease` (AAB for the Play Store, NOT an APK); smoke-test on-device via `assembleRelease` universal APK first.
4. **Merge to main:** `phase-native-polish-gaps` → `native-integration` → `main`, reconciling with LAUNCH-1 already on main (rate-limit `/v1/foryou`, release scaffold/version 1.1.0, solicitor pack, re-onboarding runbook). Watch the **version collision** (LAUNCH-1 1.1.0 vs native 2.0.0) and shared `src/lib` drift (semanticCore composite-key, detailAdapter genreIds — both additive + web-safe).
5. **Play Store:** confirm the `app.videx.streaming` listing, data-safety form (collects account email, watchlist, taste signals, in-app feedback → `app_feedback`), internal-test track first.
6. **Rollback:** the cutover is a new listing/version — rollback = halt the staged rollout and/or republish the prior AAB; the dev build remains a separate install for testing.

## Deferred (for the design review / a later phase)

Browse filter sheet + semantic mood chips; light "paper" theme; password recovery; re-onboarding; Browse/Watchlist grid impressions; impression flush on tab/detail nav (interval + lifecycle flush covers it for now); username server-availability check. Post-launch gates from the runbook: the **`search_semantic` global-flip** needs a real eval fixture (green the eval) + a per-user rate limit on the `embed-query` Edge fn (denial-of-wallet) before flipping on for everyone — until then it stays flag-off (presets serve all users).

## Gates

Native tsc 0, `expo export` bundles, release APK builds (incl. the slider + persist deps). Web untouched (native wiring + shared-lib reads). **Design-review pass (Joe) is the remaining code-complete gate** — fonts, nav spacing/icons, and a device run of the new screens + signals (a Supabase `user_interactions` row check confirms thumbs/dwell/not-interested fire).
