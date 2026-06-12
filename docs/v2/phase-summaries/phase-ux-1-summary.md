# Phase UX-1 — Perceived performance & native-feel polish: Summary

**Status:** Complete, 2026-06-12 (single-day phase). Joe's device verdict: "not perfect, but better" — residuals filed as IN-PX-61.
**Branch:** `phase-ux-1-perceived-performance`.
**Plan:** `docs/plans/2026-06-12-002-feat-ux-1-perceived-performance-plan.md` (post-E&P; Joe's three items: For You felt slow/blank, load flash on Home+For You, transitions short of native feel).

## 1. Method note (the phase's real lesson)

Every fix in this phase was found and verified by **frame forensics**: `adb screenrecord` driven by scripted `am start`/`input tap` sequences, frames extracted with OpenCV (no ffmpeg on the machine), brightness/diff timelines to locate events, then eyeballing the exact frames. Plus a live preview rig (rAF gap sampling, long-task tracing) for web-reproducible cases. The user's words ("white flash", "twitch", "nothing then bang") mapped to *measurable, distinct* causes — three rounds of them, each only visible after the previous was fixed.

## 2. What shipped (commit order)

1. **W4 — flash at the native layers:** `#0a0a0f` everywhere — capacitor `backgroundColor`, `windowBackground` + Android-12 `windowSplashScreenBackground`, NEW `values-night` theme (Samsung One UI force-dark quirk), inline pre-CSS `html/body` background.
2. **W1+W2 — instant For You:** `'foryou'` joins the persisted query namespaces (Map-aware serialize/deserialize — pool.metadata is a Map, plain JSON flattened it to `{}`); sign-out clears the query cache on both paths; fresh background results HELD if the user has scrolled (no reflow under the thumb). Boot prefetch goes through `queryClient.prefetchQuery` with the page's key — early tab-ins attach to the in-flight render.
3. **W3 — the 4s freeze:** preview tracing caught the slider-hydration block (3MB embedding fetch + Float32Array conversion + 3MB sync localStorage write) freezing the main thread on first mount; deferred to `requestIdleCallback` (1.5s cap).
4. **W5 — M3 fade-through** on all page transitions (90ms exit accelerate / 210ms enter decelerate + 92→100% scale), replacing flat 0.18s fades. View Transitions API researched, deliberately deferred to React 19.
5. **Keep-alive tabs (the big one):** frame evidence showed `AnimatePresence mode="wait"` remounting the entire page per tab switch — ~300ms blank + every image re-popping. Home + For You now stay mounted once visited, display-toggled; the tab wrapper key is static (instant switches); light tabs unchanged; detail/anchor pushes keep their animation. Plus LQIP `brightness()` clamp.
6. **Staged entrance (`<Reveal index>`):** sections cascade top-to-bottom (fade + 14px rise, 60ms stagger, M3 decelerate) on the once-per-session mount — late-arriving data joins the same motion, turning staggered loading into choreography.
7. **The white flash, actually:** a 50% LQIP clamp still painted sky-bright backdrops as a pale slab (capture: hero luminance 85 vs page 10) → deepened to `brightness(0.35)` (dark ghost that brightens into the artwork). And the feed cache key's sharedFilters suffix differed between prefetch and mount, defeating persistence + sharing → suffix dropped.
8. **Splash holds until first paint** (Joe's article sweep → the classic Capacitor double-splash fix): `launchAutoHide: false`, App hides two rAFs after mount with a 220ms fade. Final capture: dark splash ~3s warm → fully-composed Home in ONE transition.

## 3. Acceptance evidence

- Tab switches Home↔For You: **single-frame swaps** (was: 12-frame burst with ~300ms blank + staged pops).
- Final launch capture: **zero post-content blank frames, zero LQIP washes**; remaining brightness events are real artwork settling (designed).
- Slider re-ranks/scroll positions survive tab switches (keep-alive); regression-checked on device.
- Gates green throughout (tsc 0, vitest 154/154, lint 0); preview-verified before each device pass.

## 4. Gotchas recorded

- `monkey -p <pkg> 1` injects a RANDOM event — it polluted one capture by opening a detail page. Use `am start -n <pkg>/.MainActivity` for scripted launches.
- `screenrecord` captures black if the screen sleeps mid-run (`svc power stayon usb` for sessions; REVERTED after).
- Pull the mp4 only after the recorder finalises (~2s past time-limit) or the moov atom is missing.
- TanStack persister + Map payloads = silent `{}` corruption without custom serialize/deserialize.
- A query-key component that differs between prefetch and mount silently defeats both caching layers.

## 5. Follow-ups

IN-PX-61 (first-load polish residuals — boot-gate duration, cascade tuning with Joe, row-thumbnail tiering). The D4/IN-PX-59 clock and IN-PX-58/60 unchanged.
