# NATIVE-2 Implementation Plan — Design fidelity + core loop

**Status:** Active (Joe pre-approved: "crack on", priority = design alignment with the current app). Redlines welcome async — this doc is the contract.
**Branch:** `phase-native-2-core-loop` (stacked on `phase-native-1-expo-shell` / PR #23; rebases onto main when #23 merges).
**Source of truth for design:** `docs/design/design-system.md` + the web components themselves (MagazineHero, ContentRow, EditorNote).

## Work items (design-first ordering, per Joe's emphasis)

### W1 — Typography (the single biggest "looks like Videx" lever)
Fraunces (display) + DM Sans (UI) via @expo-google-fonts, loaded in the root layout behind the splash hold (UX-1 lesson: no font-swap flash). Tailwind `font-display`/`font-sans` wired to the loaded names. All NATIVE-1 components move off system font.

### W2 — Shared-tree extensions
1. Second junction `native/src/assets` → `../src/assets` (service logo PNGs — same link-shared.js pattern; no binary duplication).
2. `fetchEditorNote` moves from `src/hooks/useHomeContent.ts` into `src/lib/api/editorNote.ts` (with the fallback note) — web hook imports from lib; native imports the same module. ADR-014 spirit: copy nothing.

### W3 — Home composition parity (target: the production Home screenshot)
1. **MagazineHero port** (design-system §4): 4:5 poster (NOT backdrop — fixes the NATIVE-1 hero gap by spec rather than by data), expo-linear-gradient bottom scrim, dash+kicker, Fraunces 36/800 title, optional standfirst (item.overview), white "Play on {Service}" pill + glass bookmark/info squares, meta line with star rating, top-right ServiceBadge.
2. **ServiceBadge** native component over the junctioned logo PNGs.
3. **EditorNoteCard** — orange monogram + kicker + teaser, from the shared fetch.
4. **Browse By chip row** (All / Movies / TV Shows / Docs / Anime) — taps route to the Browse tab (filter wiring lands with the Browse screen, W5).
5. Home order: hero → editor's note → browse chips → "Top on" rows (+ Just In when the section fetcher is identified in lib).

### W4 — Detail page (core loop part 1)
Backdrop header, title block, ratings, availability rows with deep-link buttons (openDeepLink.native), overview, cast strip. Data via `fetchMergedTitle` (lib) + supabaseContent streaming links — both shared already.

### W5 — Browse + Watchlist + For You (core loop part 2)
Browse: search input + grid (FlashList masonry) over the shared search lib. Watchlist: shared storage/watchlist.ts. For You: server render via edgeRender (needs auth — see W6).

### W6 — Auth + session
Supabase auth (email/password) with MMKV-backed session storage; signal capture (impressions/dwell) parity wiring.

### Housekeeping (rides whichever work item touches it first)
Pin native dep versions exactly to root's; perServiceChart's private SERVICE_DISPLAY_NAMES → types/content; query persistence to MMKV; edgeRender localStorage → storage adapter (gates W5's For You).

## Gates
Same as NATIVE-1: web tsc/vitest/lint/build green at every commit; native tsc + expo export; device screenshot comparison against the production app for each screen (CC verifies visually via adb before claiming parity).

## Out of scope
Onboarding flow, theme switching (light mode), NativeTabs migration, cutover mechanics (NATIVE-3/4).
