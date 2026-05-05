---
title: Strategy Document Version Log
generated: 2026-04-26
sources: [docs/v2/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md changelogs]
---

# Strategy Document Version Log

Consolidated changelog across the v2 documents. Tracks what changed and why between versions, so an LLM can reason about decision evolution without reading every doc end-to-end.

## Recommendation Engine Strategy

| Version | Highlights |
|---|---|
| 1.0 | Initial draft. |
| 1.5 | Pre-rounds-1-3-review baseline. |
| 1.6 | Round-1-3 review applied: column references aligned to actual schema (`event_type`, `content_id`); Share signal removed (no share button); quiz weight column header clarified; slider names standardised. |
| 1.6.1 | Corrections v0.3.1 — `card_impressions` schema corrected to `content_id`. |
| 1.6.2 | Section 6.4 `card_impressions` schema tuple corrected `tmdb_id` → `content_id` for consistency with Detail Page Spec §5.2. |
| 1.6.3 | §6 migration numbers renumbered +2 from Phase 0.5 onwards to absorb Phase 0 deviations (015, 016 for partition RLS); Phase 0 description updated to reflect actual scope (5 migrations not 3); Phase 0.5 ref updated 015 → 017; Phase 1 → 018/019; Phase 2 → 020; Phase 3 → 021/022; Phase 4.5 → 023. |

## Project Orchestration

| Version | Highlights |
|---|---|
| 0.2 | Initial draft. |
| 0.3 | Fundamental reframe: v1 archived as Git tag rather than parallel-run. No cutover, no feature flags, no Phase 6.5 cleanup. Section 2 simplified; Section 3 rewritten; Supabase Pro tier locked; new Section 6 (Scheduled Workflows). |
| 0.3.1 | §3.4 migration table renumbered for Phase 0 deviations (015, 016 inserted; subsequent +2). New `supabase/cron/` convention surfaced. Applied-status column added. |
| 0.3.2 | (interim) |
| 0.3.3 | §3.4 migration 017 row flipped Planned → Applied with description amended (4-not-5 columns). Phase 0.5 actuals note added. `supabase/cron/` is now load-bearing with `enrich_new_titles.sql`. |

## Implementation Notes Parking Lot

| Version | Highlights |
|---|---|
| 0.2 | Initial. |
| 0.3 | New Pre-Phase 0 entry IN-PRE-001 (profiles baseline). Phase 0 expanded with IN-007 to IN-013 (dismiss rename, dismissedIds rewrite, lifecycle manager, impression batcher, pg_partman, localStorage clear, deep link confidence). Phase 0.5 added IN-105 to IN-107. Phase 1 added IN-203 to IN-205. Phase 3 added IN-301 to IN-303. Phase 4.5 added IN-455 to IN-457. Cross-phase added IN-XPS-002, IN-XPS-003. Phase 6.5 section removed; entries redistributed. |
| 0.3.1 | IN-007 prose `(interaction_type)` → `(event_type)`. IN-008 format narrative `{media_type}-{content_id}`. IN-010 `ImpressionEvent` interface uses `content_id: number`. |
| 0.3.2 | IN-PRE-001 + IN-001 to IN-013 status flipped to ✅ Incorporated post Phase 0 merge. |
| 0.3.3 | (interim) |
| 0.3.4 | IN-101 to IN-107 status flipped to ✅ Incorporated post Phase 0.5 merge. New entries IN-PX-06, IN-PX-07 (TV director extraction follow-up; split-by-media_type director gate). New cross-phase IN-XPS-004 (service-role JWT rotation), IN-XPS-005 (Windows tmp+rename lesson). |

## Detail Page Signal Capture Spec

| Version | Highlights |
|---|---|
| 0.2 | Initial. |
| 0.3 | Section 2.6 deep-link confidence tagging. Section 2.7 `not_interested` rename. Section 3.2 dwell lifecycle. Section 5.1 impression tracking moved to dedicated `card_impressions` table. Section 7.1 "Not Interested" UI. New Section 9 (Implementation References). |
| 0.3.1 | Schema diagram in §5.1 corrected to use `event_type`, `content_id`. `getDismissedIds()` pseudocode corrected. `card_impressions` schema uses `content_id`. Share signal removed. `emitDetailView()` already-exists status acknowledged. |
| 0.3.2 | Residual `tmdb_id` → `content_id` in captured-data bullet lists for §§2.1, 2.6, 2.7, 3.1, 3.2. Format narrative in §2.7 clarified. |

## Home and For You Composition Hypothesis

| Version | Highlights |
|---|---|
| 0.2 | Initial. |
| 0.3 | Slider rename "Depth vs breadth" → "Focused ↔ Varied". Critically Acclaimed row gated on OMDB ≥ 80% coverage of last 90 days. Mood Rooms cross-ref to HDBSCAN execution model. Cache TTL clarification. |

## Implementation Guide

| Version | Highlights |
|---|---|
| 0.1 | Initial. |
| 0.2 | New Section 4 Step 0: fresh-strategist-session workflow. Step 1 reframed (template illustrative). Step 6 expanded (mandatory end-of-phase summary template). New Section 4.7 status summary template. Section 5.3 cross-references. |

## Key cross-document corrections

The `event_type` vs `interaction_type` naming and `content_id` vs `tmdb_id` naming corrections are the single biggest cross-document change between v1.5 and v1.6. They reflect aligning all docs to the actual database column names. Anyone reading older versions in isolation will see incorrect identifiers.
