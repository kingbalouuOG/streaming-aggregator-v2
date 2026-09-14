# Handoff: retire the legacy Capacitor Android wrapper (IN-DEP-002)

**Date:** 2026-09-14 · **Parking lot:** IN-DEP-002 · **Decision:** Joe approved deleting the legacy Capacitor build path, 2026-09-14 · **Start after:** PR #160 has merged. It edits the same root `package.json` and `package-lock.json`.

Paste everything below the line into a fresh Claude Code session.

---

Retire the legacy Capacitor Android wrapper from the root of StreamingAggregatorV2. Joe approved the deletion on 2026-09-14. Work in a worktree branched off the current `main`, using relative paths.

## What is already established (do not re-investigate)

- The shipped app is the Expo app in `native/`, live since the NATIVE-4 cutover. It generates its own `native/android/`, which is gitignored and produced by `expo prebuild`. Signing comes from `native/plugins/withReleaseSigning.js`.
- `android-release.yml`, `ios-release.yml` and `ota-update.yml` operate only on `native/`. No CI workflow runs `cap sync` or builds the root `android/`.
- The root README already calls `android/` legacy (lines ~22, ~69, ~98).
- `@capacitor/cli` is needed by nothing that ships. Its only consumers are the `cap:*` scripts and a type-only import in `capacitor.config.ts`, which sits outside the tsconfig `include`.

## Delete

- The tracked root `android/` (78 files, incl. `keystore.properties.example`). Use `git rm -r android` so only tracked files go. **The path is root `android/`, never `native/android/`.**
- `capacitor.config.ts`.
- The root `package.json` scripts `cap:sync`, `cap:open`, `build:android` and `dev:android`.
- `@capacitor/cli` and `@capacitor/android`, via `npm uninstall`.
- `scripts/gen-android-icons.py`. It writes into `android/app/src/main/res` by a hardcoded absolute path; confirm nothing else references it.
- The now-dead config:
  - `eslint.config.mjs` ignores for `'android/**'` and `'capacitor.config.ts'`;
  - the `.gitignore` "Capacitor Android build artifacts" block and `android/keystore.properties`.

  Keep the generic `*.keystore` and `keystore.properties` ignores; they still protect credentials anywhere in the tree.
- The README references: describe `native/` as the only app build.

## Keep (out of scope)

- **The `@capacitor/*` runtime packages** (`core`, `app`, `app-launcher`, `device`, `filesystem`, `haptics`, `network`, `splash-screen`, `status-bar`, …). `src/` still imports them: `App.tsx`, `lib/openDeepLink.ts`, `lib/lifecycle/appState.ts`, `lib/storage/userExport.ts`, `lib/recommendations-v2/pipelineContext.ts`, `hooks/useNetworkStatus.ts`, `components/ThemeContext.tsx`, `components/TasteSlider.tsx`, `components/auth/NoConnectionScreen.tsx`. The `capacitor` chunk in `vite.config.ts` stays too.
  - Check each runtime package for imports. `@capacitor/browser` showed none in a quick grep. List any with zero imports in the PR body as candidates, but do not remove them here.
  - Whether the web tree keeps its native paths at all is a separate question.
- **Historical documents:** leave as written. That covers `docs/v2/native-4-cutover-runbook.md`, `docs/plans/*`, phase summaries, solutions and `videx-wiki/log.md` history.
- `native/`: do not touch it.

## Verification

1. Root `npm ci`, `npx tsc --noEmit`, `npm run lint` (0 errors), `npm test`, `npm run build`, `npm audit`.
2. Lockfile diff: removals only. No remaining package should change version; check package by package (#160 used a small node script).
3. `grep` for leftovers across the non-historical tree: `cap sync`, `npx cap`, `capacitor.config`, `@capacitor/cli`, `@capacitor/android`, and root `android/` paths. Search the `.github/`, `scripts/`, `src/`, `workers/` and `README.md` / `docs/CONVENTIONS.md` paths, plus current wiki pages.
4. `cd workers/api && npm ci && npx wrangler deploy --dry-run --outdir=<scratch>`. It should still bundle; the Worker never imported Capacitor.

## Wiki and PR

- Read `videx-wiki/AGENTS.md` first. From the same worktree:
  - append a `videx-wiki/log.md` entry;
  - mark IN-DEP-002 ✅ in `wiki/registers/parking-lot.md`;
  - grep `videx-wiki/wiki/` (not `raw/`, not the log) for pages that describe `android/` or `cap sync` as current, e.g. `wiki/concepts/architecture/platform-architecture.md` and any Capacitor entity page, and mark the wrapper retired.
- Open one PR. Its body lists what was deleted, what was deliberately kept and why, and the verification results.

## Footguns

- **Never recursive-delete inside `native/`.** It follows the `src/lib` junction and wipes the shared tree. If it happens: `git restore src/lib`. Prefer `git rm` for everything in this task.
- **Write and edit through the worktree path,** not the main checkout's absolute path.
- **Don't delete Joe's local signing files.** The main checkout may hold an untracked, gitignored `android/keystore.properties` or keystore. A worktree will not have them, and this PR must not try to delete them. Mention in the PR that Joe can remove his local copy by hand after merge, once he's confirmed the Play upload key lives with the native build.

## Confirm with Joe before acting

- Nothing is expected. If any file under `android/` turns out to be referenced by the native build or a workflow (it should not be), stop and ask.
