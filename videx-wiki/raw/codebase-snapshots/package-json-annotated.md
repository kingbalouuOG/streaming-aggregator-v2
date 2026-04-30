---
title: package.json Annotated
generated: 2026-04-26
source: package.json
---

# package.json Annotated

Why each non-trivial dependency is in the tree. Pinned versions live in `package.json`; this is intent, not version pinning.

## Runtime dependencies

| Package | Why |
|---|---|
| `react`, `react-dom` (v18) | UI runtime. |
| `motion` (`motion/react`) | Animations and bottom-sheet gestures. Chosen over Framer Motion for smaller bundle and clearer ESM. |
| `sonner` | Toast notifications. Lightweight, accessible. |
| `lucide-react` | Icon set. Tree-shakable. |
| `@supabase/supabase-js` | Auth, DB, Edge Functions, Storage. |
| `@capacitor/core`, `@capacitor/android` (v8) | Native Android wrapper. iOS deferred. |
| `@capacitor/network` | Online/offline detection (`useNetworkStatus`). |
| `@capacitor/app` | Lifecycle events (`appUrlOpen`, `appStateChange`). |
| `@capacitor/browser` | In-app browser fallback for unsupported deep links. |
| `@capacitor/app-launcher` | `AppLauncher.openUrl()` for native intent-based deep linking. |

## Build / dev dependencies

| Package | Why |
|---|---|
| `vite` (v6) | Build tool. ESM-native, fast HMR, used in dev with `LIVE_RELOAD` env for Capacitor live reload. |
| `@vitejs/plugin-react` | React Fast Refresh. |
| `typescript` | Strict mode. `tsconfig.json` extends Vite default with strict null checks. |
| `tailwindcss` (v4 alpha) | Utility CSS. v4 syntax via `@theme` block in `index.css`. |
| `eslint`, `@typescript-eslint/*` | Lint. Config in `eslint.config.mjs`. |
| `tsx` | Run TypeScript scripts directly (`npx tsx scripts/sync-content.ts`). |
| `@types/*` | Type stubs. |

## Scripts

| Script | Purpose |
|---|---|
| `dev` | Vite dev server, port 3000. |
| `build` | TypeScript check + Vite build to `dist/`. |
| `preview` | Local preview of `dist/`. |
| `lint` | ESLint over `src/`. |
| `cap:sync` | Wraps `npx cap sync android` with optional `LIVE_RELOAD` substitution into `capacitor.config.ts`. |

## Notes on omissions

- **No router library.** Route state lives in `App.tsx` and is dispatched via `setSelectedItem` / `setActiveTab`. Two-screen-deep navigation; library overhead not justified.
- **No state management library.** React Context for auth and theme; everything else is per-component or per-hook. Recommendation pipeline state is hook-local.
- **No HTTP client (axios, ky).** `fetch` plus a minimal `cache.ts` wrapper. SA API and OMDB calls happen server-side only.
- **No analytics SDK.** Onboarding events go to a Supabase table via `lib/analytics/logger.ts`. Recommendation signals go to `user_interactions`.
- **No CSS-in-JS.** Tailwind v4 only.
- **No date library.** Date formatting uses `Intl.DateTimeFormat`; date math uses raw `Date`.
- **No test framework yet.** `tests/` exists with Playwright fixtures; unit testing is ad-hoc via `tsx` script execution.
