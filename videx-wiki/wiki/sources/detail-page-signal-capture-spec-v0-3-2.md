---
title: Source — Detail Page Signal Capture Spec v0.3.2
type: source
tags: [signals, instrumentation, detail-page, dwell, deep-link]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md
related:
  - wiki/concepts/architecture/signal-architecture.md
  - wiki/concepts/architecture/lifecycle-manager.md
  - wiki/entities/codebase/event-taxonomy.md
  - wiki/concepts/decisions/adr-006-card-impressions-dedicated-table.md
  - wiki/concepts/decisions/adr-009-not-interested-rename.md
  - wiki/concepts/decisions/adr-010-pg-partman-card-impressions.md
  - wiki/concepts/product/privacy-and-gdpr.md
---

# Source: Detail Page Signal Capture Spec v0.3.2

Defines what behavioural and explicit signals the detail page captures, how they're stored, how they feed taste vector and ranking, and how they're disclosed under GDPR.

## v0.3.2 corrections

- Residual `tmdb_id` → `content_id` corrections in §2.1, §2.6, §2.7, §3.1, §3.2 captured-data lists.
- §2.7 `{media_type}-{content_id}` format narrative aligned with pseudocode.
- v0.3.1: §5.1 schema corrected (`event_type`, `content_id`, `metadata`); `getDismissedIds()` pseudocode uses real column names; share signal removed; `emitDetailView` already-exists status acknowledged; migration 013 description expanded (top-level `source_surface` column, no JSONB backfill).

## Headline content

| Section | Key claim |
|---|---|
| 1.2 | Silent tracking with upfront disclosure. No per-signal toggles. |
| 2.1-2.5 | Thumbs ±, watchlist add/remove, mark watched: weights +1.0, −0.6, +0.3, −0.4, +0.5 (combined watched+thumbs_up = +1.5). |
| 2.6 | Deep link click confidence: high if `AppLauncher.openUrl()` succeeds (+0.8); low if browser fallback (+0.4). 3-second deep-link expected-background window. |
| 2.7 | "Not Interested" renamed from `dismiss` in Phase 0. `getDismissedIds()` rewritten to query `user_interactions` (`event_type = 'not_interested'`); same signature, identical semantics; localStorage writer path deleted. |
| 3.1 | Detail view alone is NOT positive. Anchors subsequent dwell/outcome events. Industry-aligned (Netflix, YouTube, Prime, Spotify). |
| 3.2 | Dwell + exit outcome interpretation matrix. <3s ignored. 3-10s/10-30s/30s+ × no action → −0.15/−0.25/−0.35. Lifecycle manager (`appState.ts`) centralises Capacitor `appStateChange`. |
| 4.3 | Combination rules: 24h dedup, replace-don't-add, decay (90/180d), 1.5x confidence floor first 20, session negative cap −1.0. |
| 4.4 | Scale consistency: weighted unit-length deltas for taste, percentages summing to 100% for ranking. v1 `scoreCandidate()` mismatch bug not carried forward. |
| 5.1 | `user_interactions` schema (existing + migration 013 additions: `session_id`, `source_surface` top-level columns, `not_interested` rename). |
| 5.2 | `card_impressions` dedicated partitioned table per [ADR-006](../concepts/decisions/adr-006-card-impressions-dedicated-table.md) and [ADR-010](../concepts/decisions/adr-010-pg-partman-card-impressions.md). Schema + indexes + flush triggers. |
| 6 | GDPR: legitimate-interest basis, onboarding disclosure, full privacy policy in Profile, data export, hard delete. Retention: active = lifetime; inactive >18m = soft-delete >12m; deleted = immediate hard delete. |
| 7 | Only one new visible UI element: "Not Interested" detail page button. |
| 9 | Migrations 013, 014. New modules `lifecycle/appState.ts`, `instrumentation/impressionBatcher.ts`, `instrumentation/sessionId.ts`, `instrumentation/dwellTimer.ts`. Modified: `interactions.ts`, `recommendations.ts`, `recommendationEngine.ts:557`, `DetailPage.tsx`, `openDeepLink.ts`, `App.tsx`. |

## Why it matters

This is the contract between the detail page and the recommendation engine. Every signal weight, decay, and lifecycle behaviour comes from here. The interpretation matrix in §3.2 is the canonical mapping from raw events to taste signal.
