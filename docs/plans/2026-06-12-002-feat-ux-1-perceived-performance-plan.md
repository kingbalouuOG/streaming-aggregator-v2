# UX-1 Implementation Plan — Perceived performance & native-feel polish

**Status:** DRAFT for Joe's review.
**Source:** Joe's three post-E&P items (2026-06-12): (1) For You still feels slow / blank-page stare; (2) weird flash on Home + For You loads; (3) transitions should feel maximally app-native.
**Evidence base:** live preview instrumentation (rAF frame sampling, long-task tracing, fetch timing, localStorage audit) + best-practices research (Material 3 motion specs, Capacitor flash fixes, View Transitions API status, feed-loading patterns — URLs in §6).

## 0. What the instrumentation found

- **First For You mount after app start froze the main thread ~4s** (zero animation frames), then everything popped at once. Repeat visits: zero long tasks, instant. The freeze = items 1 AND 2 share a root cause.
- The slider-rerank **embedding hydration runs during first mount**: ~3MB network fetch + 200×1536 Float32Array conversion + a **3MB synchronous localStorage write** (entry confirmed at 3,021KB). It exists only to upgrade slider drags — it has no business in the first-paint window.
- The For You feed is **memory-only** client-side (TanStack `'foryou'` namespace deliberately excluded from the localStorage persister in PLAT-1) — every app launch starts from a skeleton even though the KV server cache is warm.
- The boot prefetch and the page's query are **separate requests**: tab in before the prefetch lands and you wait for a second full render.
- Research: native feed apps (Netflix/Disney+) paint the persisted last feed instantly and revalidate silently; skeletons only on true cold start. The Capacitor white flash has a specific known fix (backgroundColor at every layer + values-night theme). Material 3 tab switches = fade-through 200-300ms, compositor-only.

## 1. Workstreams

### W1 — Instant For You paint (stale-while-revalidate)
1. Add `'foryou'` to the persister's `PERSISTED_SOURCES` with a dedicated size guard: persist the render payload WITHOUT `pool.metadata`'s full text fields if the serialised entry would exceed ~700KB (measure first; the 198KB current total cache + ~300KB payload should fit comfortably under mobile quota next to the 3MB embedding entry).
2. On mount with persisted data: paint immediately (rows render from cached payload), refetch in background (staleTime 0 already does this), and **apply the fresh result only if the user hasn't scrolled/interacted** — otherwise hold it for next visit (research: never reflow under the thumb). Small `appliedAt` ref + scroll listener.
3. Bump `QUERY_CACHE_BUSTER`.
4. Sign-out path: verify `queryClient.clear()` covers the persisted feed (cross-user contamination guard — same concern as `clearEmbeddingCache`).

### W2 — One render, not two (prefetch shares the query)
Replace `prefetchForYouFeed`'s raw discarded fetch with `queryClient.prefetchQuery` using the page's exact key + fetcher (`['foryou','render',userId,providerStr,'own']` — the boot context can compute providerStr; sharedFilters arrives as 'own' default on first mount, matching). Early tab-in then ATTACHES to the in-flight render instead of firing a parallel one — the 9-15s first-ever case halves, and the skeleton shows real progress.

### W3 — Hydration off the critical path
1. Defer the post-apply embedding hydration block (`useForYouContent` worker-path applier) behind `requestIdleCallback` (fallback `setTimeout 1500ms`) AND gate it on first paint having happened.
2. Chunk the Float32Array conversion (e.g. 25 entries per idle slice) so no single task exceeds ~50ms.
3. The 3MB `setCachedEmbeddings` write moves inside the same idle path; consider `requestIdleCallback` + try/catch quota guard (already swallowed).
4. Slider drags before hydration completes degrade exactly as today (genreSpread fallback) — no behaviour change, just timing.

