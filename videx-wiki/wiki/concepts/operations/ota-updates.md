---
title: OTA updates (EAS Update)
type: concept
tags: [runbook, ota, eas-update, expo-updates, android, ios, ci]
created: 2026-09-09
updated: 2026-09-18
sources:
  - .github/workflows/ota-update.yml
  - .github/workflows/android-release.yml
  - native/plugins/withUpdatesChannel.js
related:
  - wiki/concepts/operations/apk-build-and-install.md
---

# OTA updates (EAS Update)

JS-only changes reach installed apps through EAS Update instead of a store
release. A published update reaches a build only when **three** things line up.
Two of them are per-platform, and Android got both wrong until 2026-09-09.

## The three conditions

1. **The binary asks for a channel.** The app sends `expo-channel-name` on every
   update request. Without it `u.expo.dev` answers `400 Bad Request` — not
   "no update", but a rejected request. No channel means no OTA, ever.
2. **The runtime versions match exactly.** `runtimeVersion` uses the
   `fingerprint` policy, so the manifest holds the sentinel `file:fingerprint`
   and the real value is the `assets/fingerprint` file baked into the binary. An
   update is served only to a build whose fingerprint is byte-identical.
3. **The update was published for that platform.** Fingerprints are
   per-platform; an iOS fingerprint can never match an Android build.

## Where each platform gets its channel

| | how it is built | where the channel comes from |
|---|---|---|
| iOS | EAS Build (`ios-release.yml`) | the `channel` in the matching `eas.json` build profile, injected by EAS |
| Android | `expo prebuild` + Gradle on a runner (`android-release.yml`) | `native/plugins/withUpdatesChannel.js`, which writes it into the manifest at prebuild |

Android does not use EAS Build: a Windows checkout cannot package the
junction-based shared tree, and the local Gradle build hits an unresolved
CMake/ninja loop, so the AAB is built on a Linux runner instead. That choice is
sound, but it costs the two things `eas build` does for free — injecting the
channel, and registering the binary with EAS.

## The bug this page exists to record (issue #137)

From the moment `expo-updates` shipped until 2026-09-09, no Android build
carried a channel. The 2.2.0 AAB's manifest had every other
`expo.modules.updates` key and not `UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY`,
which is where `expo-channel-name` lives; absent, `expo-updates` reads it as
`{}`. Probing the endpoint the way that binary does returns:

```
HTTP/1.1 400 Bad Request
"channel-name": Required.
```

So **every JS-only publish since Android went to Play was iOS-only in practice**,
silently. The symptom that surfaced it was a CI error that read like a
fingerprint problem: the OTA workflow could find no Android build to compare
against, because a Gradle-built AAB never appears in `eas build:list`.

The Android channel is hardcoded to `production`, since the Gradle path builds
exactly one thing. A `preview` publish therefore reaches no Android device at
all, and the workflow now says so rather than comparing.

## The second Android bug: the AAB's runtime was unreproducible (IN-GR-048)

The channel fix was necessary but not sufficient. On 2026-09-18 the first
production Android OTA (run 35366043296, main `0c0b18a`) published under
`1c1a04ff…` while the versionCode 17 AAB (`v2.5.0`, `d90cdaf`) carries
`59c7b318…`, with no native change between the two commits. No Android OTA has
ever reached a Play build.

**Cause (measured, diagnostic runs 35367402382 and 35368260937).** Gradle's
`:app:createReleaseUpdatesResources` fingerprints the project *in the middle
of the build*, after Gradle has already written into `node_modules`:

| state of the same commit | Android fingerprint |
|---|---|
| clean checkout + full `.env` | `1c1a04ff…` |
| after `expo prebuild` | `1c1a04ff…` (prebuild changes nothing) |
| `eas fingerprint:generate` (what `eas update` uses) | `1c1a04ff…` |
| inside the Gradle task | `431c25b0…` |
| after Gradle finished | `5672bf8c…` |

The sources that move are
`node_modules/@react-native-masked-view/masked-view` (Gradle rewrites its
`android/src/main/AndroidManifest.xml`) and
`node_modules/expo-updates/expo-updates-gradle-plugin` (transient output while
the task runs; gone again afterwards). The v2.5.0 AAB log shows the same
rewritten masked-view hash. Because the value depends on build timing, **no
clean checkout can reproduce an AAB's runtime**. The original hypothesis
(prebuilt `android/` or the `withReleaseSigning` / `withUpdatesChannel`
plugins) was wrong: `android/` is gitignored, so both sides resolve the
`managed` workflow and ignore it.

A second, smaller trap: `native/app.config.js` adds the google-signin plugin
only when `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set, and the plugin list is part
of the fingerprint. The GitHub secret (written to `native/.env` on the Android
runner) and the EAS `production` variable must stay identical, or the two sides
diverge again. Without the variable the same commit fingerprints `65e24531…`.

**Fix (PR for `fix/android-ota-fingerprint`).** Do what EAS Build does
(`eas-cli` build-tools `builders/android.ts`): resolve the runtime once, before
prebuild, and hand it to Gradle as `EXPO_UPDATES_FINGERPRINT_OVERRIDE` (with
`EXPO_UPDATES_WORKFLOW_OVERRIDE=managed`). `expo-updates`'
`createFingerprintForBuildAsync` then writes that value instead of
re-fingerprinting. This is why iOS builds and iOS updates always agreed. A
`.fingerprintignore` was rejected: the masked-view package directory is hashed
whole for iOS too, so ignoring the manifest would have moved every iOS runtime
and cut build 14 off from OTAs; it also would not cover transient output nobody
has listed yet.

**Consequence.** versionCode 17 and every earlier AAB can never receive an OTA.
The first reachable Android OTA follows the next versionCode build made with
this workflow.

## What the CI guards now do

- `android-release.yml` asserts the channel is present in the built AAB before
  the build can be submitted, resolves the runtime before prebuild, fails if the
  AAB's baked fingerprint differs from it, and publishes it as the
  `videx-android-runtime-version` artifact.
- `ota-update.yml` computes the runtime **before publishing** with
  `eas fingerprint:generate --environment production` and compares it with that
  artifact (Android) or `eas build:list` (iOS). On a mismatch, or when there is
  nothing to compare against, it fails and **publishes nothing**. After
  publishing it confirms `eas update` used the same runtime.

## Gotchas worth keeping

- **Never publish from Windows.** `core.autocrlf` gives a Windows checkout CRLF
  where the runner has LF, the fingerprint hashes file content, and the
  resulting update is served to nothing. Publish from CI, which reproduces the
  build's own environment.
- **`--platform all` is a matrix, not an argument.** `all` means every platform
  the config declares, which includes web, and the web bundle pulls in
  `@capacitor/core` from the shared tree. The workflow fans out to one job per
  real platform instead.
- **An update applies on the second launch.** `fallbackToCacheTimeout` is 0, so
  a launch renders from cache and fetches in the background.
- **Compare only CI-computed fingerprints.** A local Windows
  `fingerprint:generate` gave a third value (`d263b065…`) for the same commit.
- **A buildNumber / versionCode bump moves the fingerprint** (it hashes
  `native/app.json`), so it orphans OTAs for every older binary, including the
  ad-hoc preview on Joe's iPhone.
- **A channel fix cannot reach already-installed builds.** They have no channel
  to be reached by. Only a new AAB carries it.
