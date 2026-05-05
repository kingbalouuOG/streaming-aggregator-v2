# IN-466 — Server-side For You render via Edge Function

**Status:** Shipped April 2026.
**Branch:** `phase-4.5-mood-rooms` (continuation).
**Predecessors:** Phase 4 (ranking pipeline), Phase 4.5 (anchored mood rooms + cold-start quick wins).
**Successors:** IN-467 (mirror consolidation), IN-468 (Variant B SWR cache), IN-469 (cold-start mitigation continuation).

## §1 — What landed

A single Edge Function (`supabase/functions/render-foryou-rows/`) replaces the For You first-paint data path. Where `useForYouContent` previously fired 5-8 sequential client → Postgres round trips (taste profile + filter sets ×4 + candidate pool RPC + extended metadata + anchor selection ×5 + per-anchor room generation ×5), it now fires one client → Edge Function call returning the full first-viewport payload.

Files added:

- `supabase/functions/render-foryou-rows/index.ts` — orchestrator.
- `supabase/functions/_shared/recommendations-v2/` — full mirror of `src/lib/recommendations-v2/` (types, weights, recency, contextual, diversity, titleAdapter, hardFilters, ranker, anchoredRoom, anchorSelection).
- `supabase/functions/_shared/taste-v2/` — mirror of `src/lib/taste-v2/types.ts`, `tasteClusters.ts`, `tasteProfileV2.ts` (read paths only).
- `supabase/functions/_shared/userScope.ts` — service-role client factory + JWT decoder + `withUserScope(uid)` helper (the defence-in-depth replacement for RLS).
- `src/lib/recommendations-v2/edgeRender.ts` — client wrapper with 1.5s timeout + fallback contract.
- `src/lib/recommendations-v2/edgeWarmup.ts` — Variant A warm-pinger logic (extracted from App.tsx during the simplification pass; exports `warmRenderForYou(providerIds)` and a shared `readAccessToken()` helper).
- `scripts/_inspect_foryou_parity.mjs` — soundness probe.
- `scripts/_measure_foryou_pool_size.mjs` — pool size measurement (used during the build to lock decision 3).
- `.github/workflows/shared-tree-drift.yml` — CI check enforcing `src/lib/` ↔ `_shared/` lockstep.
- `videx-wiki/wiki/concepts/decisions/adr-012-server-side-foryou-render.md`.

Files deleted during the simplification pass (after code review, 2026-04-30):

