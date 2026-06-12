# Phase PLAT-3 — Single engine, server-side feed + cache: Summary

**Status:** Complete, 2026-06-12 (single-day phase).
**Branch:** `phase-plat-3-single-engine` (kickoff + 7 implementation commits + close-out).
**Brief:** E&P brief §7. Locked inputs: D2 (Workers + Hono), D4 (client fallback one release). **ADR-014 supersedes ADR-011 + ADR-012.**
**Plan:** `docs/plans/2026-06-12-001-feat-phase-plat-3-single-engine-plan.md` — Q1 (KV) and Q4 (delete Edge fn at cutover) per recommendation; Q2 (Workers Paid) deferred wait-and-see at Joe's call — the free tier never tripped; Q3 deviated (Worker cron, not GH Actions — a tsx script can't call the engine's client functions, and once the `*Scoped` variants existed the Worker already had the runtime + secret + observability).

## 1. What shipped

**W1 — engine tree environment-neutral (the unlock).** `src/lib/{recommendations-v2,taste-v2}` importable from browser AND Worker: `src/lib/server/userScope.ts` (UserScope + lint-clean `ScopedQuery` structural type, later + scoped write verbs), `*Scoped` data-access variants absorbed from the mirror (hardFilters/avoidSet/exploration/tasteProfileV2), thin-delegation pattern where bodies were identical (ranker, anchoredRoom, recompute pair), dual-mode anchorSelection. Module-init hazards found by a bundle probe and fixed: lazy `supabase` singleton (module-scope `import.meta.env` crashed non-Vite runtimes), `__DEV__` typeof-guards, image-URL builders extracted to `api/imageUrls.ts` (dropped axios + the TMDb client from the Worker graph entirely). Gate: 22-function engine surface bundled with workerd conditions, module-inited under node.

**W2 — `GET /v1/foryou`.** Orchestration ported INTO the engine tree (`src/lib/server/foryouRender.ts`, typechecked/linted with everything else); the Worker route is a thin adapter: query validation, **real JWT verification** (jose, ES256 against the project JWKS — confirmed live; the Edge gateway used to do this), service-role client from env. Payload wire-compatible with the Edge ResponsePayload including the scored pool (slider re-ranks stay client-side and instant).

**W3 — KV feed cache.** `foryou:v1:{userId}:{taste_vector_updated_at}:{sliderHash}:{sortedServices}`, TTL 20 min, profile read hoisted ahead of the lookup and passed into the render (no duplicate query on miss). Empty no-vector payloads never cached. `x-videx-cache` header.

**W4 — client cutover.** `tryRenderForYouWorker` (GET + query params + Bearer), warmup hack deleted (edgeWarmup.ts + App.tsx effect), 1.5s bail-fast → 20s safety net (Workers have no cold-start category to bail from). Client pipeline fallback retained one release (D4).

**W5 — nightly stale recompute.** The >24h taste replay + centroid k-means moved from app launch (it was AWAITED there) to a 04:00 UTC Worker cron sweeping stale profiles (`staleRecompute.ts`, per-user error isolation, cap 200/run). Verified against production via `wrangler dev --test-scheduled`: `scanned=6 vectors=6 centroids=0 errors=0`.

**W6 — deletions (LOC table below).**

**Device pass fixes (commit 6):** boot-time KV prefetch (replaces the warmup hack with something better: it materialises the actual feed entry — first-ever renders run 9–15s from cold DB caches, same physics the Edge had); `refetchOnWindowFocus: false` on the render query (a WebView focus refetch was stomping in-progress slider re-ranks with the server's saved-slider ranking — pass-1's "slider doesn't work").

## 2. Deletion table (the first-class deliverable)

| Deleted | Size |
|---|---|
| `supabase/functions/_shared/recommendations-v2/` + `_shared/taste-v2/` (24 files) | ~2,500 LOC |
| `supabase/functions/render-foryou-rows/` | 911 LOC |
| `.github/workflows/shared-tree-drift.yml` + `foryou-parity.yml` | 172 lines CI |
| `edgeWarmup.ts` + App.tsx warmup effect | ~90 LOC |
| `useTasteProfile` launch-recompute block | ~25 LOC |
| **Total** | **~3,700 LOC + 2 CI workflows** |

Kept one release (D4 clock from 2026-06-12): client pipeline in `useForYouContent`, the in-file client variants of `*Scoped` functions, the parity probe script (now targeting the Worker). `_shared/userScope.ts` + utilities stay — `embed-query` (live, outside the engine) uses them.

## 3. Acceptance evidence (brief §7.3)

- **p95 / cold-start:** KV hits ~175ms (old warm-Edge ~800ms); warm-isolate render misses 0.8–1.2s; boot prefetch hides the 9–15s first-ever render (device pass 2: "For you load was awesome"). The 5–12s cold-start *category* (per-instance Deno cold starts on every idle window) is gone — what remains is one first-ever render per cache window, served from the prefetch.
- **Parity:** golden generated from the EDGE path, probe run against the WORKER: every content row identical (rows, match %, pool). Single divergence root-caused to the mirror carrying a **pre-ADR-013 cluster-rep list** (`tasteClusters.ts` reps [562,680,857] vs the deduplicated src list) — drift CI never caught it; the Edge served anchor selection from stale data for a month; **the Worker was correct**. Golden regenerated from the Worker; green twice. Edge stability cross-checked (3 identical runs) before concluding.
- **Cache hit ratio:** measured via `x-videx-cache` during smoke (hit/hit after miss); device pass 2 first-load served from prefetch-primed KV.
- **LOC deleted:** table above.
- Device gate: pass 1 found the two issues above (fixed, commit 6); pass 2 clean — slider re-ranks verified live (catalogue-age full-swing reorders 20/20 positions in sim; comfort zone resizes Outside Your Usual 5→15 by design — see IN-PX-58 note below).

## 4. Process notes

1. **The engine tree had real browser coupling** beyond what grep showed (module-scope env throw in the singleton, `__DEV__` in storage, axios via the image-URL helpers). The esbuild-bundle + node-module-init probe caught all of it pre-Worker; the same trick later caught PLAT-2's own `tmdb.ts` module-scope env read.
2. **Free-tier CPU never tripped** — the render is I/O-bound. Q2 (Workers Paid) stays wait-and-see; the trigger is `exceeded CPU` errors in the tail.
3. **wrangler dev --test-scheduled** + `.dev.vars` (gitignored) validates cron handlers against production data without waiting for the schedule.
4. The parity divergence investigation sequence (Edge-stability check → data diff → root cause in static data) is the template for "two implementations disagree" debugging.
5. Device pass 1 evidence came from `wrangler tail` request-start timestamps — the Canceled-at-10s pattern identified our own safety timeout as the killer.

## 5. Joe actions (post-merge)

1. **Delete the `render-foryou-rows` function** in the Supabase dashboard (Edge Functions → render-foryou-rows → delete). The code is gone from the repo; the deployed instance is dead weight.
2. No new secrets, no migrations. (Workers Paid upgrade only if CPU errors ever appear.)

## 6. Follow-ups

- **D4 clock:** one release after this merge, delete the client pipeline (+ probe script + client data-access variants) — filed as the next-release chore.
- IN-PX-58 (catalogue-age CLASSIC label + "comfort zone controls the row below" affordance) gained device-pass-2 evidence: both top sliders work mechanically; the perception gap is labelling/affordance.
- ENG-2 next per track order (data-gated: ≥5–10K impressions). Launch prep before that.
