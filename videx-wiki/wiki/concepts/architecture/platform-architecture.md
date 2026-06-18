---
title: Platform Architecture — one repo, three surfaces, one engine
type: concept
tags: [architecture, monorepo, platform, native, workers, shared-tree, adr-014, orientation]
created: 2026-06-18
updated: 2026-06-18
sources:
  - docs/v2/native-4-cutover-runbook.md
  - docs/v2/phase-summaries/phase-native-4-and-polish-summary.md
related:
  - wiki/concepts/decisions/adr-014-single-server-engine.md
  - wiki/entities/codebase/module-map.md
  - wiki/concepts/operations/phase-native-4-and-polish.md
  - wiki/concepts/operations/phase-history.md
---

# Platform Architecture — one repo, three surfaces, one engine

**Read this first to orient on the codebase.** Videx is a **single Git repository** — `StreamingAggregatorV2` (GitHub `kingbalouuOG/streaming-aggregator-v2`). As of the **2026-06-18 consolidation** there is **one working folder**: the old `videx-native` worktree was retired and the native app now lives at `native/` inside the main repo. (Git worktrees still in play: the repo's own `main` checkout, plus any ephemeral `.claude/worktrees/*` scratch dir — both auto-managed, not separate projects.)

## Top-level layout

| Path | What | Runtime |
|---|---|---|
| `src/` | The **web** app — React 18 + Vite 6 + Tailwind v4. | Browser |
| `src/lib/` | The **shared engine** — `recommendations-v2/`, `taste-v2/`, `adapters/`, `api/`, `storage/`. The one tree every surface imports. | (library) |
| `native/` | The **LIVE product** — React Native 0.85 / Expo SDK 56 Android app (`app.videx.streaming`, v2.0.0). | Android (Hermes) |
| `workers/api/` | `videx-api` — Cloudflare Worker: TMDb/OMDB proxy + `GET /v1/foryou` server-rendered feed + KV cache + recompute cron. | Cloudflare |
| `supabase/` | Migrations + Edge Functions (Deno). | Supabase |
| `scripts/` | Build / sync / eval tooling (run via `tsx`). | Node |
| `videx-wiki/` | This knowledge base (Git-tracked, committed alongside phase work). | — |
| `docs/` | Strategy, phase summaries, runbooks. | — |

## Three runtime surfaces, one engine (ADR-014)

The recommendation + taste engine in `src/lib/` is the **single source of truth**, imported directly by all three surfaces — no mirrors (see [ADR-014](../decisions/adr-014-single-server-engine.md), which retired the old `_shared/` Edge mirror):

- **Web** (`src/`) — Vite bundles `src/lib` normally.
- **Cloudflare Worker** (`workers/api/`) — imports `src/lib/recommendations-v2` + `taste-v2` directly. Constraint: those modules must stay importable **outside Vite** — lazy Supabase singleton, no `import.meta.env` at module top-level.
- **Native** (`native/`) — Metro resolves the shared tree via a **junction**: `native/src/lib` → `../src/lib` (and `native/src/assets` → `../src/assets`), created by `native/scripts/link-shared.js` on `npm install` (postinstall). **Consequence:** native-only React code must NOT live under `native/src/lib` — that path *is* the shared tree, where `react` resolves to the root copy and hooks crash with "Cannot read property 'useState' of null". Native React lives under `native/src/{app,components,hooks,providers}`.

## Native app specifics

- **Routing/UI:** `native/src/app/` (expo-router, typed routes); New Architecture / Bridgeless + Hermes; NativeWind 4 styling.
- **First-time setup (fresh checkout):** `cd native && npm install` (runs `link-shared.js` → creates the junctions) + hand-copy `native/.env` (mirrors the `EXPO_PUBLIC_*` vars from the root `.env`).
- **Release build:** `npx expo prebuild --platform android --clean` regenerates the gitignored `android/`, then recreate `native/android/local.properties` (`sdk.dir=…`), then `cd android && ./gradlew bundleRelease`. Release **signing auto-injects** via the Expo config plugin `native/plugins/withReleaseSigning.js` (Play **upload** key SHA-256 `99:CE:FF:7E`; `allowBackup=false`). Full steps live in the native release-rebuild runbook.
- **Lint:** `npx expo lint` (config `native/eslint.config.mjs`, which reuses the root-hoisted plugins — the repo-root `eslint.config.mjs` deliberately ignores `native/**`).

## What changed at the NATIVE-4 cutover

The Expo app **replaced** the old Capacitor WebView build (still in git history, no longer the product — see [phase-history](../operations/phase-history.md)). Package id flipped `com.videx.app.dev` → `app.videx.streaming`; version → 2.0.0. The `@capacitor/*` entries in the root `package.json` are legacy to the web build; the live mobile product is the Expo app under `native/`.
