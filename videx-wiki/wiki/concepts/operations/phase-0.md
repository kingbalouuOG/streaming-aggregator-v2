---
title: Phase 0 — Instrumentation
type: concept
tags: [phase, phase-0, instrumentation, lifecycle, dwell, impressions]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/phase-summaries/Videx_v2_Phase_0_End_of_Phase_Summary.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/architecture/lifecycle-manager.md
  - wiki/concepts/architecture/signal-architecture.md
  - wiki/entities/codebase/migrations.md
  - wiki/concepts/decisions/adr-006-card-impressions-dedicated-table.md
  - wiki/concepts/decisions/adr-009-not-interested-rename.md
  - wiki/concepts/decisions/adr-010-pg-partman-card-impressions.md
---

# Phase 0 — Instrumentation

Branch: `phase-0-instrumentation`. Completed 2026-04-10 at commit `85f35d2`. 17 files changed, 1,792 insertions, 104 deletions.

## What was built

| Migration | Purpose |
|---|---|
| 012 | `age_range`, `viewing_context` on `profiles`. |
| 013 | `session_id`, `source_surface` top-level columns; `dismiss` → `not_interested`; CHECK constraint. |
| 014 | `card_impressions` (pg_partman monthly), `card_impression_daily_totals`, two pg_cron jobs (rollup 01:00 UTC, partman maintenance 02:00 UTC). |
| **015** (deviation) | RLS hardening on existing partitions + template table. |
| **016** (deviation) | `ddl_command_end` event trigger replicating RLS to new partitions. |

New client modules: `src/lib/lifecycle/appState.ts`, `instrumentation/sessionId.ts`, `instrumentation/impressionBatcher.ts`, `instrumentation/dwellTimer.ts`. Modified: `recommendations.ts` (`getDismissedIds()` rewrite), `interactions.ts`, `openDeepLink.ts`, `DetailPage.tsx`, `ContentRow.tsx`, `App.tsx`, `main.tsx` (localStorage v1 purge gated by `@videx_version='2'`).

## Verification

14/14 end-to-end checks PASS against production Supabase with a real signed-in test user on a production APK, plus `tsc --noEmit` clean and `npm run build` clean.

## Deviations

1. **Migration 014 schema-prefix amendment** — pg_partman v5.3.1 installs into `public` on Supabase Pro, not `partman`. Amended via `git commit --amend` + `--force-with-lease` before apply. Zero functional impact.
2. **Migration 015 added** — Postgres does not propagate RLS from a partitioned parent to child partitions. Added to harden existing partitions and template table.
3. **Migration 016 added** — `template_table` propagates constraints/indexes/CLUSTER but NOT RLS. Event trigger is the only zero-exposure-window solution. Documented as IN-PX-01 reusable pattern.
4. **Task 9a deep link confidence hotfix (commit `85f35d2`)** — two bugs fixed during native verification: (a) `markDeepLinkExpected()` race (moved before `await AppLauncher.openUrl`), (b) `linkType: 'exact' | 'search'` added to `DeepLinkContext` (search URLs always emit `low` confidence regardless of openUrl outcome).

## Lessons (carried into parking lot)

- pg_partman `template_table` is for constraints, not RLS (IN-PX-01).
- Supabase installs pg_partman into `public`, not `partman`.
- Capacitor `appStateChange` and `AppLauncher.openUrl` race on Android; set state before the await.
- `AppLauncher.openUrl` success ≠ landing in target app; tag link type at resolve.
- Session ID must be captured at moment of interaction (`startDwell`), not at emit time.
- Event triggers are available on Supabase Pro under `postgres` role.

## Parking-lot adds

IN-PX-01 (RLS event trigger pattern), IN-PX-02 (consolidate v1 `watched`/`removed` with v2 `marked_watched`/`watchlist_remove`), IN-PX-03 (impression dedup granularity revisit at Phase 3), IN-PX-04 (`@app_hidden_gems` is intentional no-op).
