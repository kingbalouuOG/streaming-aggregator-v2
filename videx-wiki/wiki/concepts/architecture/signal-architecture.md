---
title: Signal architecture
type: concept
tags: [signals, instrumentation, lifecycle, dwell, deep-link]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/v2-strategy/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md
  - raw/concepts/signal-weighting-overview.md
  - raw/phase-summaries/Videx_v2_Phase_0_End_of_Phase_Summary.md
related:
  - wiki/concepts/architecture/taste-vector.md
  - wiki/concepts/architecture/lifecycle-manager.md
  - wiki/entities/codebase/event-taxonomy.md
  - wiki/concepts/decisions/adr-006-card-impressions-dedicated-table.md
  - wiki/concepts/decisions/adr-009-not-interested-rename.md
  - wiki/sources/detail-page-signal-capture-spec-v0-3-2.md
---

# Signal architecture

Two signal categories: **explicit** (user-initiated, intentional) and **silent** (behaviour-derived, passive). Both feed the recommendation engine with different weights and confidence levels. Captured silently with upfront disclosure (no per-signal toggles).

## Routing

| Destination | Events | Backed by |
|---|---|---|
| `user_interactions` | thumbs ±, watchlist ±, marked watched, `not_interested`, detail_view, dwell_event, deep_link_click, section_expanded, cast_carousel_scroll, back_navigation_speed, report_availability | Migration 010, expanded migration 013 (`session_id`, `source_surface` top-level). |
| `card_impressions` | impressions | Migration 014 (pg_partman monthly). See [ADR-006](../decisions/adr-006-card-impressions-dedicated-table.md), [ADR-010](../decisions/adr-010-pg-partman-card-impressions.md). |
| Onboarding analytics table | onboarding funnel events | `lib/analytics/logger.ts`. Separate from `user_interactions`. |

## Capture lifecycle

1. **Detail page mount** → `detail_view` event fires (anchor only, NOT positive). Dwell timer starts. Subscribe to lifecycle manager.
2. **Lifecycle events** (background/foreground): pause/resume dwell timer. 3-second deep-link expected-background window. See [lifecycle-manager](lifecycle-manager.md).
3. **Detail page unmount**: `dwell_event` fires once with `dwell_seconds` and `exit_reason`.
4. **Explicit interactions** (thumbs, watchlist, watched, not_interested, deep-link click): emit immediately. Replace previous signal on same title (rule 2 of combination).
5. **Card shown**: `recordImpression` to in-memory buffer. Flushed by [impression batcher](#impression-batcher) on six triggers.

## Interpretation matrix (canonical)

| Dwell | Exit outcome | Weight |
|---|---|---|
| <3s | any | ignored |
| 3-10s | back_to_previous, no action | −0.15 |
| 10-30s | back_to_previous, no action | −0.25 |
| 30s+ | back_to_previous, no action | −0.35 |
| any | deep_link_click (high conf) | +0.8 |
| any | deep_link_click (low conf) | +0.4 |
| any | watchlist_add | +0.3 |
| any | thumbs_up | +1.0 |
| any | thumbs_down | −0.6 |
| any | not_interested | filter only, no taste update |
| any | marked_watched | +0.5 |
| any | watched + thumbs_up combo | +1.5 (replaces both) |
| any | app_backgrounded (not expected) | ignored until session resumes |

## Combination rules

1. Dedup within 24h.
2. Replace, don't add (explicit signals supersede).
3. Decay: 90d behavioural, 180d explicit.
4. Confidence floor: first 20 interactions weighted 1.5x.
5. **Negative session cap −1.0** prevents collapse during exploratory browsing.

## Deep-link confidence tagging

`AppLauncher.openUrl()` returning successfully ≠ landing in target app. Solution: tag at the source.

- **High confidence**: openUrl succeeded **AND** `linkType === 'exact'` from `getDeepLink`.
- **Low confidence**: search-URL fallback (e.g. Prime Video), browser fallback, or any case where openUrl resolved without true app handoff.

3-second deep-link expected-background window: `markDeepLinkExpected()` is called **before** `await AppLauncher.openUrl()` to avoid the Android race (Phase 0 Task 9a hotfix). Subsequent background events within the window are tagged `expected: true` so the dwell timer doesn't treat them as session interruption.

## Impression batcher

Lives in `src/lib/instrumentation/impressionBatcher.ts`. Subscribes to lifecycle manager.

Six flush triggers:

1. 10-second interval timer.
2. Buffer reaches 100 events.
3. App lifecycle: background, foreground.
4. Bottom nav tab change (between Home/For You/Browse/Watchlist/Profile).
5. Detail page entry (before detail page loads).
6. Component unmount on app close (fire-and-forget).

Failure handling: one retry on network failure, then drop the batch. Impressions are not critical data. Tab change and detail page entry as flush boundaries prevent buffer drift between surfaces.

## Privacy stance

- No date of birth (age range only, optional).
- No gender.
- No precise location (UK-regional at most).
- No cross-app tracking or device fingerprinting.
- Viewing context stored as user setting, not tracked behaviour.
- No share-button signal (removed from weight tables — not implementable in v1 codebase).

GDPR basis: legitimate interest. Disclosure in onboarding + Privacy & Data sub-page + privacy policy. Data export (JSON) and account deletion (cascading hard-delete) per Articles 15, 17, 20.

## Conflict resolution applied

- `interaction_type` → `event_type` (canonical column name, strategy v1.6).
- `tmdb_id` → `content_id` on `card_impressions` (strategy v1.6.1).
- `dismiss` → `not_interested` event type (Phase 0, ADR-009).
- Detail view as weak positive (older drafts) → NOT positive (anchor only) (corrected per detail page spec §3.1, industry-aligned with Netflix/Prime/YouTube).
- Share signal in weight tables → removed (not implementable in v1 codebase).
