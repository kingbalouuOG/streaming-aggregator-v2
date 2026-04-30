---
title: Source — Project Orchestration v0.3.3
type: source
tags: [orchestration, infrastructure, branching, migrations]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.3.3.md
related:
  - wiki/concepts/decisions/adr-003-supabase-pro.md
  - wiki/concepts/decisions/adr-007-v1-archived-as-tag.md
  - wiki/concepts/decisions/adr-010-pg-partman-card-impressions.md
  - wiki/concepts/decisions/adr-011-edge-function-shared-modules.md
  - wiki/concepts/operations/supabase-migration-workflow.md
  - wiki/entities/codebase/migrations.md
  - wiki/entities/infrastructure/supabase.md
---

# Source: Project Orchestration v0.3.3

Defines version control, environment setup, and orchestration for the v2 build. Sister doc to the strategy doc; mirrors strategy version log.

## v0.3.3 corrections

- §3.4 migration 017 row flipped to ✅ Applied. Description amended to four columns (`keywords`, `cast_top_5`, `director`, `content_rating`) plus partial work-queue index. `runtime` already existed at `001_content_tables.sql:24` and was backfilled opportunistically (0 → 81.4%), not re-added.
- §3.4 gained Phase 0.5 actuals note covering the four-column reality, the live `supabase/cron/` directory, the `title_credits`/`title_genres` left-empty decision, and the production row-count gate outcomes.
- `supabase/cron/` convention is now load-bearing: `enrich_new_titles.sql` is its first file (06:30 UTC daily). Future recurring-job schedules go in `supabase/cron/`, not migrations.

## Headline commitments

| Theme | Commitment |
|---|---|
| Branching | v1 archived as `v1-archive` Git tag. v2 builds forward on `main` as a series of `phase-*` branches merged with `--no-ff`. |
| Environments | Local + production Supabase Pro + Android test device. No staging. |
| Schema rule | Additive within phase, destructive across phases (each destructive op is the final migration in the phase that makes it safe). |
| Migration sequence | 011 (profiles baseline) onwards. 32 applied as of 2026-04-26. Migration 021 intentionally skipped. |
| Operational automation | Lives in `supabase/cron/`, separate from numbered migrations. |
| CI | Two GitHub Actions workflows: typecheck+lint on phase branches, build verification on `main`. No test automation yet. |
| Scheduled workflows | Mood rooms monthly recluster: `cron: '0 3 1 * *'` via GitHub Actions. Python + psycopg2 + hdbscan + openai. Secrets in GitHub Actions Secrets. |
| Backups | Supabase Pro daily auto-backups, 7-day retention. Manual snapshots before destructive migrations. Mirror remote (GitLab) for Git redundancy. |
| Workflow | Spec → branch → CC implementation → local test → migration apply → merge → tracking. CC plan-review-code-review cycle is a gate. |

## Phase actuals captured (per §3.4 notes)

- **Phase 0**: shipped migrations 012-014 plus in-phase deviations 015 and 016 (RLS partition propagation gap). Renumbered downstream by +2.
- **Phase 0.5**: shipped migration 017 (4 columns, not 5). Coverage gates met or accepted: keywords 100%, cast_top_5 100%, runtime 81.4%, content_rating 65.4% (within 60% tolerance), director 77.2% overall (movies 99.7% / TV 54.9%, accepted as TMDb structural gap, follow-ups IN-PX-06/IN-PX-07).
- **Phase 1**: migrations 018, 019. 19,993 titles embedded with text-embedding-3-small. Wire format spike: `JSON.parse(row.embedding as string)` is locked. `embed-new-titles` Edge Function + 06:45 UTC cron deployed. Cluster eval conditional pass.
- **Phase 2**: migration 020. 10 services fingerprinted, top-150 catalogue. Discrimination eval conditional pass (catalogue overlap structural). 3 services missing fingerprints (BBC iPlayer, NOW TV, Sky Go) → IN-250.
- **Phase 2.5**: 0 migrations. 600 rows inserted into `streaming_availability` (BBC/NOW/SkyGo TMDb backfill, 200 each). All 10 services fingerprinted. Cosine drift 0.0027 (PASS).
- **Phase 2.6**: migration 022. v2 exclusivity centroids built; bottom-half variance gate FAIL (5/13). Decision: ship v1_popularity. WU-3 skipped per early-exit.
- **Phase 3**: migrations 023, 024, 025, 028. Auth sign-up integrated into onboarding Step 1. Bootstrap dynamic 4-band weights by watched-grid count. v1 quiz subsystem deleted. 038/15,176 lines net.
- **Phase 4**: 0 migrations. Pipeline replaced. 7 Home rows + 7 For You rows. 4 sliders wired with bottom-sheet tray + haptic feedback. Stage 2 implemented as 3-component sum (62.5/25/12.5). Genre-spread post-processing instead of MMR (deferred to Phase 5).
- **Phase 4.5**: migrations 029, 030, 031 (Gate 4 hotfix), 032 (`mood_room` source_surface). 68 rooms at 53.5% coverage shipped.
- **Phase 5/6**: migration 033+ planned (taste_profiles RLS, pre-launch GDPR blocker).

## Why it matters

This is the operational source of truth. Every wiki page about migrations, branching, CI, or scheduled workflows derives from here.
