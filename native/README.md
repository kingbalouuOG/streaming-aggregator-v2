# Videx — native app (`native/`)

The live Videx app: a personalised UK streaming aggregator. It tells you **where** a
title is streaming, deep-links you straight into the right service, and learns your
taste from what you rate, watch, and explore to drive the For You feed.

This is the React Native / Expo client that **replaced** the Capacitor (WebView) build.
It shipped as **v2.0.0** under Android package **`app.videx.streaming`** (the NATIVE-4
cutover — see `../docs/v2/native-4-cutover-runbook.md`).

> **Do not run `npm run reset-project`.** That script (a leftover from the
> create-expo-app template) moves the real app to `app-example/` and replaces `src/app`
> with a blank starter. It will wipe this app. The script is left in `package.json` only
> because the template ships it; never invoke it.

## Stack

- **Expo SDK 56** / **React Native 0.85** / **React 19** — see `package.json` for exact pins.
- **New Architecture + Hermes** — both enabled (`android/gradle.properties`:
  `newArchEnabled=true`, `hermesEnabled=true`). The React Compiler is on via
  `app.json` → `experiments.reactCompiler`.
- **expo-router** (file-based routing, `experiments.typedRoutes`).
- **NativeWind 4** — Tailwind-in-RN; the design tokens live in `tailwind.config.js`,
  global stylesheet at `src/global.css` (wired through `metro.config.js` via
  `withNativeWind`).
- **TanStack Query** for data, persisted to **MMKV** (`react-native-mmkv`) so Home /
  For You paint from the last payload on cold start instead of a spinner.
- **Supabase** (`@supabase/supabase-js`) for content cache, taste, feedback, and feeds.

> Before writing any RN/Expo code, read the **versioned** SDK 56 docs
> (https://docs.expo.dev/versions/v56.0.0/) — APIs differ from older majors. See `AGENTS.md`.

## The shared-lib junction (important)

The recommendation engine, API clients, adapters, taste vector, storage, etc. are **not**
duplicated here. They live once in the repo-root `../src/lib` (and shared assets in
`../src/assets`) — **ADR-014: one engine tree, three consumers** (web, the `workers/api`
Worker, and this app).

`npm install` runs a **`postinstall` hook** (`scripts/link-shared.js`) that, idempotently:

1. **Mounts the shared trees inside the project** as directory junctions (Windows) /
   symlinks (POSIX): `native/src/lib → ../src/lib` and `native/src/assets → ../src/assets`.
   Metro can't reliably index files outside the project root on Windows (`watchFolders`
   ends in "Failed to get SHA-1"), so the shared tree is mounted **inside** and treated as
   a plain directory. Both junction targets are gitignored — the single source of truth
   stays `../src/lib`.
2. **Patches `@react-native/gradle-plugin`'s pinned `foojay-resolver` 0.5.0 → 1.0.0** —
   0.5.0 references `JvmVendorSpec.IBM_SEMERU`, removed in Gradle 9, which crashes any
   JDK-toolchain download.

Two Metro consequences (both handled in `metro.config.js`, read the comments there before
touching resolution):

- **Shared deps with native code must be installed into `native/package.json`** at the
  **same versions** as the root. A `Failed to get SHA-1 … node_modules` error means a
  shared dep resolved to the root copy — add it here.
- **`react` / `react-native` / `scheduler` are pinned to `native/node_modules`** regardless
  of import origin. The root is the web app's React 18; a bare `react` import from a
  shared-tree file would otherwise walk up to it and you'd get two Reacts ("Cannot read
  property 'useState' of null" at the first hook).

If `src/lib` or `src/assets` is missing (e.g. after a fresh clone where postinstall didn't
run), just re-run `npm install` from `native/`.

## App layout (`src/app`, expo-router)

