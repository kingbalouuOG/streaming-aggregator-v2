# Release runbook — Videx native (Android + iOS)

**To ship a new version you bump one file and push a tag. CI does the rest — builds and submits to both stores.** No local builds, no manual uploads.

---

## TL;DR — cut a release

1. **Bump versions** in [`native/app.json`](../../../native/app.json):
   - `expo.version` — marketing version (e.g. `2.0.2`)
   - `expo.android.versionCode` — integer, **+1** (Play rejects a duplicate)
   - `expo.ios.buildNumber` — string, **+1** (TestFlight rejects a duplicate)
2. **Merge to `main`** (PR as usual).
3. **Tag and push:**
   ```bash
   git tag v2.0.2 && git push origin v2.0.2
   ```
4. Watch **GitHub → Actions**. Two runs fire off the tag and each **builds then submits**:
   - **Android Release (AAB)** → signed AAB → Play **internal testing**
   - **iOS Release (EAS build → TestFlight)** → EAS build → **TestFlight**

Testers then get it through the Play Store / TestFlight (auto‑update, or "Update" in the store). Done.

---

## What the tag triggers

| | Android — [`android-release.yml`](../../../.github/workflows/android-release.yml) | iOS — [`ios-release.yml`](../../../.github/workflows/ios-release.yml) |
|---|---|---|
| Build | gradlew `bundleRelease` on a Linux runner | EAS Build (cloud macOS), driven from Linux |
| Signing | `videx-release` upload key `99:CE:FF:7E` (via `withReleaseSigning` plugin) | EAS‑stored distribution cert + provisioning profile |
| Submit | `r0adkll/upload-google-play` → **internal** track | `eas submit --latest` → **TestFlight** |
| Time | ~20–25 min | ~20–40 min (EAS queue) |

**Submit is gated to `v*` tags only.** A manual **Actions → Run workflow** is **build‑only** (Android saves the AAB as a run artifact; iOS just builds) — use it to test a build without shipping.

---

## Versioning — the one thing to remember

Each store rejects a duplicate build number, so **every release bumps both**:
- `android.versionCode` (integer, monotonic)
- `ios.buildNumber` (string, monotonic)

`version` (marketing) may repeat, but bump it for clarity. *(Optional: add `"autoIncrement": true` to the `production` profile in `eas.json` to let EAS manage the iOS build number.)*

---

## Universal links and app links (since Growth S1, 2026-09-14)

`native/app.json` now declares `ios.associatedDomains: ["applinks:videxstreaming.com"]` and one `android.intentFilters` entry (`autoVerify`, https `videxstreaming.com` `/t/`, `/room/`, `/list/`). Both are native config, so **both platforms need a store rebuild** to pick them up; an OTA update does not. Before building:

1. The Worker must already serve both association files on the real domain (dashboard routes `videxstreaming.com/.well-known/*`, `/room/*`, `/list/*` → `videx-api`):
   ```bash
   curl -sI https://videxstreaming.com/.well-known/apple-app-site-association
   ```
   Expect `200` and `content-type: application/json`, no redirect. Same for `/.well-known/assetlinks.json`.
2. `assetlinks.json` must list the **Play App Signing** SHA-256 (Play Console → App integrity) as well as the upload key `99:CE:FF:7E…`: set `ASSETLINKS_FINGERPRINTS` in `workers/api/wrangler.toml` and merge (deploys the Worker).
3. iOS: the EAS build log should show the Associated Domains capability being synced to the App ID.

