# IN-466 Kick-off — Server-side For You Render via Edge Function

**Status:** Ready for implementation in a new session.
**Predecessor work (April 2026):**
- Phase 4 ranking pipeline ([phase-4-summary.md](phase-summaries/phase-4-summary.md))
- Phase 4.5 anchored mood rooms redirect ([phase-4.5-anchored-rooms-summary.md](phase-summaries/phase-4.5-anchored-rooms-summary.md))
- Phase 4.5 cold-start quick wins (migration 035, localStorage availability cache, label caching) — see Parking Lot **IN-466** for the architectural review that produced this brief.
**Bug-tracker context:** post-Phase-4.5 testing surfaced that the For You cold path still takes ~2–3s even after the three quick wins shipped. Joe's gate: "viable to go to market with." This phase is the next investment in cold-path latency.

The work in this brief is **a follow-on to Phase 4.5**, not a new phase. It targets a single problem (For You cold-start latency) with a focused solution (server-side row render in an Edge Function). Treat it as a contained body of work, ~3–5 days of implementation, with explicit fallback to the existing client-side path if the Edge Function fails.

---

## Section 1 — What's being built

### 1.1 Architectural commitment

The For You surface's "first paint" data path moves from **N client-side Supabase calls** (taste profile read + filter sets × 4 + candidate pool RPC + extended metadata + anchor selection × 5 + anchor room generation × 5) to **one client → Edge Function call** that returns a pre-computed payload.

The Edge Function runs inside Supabase's network with sub-50ms latency to Postgres. Server-side, it executes the same pipeline the client currently runs — the code is ported, not rewritten — and returns a single JSON payload sized for the For You first viewport.

**Net effect:** ~5–8 sequential RPCs collapse into one HTTP round trip. Latency floor drops from ~2-3s → ~400-600ms on residential WAN.

**Existing client-side pipeline is not deleted.** It stays in place as the **fallback path** — if the Edge Function returns 5xx or times out (>5s), the client transparently degrades to its current behaviour. This is intentional resilience: the Edge Function is a performance optimisation, not a correctness path. The pipeline code is also re-used by row-specific Phase 5+ surfaces (Because You Watched, More From) which don't run on the same Edge Function.

### 1.2 Edge Function shape

**Path:** `supabase/functions/render-foryou-rows/`
**Pattern to copy:** `supabase/functions/label-anchor-room/index.ts` (Phase 4.5 IN-463) — request-time, auth-gated, deno-native, returns JSON.

**Request:**

```
POST /functions/v1/render-foryou-rows
Authorization: Bearer <user JWT>
Content-Type: application/json

{
  "services": ["netflix", "prime", "apple", "bbc", "skygo", "itvx", "channel4"]
}
```

The user is identified by the JWT (the function reads `auth.uid()` from the verified token). Sliders, taste profile, interaction history, watchlist, dismissed/thumbs-down events all read server-side from Supabase using the user's session — **no client-side state passed in the request body** beyond the services array (which the user could change via Profile mid-render). This avoids passing stale local state and keeps the function single-source-of-truth.

**Response:**

```ts
{
  recommendedForYou: ContentItem[];        // top 20
  hiddenGems: ContentItem[];               // 15 max
  outsideYourUsual: ContentItem[];         // 5-15 depending on Comfort Zone
  becauseYouWatched: BecauseYouWatchedRow[]; // up to 2 rows
  moreFromPerson: MoreFromPersonRow | null;  // 0 or 1
  fromYourWatchlist: ContentItem[];        // top 15
  anchorRooms: AnchorRoomPreview[];        // 5 max — full payload incl. anchor metadata + thumbnails + llmLabel
  sliders: SliderState;
  perAnchorLatencyMs: number[];
  /** Server-side wallclock for the whole render. Useful for client-side
      telemetry on whether the Edge Function is meeting its SLO. */
  renderMs: number;
}
```

**Internally, the function ports the existing recommendation pipeline.** Concretely:

- `selectAnchors` (from `src/lib/recommendations-v2/anchorSelection.ts`)
- `buildAnchoredRoom` (from `anchoredRoom.ts`)
- `fetchCandidatePool` + `scoreCandidates` + `buildRowFromPool` (from `ranker.ts`)
- `applyAnchorHardFilters` + `getAvailableTmdbIds` + filter-set builders (from `hardFilters.ts`)
- `weights.ts` constants and slider-mapping functions
- `recency.ts`, `contextual.ts`, `diversity.ts`
- BYW + MoreFrom + Watchlist row builders (currently private helpers in `useForYouContent.ts` — extract these to importable functions as part of this phase)

Two paths for the port:

**(a) Mirror copy** the relevant `.ts` files into `supabase/functions/render-foryou-rows/_pipeline/`, adjusting imports to `https://esm.sh/...` for Deno. Code duplication acknowledged; file a parking-lot item for consolidation post-launch. Faster to land.

