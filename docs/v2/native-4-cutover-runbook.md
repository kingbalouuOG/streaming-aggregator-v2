# NATIVE-4 Cutover Runbook — Videx native → live app (v2.0.0)

**Status:** Phase A (pre-launch hardening) complete on `phase-native-polish-gaps`.
This runbook is the step-by-step to make the native app the live product. Nothing
here is executed yet — the appId/version flip + signing happen as ONE release, with
Joe's existing keystore, so the current `com.videx.app.dev` dev-test loop keeps working
until cutover.

Author: CC · Date: 2026-06-17

---

## 0. Pre-flight (done)

- ✅ Multi-agent pre-launch audit run; blockers fixed (semantic id-collision, Free Tonight),
  mediums fixed (badge cache key, skeleton de-dup, genre attribution), security verified
  (no secrets in client, RLS correct, JWT-gated Edge fn).
- ✅ Branch pushed: `phase-native-polish-gaps` (PR #28).
- ⚠️ Outstanding before tagging the release — see §6 "Remaining" (docs sweep + a few
  deferred items). None block the mechanics below.

## 1. App identity flip (`native/app.json`)

Change as part of the release commit (NOT before — it forks the install id):

- `expo.android.package`: `com.videx.app.dev` → **`app.videx.streaming`** (matches the
  verified store id; see memory `app.videx.streaming verified on device 2026-06-12`).
- `expo.version`: `1.0.0` → **`2.0.0`**; `expo.android.versionCode`: bump to the next
  integer above the current Play track (check Play Console; first upload can be `1`).
- Confirm `expo.name` / icon / splash are the production assets.
- Confirm `android.allowBackup` is **false** (audit nit: no explicit flag today — add
  `"allowBackup": false` under `expo.android` so refresh tokens in MMKV aren't backed up).

After editing app.json, regenerate native config: `npx expo prebuild --platform android`
(or hand-edit `android/app/build.gradle` `applicationId` + `versionName`/`versionCode`).

## 2. Release signing — use the EXISTING keystore

Today `android/app/build.gradle` signs the `release` buildType with the **debug** keystore
(`signingConfigs.debug`) — fine for side-loading, NOT for the Play Store.

1. Place Joe's existing keystore **outside git** (e.g. `~/.videx/videx-release.jks`).
2. Add a `release` signingConfig to `android/app/build.gradle`:
   ```gradle
   signingConfigs {
     release {
       storeFile file(System.getenv("VIDEX_KEYSTORE") ?: "release.jks")
       storePassword System.getenv("VIDEX_KEYSTORE_PASSWORD")
       keyAlias System.getenv("VIDEX_KEY_ALIAS")
       keyPassword System.getenv("VIDEX_KEY_PASSWORD")
     }
   }
   buildTypes { release { signingConfig signingConfigs.release ... } }
   ```
   (Or use `android/gradle.properties` / `~/.gradle/gradle.properties` for the creds — never commit them.)
3. **Verify the keystore SHA matches the one already registered with Google Play** (App
   signing). If Google manages the upload key, this must be the registered upload key — a
   mismatch is unrecoverable for that listing.
4. `.gitignore` already excludes `*.jks`/`*.keystore` — confirm the new file isn't staged.

## 3. Build the signed release

```
cd native
npx expo prebuild -p android          # if app.json changed
cd android
./gradlew bundleRelease               # AAB for the Play Store (NOT assembleRelease/APK)
# output: app/build/outputs/bundle/release/app-release.aab
```
Smoke-test the signed build on-device first via a universal APK:
`./gradlew assembleRelease && adb install -r app/build/outputs/apk/release/app-release.apk`.

## 4. Merge to main

PR path (do NOT fast-forward native straight to main):
1. `phase-native-polish-gaps` → **`native-integration`** (review PR #28-stack).
2. `native-integration` → **`main`**, reconciling with LAUNCH-1 already on main
   (rate-limit `/v1/foryou`, release scaffold/version 1.1.0, solicitor pack, re-onboarding
   runbook). Watch for: the `version` collision (LAUNCH-1 set 1.1.0; native goes 2.0.0),
   and any web/Worker drift from the shared `src/lib` changes (semanticCore composite-key,
   detailAdapter genreIds — both additive + safe for web).
3. CI: the "Semantic search eval" check will go red on any search-path change — it's the
   stub gate (see §6); make it non-blocking or author the fixture before requiring it.

## 5. Play Store

- Create/confirm the `app.videx.streaming` listing; data-safety form (collects: account
  email, watchlist, taste signals, in-app feedback → `app_feedback`); content rating.
- Upload the AAB to an **internal test** track first; promote to closed → production.
- Screenshots/copy from the current design system.

## 6. Remaining before "go" (none block the mechanics above)

- **Docs sweep** (Phase A tail): reconcile `docs/v2/native-design-review-audit.md` (lists
  shipped features as missing), wiki phase pages + `migrations.md` (047) + `next-steps.md`,
  `hooks.md`, and replace `native/README` boilerplate. — *in progress*
- **`search_semantic` global-flip gate** (post-launch decision): author the real eval
  fixture (green the eval) **and** add a per-user rate limit to the `embed-query` Edge fn
  (denial-of-wallet) before flipping semantic on for everyone. Until then it stays flag-off
  (presets serve all users).
- **Deferred hardening (your call):** MMKV session encryption via `expo-secure-store`
  (local-only risk); `reactCompiler` ESLint plugin in CI.

## 7. Rollback

The cutover is a new Play listing/version — rollback = halt the staged rollout in Play
Console and/or publish the prior AAB. The dev build (`com.videx.app.dev`) is a separate
install and remains available for testing throughout.