After install: Android `adb shell pm verify-app-links --re-verify app.videx.streaming` then `adb shell pm get-app-links app.videx.streaming` shows `videxstreaming.com: verified`. iOS reads the file via `https://app-site-association.cdn-apple.com/a/v1/videxstreaming.com` (Apple's CDN can lag a new file by hours).

---

## Sign-in providers: Apple and Google (since Growth S3, 2026-09-15)

`native/app.json` declares `ios.usesAppleSignIn: true` and the `expo-apple-authentication` plugin (entitlement `com.apple.developer.applesignin`). `native/app.config.js` adds the `@react-native-google-signin/google-signin` plugin, with `iosUrlScheme` derived from `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (the reversed client id). Both are native config: a **store rebuild**, not an OTA update. Before the first build that carries them:

1. **Migration 089 applied** (`handle_new_user` placeholder username). Without it every Apple or Google sign-up fails in the trigger ("Database error saving new user").
2. **Google client ids, identical in all three places:**

   | Variable | Value | Set in |
   |---|---|---|
   | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google Cloud (project `videx-3063b`) → Credentials → the *Web application* client | `native/.env`; GitHub secret (`android-release.yml` writes it into `.env`); EAS **production** environment, visibility plain text or sensitive (so eas-cli can read it while resolving `app.config.js`) |
   | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | the *iOS* client (bundle `app.videx.streaming`) | the same three |

   No web id: the Google button is hidden on both platforms. No iOS id: the plugin is left out and the Google button is hidden on iOS (signing in without the URL scheme crashes). `runtimeVersion` is a fingerprint over the app config, so a value that differs between a build and an `eas update` changes the runtime version.
3. **Google Cloud OAuth clients** (same project): *Web application*; *iOS* (bundle `app.videx.streaming`, App Store id `6785395342`, Team `CT8F3578W8`); *Android* `app.videx.streaming` with SHA-1 `A1:39:39:44:87:22:10:B7:C7:A7:A1:B1:B3:47:64:ED:68:5C:02:2B` (the upload key, which is also the Play App Signing key, IN-GR-001); optionally *Android* `com.videx.app.dev` with the Expo debug keystore SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` for `npm run android:dev`. OAuth consent screen published to production (Testing mode admits listed test users only). To re-derive: `keytool -printcert -jarfile <signed .aab>` (release) or `keytool -list -v -keystore android/app/debug.keystore -storepass android` (debug). `google-services.json` does not need re-downloading; the app passes `webClientId` itself.
4. **Supabase dashboard → Authentication → Sign In / Providers.** *Apple:* enabled, Client IDs `app.videx.streaming`, no secret (the native id-token flow needs no Services ID or key). *Google:* enabled, Client IDs `<web id>,<iOS id>` with **web first**, client secret = the web client's secret, **Skip nonce check on** (Google's iOS SDK puts a nonce in the token that the app cannot read). Check from anywhere:
   ```bash
   curl -s https://fmusugdcnnwiuzkbjquo.supabase.co/auth/v1/settings -H "apikey: <publishable key>"
   ```
   Expect `"apple":true` and `"google":true` under `external`.
5. **Apple Developer portal:** the App ID `app.videx.streaming` has *Sign In with Apple*; the EAS build log shows the capability sync. If Videx ever emails users (beyond Supabase Auth mail), register the sending domain under *Sign in with Apple for Email Communication*, or mail to Hide My Email relay addresses bounces.

After install (S5 device pass): Apple on a physical iPhone (new account, returning account, Hide My Email); Google on iPhone and Android; `select provider, count(*) from auth.identities group by 1` shows the new rows; a new provider account starts onboarding at Connect Services and meets "Choose your name" before Curating. Open review risk: Apple token revocation on account deletion (IN-GR-010).

---

## Promote beyond internal testing

The pipeline ships to **internal testing**. To widen:
- **Play:** Console → Videx → *Production* (or Closed/Open testing) → create a release and **promote** the internal build (or change `track:` in the workflow).
- **App Store:** submit for review from App Store Connect. *(External TestFlight groups need a one‑time ~24h Apple beta review on the first build.)*

---

## One‑time setup (already done — kept for a new machine / repo / account)

Credentials live as **GitHub repo secrets** (Settings → Secrets and variables → Actions) or **on EAS**:

