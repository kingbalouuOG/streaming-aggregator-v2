---
title: ADR-012 — Server-side For You first paint via Edge Function
type: concept
tags: [adr, decision, edge-functions, foryou, latency, locked]
created: 2026-04-30
updated: 2026-04-30
sources:
  - raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_v0.5.md
  - raw/phase-summaries/IN-466-server-side-foryou-render-summary.md
related:
  - wiki/concepts/decisions/adr-011-edge-function-shared-modules.md
  - wiki/concepts/architecture/for-you-surface.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/operations/edge-function-deployment.md
---

# ADR-012 — Server-side For You first paint via Edge Function

**Status:** locked.

## Context

Phase 4.5 quick wins (migration 035 JSONB-array RPC, localStorage availability cache, label cache) brought the For You cold path from ~5s to ~2-3s on residential WAN. Joe's gate ("viable to GTM") was unmet. The remaining floor was structural: 5-8 sequential client → Postgres round trips for taste profile, filter sets, candidate pool RPC, extended metadata, anchor selection, and 5 parallel anchor room generations.

## Decision

For You first paint runs server-side in a Supabase Edge Function (`render-foryou-rows`). One client → Edge Function call returns the full payload for the first viewport: Recommended For You, Hidden Gems, Outside Your Usual, Because You Watched, More From [Person], From Your Watchlist, and 5 anchored mood rooms. The function ports the existing pipeline modules verbatim into `supabase/functions/_shared/recommendations-v2/` and `_shared/taste-v2/` per [ADR-011](adr-011-edge-function-shared-modules.md).

Key trade-offs the build pinned:

- **Auth model: service-role + manual JWT decode + `withUserScope(uid)` helper.** The auth-spike showed user-JWT-scoped reads cost ~280ms in RLS overhead — too much for a 600ms p50 budget. Service-role bypasses RLS, so every user-owned read goes through `userScope.select(table, cols)` which auto-applies `.eq('user_id', uid)`. The wrapper is the defence-in-depth replacement for RLS.
- **Pool included in response payload (~25 KB gzipped).** Slider drag re-rank stays client-side and instant; no second roundtrip needed.
- **Client-side fallback path retained.** On any Edge failure (5xx, malformed JSON, network, >1.5s timeout), `useForYouContent` falls through to the existing client pipeline. The 1.5s timeout is tighter than the brief's 5s — calibrated against the cold-instance profile (5-12s) so the user never waits longer than the client-direct path (2-3s).
- **Variant A warm-pinger** (`warmup-foryou` Edge Function fired from App.tsx mount, no auth) closes the cold-start gap to ~800ms warm. Variants B (localStorage SWR snapshot) and pg_cron-driven warm-pinger filed as IN-468 / IN-469.

## Consequences

- Warm path: ~700ms server, ~850ms wallclock (p50). ~3x improvement over the client-direct cold path.
- Cold path: 5-12s on first invocation per Edge Function instance. Mitigated by warm-pinger; further work in IN-469.
- Two trees of identical pipeline code — `src/lib/recommendations-v2/` (client) and `supabase/functions/_shared/recommendations-v2/` (Edge). Drift enforced by the `shared-tree-drift` GitHub Actions workflow. PR-level escape hatch via `drift-allowed: <reason>` marker for emergency one-sided patches.
- The fallback path requires the client pipeline to keep working as today. Future Edge Function changes that diverge from the client (e.g. new ranker stage that only the Edge has) become correctness liabilities — the fallback would silently produce stale rankings. Either ship to both trees in lockstep (CI-enforced) or remove the client pipeline at the same time.
- Future Phase 5 detail-page "More Like This" Edge Function reuses the same `_shared/` modules. Compounding return on the porting cost.

## Alternatives considered

- **Path (b) — refactor pipeline into a runtime-portable shared package consumed by client and Deno.** Cleaner long-term, higher upfront cost. Filed as IN-467 for post-launch revisit.
- **User-JWT-scoped Supabase client (RLS as defence-in-depth).** Rejected after the auth-spike showed ~280ms cost across a 5-8 query critical path. Service-role + `withUserScope` helper preserves the safety property at lower cost.
- **localStorage SWR snapshot of the rendered payload as part of this phase.** Deferred per Cowork's "ship Edge Function FIRST, measure, then add snapshot" framing. Filed as IN-468.

## Reference

Parking-lot IN-466 (✅ Incorporated v0.5). Phase summary `docs/v2/phase-summaries/IN-466-server-side-foryou-render-summary.md`. Auth-spike measurement in same summary §3.
