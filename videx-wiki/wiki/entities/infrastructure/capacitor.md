---
title: Capacitor (Android wrapper)
type: entity
tags: [capacitor, android, native, plugins]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/infrastructure/capacitor-reference.md
  - raw/codebase-snapshots/package-json-annotated.md
related:
  - wiki/entities/codebase/module-map.md
  - wiki/concepts/architecture/lifecycle-manager.md
  - wiki/concepts/operations/apk-build-and-install.md
---

# Capacitor 8

Videx ships as a Capacitor-wrapped web app. Android only at present; iOS deferred.

## Project layout

- `capacitor.config.ts` — webDir, appId, scheme, plugin config.
- `android/` — generated native project (`app/build.gradle`, `AndroidManifest.xml`, signing config).
- `dist/` — Vite build output, copied into `android/app/src/main/assets/public` by `npx cap sync android`.

## Configuration

```ts
{
  appId: 'com.videx.app',
  appName: 'Videx',
  webDir: 'dist',
  server: { androidScheme: 'https' }
}
```

## Plugins

| Plugin | Use |
|---|---|
| `@capacitor/network` | `useNetworkStatus` reads `Network.getStatus()`, subscribes to `networkStatusChange`. |
| `@capacitor/app` | `App.addListener('appStateChange')` powers [lifecycle manager](../../concepts/architecture/lifecycle-manager.md). Also `appUrlOpen` for inbound deep links. |
| `@capacitor/browser` | In-app browser fallback. |
| `@capacitor/app-launcher` | `AppLauncher.openUrl({ url })` fires intent at streaming app. Returns `{ completed: boolean }`. `completed: true` is high-confidence signal. |

## Deep link out

`lib/openDeepLink.ts`:

1. Resolve link: SA API exact URL if cached, else service-specific search fallback (`lib/deepLinks.ts`).
2. Native: `await AppLauncher.openUrl({ url })`. If `completed: true` AND `linkType === 'exact'` → confidence `high`. Otherwise (browser fallback or search URL) → `low`.
3. Web: `window.open(url, '_blank')`.

`markDeepLinkExpected()` MUST be called **before** the await to avoid the Android race (Phase 0 Task 9a hotfix). See [lifecycle manager](../../concepts/architecture/lifecycle-manager.md).

## Build

```bash
npm run build              # web build
npx cap sync android       # sync into native project
cd android && ./gradlew assembleDebug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Live reload: `LIVE_RELOAD=192.168.1.42 npx cap sync android` injects `server.url` so the APK loads from local Vite dev server.

## Permissions

`INTERNET`, `ACCESS_NETWORK_STATE`. AppLauncher uses `<queries>` entries declaring intent-filters for known streaming app schemes; `QUERY_ALL_PACKAGES` not used.

## Quirks

- Windows file watchers (VS Code, Claude Code, antivirus) occasionally throw EPERM during `cap sync` if Edge Functions are rebuilt simultaneously; retry resolves (parking-lot IN-XPS-005).
- `npx cap sync` clobbers `android/app/src/main/assets/public/`; never edit manually.
- Capacitor 8 dropped some Capacitor 7 plugin shims; verify each plugin against Capacitor 8 compatibility table.
