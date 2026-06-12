---
title: ADR-014 — Single server-side engine on the videx-api Worker
type: concept
tags: [adr, decision, workers, foryou, engine, locked]
created: 2026-06-12
updated: 2026-06-12
sources:
  - raw/v2-strategy/Videx_v2_Engine_and_Platform_Hardening_Brief_v0.2.md
  - raw/phase-summaries/phase-plat-3-summary.md
related:
  - wiki/concepts/decisions/adr-011-edge-function-shared-modules.md
  - wiki/concepts/decisions/adr-012-server-side-foryou-render.md
  - wiki/concepts/architecture/for-you-surface.md
  - wiki/concepts/architecture/recommendation-pipeline.md
---

# ADR-014 — Single server-side engine on the videx-api Worker

**Status:** locked (PLAT-3 cutover, 2026-06-12). **Supersedes [ADR-011](adr-011-edge-function-shared-modules.md) and [ADR-012](adr-012-server-side-foryou-render.md).**

## Context

ADR-012 put the For You render server-side (Supabase Edge Function); ADR-011 paid for it with a hand-maintained mirror of the engine under `supabase/functions/_shared/`, guarded by `shared-tree-drift` CI and validated by the `foryou-parity` probe. The arrangement worked but taxed every engine change twice and left two latency problems: 5–12s Edge cold starts (masked by the Variant A warmup hack) and a 1.5s bail-fast timeout in the client that abandoned slow-but-succeeding renders. The E&P brief locked the dissolution path (D2: Cloudflare Workers — wrangler bundles from anywhere in the repo; D4: client pipeline survives one release as fallback).

## Decision

ONE engine implementation, in `src/lib/{recommendations-v2,taste-v2}`, imported directly by the videx-api Worker:

- **`GET /v1/foryou`** (Worker route) verifies the Supabase JWT against the project JWKS (ES256 — the Edge gateway used to do this; the Worker must do it itself), then runs `src/lib/server/foryouRender.ts` with a service-role client + `UserScope` defence-in-depth. The payload is wire-compatible with ADR-012's, including the scored pool for instant client-side slider re-ranks.
- **Engine tree contract:** modules stay importable outside Vite — no module-scope `import.meta.env` / `localStorage` / bare `__DEV__` (lazy `supabase` singleton; `*Scoped` data-access variants taking explicit client/scope). Recorded in `docs/CONVENTIONS.md`.
- **Feed cache:** Workers KV keyed `foryou:v1:{userId}:{taste_vector_updated_at}:{sliderHash}:{sortedServices}`, TTL 20 min. Vector-moving interactions bust entries by key construction. Hits serve ~175ms.
- **Boot prefetch** (replaces the warmup hack): the app fires the real `/v1/foryou` at boot, materialising the KV entry before the user reaches For You. First-ever renders run 9–15s (cold DB caches — the same physics ADR-012 measured); the prefetch hides them.
- **Nightly stale recompute:** the >24h taste replay + centroid k-means moved from app launch to the Worker's 04:00 UTC cron (`src/lib/server/staleRecompute.ts`). `UserScope` gained scoped write verbs for it.

## Deleted at cutover

`_shared/recommendations-v2/` + `_shared/taste-v2/` (24 files), `render-foryou-rows` (911 lines), `shared-tree-drift.yml`, `foryou-parity.yml`, `edgeWarmup.ts` + its App.tsx effect — 3,644 LOC + 172 lines of CI. The search ranker core (the one reverse-direction shared module) relocated INTO the engine tree as `search/semanticCore.ts`.

## Final parity evidence

Golden generated from the Edge path, probe run against the Worker: every content row identical; the single divergence (anchorRooms[3]) root-caused to the MIRROR carrying a pre-ADR-013 cluster-rep list that drift CI never caught — the Worker was correct. A live specimen of the bug class this ADR eliminates.

## D4 fallback clock

The client pipeline in `useForYouContent` (plus the parity probe script and the in-file client variants of `*Scoped` functions) survives **one release from 2026-06-12**, then is deleted. During the window, engine behaviour changes must keep client and `*Scoped` twins in step within the same file.
