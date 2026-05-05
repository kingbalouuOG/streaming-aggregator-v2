---
title: Capacitor Reference
generated: 2026-04-26
sources: [capacitor.config.ts, android/, src/lib/openDeepLink.ts]
---

# Capacitor 8 Reference

Videx ships as a Capacitor-wrapped web app. Android only at present; iOS deferred.

## Project layout

- `capacitor.config.ts` — webDir, appId, scheme, plugin config.
- `android/` — generated native project. Includes `app/build.gradle`, `AndroidManifest.xml`, signing config.
- `dist/` — Vite build output; copied into `android/app/src/main/assets/public` by `npx cap sync android`.

## Configuration

```ts
// capacitor.config.ts
{
  appId: 'com.videx.app',
  appName: 'Videx',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
    // url: 'http://<LIVE_RELOAD>:3000'  // injected when LIVE_RELOAD env set
  }
}
```

## Plugins used

- `@capacitor/network` — `useNetworkStatus` hook reads `Network.getStatus()` and subscribes to `networkStatusChange`.
- `@capacitor/app` — `App.addListener('appStateChange', …)` powers `lib/lifecycle/appState.ts`. Also `appUrlOpen` for deep links into Videx.
- `@capacitor/browser` — in-app browser fallback when AppLauncher fails.
- `@capacitor/app-launcher` — `AppLauncher.openUrl({ url })` to fire intent at the streaming app. Returns `{ completed: boolean }`. `completed: true` is the high-confidence signal.

## Deep link out (to streaming apps)

Path through `lib/openDeepLink.ts`:

1. Resolve link: exact SA API URL if present in cache, else service-specific search fallback (`lib/deepLinks.ts`).
2. On native: `await AppLauncher.openUrl({ url })`. If `completed: true`, tag confidence `high`. If `completed: false` or thrown, fall back to `Browser.open({ url })` and tag confidence `low`.
3. On web: `window.open(url, '_blank')`.

## Deep link in (Android App Links)

Some streaming services support handing back a URL when content is unavailable. Videx registers app links in `AndroidManifest.xml` for the domain it owns. Currently a stub; full universal links pending Phase 5.

## Build commands

```bash
# Web build
npm run build

# Sync into native project
npx cap sync android

# Build debug APK
cd android && ./gradlew assembleDebug

# Install
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Live reload

```bash
npm run dev
LIVE_RELOAD=192.168.1.42 npx cap sync android
cd android && ./gradlew assembleDebug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`LIVE_RELOAD` injects `server.url` into `capacitor.config.ts` so the APK loads from your dev machine's Vite server. Useful for native-context debugging without repeated APK reinstall.

## Signing

Debug builds use the Android debug keystore (auto-generated). Release builds require a keystore in `android/app/keystore/` referenced by `signingConfigs` in `app/build.gradle`. See runbook `raw/runbooks/apk-build-and-install.md`.

## Permissions

- `INTERNET` — required by every plugin.
- `ACCESS_NETWORK_STATE` — `@capacitor/network`.
- `QUERY_ALL_PACKAGES` not used; AppLauncher uses queries entries in the manifest declaring intent-filters for known streaming app schemes.

## Quirks

- File watcher on Windows occasionally throws EPERM during sync if Supabase Edge Functions are rebuilt at the same time; retry resolves. See parking lot IN-XPS-005.
- `npx cap sync` clobbers `android/app/src/main/assets/public/`; never edit that folder manually.
- Capacitor 8 dropped some Capacitor 7 plugin shims; verify each plugin version against Capacitor 8 compatibility table.