### W4 — Kill the flash at the source
1. `capacitor.config.ts`: top-level `backgroundColor` set to the app's paper/ink dark hex; `SplashScreen` plugin config aligned (same hex, `launchAutoHide: false`, hide after first React render).
2. Android: `windowBackground` in the launch theme + Android-12 `windowSplashScreenBackground` + **`values-night/` variants** (Samsung One UI force-dark quirk: light-only launch theme → white→dark flash; also add `uiMode` to `android:configChanges`).
3. `index.html` / root CSS: explicit `background-color` on `<html>`/`<body>` matching the same hex.
4. Verify on device with screen recording (the PLAT-1 frame-forensics workflow).

### W5 — Native-feel transitions (Material 3 fade-through)
1. Tab switches: replace the current AnimatePresence variant with **fade-through** — outgoing 90ms fade (accelerate `cubic-bezier(0.3,0,1,1)`), incoming 210ms fade + 92→100% scale (decelerate `cubic-bezier(0,0,0,1)`). Compositor-only (transform/opacity), no slides between tabs (slides are for push navigation — DetailPage keeps its push feel).
2. Heavy-mount rule: the entering element of a transition must be lightweight — For You/Browse enter with their skeleton shell; real content mounts after `onAnimationComplete` (or `startTransition`), preventing mid-animation jank.
3. Poster grids: `content-visibility: auto` + `contain-intrinsic-size` on below-fold rows; confirm `loading="lazy" decoding="async"` on ImageSkeleton; `fetchpriority="high"` on the For You hero + Home TODAY'S PICK images only.
4. Chunk-preload on press-down: pointerdown on a nav tab kicks the React.lazy chunk import before click commits (~100ms head start).
5. **View Transitions API: NOT now** — Baseline in WebView and viable same-document, but React 18 needs manual `flushSync` choreography and transitions aren't interruptible; AnimatePresence stays until React 19. Recorded as the revisit trigger.

## 2. Sequencing & gates

Order: W4 (config-only, instant win) → W1 → W2 → W3 → W5. Each workstream = one commit; gates per house rule (tsc, vitest, lint, build). Device pass after W4+W1 (the two visible wins) and again at close. The preview rig (launch.json now in repo) re-verifies W1/W3 with the same rAF/long-task instrumentation — acceptance: no frame gap >250ms on first For You mount, cold.

## 3. Acceptance

| Item | Evidence |
|---|---|
| For You feels instant on app open | persisted-feed paint <300ms (preview trace) + Joe's device verdict |
| No 4s first-mount freeze | rAF gap ≤250ms cold (preview), no long task >200ms in hydration window |
| No load flash | device screen-recording frame check, light AND dark boot |
| Native-feel tabs | Joe's device verdict (subjective gate, M3 specs as the baseline) |

## 4. Open questions (recommendations inline)

- **Q1 — Stale-feed staleness window:** persisted feed can be up to 24h old at paint (persister maxAge). Recommend: paint regardless of age but show the existing subtle refresh affordance; the background refetch corrects within ~1s on warm KV.
- **Q2 — Apply-fresh-while-viewing:** hold fresh results if the user has scrolled (recommended) vs always swap. Holding matches native apps; swap-on-next-visit is one ref.
- **Q3 — Scope of W5.2 (skeleton-first mounting):** apply to For You + Browse only (recommended) or all five tabs. Home is the boot tab (no transition-mount), Watchlist/Profile are light.

## 5. Explicitly out of scope

Real progress indicators on the skeleton, mood-refiner wiring (IN-V3-003), catalogue-age relabel (IN-PX-58), rate limiting (IN-PX-60), React 19 / View Transitions migration.

## 6. Research sources

M3 motion tokens: m3.material.io/styles/motion/easing-and-duration/tokens-specs · Capacitor splash/background: capacitorjs.com/docs/apis/splash-screen, github.com/ionic-team/capacitor/issues/3601 · View Transitions: developer.chrome.com/docs/web-platform/view-transitions, react.dev/reference/react/ViewTransition · content-visibility: web.dev/articles/content-visibility · skeleton vs SWR: blog.logrocket.com/ux-design/skeleton-loading-screen-design