| Secret | Used by | What it is |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | Android build | base64 of the `videx-release` upload keystore |
| `VIDEX_UPLOAD_STORE_PASSWORD` / `VIDEX_UPLOAD_KEY_PASSWORD` | Android build | keystore passwords (alias `videx-key`) |
| `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `EXPO_PUBLIC_API_PROXY_URL` | Android build | public client config, inlined into the JS bundle |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Android build | Google Sign-In client ids (Growth S3); also set in the EAS production environment for iOS. See *Sign-in providers* above |
| `PLAY_SERVICE_ACCOUNT_JSON` | Android submit | Google Play service‑account JSON (grant "Release to testing tracks") |
| `EXPO_TOKEN` | iOS build + submit | Expo access token (authenticates eas‑cli in CI) |

**On EAS, not in git:** the iOS distribution cert + provisioning profile, the App Store Connect API key (auto‑created on the first `eas submit`), and the `production` environment's `EXPO_PUBLIC_*` variables.

Reference: EAS project `@kingbalouu/videx` (`projectId 9b9b5960…`); Apple Team `CT8F3578W8`; Android package + iOS bundle id both `app.videx.streaming`.

**Re‑creating the Play service account** (Google removed the old "Setup → API access" page):
1. Google Cloud Console → *IAM & Admin → Service Accounts* → create one → *Keys → Add key → JSON* (download).
2. Play Console → *Users and permissions → Invite new users* → paste the service‑account email → grant **"Release to testing tracks"**.
3. **Enable the Google Play Android Developer API** in that same Google Cloud project: *APIs & Services → Library →* search **"Google Play Android Developer API"** *→ Enable* (direct: `console.developers.google.com/apis/api/androidpublisher.googleapis.com`). Without this, submit fails with *"…API has not been used in project N before or it is disabled."* Give it a few minutes to propagate.
4. Put the JSON's full contents in the `PLAY_SERVICE_ACCOUNT_JSON` repo secret.

---

## Manual & fallback

- **Build only:** Actions → the workflow → **Run workflow** (any branch). Android → download the `videx-release-aab` artifact.
- **Manual iOS submit:** `cd native && npx eas-cli@latest submit --platform ios --latest` (uploads only the `.ipa`, so it runs fine from Windows).
- **Local Android AAB** (Windows): possible but fragile — the NDK CMake/ninja loop bites (see below). CI is strongly preferred.
- **Local iOS build:** not possible on Windows — always CI/EAS.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Tag pushed, no run started | Trigger is `push: tags: ['v*']` — the tag must start with `v`. |
| Android submit `403` / permission | Service account lacks "Release to testing tracks" — re‑grant in Play → Users and permissions. |
| Android submit: `…API has not been used … or it is disabled` | Enable the **Google Play Android Developer API** in the service account's Google Cloud project (the error gives the exact link); wait a few minutes to propagate. |
| Android `Version code N has already been used` | Bump `android.versionCode`. |
| iOS submit rejects the build number | Bump `ios.buildNumber` (must be unique on TestFlight). |
| iOS submit: `Set ascAppId in the submit profile` | Non‑interactive submit needs the App Store Connect app ID — it's committed in `eas.json` → `submit.production.ios.ascAppId` (`6785395342`). |
| Android build: `ninja: build.ninja still dirty` | Windows‑local only (never CI). This is *why* Android builds on a Linux runner. |
| iOS: `EPERM … symlink` at "Compressing project files" | You ran `eas build` from Windows — always use the CI workflow (Linux). |

---

## Why it's built this way

The Windows dev machine can't reliably build either platform: Android hits a CMake/ninja regeneration loop, and eas‑cli can't package the junction‑based shared tree on Windows (symlink `EPERM`). A **Linux CI runner** sidesteps both — real symlinks + a well‑behaved NDK — so every release builds in the cloud and submits itself. iOS deep‑dive: [ios-testflight-runbook.md](./ios-testflight-runbook.md).
