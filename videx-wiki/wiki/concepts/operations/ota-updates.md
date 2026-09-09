---
title: OTA updates (EAS Update)
type: concept
tags: [runbook, ota, eas-update, expo-updates, android, ios, ci]
created: 2026-09-09
updated: 2026-09-09
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

## What the CI guards now do

- `android-release.yml` asserts the channel is present in the built AAB before
  the build can be submitted, and publishes the AAB's baked fingerprint as the
  `videx-android-runtime-version` artifact.
- `ota-update.yml` compares an Android publish against that artifact, and an iOS
  publish against `eas build:list`. Either way, "nothing to compare against" is
  a failure, not a warning — an unverifiable publish has the same silent shape
  as a broken one.

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
- **A channel fix cannot reach already-installed builds.** They have no channel
  to be reached by. Only a new AAB carries it.
