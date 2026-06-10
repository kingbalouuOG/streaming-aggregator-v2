---
title: Source — Implementation Notes Parking Lot v0.3.4
type: source
tags: [parking-lot, implementation-notes, in-xxx]
created: 2026-04-26
updated: 2026-06-10
sources:
  - raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md
related:
  - wiki/sources/engine-strategy-v1-6-3.md
  - wiki/sources/detail-page-signal-capture-spec-v0-3-2.md
  - wiki/concepts/architecture/lifecycle-manager.md
  - wiki/concepts/architecture/mood-rooms.md
---

# Source: Implementation Notes Parking Lot v0.3.4

> Superseded by [Implementation Notes Parking Lot v0.5](implementation-notes-parking-lot-v0-5.md) (2026-04-30); docs source of truth is now v0.7 — see the [parking-lot register](../registers/parking-lot.md).

Per-phase implementation-level notes that need to land in CC briefs at the right phase.

## v0.3.4 changes

- IN-101 through IN-107 ✅ Incorporated (Phase 0.5 closeout). Reflected on `phase-0.5-content-enrichment` branch (`e813c39` through `c4a8916`).
- New: IN-PX-06 (TV director extraction widening follow-up), IN-PX-07 (split-by-media_type director gate policy) from 77.2% director coverage miss.
- Cross-phase: IN-XPS-004 (service-role JWT rotation pre-launch), IN-XPS-005 (Windows tmp+rename lesson from Phase 0.5 EPERM crash).

## v0.3.3 changes

- IN-PRE-001, IN-001 through IN-013 ✅ Incorporated (Phase 0). Reflected on `phase-0-instrumentation` branch (`ea1e456` through `e8702dc`). IN-005/IN-011 status notes call out 015/016 deviations.

## Indexing convention

| Range | Phase / Scope |
|---|---|
| IN-PRE-001 | Pre-Phase 0 (profiles baseline migration). |
| IN-001 — IN-013 | Phase 0 (dwell, lifecycle, impressions, dismiss rename, deep link confidence). |
| IN-101 — IN-107 | Phase 0.5 (enrichment columns, runtime backfill, static genre mapping, Edge Function split). |
| IN-PX-01 — IN-PX-07 | Cross-phase deviation patterns (partition RLS event trigger, director coverage policy). |
| IN-2xx | Phase 2 / 2.5 (service fingerprints, BBC/NOW/SkyGo backfill). |
| IN-3xx | Phase 3 (hook rewrites, detail page batch query, quiz subsystem deletion). |
| IN-4xx | Phase 4 / 4.5 (mood rooms — IN-455 Python env, IN-456 psycopg2, IN-457 UMAP+HDBSCAN tuning, IN-459 coverage revisit). |
| IN-OB-xxx | Onboarding-flow specific. |
| IN-XPS-xxx | Cross-phase (IN-XPS-002 profiles RLS tightening, IN-XPS-003, IN-XPS-004 JWT rotation, IN-XPS-005 Windows tmp+rename). |

## Why it matters

The parking lot is the operational glue between strategy intent and per-phase implementation detail. Every phase brief scans this for the relevant IN-XXX entries and incorporates them. Once incorporated, the entry stays in the file marked ✅ as a record.
