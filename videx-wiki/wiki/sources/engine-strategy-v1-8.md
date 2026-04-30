---
title: Source — Recommendation Engine v2 Strategy v1.8
type: source
tags: [strategy, recommendation-engine, v2, edge-functions]
created: 2026-04-30
updated: 2026-04-30
supersedes:
  - wiki/sources/engine-strategy-v1-6-3.md
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.8.md
related:
  - wiki/concepts/architecture/two-surface-architecture.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/architecture/for-you-surface.md
  - wiki/concepts/architecture/signal-architecture.md
  - wiki/concepts/architecture/mood-rooms.md
  - wiki/concepts/decisions/adr-011-edge-function-shared-modules.md
  - wiki/concepts/decisions/adr-012-server-side-foryou-render.md
---

# Source: Recommendation Engine v2 Strategy (v1.8)

Author: Head of Strategy & Engineering with Joe. Date: April 2026. Most cross-referenced doc in the v2 set.

## v1.8 changes (load-bearing)

- §5.4 added: server-side render layer for For You first paint (IN-466). One client → Edge Function call replaces 5-8 sequential client → Postgres round trips. Existing `useForYouContent` client pipeline retained as fallback path with 1.5s timeout.
- §5.4 documents the auth model (service-role + manual JWT decode + `withUserScope` helper after the auth-spike showed user-JWT-scoped reads cost ~280ms in the critical path), the fallback contract, the Variant A warm-pinger (App.tsx fires render-foryou-rows itself), and the ADR-011-compliant `_shared/` mirror with CI-enforced drift control.
- §9.5 commits 38–39 added: For You server-side render (ADR-012) + pipeline mirroring per ADR-011.
- IN-466 status flipped to ✅ Incorporated in Parking Lot v0.5; three follow-ups filed (IN-467 mirror consolidation, IN-468 Variant B SWR cache, IN-469 cold-start mitigation).

## v1.7 changes (carried forward)

- §5.2: title-anchored mood rooms ranking layer for the For You row (Phase 4.5 redirect).
- §9.3: anchored ranking on For You.
- §5.2.1: instrumentation note for migration 033 (`card_impressions.metadata` jsonb + `'anchor_room'` source_surface).

## v1.6.3 changes (carried forward)

- Migration numbers renumbered +2 from Phase 0.5 onwards to absorb Phase 0 in-phase deviations (015, 016).
- Conflict-resolution alignment with Detail Page Signal Capture Spec.

## Headline commitments (current)

- Multi-stage recommendation pipeline (Phase 4 ranker, post-processing diversity).
- Two-surface architecture (Home + For You).
- Mood Rooms as Pillar 1 USP (anchored ranking on For You; global rooms reserved for v2.5 + Phase 7).
- 4 delivery sliders that tune pipeline parameters, not taste vector.
- Detail page "More Like This" via batch Supabase query + client-side cosine similarity.
- For You first paint runs server-side via Edge Function, with client fallback (new in v1.8).