**(b) Refactor the recommendation logic into a `_shared/recommendations` package** that's consumable by both the client (via path import) and Deno Edge Functions (via path import). Higher upfront cost; cleanest long-term.

**Recommended:** start with **(a)** to land the latency win, file the consolidation as a follow-up. The pipeline code is mature and stable post-Phase-4.5 — drift risk is low for the first 1–2 months. Revisit at Phase 5 boundary.

**Auth & RLS posture:** the function uses the **user's JWT** (not service-role) for all `taste_profiles` / `user_interactions` / `card_impressions` reads, so existing RLS policies apply naturally. Service-role is needed for one path: the LLM label cache write (`mood_room_anchor_labels`, see IN-463). Keep service-role narrowly scoped to that single upsert and the `streaming_availability` aggregation (no RLS on that table today).

### 1.3 Client integration shape

`useForYouContent` is the primary touchpoint. Two changes:

1. **Primary fetch path becomes a single Edge Function call.** Replace the orchestration block (filter sets → pool → score → rows) with `supabase.functions.invoke('render-foryou-rows', { body: { services } })`.

2. **Client-side pipeline becomes the fallback.** On Edge Function failure (5xx, network error, timeout > 5s), fall through to the existing client path. Log a `[useForYouContent] fell back to client pipeline: <reason>` console error for telemetry. Do NOT silently fail without falling back — first 1–2 weeks of production telemetry is the value here.

3. **`useAnchorMoodRooms` consumes the embedded `anchorRooms` array** directly when the Edge Function path succeeds. Skip the `selectAnchors` + `buildAnchoredRoom` × 5 chain entirely. The hook still exists and runs as fallback.

**localStorage cache:** the IN-466 entry already proposed a stale-while-revalidate snapshot. Add it as a separate enhancement; don't gate the Edge Function ship on it. Path:
- `videx.foryou_render.v1.{userId}` — stores the last-rendered payload + `cachedAt` ISO timestamp.
- 1-hour TTL.
- On hook mount: if cache hit, render from cache immediately AND fire fresh fetch in background; replace state when fresh data lands.

Build the Edge Function path FIRST. Add the localStorage snapshot AFTER the Edge Function is live and you have a baseline measurement.

### 1.4 Slider re-rank flow

Today, slider drag triggers `rerank()` which uses the cached pool + scoreCandidates client-side. **Keep this behaviour.** The Edge Function is for the cold-path render; slider drag is a hot-path interactive operation that benefits from the in-memory pool.

After the Edge Function landing, `rerank()` requires the client-side pool to be populated. Options:

- **(i)** Ship the Edge Function pool back to the client as part of the response payload (50KB-ish, acceptable).
- **(ii)** Lazy-fetch the pool client-side on first slider interaction (1 RPC, ~500ms).

**Recommended (i):** include the pool in the response. Adds ~50KB to the payload but keeps slider UX instant. The pool isn't user-private (it's the same set of candidates regardless of session) and is already cached client-side in the existing path.

### 1.5 Telemetry

Capture and surface for the post-deploy review:

- **Client wallclock** for the Edge Function call (Date.now() before/after `invoke`).
- **Server-side wallclock** for the whole render (returned as `renderMs` in the payload).
- **Fallback rate** — count of `[useForYouContent] fell back` events in production. Should be near-zero in steady state; > 5% indicates a real problem.
- **Per-row counts** to confirm the Edge Function is producing parity output to the client path (Recommended For You count, anchored rooms count, etc.). Compare against the existing client-path output for the same user during a smoke test.

Persist these to a new lightweight table or as `metadata` on `card_impressions` — same shape decision as IN-463 / migration 033.

### 1.6 Out of scope for IN-466

- **Refactoring the recommendation pipeline into a shared package** (path (b) above). Mirror copy the files; consolidate later.
- **Realtime push for slider changes** (IN-466 entry option 4). Heavyweight infra for marginal UX gain; defer.
- **Pre-warm via Home tab** (IN-466 entry option 3). Smaller scope; can layer on later if Edge Function path doesn't hit the latency target.
- **Reducing candidate pool size** (IN-466 entry option 5). Independent A/B test; doesn't depend on Edge Function.
- **localStorage snapshot of the rendered payload** (IN-466 entry option 2). Land Edge Function FIRST, measure baseline, then add snapshot. The fallback path has a similar effect for second opens within a session.

---

## Section 2 — Migrations and schema changes

**No expected migrations.** This phase is application-layer.

If telemetry capture warrants its own table (e.g. `foryou_render_events`), file as migration 036 with the standard pg_partman + RLS pattern from migration 014. Otherwise reuse `card_impressions.metadata`.

