---
title: Phase NATIVE-2 — Design fidelity + core loop
type: concept
tags: [react-native, expo, capacitor-migration, native, auth, watchlist, search, for-you]
created: 2026-06-13
updated: 2026-06-13
sources:
  - docs/v2/phase-summaries/phase-native-2-summary.md
related:
  - wiki/concepts/operations/phase-native-1.md
---

# Phase NATIVE-2 — Design fidelity + core loop

Second phase of the Capacitor → React Native migration. Brings the native app from "one Home screen" (NATIVE-1) to the full core loop + Videx brand typography. Code-complete 2026-06-13; Home (W1–W3) and AuthScreen (W6) verified on device, signed-in screens build-green pending Joe's signed-in review.

## What shipped

- **Typography (W1):** Fraunces + DM Sans via `@expo-google-fonts`, splash-held to avoid a system-font flash. Per-cut Tailwind families (RN can't synthesize weights).
- **Home parity (W3):** `MagazineHero` (4:5 poster, gradient, Play-on-service pill, ServiceBadge over junctioned logo PNGs), `EditorNoteCard`, `BrowseChips`. Verified to match the production app.
- **Detail (W4):** Stack-over-Tabs routing (`detail/[id]` pushes over the tab bar). `useContentDetail` re-orchestrates the same shared lib as web. 3-tier Where to Watch fires real deep links via `openDeepLink.native`.
- **Auth (W6):** `supabase.native.ts` (MMKV session storage), `AuthProvider`/`useAuth`, sign-in/up screen, root auth gate.
- **Watchlist / Browse / For You (W5):** over the shared storage, search, and Worker-render libs respectively.

## Key shared-tree change

`edgeRender.readAccessToken` went from a synchronous `localStorage` scan (`sb-<ref>-auth-token`) to `async supabase.auth.getSession()` — **isomorphic**: works under Hermes and removes a web localStorage dependency (web reads the same session). This is what lets native For You authenticate to the Worker. Pattern: prefer `getSession()` over scanning storage for the token.

## Architecture notes

- Native For You uses the **Worker render path only** (`tryRenderForYouWorker`); the localStorage-bound client fallback (`embeddingCache`/`hardFilters`) is not ported — a Worker miss shows a retry state.
- `editorNote` fetch moved to `src/lib/api/editorNote.ts` so web and native render the same note (ADR-014 pattern: copy nothing).
- Second junction `native/src/assets → src/assets` for shared logo PNGs.
- Watchlist stores raw TMDb image paths (extracted from full URLs on add) so native rows stay consistent with web/Supabase data.

## Gotcha — junction placement crashes React

`native/src/lib` and `native/src/assets` are junctions into the shared tree. A React-hook file (`auth.tsx`) accidentally written under `native/src/lib` resolved its `react` import to the ROOT `node_modules` (not `native/node_modules`) → a **second React instance with a null hooks dispatcher** → `useState`-of-null crash at launch. Pure shared-lib modules are unaffected (no hooks). **Rule: only PURE modules under the junctioned paths; React components live in real native dirs (`native/src/{components,hooks,providers,app}`).** tsc + `expo export` both passed — only running on device surfaced it. Lesson: a green bundle is not a running app.

## Deferred to NATIVE-3

Onboarding (services + taste quiz — For You currently needs a pre-existing profile and uses a hardcoded `DEV_SERVICES` set), Browse filter sheet + semantic mood chips, detail rating/report/instrumentation, For You anchor-room/person rows, password recovery, light theme, query persistence, native ESLint config (template ignores `src/`).
