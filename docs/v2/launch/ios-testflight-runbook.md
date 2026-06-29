# iOS / TestFlight deployment runbook

The Videx iOS app is the **same Expo SDK 56 codebase as Android**, shipped to iPhone testers via **TestFlight**. **iOS builds run on EAS Build through a GitHub Actions Linux runner** (`.github/workflows/ios-release.yml`) — they **cannot** be built from the Windows dev machine: `eas build` fails at *"Compressing project files"* because eas-cli can't create the `src/lib` + `src/assets` junction symlinks in the upload tarball on Windows (`EPERM`). On Linux they're real symlinks, so the upload succeeds; the build itself runs on EAS's macOS. (Same reason the Android release build is on a Linux runner.)

First iOS TestFlight build shipped 2026-06-28.

## One-time setup (already done — kept for a new machine / account / re-bootstrap)

1. **Apple Developer Program** — enrolled (Joe Green, Individual; Apple **Team `CT8F3578W8`**).
2. **iOS signing credentials** — provisioned once by running `eas build -p ios` interactively from a terminal (`cd native` → Apple ID login + 2FA → EAS **created and stored** the distribution certificate + provisioning profile for `app.videx.streaming`). This part works from Windows — it only fails *later*, at the upload step, after the credentials exist. Every CI build afterwards reuses the stored creds, so **no Apple login is needed in CI**.
3. **GitHub repo secret `EXPO_TOKEN`** — an Expo access token (expo.dev → Account → Settings → Access tokens). Authenticates eas-cli non-interactively as the project owner.
4. **EAS environment variables (`production` environment)** — `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_PROXY_URL` (the public client values). Set via the EAS dashboard (Project → Environment variables) or `eas env:create`. Without them the JS bundle has no backend config. They live on EAS, **not** in git — `native/.env` is gitignored and isn't uploaded to the cloud build, so the local-`.env` trick the Android gradle build uses does **not** carry over to EAS.
5. **App.json encryption flag** — `ios.infoPlist.ITSAppUsesNonExemptEncryption = false` (standard-encryption export compliance; stops the build prompting).
6. **App Store Connect API Key** — generated automatically on the **first** `eas submit` (answer **Yes** to "Generate a new App Store Connect API Key?"). EAS creates it, stores it, and reuses it for every future submit. Revocable in App Store Connect → Users and Access → Integrations.

## Each TestFlight build

1. **Bump the build number** — `native/app.json` → `ios.buildNumber` (every TestFlight upload needs a unique value). Or set `"autoIncrement": true` on the `production` profile to let EAS manage it.
2. **Trigger the build** — GitHub → **Actions → "iOS Release (EAS build)" → Run workflow → branch `main`.** ~20–40 min; the EAS build URL prints in the run log.
3. **Submit to TestFlight** — once the run is green, from a terminal:
   ```
   cd native
   npx eas-cli@latest submit --platform ios --profile production --latest
   ```
   This uploads only the finished `.ipa`, so there's **no junction problem** — it runs fine from Windows.
4. **App Store Connect → TestFlight** — the build appears after a few minutes' processing. Add testers: **Internal** (≤100, instant) or **External** (≤10,000 via email/link; the *first* external build needs a one-time ~24h Apple beta review).

## Gotchas we actually hit

- **Run eas from `native/`, not the repo root.** The root has no Expo project — eas there generates a stray `eas.json`/`app.json`, prompts for a fresh bundle id, and dies with *"Cannot find `expo-modules-autolinking`"*.
- **The workflow must be on `main`** (the default branch) or `workflow_dispatch` shows no "Run workflow" button. (It first lived only on `release/native-2.0.1`, so it was un-triggerable — PR #38 moved it to main.)
- **You can't build iOS locally on Windows** (the junction/symlink upload `EPERM`) → always use the CI workflow.
- **`eas submit` from the terminal is fine** — it uploads the `.ipa`, not the project tree, so no junction is involved.

## Config / facts

- Bundle id `app.videx.streaming` (same string as the Android package — separate registries). `supportsTablet: false`; opaque no-alpha icon `native/assets/images/icon-ios.png`; splash via the cross-platform `expo-splash-screen` plugin.
- EAS project `@kingbalouu/videx`; Apple Team `CT8F3578W8`.
- Deep links work on iOS unchanged (`https` via `Linking.openURL`). The Android release build is independent (local gradle + the `withReleaseSigning` config plugin).
