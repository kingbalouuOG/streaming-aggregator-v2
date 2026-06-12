# PLAT-3 Implementation Plan — Single engine, server-side feed + cache

**Status:** DRAFT for Joe's review.
**Branch:** `phase-plat-3-single-engine`.
**Brief:** E&P Hardening v0.2 §7. Locked inputs: D2 (Cloudflare Workers + Hono — the Worker exists, PLAT-2), D4 (client pipeline kept as fallback one release, then deleted), D1 (ENG-1 landed first — the mirror tax is fully paid; this phase collects the refund).
**Estimate vs reality:** brief says 2–3 weeks; recent phases compress to 1–3 days. Sized as 7 workstreams / ~8 commits.

## 0. The one-sentence version

Move the For You render from the Supabase Edge Function (which needs a hand-maintained copy of the engine) onto the `videx-api` Worker (which imports the real engine from `src/lib/` directly), add a per-user feed cache, move the 24h taste recompute off the app-launch hot path — then delete every line that existed only because the engine lived in two places.

## 1. What exists today (verified against the tree, 2026-06-12)

- `supabase/functions/render-foryou-rows/index.ts` (911 lines): full server render — JWT decode (gateway-verified), service-role client + `userScope` defence-in-depth, filter sets ‖ interest centroids, candidate pool (ENG-1 multi-interest fan-out), scoring, avoid penalty, MMR, exploration splice, 5 anchor rooms, person row, watchlist row. Returns `ResponsePayload` **including the scored pool** (`pool.matched` + metadata) — that pool is what lets slider drags re-rank client-side with zero refetch.
- It imports the engine from `supabase/functions/_shared/{recommendations-v2,taste-v2}/` — the ADR-011 mirror (25 files), guarded by `shared-tree-drift.yml` and validated by `foryou-parity.yml` + `scripts/test/foryou-parity-probe.mjs`.
- `src/hooks/useForYouContent.ts` (822 lines): `tryRenderForYouEdge` first, full client pipeline as fallback; `edgeWarmup.ts` fires a throwaway render at app boot to dodge Edge cold starts (5–12s cold vs ~800ms warm) — the "Variant A hack".
- `src/hooks/useTasteProfile.ts`: runs the >24h-stale **full taste recompute + centroid refresh on app launch, client-side** — the hot-path work item 7.2-4 evicts.
- **The `src/lib` engine tree is NOT yet Worker-clean:** `hardFilters.ts` and `embeddingCache.ts` contain real `localStorage` code paths (the mirror copies diverge exactly there, by design). "Import `src/lib` directly" therefore needs a small environment-seam refactor first — that's W1, and it's the only genuinely fiddly part of the phase.

## 2. Workstreams

### W1 — Make the engine tree environment-neutral (the unlock)

One engine tree, importable from browser AND Worker. Pattern: inject the environment instead of reaching for it.

