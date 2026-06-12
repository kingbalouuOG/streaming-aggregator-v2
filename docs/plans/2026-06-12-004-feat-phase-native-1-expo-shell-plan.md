# NATIVE-1 Implementation Plan — React Native shell bootstrap

**Status:** DRAFT for Joe's review.
**Branch:** `phase-native-1-expo-shell`.
**Decision context:** Joe's verdict after UX-1 ("not perfect, but better") + the platform exploration (2026-06-12): the residual jank in scrolling, transitions, and cold start is the WebView's structural ceiling, not an optimization gap. UX-1 was the disciplined attempt to close it inside Capacitor; what remains requires native rendering. Decision: migrate to **React Native + Expo**, reusing the lib layer wholesale.

## Track overview (NATIVE-1 → NATIVE-4)

This plan covers NATIVE-1 only; later phases get their own plans.

| Phase | Scope | Exit |
|---|---|---|
| **NATIVE-1** (this) | Expo shell in-repo, shared `src/lib` proven, storage + env + theme foundations, nav skeleton, **one real native screen (Home feed)** on device | Side-by-side APK on Joe's phone; frame capture shows native scroll on real data |
| NATIVE-2 | Core loop: For You, Detail page, Browse, Watchlist; signal capture parity (impressions, dwell, deep-link events) | Daily-drivable app for Joe |
| NATIVE-3 | Auth + onboarding (5-step), settings/profile, data export, availability reports | Feature parity checklist green |
| NATIVE-4 | Polish, animation fidelity pass, cutover: appId → `com.videx.app`, signed with the LAUNCH-1 keystore, ships as v2.0.0 update; Capacitor shell retired | Capacitor `android/` deleted; wiki + docs updated |

## Locked decisions (proposed — confirm or veto in review)

