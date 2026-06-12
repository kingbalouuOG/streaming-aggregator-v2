---
title: Phase NATIVE-1 — React Native shell bootstrap
type: concept
tags: [react-native, expo, capacitor-migration, metro, native, performance]
created: 2026-06-12
updated: 2026-06-12
sources:
  - docs/v2/phase-summaries/phase-native-1-summary.md
related:
  - wiki/concepts/operations/phase-ux-1.md
  - wiki/concepts/operations/phase-history.md
---

# Phase NATIVE-1 — React Native shell bootstrap

First phase of the Capacitor → React Native migration (track NATIVE-1→4). Decided 2026-06-12 after UX-1's "not perfect, but better" verdict established that the residual scroll/transition/cold-start jank is the WebView's structural ceiling.

## Decisions

| Decision | Choice |
|---|---|
| Stack | Expo SDK 56 / RN 0.85 / React 19.2, expo-router, NativeWind 4 on Tailwind **v3** config (Joe's review call; NativeWind v5/TW-v4 upgrade parked until stable) |
| Repo shape | `native/` plain folder; shared `src/lib` reached via **directory junction** `native/src/lib` (ADR-014 extended: one engine tree — web, Worker, native) |
| Dev appId | `com.videx.app.dev` side-by-side; cutover target is **`app.videx.streaming`** (verified on device — older `com.videx.app` notes were wrong) + LAUNCH-1 keystore, as v2.0.0 in NATIVE-4 |
| Sequencing | Parallel with LAUNCH-1 (keystore/solicitor/rate-limit/re-onboarding all transfer) |

## Device evidence (S22, release builds, scripted swipes)

- Cold start window→settled Home: native **~1.3s with cold caches** vs Capacitor ~2.2s warm.
- Feed scroll: native **1.28% janky / p95 10ms / p99 15ms** vs Capacitor 4.36% / 20ms / **57ms** (legacy 120Hz metric: 4.28% vs 65.74%). The Capacitor p99 is the measured shape of Joe's complaint.

## Hard-won build knowledge

- **Metro on Windows cannot index files above the project root** — `watchFolders` and custom resolvers both die with SHA-1 errors; Expo's tsconfig-paths layer rewrites aliases before custom resolvers and resolves them relative to the importing file. The junction + `nodeModulesPaths` pinned native-first is the working pattern (`native/metro.config.js`, `native/scripts/link-shared.js`).
- **foojay-resolver 0.5.0** (pinned in `@react-native/gradle-plugin`) crashes Gradle 9 toolchain provisioning; postinstall patches it to 1.0.0.
- `*.native.ts` platform shadows: tsc mirrors Metro via `moduleSuffixes`; root tsconfig excludes them. MMKV v4 = `createMMKV()`/`.remove()`.
- `screenrecord` is VFR — use container timestamps, not frame/fps. PowerShell `>` corrupts adb binary output.
- Shared-type boundary repaired: `ServiceId`/`ContentItem` canonical in `src/lib/types/content.ts`; components re-export.

## State at phase end

Native Home renders production Supabase data through `fetchPerServiceCharts` (FlashList v2 + expo-image + Reanimated Reveal port). Platform shadows: storage (MMKV), lifecycle, deep links — same contracts, same signal semantics. Not started: auth/onboarding, For You, query persistence, theme switching (see summary §5 for NATIVE-2 seeds). Phase gate: Joe's device verdict.
