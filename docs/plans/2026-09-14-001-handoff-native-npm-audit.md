# Handoff: triage the native `npm audit` (IN-DEP-001)

**Date:** 2026-09-14 · **Parking lot:** IN-DEP-001 · **Follows:** PR #160 (root audit, 23 → 0) · **Start after:** #160 has merged to `main`

Paste everything below the line into a fresh Claude Code session.

---

Triage the `npm audit` advisories in `native/` of StreamingAggregatorV2 (the shipped Expo app). This is the native counterpart of PR #160, which cleared the root web tree. Work in a worktree branched off the current `main`, using relative paths.

## What is already established (do not re-investigate)

- **The native lockfile is healthy.** An older note said `native/package-lock.json` was stale. That was fixed by PR #106 (2026-08-27). On 2026-09-14 it matched `native/package.json` exactly (47 deps, 0 range mismatches, 0 missing entries). There is no hidden churn to work around.
- **Baseline:** `cd native && npm audit --omit=dev --package-lock-only` reported **29 (13 high, 16 moderate)**. Regenerate the full list yourself; only part of it was captured. Known chains:

| Package | Chain | Where it runs | First read |
|---|---|---|---|
| `axios` 1.17.0 (range 1.0.0–1.17.0) | direct, `^1.17.0` | **In the app.** `src/lib/api/tmdb.ts` + `omdb.ts` reach native through the `src/lib` junction; Metro resolves `axios` from `native/node_modules`. | Bump to `^1.20.0` (same major; root is already there). RN uses the XHR adapter, so the Node-adapter advisories have no path. Both clients send only fixed `baseURL`/`timeout`/`params`. |
| `decode-uri-component` 0.2.2 | `expo-router` → `query-string` 7.1.3 | **Probably in the app** (URL / deep-link parsing) | Fix is only via `--force`, i.e. a major. Establish reachability properly: which `expo-router` code calls it, and whether untrusted input (incoming deep links, share URLs) reaches it. Do not force it. |
| `image-size` 1.2.1 | `expo` → `@expo/metro` → `metro` | Build time (asset sizing) | Tooling. |
| `shell-quote` 1.8.4 | `react-native` → `react-devtools-core` | Dev tooling | Tooling. |
| `uuid` 7.0.3, `@xmldom/xmldom` 0.9.10 | `expo-splash-screen` → `@expo/config-plugins` → `xcode` (→ `simple-plist` → `plist`) | `expo prebuild` (iOS project generation), parses our own project files | Tooling. `uuid` needs `--force`. |
| `baseline-browser-mapping`, `brace-expansion`, `browserslist`, `js-yaml`, `nanoid`, `postcss` | various | Build tooling | Likely in-range updates. |

## Scope

- `native/package.json` and `native/package-lock.json` only.
- Upgrade deliberately, one dependency or group per commit, as #160 did:
  1. `axios` to `^1.20.0`.
  2. In-range transitive updates via `npm update <name…>` inside `native/`.
  3. Anything left is documented as not reachable (with evidence) or deferred (with a reason).
- **Do not** run `npm audit fix`, `npm audit fix --force` or `npx expo install --fix`. Do not change the Expo SDK, `react-native` or `expo-router` versions. Anything fixable only by a major is a deferral, not a change.
- Check the lockfile diff package by package for major-version changes. #160's commit history shows a small node script that does this.

**Out of scope:** the root tree (done in #160); retiring the legacy Capacitor wrapper (separate handoff, `2026-09-14-002`); an Expo SDK upgrade.

## Verification

1. Root `npm ci`, then `cd native && npm ci` (the postinstall creates the `src/lib` / `src/assets` junctions).
2. `npm run lint` in `native/` (0 errors; 1 pre-existing warning at `(tabs)/index.tsx:263`).
3. `npx tsc --noEmit` in `native/`. This needs the native install; note the baseline on `main` before judging.
4. Root `npm test` (the shared `src/lib` tests).
5. A JS bundle check that Metro still resolves everything, e.g. `npx expo export --platform android` in `native/`.
6. Do **not** trigger `android-release.yml` or `ios-release.yml` yourself: they sign and can upload to the stores. Ask Joe whether to cut a build, or ship the JS change via `expo-updates` OTA. The device check is Joe's: the TMDb-backed surfaces (Home rails, Browse discover, search, detail "More like this") load.

## Wiki and PR

- Read `videx-wiki/AGENTS.md` first. From the same worktree:
  - append a `videx-wiki/log.md` entry;
  - update the IN-DEP-001 row in `videx-wiki/wiki/registers/parking-lot.md` to its outcome, adding a row for anything deferred.
- Open one PR. Its body lists every advisory with a verdict: fixed, not reachable (with evidence), or deferred (with a reason).

## Footguns

- **Never recursive-delete inside `native/`.** It follows the `src/lib` junction and wipes the real shared tree (happened 2026-08-25). If it happens: `git restore src/lib`.
- **Write and edit through the worktree path,** not the main checkout's absolute path. Otherwise changes land off the PR branch.
- **Don't debug a local Android release build.** Windows `bundleRelease` hits an unresolved CMake/ninja loop. The Android build runs on GitHub Actions only.

## Confirm with Joe before acting

- If `decode-uri-component` (or anything else) turns out to be reachable from untrusted input in the app and only a major fixes it: defer to an Expo SDK bump, or mitigate in our own code?
- Ship the axios bump as an OTA update, or wait for the next store build?
