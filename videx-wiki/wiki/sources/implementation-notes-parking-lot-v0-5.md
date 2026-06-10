---
title: Source — Implementation Notes Parking Lot v0.5
type: source
tags: [parking-lot, implementation-notes, in-466]
created: 2026-04-30
updated: 2026-04-30
supersedes:
  - wiki/sources/implementation-notes-parking-lot-v0-3-4.md
sources:
  - raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_v0.5.md # never snapshotted to raw/ — page written from the docs/ copy; v0.5 deltas preserved in the v0.7 changelog
related:
  - wiki/concepts/decisions/adr-012-server-side-foryou-render.md
  - wiki/concepts/architecture/for-you-surface.md
---

# Source: Implementation Notes Parking Lot v0.5

> **Superseded by [Implementation Notes Parking Lot v0.7 (+ ENG-1 section)](implementation-notes-parking-lot-v0-7.md)** (2026-06-10 snapshot). v0.6 was never snapshotted to raw/.

Running list of implementation-level notes that need to make it into CC briefs when the relevant phase comes up.

## v0.5 changes

**IN-466 incorporated.** Server-side For You render via Edge Function shipped April 2026. Status flipped from ⏳ Quick wins shipped → ✅ Incorporated.

**Eight new entries filed** from the IN-466 implementation + code review pass:

| Entry | Title | Status | Trigger |
|---|---|---|---|
| IN-467 | Long-term consolidation of `_shared/recommendations-v2/` mirror | ⏳ | Revisit after 1-2 months operational experience or first major weight refactor |
| IN-468 | Variant B — SWR localStorage snapshot of rendered payload | ⏳ | Revisit if measured warm p95 > 1.0s post-launch |
| IN-469 | Cold-start mitigation continuation (Variant A shipped, further options) | ⏳ | Production cold-start incidence > 10% |
| IN-470 | Wire `featuredLastWeek` through to Edge Function | ⏳ | Telemetry shows users notice anchor recurrence |
| IN-XPS-010 | Pro→Free Supabase downgrade risk inventory | 📋 | If cost optimisation comes up pre-launch |
| IN-XPS-011 | CI guard against `verify_jwt = false` drift | ⏳ | Pre-public-launch hardening |
| IN-XPS-012 | Promote parity probe to CI smoke test | ⏳ | First `drift-allowed:` use or first divergence incident |
| IN-XPS-013 | Pre-launch CORS tightening on user-callable Edge Functions | ⏳ | Pre-public-launch hardening |

## Carry-forward themes

- Pre-public-launch hardening cluster: IN-XPS-002 (profiles RLS), IN-XPS-004 (service-role JWT rotation), IN-XPS-006 (delete-account wiring), IN-XPS-007 (pricing review cadence), IN-XPS-011 (verify_jwt CI), IN-XPS-013 (CORS tightening).
- Phase-5+ taste/cluster review: IN-OB-006.
