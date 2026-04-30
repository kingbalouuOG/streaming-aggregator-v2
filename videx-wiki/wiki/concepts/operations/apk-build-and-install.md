---
title: APK build and install runbook
type: concept
tags: [runbook, android, capacitor, apk, build]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/runbooks/apk-build-and-install.md
related:
  - wiki/entities/infrastructure/capacitor.md
---

# APK build and install runbook

Builds a Capacitor-wrapped Android APK and installs it onto a connected device.

## Prerequisites

- Android Studio with SDK 34+.
- `JAVA_HOME` set to JDK 17+.
- `adb` on `PATH`.
- Device with USB debugging enabled, or emulator running.

## Debug build

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`-r` reinstalls keeping data; omit for clean install.

## Live reload

```bash
npm run dev   # one terminal
# Another terminal, with LAN IP
LIVE_RELOAD=192.168.1.42 npx cap sync android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

APK now points to dev Vite server. Edit, save, see changes on device.

## Release build (signed)

> Pre-launch: keystore generated and stored securely, `signingConfigs.release` populated, version code bumped.

```bash
cd android
./gradlew assembleRelease     # APK
./gradlew bundleRelease       # AAB for Play Console
```

Outputs:
- `android/app/build/outputs/apk/release/app-release.apk`
- `android/app/build/outputs/bundle/release/app-release.aab`

## Keystore generation (one-time, kept offline + backed up)

```bash
keytool -genkey -v \
  -keystore videx-release.keystore \
  -alias videx \
  -keyalg RSA -keysize 2048 -validity 10000
```

Reference in `android/app/build.gradle`. Never commit keystore or passwords. Use env vars locally and GitHub Actions secrets in CI.

## Version bump

Before release:

1. Update `versionCode` (integer, monotonic) and `versionName` (semver) in `android/app/build.gradle`.
2. Update `package.json` version.
3. Tag release commit: `git tag v0.x.y && git push origin v0.x.y`.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `adb: device unauthorized` | USB debug not accepted | Confirm dialog on device; revoke and re-pair if stuck. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Signature mismatch | `adb uninstall com.videx.app`. |
| `Cannot resolve symbol R` after sync | Gradle cache stale | `./gradlew clean` then rebuild. |
| Live reload connects but blank | Vite not running or device on different network | Verify `npm run dev` up; verify LAN IP reachable from device. |
