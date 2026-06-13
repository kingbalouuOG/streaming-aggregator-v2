# Phase NATIVE-2 — Design fidelity + core loop: Summary

**Status:** Code-complete 2026-06-13; awaiting Joe's on-device review (the phase gate). Home (W1–W3) verified on device; Detail/auth/Watchlist/Browse/For You (W4–W6) are build-green (tsc 0, bundles, release APK runs) but NOT yet device-verified — the phone disconnected partway through and Joe's review is the on-device pass.
**Branch:** `phase-native-2-core-loop` (stacked on NATIVE-1 / PR #23; rebase onto main when #23 merges).
**Plan:** `docs/plans/2026-06-12-005-feat-phase-native-2-core-loop-plan.md`.

## What shipped (commit order)

1. **W2 — shared-tree extensions:** `link-shared.js` now also junctions `native/src/assets` → `src/assets` (service logo PNGs, no binary dup). `fetchEditorNote` + fallback + TTL moved to `src/lib/api/editorNote.ts` (web hook re-imports; native renders the same note through the same module).
2. **W1 — typography:** Fraunces 600/700/800 + DM Sans 400/500/700 via `@expo-google-fonts`, loaded behind the splash hold (a system-font flash is the native white-flash). Per-cut Tailwind families (`font-display[-bold|-black]`, `font-sans[-medium|-bold]`) — RN can't synthesize weights for custom fonts.
3. **W3 — Home composition parity:** `MagazineHero` (4:5 poster full-bleed under the status bar, 3-stop gradient, dash+kicker, Fraunces 36 title, standfirst, Play-on-service pill, glass bookmark/info, meta line, ServiceBadge over junctioned PNGs), `EditorNoteCard`, `BrowseChips`. Home recomposed hero → note → chips → Top-on rows. **Verified on device** against the production app — typography + hero anatomy match. Hero service attribution fix so the Play pill + badge always render (chart guarantees the service even when the adapted `ContentItem.services` is empty).
4. **W4 — Detail page + Stack-over-Tabs nav:** routing restructured to root `Stack` (fonts + query + auth) wrapping `(tabs)` group + `detail/[id]`. Native `useContentDetail` re-orchestrates the SAME shared lib as web (`fetchMergedTitle` + `getStreamingLinks` + `buildDetailData`). Editorial hero, meta, IMDb/RT badges, genre pills, expandable description, **3-tier Where to Watch firing real deep links** (shared resolver + `openDeepLink.native` → RN Linking → ACTION_VIEW), cast strip, More Like This (TMDb similar; embedding re-score deferred). Hero + cards navigate to detail.
5. **W6 — auth + session:** `supabase.native.ts` (MMKV-backed session storage, `detectSessionInUrl: false`). Native `AuthProvider`/`useAuth` wraps `supabase.auth` and mirrors state into the storage layer's auth routing (`setAuthState`) so watchlist/prefs flip to the Supabase backend when signed in. `AuthScreen` (sign-in/sign-up toggle, "Welcome back." design). Root layout gates: initializing → spinner, signed-out → AuthScreen, signed-in → router Stack.
6. **W5a — Watchlist:** `useWatchlist` (React Query over shared `storage/watchlist.ts`) with `WatchlistItem`↔`ContentItem` mappers (raw TMDb-path extraction keeps native-added rows consistent with web/Supabase data). Watchlist tab (want-to-watch / watched segments, 2-col grid). Detail page gains `WatchlistActions` (Add-to/In-Watchlist + Mark-as-Watched), state derived from the shared query so tab and detail stay in sync.
7. **W5b — Browse/Search:** Mode A keyword search over shared lib (TMDb `/search/movie` + `/search/tv` ∥ Postgres ILIKE, merged/deduped/re-ranked via `reRankSearchResults`). Debounced input, All/Movies/TV/Docs pills, 2-col results. Shared `PosterGridCard` extracted (reused by Watchlist).
8. **W5c — For You:** native render over `tryRenderForYouWorker` (Worker path only). MagazineHero top pick + flat rows (Recommended / Hidden gems / Outside your usual / From your watchlist). Null payload → "warming up" retry.

## Shared-tree changes (web stays green: tsc 0, 154 tests, lint 0)

- `src/lib/api/editorNote.ts` (new) — note fetch extracted from `useHomeContent`.
- `src/lib/types/content.ts` — already canonical from NATIVE-1; `SERVICE_DISPLAY_NAMES` reused.
- **`src/lib/recommendations-v2/edgeRender.ts` — `readAccessToken` made isomorphic:** was a synchronous `localStorage` scan for `sb-<ref>-auth-token`; now `async` via `supabase.auth.getSession()`. Works under Hermes AND removes a web localStorage dependency (web reads the same session). Only caller updated. This is the key unlock for native For You.
- `src/lib/supabase.native.ts` (new shadow) — MMKV-backed auth storage.

## Deferred (NATIVE-3 seeds)

- **Onboarding** (services + taste quiz) — until it exists, For You depends on a pre-existing profile (Joe's account has one; brand-new native sign-ups get the "warming up" state) and Home/For You use a hardcoded `DEV_SERVICES` set instead of saved prefs.
- Browse **filter sheet** (genres/services/cost/runtime/rating) + **semantic mood chips** (Mode C); **recent searches** persistence.
- Detail: thumbs rating, Not-Interested, report-availability sheet, dwell/impression instrumentation (need the signal-capture wiring + auth-bound interactions).
- For You: anchor-room / because-you-watched / more-from-person rows (richer card types); the localStorage-bound **client fallback pipeline** (`embeddingCache`/`hardFilters` would need `.native` shadows) — native uses the Worker path only.
- Password recovery / account deletion / username checks in auth.
- Light ("paper") theme; query persistence to MMKV; exact native dep-version pinning to root.
- **Native ESLint config** — `expo lint` currently ignores `src/` (template misconfiguration); tsc + bundle are the gates meanwhile.

## Gates

Web: tsc 0, vitest 154/154, lint 0 errors, vite build green. Native: tsc 0, `expo export` bundles, release APK builds + installs. **Device verification of W4–W6 is outstanding** (Joe's review).

## Follow-ups

Joe's device pass on `Videx Dev` (Home/Detail/Watchlist/Browse/For You + sign-in with joegreenwas@gmail.com, deep-link tap on a Where-to-Watch row). Then NATIVE-3 (onboarding + the deferred items above).