- **D-N1 — Expo SDK 56** (RN 0.85, React 19.2, New Architecture). expo-router v7 for navigation, FlashList v2 for feeds/carousels, expo-image (ThumbHash placeholders replace the LQIP system), Reanimated 4 (its CSS-syntax API carries the M3 fade-through/Reveal choreography from UX-1 over almost verbatim).
- **D-N2 — Styling: NativeWind 4 (stable)** — Joe's call at plan review (2026-06-12), preferring battle-tested over Tailwind-v4 syntax continuity. Consequences: `native/` carries a Tailwind **v3** `tailwind.config.js` (the web tree stays on v4 — the two configs are siblings, not shared); design tokens are ported as v3 `theme.extend` values sourced from `src/index.css` `@theme`. Class vocabulary is unchanged, so components are unaffected by a later NativeWind v5 (TW v4) upgrade — that upgrade is parked until v5 is stable. Pin the version; no `latest`.
- **D-N3 — Repo shape: `native/` folder in this repo**, plain folder like `workers/api` (D6 precedent — no workspace split). Own `package.json`/`node_modules`; Metro `watchFolders`/`nodeModulesPaths` reach the root so `native/` imports `src/lib` **directly from the single tree** (ADR-014 extended: one engine tree, now three consumers — web client, Worker, native). ADR-015 records this; rides this PR.
- **D-N4 — React version skew is a non-issue by construction:** `src/lib` is React-free (CONVENTIONS "No React" rule). The one violation, `src/lib/search/useFilterUrlSync.ts`, moves to `src/hooks/` in W1 (it's web-only — URL bar state). `src/hooks/` is NOT shared; native gets its own thin hooks layer.
- **D-N5 — Env indirection instead of `import.meta.env`:** 6 call sites in `src/lib` (supabase.ts, videxApi.ts, tmdb.ts, edgeRender.ts, debugLogger.ts + 1). New `src/lib/env.ts` resolves from `import.meta.env.VITE_*` (web) or `process.env.EXPO_PUBLIC_*` (native) behind one typed accessor, same lazy-read discipline as the supabase singleton. Worker is unaffected (it injects its own config already).
- **D-N6 — Storage stays behind the existing wrapper:** `native/` provides an MMKV-backed implementation of the `storage.ts` interface (same API: getItem/setItem/removeItem/getAllKeys/multiRemove + quota eviction no-op). All 39 lib consumers untouched.
- **D-N7 — Dev appId `com.videx.app.dev`** so the native app installs alongside the Capacitor app for A/B comparison on device. Cutover to `com.videx.app` is NATIVE-4 (same keystore from LAUNCH-1 W2 → existing installs update in place).
- **D-N8 — Onboarding/settings may ride Expo DOM components (`'use dom'`) in NATIVE-3** to pull the cutover forward; anything that scrolls heavily is always native. Decision deferred to NATIVE-3 planning.

## Relationship to LAUNCH-1 (recommendation, Joe decides)

**LAUNCH-1 proceeds unchanged, in parallel.** Nothing in it is wasted by the migration:
- Solicitor review (W3) — platform-independent, and the long pole; start it now regardless.
- Keystore (W2) — the app identity; the native app signs with the same keystore + appId at cutover, so it transfers entirely.
- Rate limiting (W1) — Worker-side, client-agnostic.
- Tester re-onboarding (W4) — profiles live in Supabase; they survive the platform switch. Testers get the Capacitor release now, the native build as a normal update later.

The only real question is whether "launch" (beyond the 2 prototype testers) waits for native. Recommendation: decide at NATIVE-2 exit, when the native app's actual quality and remaining distance are known facts rather than estimates.

## Work items

### W1 — Lib portability groundwork (web tree, no behavior change)
1. `src/lib/env.ts` typed accessor; replace the 6 `import.meta.env` call sites (D-N5).
2. `git mv src/lib/search/useFilterUrlSync.ts src/hooks/` + import fixes (D-N4).
3. Gate: tsc 0, vitest green, `npm run build` passes, Worker CI green — proves the web app is indifferent.

### W2 — Expo scaffold
1. `npx create-expo-app native` pinned to SDK 56; TypeScript template; expo-router.
2. Metro config: `watchFolders: [repo root]`, `nodeModulesPaths` covering both trees; tsconfig path alias `@lib/* → ../src/lib/*`.
3. Uniwind wired to the existing `@theme` tokens — port `--background`/`--foreground`/`--primary`/`--svc-*` from `src/index.css` into the native theme source; design tokens cite `docs/design/design-system.md` as before.
4. `app.json`: appId `com.videx.app.dev`, dark `windowBackground` `#0a0a0f` (UX-1 W4 lesson applies natively too), splash config.
5. Smoke screen: renders a value computed by an imported `src/lib` module (e.g. a `platformAdapter` mapping) to prove the shared tree resolves through Metro.

### W3 — Foundations
1. MMKV storage implementation of the `storage.ts` interface (D-N6); TanStack Query persister wired to it (same `queryClient.ts` patterns, native copy of the thin glue).
2. Supabase client boots against `EXPO_PUBLIC_*` env (anon key; move to `sb_publishable_` keys here — they deprecate end-2026 anyway).
3. Lifecycle: RN `AppState` implementation of the `appState.ts` subscribe contract; deep links via `Linking.openURL` implementing the `openDeepLink.ts` contract (the resolution logic in `deepLinks.ts` is shared, untouched).
4. expo-router skeleton: 5 tabs matching the current nav (home, foryou, browse, watchlist, profile), placeholder screens; ThemeContext equivalent (status/nav bar via expo-system-ui — replaces the custom NavigationBarPlugin).

### W4 — Home feed, native
1. Home page on FlashList v2: hero + horizontal carousel rows (nested horizontal FlashLists), expo-image with ThumbHash placeholders, real data through the shared hooks-equivalent calling `src/lib` (content queries, adapters, service cache).
2. Reanimated 4 ports of the UX-1 motion vocabulary: M3 fade-through page transition + `Reveal` staggered entrance.
3. Pull-to-refresh via the native `RefreshControl` (replaces the hand-rolled touch handler — this is the point of the exercise).

### W5 — Device acceptance
1. Local Gradle release-style build (`expo prebuild` + `gradlew assembleRelease`, unsigned or debug-signed), installed alongside the Capacitor app.
2. **Frame forensics rerun** (the UX-1 rig: scripted `am start` + `screenrecord` + OpenCV timelines) on the same device, same scenarios: cold start to Home, feed scroll, tab switch. Side-by-side numbers vs the UX-1 final captures land in the phase summary.
3. Joe device pass — the actual gate is his thumb, not the numbers.

## Gates

- Web: tsc 0, vitest 154/154, lint 0, `npm run build` green at every commit (W1 touches the shared tree).
- Native: `tsc` 0 in `native/`, app builds and runs on device, smoke screen proves shared-tree import.
- Evidence: frame-capture comparison table (cold start ms, blank frames on tab switch, scroll jank events) Capacitor vs native, in the phase summary.

## Risks

| Risk | Containment |
|---|---|
| Two Tailwind configs (v4 web, v3 native) drift on tokens | Tokens ported from `src/index.css` `@theme` in one place (`native/tailwind.config.js`); design-system.md remains the source of truth; revisit at NativeWind v5 |
| Metro + shared root tree resolution quirks (duplicate deps, e.g. two `@supabase/supabase-js`) | `nodeModulesPaths` ordering + `resolver.extraNodeModules` pin; surface early in W2 smoke |
| Motion → Reanimated fidelity for the UX-1 choreography | Reanimated 4 CSS API is near-isomorphic; W4 limits scope to the two core motions |
| Scope creep toward parity in one phase | NATIVE-1 ends at one screen, deliberately |
| First RN Gradle build pain (NDK, etc.) | Known toolchain on this machine; budget half a day |

## Out of scope (NATIVE-1)

For You/Detail/Browse/Watchlist screens, auth/onboarding, signal-capture parity, iOS, Play Store, Capacitor removal, `com.videx.app` cutover, EAS.

## Open questions — RESOLVED at plan review (2026-06-12)

- **Q1 — styling:** Joe chose **NativeWind 4 stable** (D-N2 updated accordingly).
- **Q2 — sequencing:** parallel with LAUNCH-1, as recommended.
- **Q3 — summary cadence:** one summary at NATIVE-1 exit.
