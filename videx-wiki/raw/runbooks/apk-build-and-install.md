---
title: APK Build and Install Runbook
generated: 2026-04-26
---

# APK Build and Install Runbook

Builds a Capacitor-wrapped Android APK and installs it onto a connected device.

## Prerequisites

- Android Studio with SDK 34+ installed.
- `JAVA_HOME` set to JDK 17+.
- `adb` on `PATH`.
- Device with USB debugging enabled, or emulator running.

## Debug build

```bash
# 1. Build the web bundle
npm run build

# 2. Sync into the native project
npx cap sync android

# 3. Build the APK
cd android
./gradlew assembleDebug

# 4. Install
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The `-r` flag reinstalls keeping data; omit for a clean install.

## Live reload (development)

```bash
# In one terminal
npm run dev

# Find your LAN IP, then in another terminal
LIVE_RELOAD=192.168.1.42 npx cap sync android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The APK now points to your dev server. Edit code, save, see changes on device. Faster than rebuilding the bundle for every change.

## Release build (signed)

> **Pre-launch checklist before first release build:** keystore generated and stored securely, `signingConfigs.release` populated in `app/build.gradle`, version code bumped.

```bash
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`.

Or for AAB (Play Console):

```bash
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

## Keystore generation

One-time, kept offline + backed up:

```bash
keytool -genkey -v \
  -keystore videx-release.keystore \
  -alias videx \
  -keyalg RSA -keysize 2048 -validity 10000
```

Reference in `android/app/build.gradle`:

```groovy
android {
  signingConfigs {
    release {
      storeFile file("${rootProject.projectDir}/keystore/videx-release.keystore")
      storePassword System.getenv("KEYSTORE_PASSWORD")
      keyAlias "videx"
      keyPassword System.getenv("KEY_PASSWORD")
    }
  }
}
```

Never commit the keystore or passwords. Use environment variables locally and GitHub Actions secrets in CI.

## Version bump

Before each release:

1. Update `versionCode` (integer, monotonic) and `versionName` (semver) in `android/app/build.gradle`.
2. Update `package.json` version.
3. Tag the release commit: `git tag v0.x.y && git push origin v0.x.y`.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| `adb: device unauthorized` | USB debug auth not accepted | Confirm dialog on device; revoke and re-pair if stuck. |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Signature mismatch | Uninstall first: `adb uninstall com.videx.app`. |
| `Cannot resolve symbol R` after sync | Gradle cache stale | `./gradlew clean` then rebuild. |
| Live reload connects to dev machine but shows blank | Vite not running, or device on different network | Verify `npm run dev` is up; verify `LIVE_RELOAD` IP is reachable from the device. |
