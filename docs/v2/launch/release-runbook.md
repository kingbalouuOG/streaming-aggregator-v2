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
| `PLAY_SERVICE_ACCOUNT_JSON` | Android submit | Google Play service‑account JSON (grant "Release to testing tracks") |
| `EXPO_TOKEN` | iOS build + submit | Expo access token (authenticates eas‑cli in CI) |

**On EAS, not in git:** the iOS distribution cert + provisioning profile, the App Store Connect API key (auto‑created on the first `eas submit`), and the `production` environment's `EXPO_PUBLIC_*` variables.

Reference: EAS project `@kingbalouu/videx` (`projectId 9b9b5960…`); Apple Team `CT8F3578W8`; Android package + iOS bundle id both `app.videx.streaming`.

**Re‑creating the Play service account** (Google removed the old "Setup → API access" page):
1. Google Cloud Console → *IAM & Admin → Service Accounts* → create one → *Keys → Add key → JSON* (download).
2. Play Console → *Users and permissions → Invite new users* → paste the service‑account email → grant **"Release to testing tracks"**.
3. Put the JSON's full contents in the `PLAY_SERVICE_ACCOUNT_JSON` repo secret.

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
| Android `Version code N has already been used` | Bump `android.versionCode`. |
| iOS submit rejects the build number | Bump `ios.buildNumber` (must be unique on TestFlight). |
| iOS submit: `Set ascAppId in the submit profile` | Non‑interactive submit needs the App Store Connect app ID — it's committed in `eas.json` → `submit.production.ios.ascAppId` (`6785395342`). |
| Android build: `ninja: build.ninja still dirty` | Windows‑local only (never CI). This is *why* Android builds on a Linux runner. |
| iOS: `EPERM … symlink` at "Compressing project files" | You ran `eas build` from Windows — always use the CI workflow (Linux). |

---

## Why it's built this way

The Windows dev machine can't reliably build either platform: Android hits a CMake/ninja regeneration loop, and eas‑cli can't package the junction‑based shared tree on Windows (symlink `EPERM`). A **Linux CI runner** sidesteps both — real symlinks + a well‑behaved NDK — so every release builds in the cloud and submits itself. iOS deep‑dive: [ios-testflight-runbook.md](./ios-testflight-runbook.md).