- `supabase/functions/auth-spike/index.ts` — throwaway from the auth-model spike. Local file deleted; deployed instance can be torn down via Supabase dashboard.
- `supabase/functions/warmup-foryou/index.ts` — original Variant A scaffold (warmed a separate function instance, didn't help). Superseded by App.tsx firing `render-foryou-rows` directly. Local file deleted; deployed instance can be torn down via Supabase dashboard.

Files modified:

- `src/hooks/useForYouContent.ts` — Edge path with client fallback; new `prebuiltAnchorRooms` field.
- `src/hooks/useAnchorMoodRooms.ts` — accepts optional `prebuiltRooms` parameter; short-circuits selection + room generation when present.
- `src/components/ForYouPage.tsx` — passes `prebuiltAnchorRooms` through.
- `src/App.tsx` — fires `warmup-foryou` at mount.

## §2 — Decisions made (with reasoning)

| # | Decision | Choice | Why |
|---|---|---|---|
| 1 | Pipeline porting layout | Mirror copy into `supabase/functions/_shared/` (per ADR-011) | Brief specified `render-foryou-rows/_pipeline/` which violates ADR-011 outright. The locked `_shared/` pattern is also strategically better — Phase 5's detail-page "More Like This" Edge Function will reuse the same modules. Drift control via CI workflow. |
| 2 | Watchlist source | Server-read from `watchlist` Supabase table | The brief promised "no client state in request body beyond services array." Confirmed `watchlist` table is kept in sync by the client's writes. Edge case: offline add not yet synced → Edge Function won't filter it. Self-heals on next render. |
| 3 | Pool in response payload | Include full pool (~25 KB gzipped) | Measured against Joe's account via `_measure_foryou_pool_size.mjs` — well under the 150 KB threshold. Slider drag rerank stays client-side and instant. Stripped `PoolItem` shape designed but not needed. |
| 4 | Auth model | Service-role + manual JWT decode + `withUserScope(uid)` helper | `auth-spike` measured user-JWT-scoped reads at ~80ms warm per query for RLS overhead, plus ~80ms for `getUser`. Across 5-8 critical-path queries, that's ~280ms of pure auth/RLS cost in a 600ms p50 budget. Service-role bypasses RLS; the wrapper is the safety net (every user-owned read filtered by `user_id` automatically; raw `client.from()` only for non-user tables). |
| 5 | Telemetry | Console only for v1 | Cowork-approved. No Sentry/Datadog wired in the codebase, so TestFlight/device observability is via `adb logcat` grep. Joe greps `[useForYouContent] edge:` for success-path latency and `[edgeRender] ... fall back` for fallback rate. Migration 036 deferred. |
| 6 | localStorage SWR snapshot | Deferred | Per Cowork: "ship Edge Function FIRST, measure, then add snapshot." Filed as IN-468. Revisit if measured warm p95 > 1.0s post-launch. |
| 7 | New ADR-012 | Filed | Architectural commitment ("For You first paint runs server-side") deserves a wiki ADR. |
| 8 | Staged paint vs single payload | Single payload | Cowork: at sub-1s warm wallclock, the perceptual gap between "all rows together" vs "fast subset first" collapses. Staged would pay an extra RTT for nothing. |
| 9 | LLM labels in Edge Function | Out — cache-read only | OpenAI roundtrip on cache miss is 200-1000ms; would blow p95 single-handedly. Cache hit returns label; cache miss returns null and the existing client `requestAnchorLabel` resolves it post-paint. |
| 10 | Parity probe scope | Soundness checks + cross-call determinism + filter-leak validation | Per Cowork's expansion: scores not just order, filter-set sizes, anchor-tier breakdown, slider echo, repeat-call determinism. Implemented in `scripts/_inspect_foryou_parity.mjs`. |
| 11 | Edge timeout | 1.5s (tightened from brief's 5s) | Cold profile is 5-12s. A 5s timeout means the user waits 5s + 2-3s client fallback = 7-8s in the cold case, vs 2-3s for client-direct. 1.5s lets warm requests succeed (~800ms typical) while bailing fast on cold. |
| 12 | Variant A warm-pinger | Shipped this phase | Cheap (30 min implementation). Closes cold-start gap to ~800ms warm for users who open the app a couple seconds before tapping For You. |

## §3 — Auth-spike measurements (locked decision 4)

Three sequential warm runs against `auth-spike` Edge Function, user-JWT-scoped client reading `taste_profiles` + `user_interactions`:

| Run | getUser | taste_read | inter_read | total |
|---|---|---|---|---|
| 1 (cold) | 399 | 590 | 171 | 1160 |
| 2 (warming) | 75 | 146 | 102 | 323 |
| 3 (warm) | 81 | 107 | 76 | 264 |

Warm marginal cost of RLS per query: ~70-90ms vs ~10-30ms typical for service-role pooled connections. Across the render function's 5-8 critical-path queries: ~280ms additional auth/RLS cost. Pre-commitment was: <200ms warm → JWT-scoped wins; 200-400ms → lean service-role; >400ms → service-role no question. Result landed in the 200-400ms band; service-role chosen.

## §4 — Latency results

`render-foryou-rows` measurements via devtools-issued POST from Joe's session, default services list:

| Run state | Wall (ms) | Server renderMs | Anchors max parallel (ms) |
|---|---|---|---|
| Cold-cold (first invocation after deploy) | 12000 | 10800 | 4300 |
| Cold instance (first batch after idle) | 4600-5700 | 4500-5400 | 1500-2000 |
| Warming | 1400-2800 | 1200-2500 | 200-1400 |
| **Warm steady-state** | **820-1300** | **700-1100** | **120-310** |

vs IN-466 brief targets (p50 < 600ms / p95 < 1000ms): warm p50 ~850ms server / p95 ~1300ms — both miss. But warm path beats the existing client-direct cold path (~2-3s post-Phase-4.5-quick-wins) by 2-3x. Joe's GTM gate is the actual call.

Cold path is the architectural concern: Edge Function cold-start (5-12s) is *worse* than client-direct (2-3s). The 1.5s timeout means cold cases fall through quickly to the client path; net cold-case latency = 1.5s timeout + 2-3s client = 3.5-4.5s, vs 2-3s if we'd skipped Edge entirely. Variant A warm-pinger closes this for users who don't tap For You within 2 seconds of app open.

### On-device confirmation (Pixel device R3CT50HL3XA, 2026-04-30 evening)

After deploying the corrected Variant A (App.tsx fires `render-foryou-rows` itself, not a separate `warmup-foryou` function), three sequential test runs against Joe's Galaxy:

| Time | Event | Reading |
|---|---|---|
| 16:46:34 | `[warmup] render-foryou-rows fire-and-forget: 17646ms (200)` | Cold-cold first invocation since deploy |
| 16:47:00 | `[warmup] render-foryou-rows fire-and-forget: 4190ms (200)` | App reopened, partially warm |
| 16:47:06 | `[useForYouContent] edge: wall=1123ms server=774ms anchorMax=160ms rec=20 gems=7 outside=15 byw=1 mfp=0 wl=0 rooms=5` | For You tapped 6.7s after warmup completed — full success |

The warm wallclock landed at **1123ms** on real Android over residential WAN — within margin of the desktop browser warm baseline. The cold-tap window (user taps For You < ~5s after app open while warmup is still in flight) hits the 1.5s timeout and falls through to the client pipeline (~2-3s). Acknowledged limitation; mitigation paths filed as IN-468 (SWR cache) and IN-469 (pg_cron warm-pinger).

### Variant A correction

The original Variant A (deployed `warmup-foryou` as a no-auth noop function fired from App.tsx) didn't work because Edge Function instances are per-function — warming `warmup-foryou` left `render-foryou-rows` cold. Three on-device tests confirmed every render call timed out and fell through to the client pipeline. Replaced with a fire-and-forget hit on `render-foryou-rows` itself, gated on `auth.session && !auth.loading && !userPrefs.loading && connectedServices.length > 0`. The `warmup-foryou` function file was deleted; the deployed instance can be torn down via Supabase dashboard.

## §5 — Deviations from the brief

1. **Path layout.** Brief said `supabase/functions/render-foryou-rows/_pipeline/`. ADR-011 is locked and mandates `_shared/`. Mirrored into `_shared/recommendations-v2/` and `_shared/taste-v2/` instead. Drift CI check added (`shared-tree-drift.yml`) since the locked pattern still produces two trees of identical code.
2. **Auth model.** Brief specified user-JWT-scoped reads (RLS as defence-in-depth). The auth-spike showed real cost (~280ms in the critical path). Switched to service-role + JWT-decode + `withUserScope` helper. Brief §6 explicitly allowed this pivot.
3. **Edge timeout.** Brief said 5s. Cold profile (5-12s) made 5s a worst-case-pessimal value. Tightened to 1.5s.
4. **Variant A warm-pinger.** Not in original brief; added mid-build after the cold-start profile came in worse than expected. ~30 min of work; closes the cold-start gap for the common case.
5. **Telemetry persistence table.** Brief offered migration 036 if telemetry didn't fit on `card_impressions.metadata`. Skipped entirely for v1 — console logs are sufficient pre-launch.

## §6 — Validated invariants

- `auth.uid()` extraction from JWT works without signature verification (Supabase gateway pre-verifies; we only read claims). `auth-spike` confirmed.
- `taste_user_id_matches_request: true` in every spike run — RLS scoping + user-scoped client both isolate correctly.
- All Edge Function reads of user-owned tables go through `userScope.select()`. Raw `client.from()` only for `titles`, `mood_room_anchor_labels`, and `streaming_availability` (no `user_id` column).
- Pool reconstruction (Map ↔ Record at the wire boundary) preserves identity. `scoreCandidates` and `rerank()` work identically against the Edge-built pool.
- TypeScript typecheck passes against the wired client (`npx tsc --noEmit` exit 0).

## §7 — Rollback plan

- Revert `src/hooks/useForYouContent.ts` to the pre-IN-466 commit. The Edge Function stays deployed but unused; no harm. Client falls back to its pipeline as before.
- The Edge Function modules in `supabase/functions/_shared/` are inert when no function imports them. `auth-spike` and `warmup-foryou` are fire-and-forget; safe to leave or delete via `npx supabase functions delete <name>`.

## §8 — Telemetry to capture post-launch

- Edge success rate vs fallback rate (grep `[edgeRender]` in production logs).
- Warm wallclock distribution from `[useForYouContent] edge: wall=Xms server=Yms` lines.
- Cold-start incidence: how often the 1.5s timeout fires.
- Per-anchor latency from the `[useForYouContent] edge: ... anchorMax=Xms` field.

If cold-start incidence > 10%, schedule IN-469 option 2 (pg_cron-driven warm-pinger every 5 min) — cheapest fix.

## §9 — Code review pass (2026-04-30)

Four parallel reviewers (kieran-typescript-reviewer, architecture-strategist, security-sentinel, code-simplicity-reviewer) audited the phase. Consolidated findings + actions:

**Applied:**

- `EdgeAnchorRoomPreview` deleted from `edgeRender.ts`; `useForYouContent` and `edgeRender` now import `AnchorRoomPreview` from `useAnchorMoodRooms` directly. Type duplication risk closed.
- `reconstructPool` in `edgeRender.ts` gained a sanity check: if `matched.length > 0 && metadata is empty`, log a wire-drift warning and return null to force client fallback. Closes the silent-zero-rows failure mode.
- `withUserScope` in `userScope.ts` now returns properly-typed `PostgrestFilterBuilder` (was `any`). Callers get IntelliSense on chained methods. TODO marker added flagging the `update / insert / upsert / delete` verb gap for the next Edge Function that needs writes.
- Variant A warmup logic extracted from App.tsx into `src/lib/recommendations-v2/edgeWarmup.ts` exporting `warmRenderForYou(providerIds)` and `readAccessToken()`. App.tsx is now 4 lines. `edgeRender.ts` deduplicates against `readAccessToken`.
- Body validation in `render-foryou-rows/index.ts`: rejects `services.length > 20` and any non-string / oversized service id with 400.
- `featuredLastWeek` request field removed — was dead code (always passed as `[]`). Filed as IN-470 follow-up.
- `ROOM_TITLE_LIMIT` / `ROOM_MATCH_LIMIT` / `THUMBNAIL_LIMIT` constants inlined in the orchestrator (single-use each).
- `auth-spike/` and `warmup-foryou/` local function directories deleted. Deployed instances can be torn down via Supabase dashboard.
- `connectedServices.join(',')` stabilisation added to the App.tsx warmup useEffect dep array (avoids re-fires on identity flip of the literal array).
- `buildFilterSets` divergence comments added in both client and Edge copies — the signatures intentionally diverge (`(serviceIds)` client vs `(client, scope, serviceIds)` Edge); future "fix the mirror" attempts won't break it.

**Filed as follow-ups (not applied):**

- **IN-XPS-011**: CI guard against `verify_jwt = false` drift. Pre-public-launch hardening.
- **IN-XPS-012**: promote parity probe to CI smoke test. Revisit on first signal of need.
- **IN-XPS-013**: CORS tightening from `*` to known origins. Pre-public-launch hardening.
- **IN-470**: wire `featuredLastWeek` through to Edge Function for week-on-week anchor variety. Revisit when telemetry shows it matters.

## §10 — Cleanup (next session)

- Tear down deployed `auth-spike` and `warmup-foryou` Edge Functions via Supabase dashboard (local files already deleted).
- Decide on IN-468 Variant B based on measured warm p95.

## §11 — Hand-back signal

> IN-466 server-side For You render shipped. Warm wallclock 1.1s on real Android device (Galaxy R3CT50HL3XA). Cold-start mitigated by Variant A warm-pinger (App.tsx fires render-foryou-rows itself); cold-tap window falls through to existing client pipeline via 1.5s timeout. Code reviewed (TypeScript / architecture / security / simplicity) — fixes applied; four follow-ups filed (IN-470, IN-XPS-011/012/013). Phase summary at `docs/v2/phase-summaries/IN-466-server-side-foryou-render-summary.md`.
