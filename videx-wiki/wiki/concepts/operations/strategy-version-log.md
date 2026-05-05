---
title: Strategy document version log
type: concept
tags: [version-log, strategy, changelog]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/reference/strategy-version-log.md
related:
  - wiki/sources/engine-strategy-v1-6-3.md
  - wiki/sources/project-orchestration-v0-3-3.md
  - wiki/sources/detail-page-signal-capture-spec-v0-3-2.md
  - wiki/sources/home-foryou-composition-hypothesis-v0-3.md
  - wiki/sources/implementation-guide-v0-2.md
  - wiki/sources/implementation-notes-parking-lot-v0-3-4.md
---

# Strategy document version log

Consolidated changelog across the v2 documents. Tracks what changed and why between versions, so a reader can reason about decision evolution without rereading every doc.

## Recommendation Engine Strategy

| Version | Highlights |
|---|---|
| 1.0 | Initial draft. |
| 1.5 | Pre-rounds-1-3-review baseline. |
| 1.6 | CC review applied: column references aligned (`event_type`, `content_id`); share signal removed; quiz weight clarified; slider names standardised. |
| 1.6.1 | `card_impressions` schema → `content_id`. |
| 1.6.2 | §6.4 `card_impressions` tuple `tmdb_id` → `content_id`. |
| 1.6.3 | §6 migration numbers renumbered +2 from Phase 0.5 onwards (absorbed Phase 0 015/016 deviations); Phase 0 description updated to 5 migrations. Phase 0.5 → 017; Phase 1 → 018/019; Phase 2 → 020; Phase 3 → 021/022; Phase 4.5 → 023. |

## Project Orchestration

| Version | Highlights |
|---|---|
| 0.2 | Initial. |
| 0.3 | v1 archived as Git tag (not parallel-run). No cutover, no feature flags, no Phase 6.5 cleanup. Supabase Pro tier locked. New §6 (Scheduled Workflows). |
| 0.3.1 | §3.4 migration table renumbered for Phase 0 deviations. New `supabase/cron/` convention. Applied-status column added. |
| 0.3.2 | (interim) |
| 0.3.3 | §3.4 migration 017 row flipped Planned → Applied with description amended (4-not-5 columns). Phase 0.5 actuals note added. `supabase/cron/` is now load-bearing with `enrich_new_titles.sql`. |

## Implementation Notes Parking Lot

| Version | Highlights |
|---|---|
| 0.2 | Initial. |
| 0.3 | New Pre-Phase 0 IN-PRE-001. Phase 0 IN-007 to IN-013. Phase 0.5 IN-105 to IN-107. Phase 1 IN-203 to IN-205. Phase 3 IN-301 to IN-303. Phase 4.5 IN-455 to IN-457. Cross-phase IN-XPS-002, IN-XPS-003. Phase 6.5 section removed. |
| 0.3.1 | IN-007 prose `(interaction_type)` → `(event_type)`. IN-008 format `{media_type}-{content_id}`. IN-010 `ImpressionEvent.content_id: number`. |
| 0.3.2 | IN-PRE-001 + IN-001 to IN-013 ✅ Incorporated post Phase 0 merge. |
| 0.3.3 | (interim) |
| 0.3.4 | IN-101 to IN-107 ✅ Incorporated post Phase 0.5 merge. New IN-PX-06, IN-PX-07 (TV director extraction follow-up; split-by-media_type director gate). New cross-phase IN-XPS-004 (JWT rotation), IN-XPS-005 (Windows tmp+rename lesson). |

## Detail Page Signal Capture Spec

| Version | Highlights |
|---|---|
| 0.2 | Initial. |
| 0.3 | §2.6 deep-link confidence tagging. §2.7 `not_interested` rename. §3.2 dwell lifecycle. §5.1 impressions moved to dedicated `card_impressions`. §7.1 "Not Interested" UI. New §9. |
| 0.3.1 | §5.1 schema `event_type`, `content_id`. `getDismissedIds()` pseudocode corrected. `card_impressions` uses `content_id`. Share signal removed. `emitDetailView()` already-exists status. |
| 0.3.2 | Residual `tmdb_id` → `content_id` in captured-data bullet lists for §§2.1, 2.6, 2.7, 3.1, 3.2. Format narrative in §2.7 clarified. |

## Home and For You Composition Hypothesis

| Version | Highlights |
|---|---|
| 0.2 | Initial. |
| 0.3 | Slider rename "Depth vs breadth" → "Focused ↔ Varied". Critically Acclaimed gated on OMDB ≥ 80% coverage. Mood Rooms cross-ref to HDBSCAN execution model. Cache TTL clarification. |

## Implementation Guide

| Version | Highlights |
|---|---|
| 0.1 | Initial. |
| 0.2 | New §4 Step 0: fresh-strategist-session workflow. Step 1 reframed (template illustrative). Step 6 expanded (mandatory end-of-phase summary template). New §4.7 status summary template. §5.3 cross-references. |

## Key cross-document corrections

`event_type` vs `interaction_type` and `content_id` vs `tmdb_id` corrections are the single biggest cross-document change between v1.5 and v1.6. Anyone reading older versions in isolation will see incorrect identifiers.
