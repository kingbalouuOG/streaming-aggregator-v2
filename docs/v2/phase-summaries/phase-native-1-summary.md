# Phase NATIVE-1 — React Native shell bootstrap: Summary

**Status:** Code complete 2026-06-12 (single-day phase); awaiting Joe's device verdict (the phase gate).
**Branch:** `phase-native-1-expo-shell` (built in the `videx-native` worktree — LAUNCH-1 owned the main checkout in parallel).
**Plan:** `docs/plans/2026-06-12-004-feat-phase-native-1-expo-shell-plan.md` (track NATIVE-1→4; decided after UX-1's "not perfect, but better" verdict established the WebView ceiling).

## 1. What shipped

1. **W1 — lib groundwork:** `src/lib/env.ts` typed accessor replaces the 6 `import.meta.env` call sites (lazy getters, optional-chained — safe under Vite, Worker, and shadowed under Metro). `useFilterUrlSync` moved to `src/hooks/` (web-only URL-bar state; restores the "no React in lib" rule).
2. **W2 — Expo shell:** `native/` (Expo SDK 56, RN 0.85, React 19.2, New Architecture), expo-router 5-tab skeleton, NativeWind 4 on a Tailwind **v3** config carrying the design tokens ported from `src/index.css` `@theme` (Joe's call at plan review: battle-tested over v4 syntax). appId `com.videx.app.dev` for side-by-side installs. Dark-first chrome `#0a0a0f` everywhere (the UX-1 W4 lesson, applied natively from day one).
3. **W2a — type-boundary repair:** `ServiceId`/`ContentItem` (+ `SERVICE_DISPLAY_NAMES`) moved to `src/lib/types/content.ts`; `platformLogos.ts`/`ContentCard.tsx` re-export so no component-side import changed. 14 lib modules had been type-importing FROM components — a standing CONVENTIONS violation that native tsc flushed out.
4. **W3 — platform shadows:** `storage.native.ts` (MMKV v4 behind the same AsyncStorage-shaped interface, incl. auth-state routing), `lifecycle/appState.native.ts` (RN AppState, same IN-009 single-listener contract + 3s deep-link correlation window), `openDeepLink.native.ts` (`Linking.openURL` = same ACTION_VIEW dispatch; per-service App Links findings carry over).
5. **W4 — native Home:** `useHomeFeed` calls `fetchPerServiceCharts` — the SAME engine module as web Home — against the production Supabase content cache. Rendering: horizontal FlashList v2 rows of expo-image PosterCards, hero slot, Reanimated port of the UX-1 Reveal stagger (FadeInDown, M3 decelerate, 60ms cascade), native RefreshControl.
6. **W5 — device evidence:** release APK (111MB universal; arm64 split later) on Joe's S22 next to the production app; frame forensics rerun (UX-1 method, fixed for screenrecord's variable frame rate by using real container timestamps).

## 2. Acceptance evidence (Galaxy S22, release builds, same scripted swipes)

| Measurement | Capacitor (prod, signed in, WARM caches) | Native dev (COLD caches) |
|---|---|---|
| Cold start: window → settled Home | ~2.2s | **~1.3s** (incl. fresh Supabase fetch + poster downloads) |
| Janky frames, feed scroll (~500 frames) | 4.36% | **1.28%** |
| Janky frames (legacy/120Hz metric) | 65.74% | **4.28%** |
| 95th / 99th percentile frame time | 20ms / 57ms | **10ms / 15ms** |
| Bright-flash events on boot | 0 | 0 |

The Capacitor p99 of 57ms (≈1 in 25 frames blowing 3+ frame budgets) is the measured shape of the jank Joe described. Native holds p99 at 15ms while compositing fresh poster art.

## 3. Architecture decisions that differ from the plan

- **Junction, not watchFolders (D-N3 amended).** Metro on Windows would not index files above the project root — `watchFolders` + custom resolvers both terminate in "Failed to get SHA-1". Expo's tsconfig-paths layer additionally rewrites aliases before custom resolvers run, relative to the importing file. Working design: **directory junction `native/src/lib` → `../src/lib`** (created idempotently by `native/scripts/link-shared.js` on postinstall), `resolver.nodeModulesPaths` pinned native-first because Metro realpaths junctioned origins. Single engine tree preserved (ADR-014: now web + Worker + native).
- **Shared pure-JS deps are installed into `native/package.json` too** (Metro can't safely use root `node_modules`). Drift watch: native resolved supabase-js 2.108 / axios 1.17 vs root 2.97 / 1.13 — pin exact at NATIVE-2.
- **CNG:** `native/android/` is gitignored; `expo prebuild` regenerates. `local.properties` is machine-local.

## 4. Gotchas recorded

- **foojay-resolver 0.5.0 (pinned inside `@react-native/gradle-plugin`) crashes Gradle 9** toolchain provisioning (`JvmVendorSpec.IBM_SEMERU` removed). Patched to 1.0.0 by the postinstall script; drop when RN bumps it.
- `screenrecord` output is **VFR** — frame_index/fps timing lies (12s read as 18.6s); use `CAP_PROP_POS_MSEC`.
- PowerShell `>` corrupts binary adb output (UTF-16 BOM) — `screencap` to device file + `adb pull`.
- Native tsc needs `moduleSuffixes: [".android",".native",""]` to mirror Metro platform resolution; root tsconfig excludes `src/**/*.native.ts`.
- react-native-mmkv v4 renamed the API: `createMMKV()` / `.remove(key)`.
- **The production appId is `app.videx.streaming`** (verified on device) — older notes saying `com.videx.app` are wrong. NATIVE-4 cutover targets `app.videx.streaming` + the LAUNCH-1 keystore.

## 5. Known gaps (NATIVE-2 scope seeds)

- Hero renders empty on device — `EXTENDED_TITLE_SELECT` rows likely lack `backdrop` URLs through `titleAdapter`; investigate.
- Query persistence to MMKV (the UX-1 instant-For-You lesson) — session-scoped QueryClient for now.
- Auth, onboarding, theme switching (light "paper" mode), signal capture (impressions/dwell) — not started, per plan.
- `DEV_SERVICES` hardcoded in `useHomeFeed`; replace with user prefs at NATIVE-3.
- Pin native dep versions exactly to root's; `perServiceChart.ts` has a private `SERVICE_DISPLAY_NAMES` duplicate that should now use `types/content`.
- `edgeRender.ts` reads `localStorage` at call time — needs the storage adapter before For You goes native.

## 6. Follow-ups

Joe's device pass on `Videx Dev` is the phase gate. NATIVE-2 plan (For You + Detail + Browse + Watchlist, signal parity) follows the verdict. LAUNCH-1 continues in parallel, unaffected.