- `embeddingCache.ts` / `hardFilters.ts`: extract the `localStorage` reads/writes behind a tiny `KVStringStore` interface (`get/set/remove`), default = localStorage adapter (client behaviour byte-identical), Worker passes `null` → in-memory Map per request (matching today's Edge behaviour: module-scope Map, no persistence).
- Audit the other flagged files (`anchorSelection`, `weights`, `edgeRender`, `edgeWarmup`, `interactionUpdate`): comment-only mentions stay; `edgeRender`/`edgeWarmup` are client callers, not engine — they never get imported by the Worker.
- Diff each `src/lib` engine file against its `_shared` mirror twin; any real divergence beyond the storage seam gets reconciled INTO `src/lib` now (the mirror is about to die — `src/lib` must be the superset).
- Gate: vitest green, client behaviour unchanged, AND a throwaway `wrangler deploy --dry-run` proving the Worker can bundle the tree (no DOM types, no Vite-isms).

### W2 — `GET /v1/foryou` on the videx-api Worker

- New route module `workers/api/src/foryou.ts`, importing `src/lib/recommendations-v2/` + `src/lib/taste-v2/` directly (wrangler bundles from anywhere in the repo — the D2 rationale, now cashed in).
- **Auth is the one thing the Edge gateway did for us that the Worker must now do itself:** verify the Supabase JWT properly (signature, `exp`), not just decode it. `jose` against the project JWKS, with the legacy HS256 `SUPABASE_JWT_SECRET` as the fallback path if the project is still on symmetric signing (checked during implementation). Then the existing `userScope` defence-in-depth pattern ports as-is.
- Request: `GET /v1/foryou?services=netflix,prime&hour=20&dow=4` + `Authorization: Bearer <jwt>` — same validation rules as the Edge body (≤20 services, hour 0–23, dow 0–6).
- Response: **byte-compatible `ResponsePayload`** — rows + scored pool + sliders + perAnchorLatencyMs. The slider re-rank UX (7.2-2) is preserved by contract, not by new code.
- New Worker secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` (Joe action, piped from file per the now-twice-burned lesson).

### W3 — Feed cache

- **Workers KV** (not Cache API — the response is per-user and Authorization-keyed; KV gives us explicit keys and native TTL without fighting HTTP cache semantics).
- Key: `foryou:{userId}:{taste_profiles.updated_at}:{sliderHash}` — interactions that move the vector bump `updated_at` and naturally bust the cache (the existing embedding-cache invalidation trick, reused per 7.2-3). Slider saves also touch the profile row, so the same key covers them.
- TTL 20 min (mid-range of the brief's 15–30). `x-videx-cache: hit|miss` header (PLAT-2 house pattern) so the hit ratio is measurable from `wrangler tail` for the acceptance number.
- KV namespace binding in `wrangler.toml`; namespace created via `wrangler kv namespace create` during implementation.

### W4 — Client cutover

- `edgeRender.ts` → `tryRenderForYouWorker`: point at `${VITE_API_PROXY_URL}/v1/foryou`, GET, JWT from the existing session-token helper. Same return shape → `useForYouContent` changes are ~10 lines.
- Delete `edgeWarmup.ts` + its App.tsx boot call — Workers have no cold start; the warmup hack is the first 7.2-5 deletion and lands in the same commit as the cutover.
- Simplify the fallback dance: the 5s-timeout-then-client-pipeline ladder stays **for one release** (D4) but loses its Edge-specific contortions — one try/catch around the Worker fetch, falling back to the client pipeline on failure only (not on slowness).
- `useTasteProfile`: stale-recompute on launch becomes a no-op behind W5 (kept as silent backstop for one release, same D4 clock).

### W5 — Batch recompute off the hot path

- Nightly GitHub Actions job (the HDBSCAN/`mood-rooms-recluster.yml` house pattern — brief 7.2-4 explicitly allows "stays in the existing cron pattern") running a script that sweeps profiles stale >24h: `recomputeFromInteractions` + `recomputeInterestCentroids` per user, service-role, batched.
- Chosen over a Cloudflare Cron Trigger because: the recompute writes to Supabase (no Worker-specific advantage), GH Actions gives free logs/retries/manual dispatch, and it reuses the secrets already in the repo. A Worker cron is a one-line migration later if we ever want it.

### W6 — The deletions (first-class deliverable, LOC tracked)

In order, after the cutover device-verifies:

1. Final `foryou-parity` run against the **Worker** path (probe repointed for one last green) → then delete `foryou-parity.yml` + the probe's CI wiring (script file kept one release alongside the client pipeline — it's the tool we'd debug a fallback discrepancy with).
2. `supabase/functions/_shared/recommendations-v2/` + `_shared/taste-v2/` (25 files).
3. `shared-tree-drift.yml`.
4. `supabase/functions/render-foryou-rows/` (the Worker replaces it outright — the D4 fallback is the *client* pipeline, not the Edge fn) + Joe deletes the deployed function in Supabase.
5. `edgeWarmup.ts` (already gone in W4).

### W7 — ADR-014 + close-out

- **ADR-014: Single server-side engine on the videx-api Worker** — supersedes ADR-011 (mirror rule) and ADR-012; records the D4 one-release fallback clock (start = PLAT-3 merge date) and the deletion list with LOC counts.
- Phase summary with acceptance evidence; wiki ingest; parking-lot sweep; PR.

## 3. Commit plan

1. W1 environment seam + mirror reconciliation (engine tree only, client-neutral).
2. W2 Worker route + auth (+ secrets handover to Joe mid-commit).
3. W3 KV feed cache.
4. Worker smoke evidence (curl: cold/warm timings, cache header, 401/400 guards).
5. W4 client cutover + warmup deletion.
6. W5 nightly recompute job + script.
7. W6 deletions (after device gate + final parity run).
8. W7 ADR-014 + close-out.

Device gate between commits 5 and 7, same loop as every phase: build, install, Joe browses For You while `wrangler tail` records.

## 4. Acceptance (brief §7.3, made concrete)

| Criterion | How we'll evidence it |
|---|---|
| p95 first-paint ≤ current warm-Edge; cold-start category eliminated | curl timings cold vs warm vs Edge baseline (~800ms warm / 5–12s cold); device tail during Joe's session |
| Parity green on final pre-cutover run | probe repointed at the Worker, one last green run logged in the summary |
| Feed-cache hit ratio measured | `x-videx-cache` counts from the device-session tail |
| LOC/CI deleted tracked | deletion table in the summary: mirror tree + 2 workflows + Edge fn + warmup (expect ~3,500+ LOC) |

## 5. Open questions for Joe (recommendations inline)

- **Q1 — Feed cache store:** KV vs Cache API. **Recommend KV** (per-user keys, native TTL, no auth-header cache-semantics fight). Costs pennies at our scale.
- **Q2 — Workers Paid plan timing:** the scoring pipeline will exceed the free tier's 10ms CPU budget per request. **Recommend upgrading to Workers Paid ($5/mo, the brief §10 line item) at the START of W2** so we never debug phantom CPU-limit errors. This is a Joe dashboard action.
- **Q3 — Batch recompute home:** GitHub Actions nightly (recommended, house pattern) vs Cloudflare Cron Trigger. See W5 rationale.
- **Q4 — Edge function retirement:** delete `render-foryou-rows` at cutover (recommended — the fallback is the client pipeline, keeping a third path alive contradicts the phase's whole point) vs keep it dormant one release alongside.

## 6. Joe actions during the phase

1. Q2 plan upgrade (Cloudflare dashboard → Workers → upgrade to Paid) when W2 starts.
2. Three `wrangler secret put` commands (exact piped commands handed over at that point).
3. Device session for the cutover gate.
4. Post-merge: delete the `render-foryou-rows` function in the Supabase dashboard (production mutation = Joe's action, per house rule).

## 7. Risks

- **Engine tree hides more env coupling than the grep shows** → W1's dry-run bundle gate catches it before any Worker code is written.
- **Worker CPU limits even on Paid (30s wall / 5min CPU is ample, but pgvector RPC latency dominates)** → the render is I/O-bound (Edge proves it); KV cache absorbs repeats.
- **JWT verification subtlety (key rotation, aud claims)** → final parity run + 401-path smoke before cutover; HS256 fallback documented in ADR-014.
- **Fallback divergence during the one-release D4 window** → the client pipeline is frozen (no engine edits land in the window unless `drift-allowed:` reasoning applies — carried into ADR-014).