```
src/app/
  _layout.tsx            # root layout (providers, fonts, query persistence)
  auth.tsx               # sign-in / account creation (session-guarded redirects)
  onboarding.tsx         # 5-step onboarding + taste bootstrap
  (tabs)/
    _layout.tsx          # tab bar; mounts <FeedbackHost /> (timed feedback prompt)
    index.tsx            # Home
    foryou.tsx           # For You feed
    browse.tsx           # Browse — pre-search, filter-only /discover, semantic mood search
    watchlist.tsx        # Watchlist
    profile.tsx          # Profile
  detail/[id].tsx        # title detail (engagement/dwell signals, deep-link out)
  profile/[section].tsx  # Profile sub-screen router (account/services/taste/tune/
                         #   appearance/spend/privacy; unknown → fallback)
```

Non-route code sits alongside under `src/`: `components/`, `hooks/`, `providers/`,
`constants/`, `instrumentation/`, plus the `lib`/`assets` junctions.

## Dev vs release builds

Common: `npm install` (runs the junction/foojay postinstall). Env in `native/.env`.

**Dev (Metro + fast refresh):**

```bash
npm run start:dev      # Metro / Expo dev server (APP_VARIANT=development)
npm run android:dev    # build + install the "Videx Dev" app on a connected device
```

The `:dev` scripts set `APP_VARIANT=development` (via `cross-env`), which
`app.config.js` reads to build a **separate app** — name **"Videx Dev"**,
package **`com.videx.app.dev`** — that installs *alongside* the Play release
(`app.videx.streaming`). Use this to test on-device before shipping without
touching the production app. The plain `npm run android` / `npm run start`
build under the production id (only useful for release-id smoke tests, and a
debug build there collides with the Play-signed app).

**Release APK (standalone, no Metro):**

```bash
cd android
./gradlew assembleRelease
```

The release variant currently signs with the **debug keystore**, so `assembleRelease`
APKs install directly on-device for testing — no separate signing setup required yet.

Other scripts: `npm run lint` (`expo lint`), `npm run ios`, `npm run web`.

## Crash reporting (Sentry)

Crash + error reporting runs through **`@sentry/react-native`** (roadmap 0.4).
`Sentry.init` is at the top of `src/app/_layout.tsx`; the root layout is wrapped
with `Sentry.wrap`. Release health (crash-free sessions — the H0 "crash-free ≥99%"
gate) is on via `enableAutoSessionTracking`.

Config:

- **`EXPO_PUBLIC_SENTRY_DSN`** (runtime) — the project DSN. Put it in `native/.env`
  for local device builds and add it to **EAS build env / CI secrets** for release
  builds. With **no** DSN the SDK stays disabled, so local Metro dev is silent and
  never depends on a token.
- **Source maps** (optional, "if cheap"): the `@sentry/react-native/expo` config
  plugin in `app.json` uploads source maps during an EAS build when a
  **`SENTRY_AUTH_TOKEN`** secret is present in the build env. Without the token the
  upload is skipped and the build still succeeds. Configured for org `videx-0n` /
  project `videx-native` on the **EU** data region (`url: https://de.sentry.io/`).

Runtime crash capture needs only the DSN; the auth token / slugs are just for
readable stack traces.

## Package / bundle ids

- **Android**: **`app.videx.streaming`** (`app.json` → `android.package`) — the production
  id from the NATIVE-4 cutover. App version **2.0.0** (`expo.version`); bump
  `android.versionCode` per release.
- **iOS**: bundle id is still the **dev** id **`com.videx.app.dev`** (`ios.bundleIdentifier`).

**Dev package-id history:** earlier native phases ran under **`com.videx.app.dev`** to keep
the in-development client installable next to the shipping Capacitor app. NATIVE-4 cut the
**Android** package over to `app.videx.streaming` at v2.0.0 (iOS retains the dev id for now).
Older notes referencing `com.videx.app` are stale. The `APP_VARIANT=development` build
(`npm run android:dev`) restores `com.videx.app.dev` so the dev app still installs next to
the Play release — see `app.config.js`.