---

## Section 3 — Verification and ship criteria

### 3.1 Functional verification

For the same user (Joe's account is the natural test bed), the Edge Function path and the client fallback path must produce **equivalent output**:

- Recommended For You: same titles, same order. Acceptable variance: < 5% reordering due to genre-spread tiebreak nondeterminism.
- Hidden Gems / Outside Your Usual: same logic → same output.
- Anchor selection: same anchors. The Tier 1/2/3 ladder is deterministic given fixed input.
- Anchored mood rooms: same room contents. `match_titles_by_vector` is deterministic.

Write a one-off probe script (`scripts/_inspect_foryou_parity.mjs`) following the pattern of `scripts/_inspect_bbc_sa.mjs`: fetch the Edge Function output AND the client-pipeline output for the same user, diff them, report.

### 3.2 Latency verification

Target: **p50 < 600ms, p95 < 1000ms** for the Edge Function wallclock on residential WAN.

Joe's existing setup measures wallclock from app open to For You row visible. Capture before/after numbers. The IN-466 entry sets the expectation: ~2-3s → ~400-600ms.

### 3.3 Fallback verification

Manually trigger fallback paths and verify:

- Edge Function returns 5xx → client falls back, console log fires, user sees normal For You content.
- Edge Function returns 200 with malformed JSON → fallback fires.
- Network timeout (kill phone wifi mid-load, restore) → fallback fires.

The fallback isn't optional polish — it's the resilience contract that makes shipping the Edge Function safe.

---

## Section 4 — Documentation updates (in-phase, not a follow-up)

When this phase ships:

- **Strategy doc** (currently v1.7) → bump to v1.8. New §5.4 subsection on the server-side render layer; add commit to §9.5 (Process and infrastructure).
- **Project Orchestration** (currently v0.4) → bump to v0.5. §3.4 add migration 036 if filed; §11 confirmed-decisions add the server-side render lock.
- **Parking Lot** (currently v0.4) → bump to v0.5. Mark IN-466 as ✅ Incorporated; document the path-(a) vs path-(b) trade-off and file a follow-up entry IN-467 for the long-term consolidation if path (a) was chosen.
- **Wiki** mood-rooms.md and for-you-surface.md updated with the server-side render path.
- **Phase summary** at `docs/v2/phase-summaries/IN-466-server-side-foryou-render-summary.md` covering: what landed, decisions made, deviations, telemetry numbers, parity probe results, fallback rate after first 24-72 hours.

---

## Section 5 — Implementation order

Suggested sequence:

1. Read this kick-off, the IN-466 parking-lot entry, and `useForYouContent.ts` end-to-end.
2. Decide path (a) mirror copy vs path (b) shared package. Recommended (a) for v1.
3. Port the pipeline files into `supabase/functions/render-foryou-rows/_pipeline/`. Adjust imports.
4. Write the Edge Function entry (`index.ts`) — request validation, auth, orchestration, response shape.
5. Deploy with `npx supabase functions deploy render-foryou-rows --project-ref fmusugdcnnwiuzkbjquo`.
6. Smoke test via curl. Run the parity probe script.
7. Update `useForYouContent` to invoke the Edge Function with client-side fallback. Wire the response payload into existing state setters.
8. Update `useAnchorMoodRooms` to consume embedded `anchorRooms` from the For You hook when present.
9. Add telemetry capture (client + server wallclock, fallback rate).
10. Build APK + smoke test on device.
11. Documentation updates (Section 4).
12. End-of-phase summary.

---

## Section 6 — Mid-flight questions for the strategist

If during implementation any of these become unclear, surface in chat rather than guessing:

- **Path (a) vs (b).** If during the port the pipeline code shows obvious refactor opportunities, raise — the call to take (b) instead is reasonable if the cost is small.
- **Pool inclusion in the response payload.** If the payload exceeds ~200KB, surface — slider rerank UX is the only reason to include it; alternatives exist.
- **Auth model.** If reading the user's session via JWT inside the Edge Function turns out to be awkward (Supabase's deno-native auth helpers can be finicky), service-role + JWT-decode + manual `auth.uid()` extraction is acceptable but flag it.
- **Telemetry table vs `card_impressions.metadata`.** If captured fields don't fit naturally on impressions, propose the dedicated table.

---

## Section 7 — Resuming the active session

When this phase is complete, return to the active conversation thread. The hand-back signal is a one-line note in chat:

> IN-466 server-side For You render shipped. Latency p50/p95: <X>ms / <Y>ms. Fallback rate over first <N> hours: <Z>%. Phase summary at `docs/v2/phase-summaries/IN-466-server-side-foryou-render-summary.md`.

Joe makes the go-to-market call from there.

---

*End of IN-466 kick-off. Ready to start in a fresh session.*
