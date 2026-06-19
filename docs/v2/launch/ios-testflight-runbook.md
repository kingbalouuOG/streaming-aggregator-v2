# iOS / TestFlight deployment runbook (internal-testing phase)

The Videx native app (Expo SDK 56) reaches iPhone testers via **TestFlight**. The dev machine is Windows, so iOS builds run on **EAS Build** (Expo's cloud Macs) — there is no local iOS build. The iOS app is the *same Expo codebase* as Android (near-parity), built for App Store distribution.

## Prerequisites (one-time)

1. **Apple Developer Program** membership ($99/yr) — required for TestFlight + App Store Connect. Enrol at https://developer.apple.com/programs/. Approval can take 24–48h. **This is the critical path** — everything else is ready.
2. **Expo account** (free) — sign in with `npx eas-cli login`. The EAS Build free tier is enough to start (slower queue).
3. No global install needed — use `npx eas-cli@latest`.

## Config already in place (this repo)

- `native/eas.json` — `production` (App Store/TestFlight), `preview` (internal ad-hoc), `development` profiles; `appVersionSource: local`.
- `native/app.json` → `ios`: `bundleIdentifier: app.videx.streaming` (matches Android), `buildNumber: "1"`, `supportsTablet: false`, and an opaque **no-alpha** icon (`assets/images/icon-ios.png`) so it passes App Store's icon rule.

## Build → TestFlight (after enrolment), run from `native/`

1. `npx eas-cli login` — sign in to Expo.
2. `npx eas-cli build:configure` — links the project to EAS (first time; writes `extra.eas.projectId` into app.json — **commit that change**).
3. `npx eas-cli build --platform ios --profile production` — EAS prompts to log in to **Apple** and auto-provisions the iOS distribution certificate + provisioning profile, and registers the `app.videx.streaming` App ID. ~20–40 min on the free queue → produces an `.ipa`.
4. `npx eas-cli submit --platform ios --profile production --latest` — uploads to App Store Connect / TestFlight (first run asks for an App Store Connect API key or your Apple login; if the App Store Connect app entry doesn't exist yet, create it there first under the same bundle id).
5. **App Store Connect → TestFlight** (build appears after ~5–15 min processing):
   - **Internal testing** — ≤100 testers, instant, no review. Add testers (must be users on your App Store Connect team) → they're invited.
   - **External testing** — ≤10,000 via email or a public link, but the **first build needs a ~24h Apple "beta review."** Create a group, add tester emails / share the link.
6. Testers install **TestFlight** from the App Store, accept the invite, install Videx.

## Subsequent builds

Each TestFlight upload needs a **unique build number**: bump `app.json` `ios.buildNumber`, then repeat steps 3–4. (Or set `"autoIncrement": true` on the `production` profile in eas.json to let EAS manage it.)

## Known iOS notes (fine for a feedback build)

- **Deep links** ("Watch on {service}") open the service's `https` URL via `Linking.openURL` — on iOS that resolves to Safari or the service's Universal Link (frequently opens the app directly). No iOS-specific deep-link work was needed; the `intent://` path is Android-only and unused.
- **Splash screen** still uses the old `splash-icon.png` (pre-funnel logo) on both platforms — cosmetic; update `native/assets/images/splash-icon.png` when convenient.
- **Android is untouched** — it still builds the signed AAB via local gradle + the `withReleaseSigning` plugin. EAS is iOS-only here. The Android-only config (`expo-navigation-bar`, the release-signing plugin) is inert during iOS builds.
