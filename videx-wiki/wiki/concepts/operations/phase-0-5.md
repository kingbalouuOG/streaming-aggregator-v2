---
title: Phase 0.5 — First-party content enrichment
type: concept
tags: [phase, phase-0-5, enrichment, tmdb]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/phase-summaries/Videx_v2_Phase_0_5_End_of_Phase_Summary.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/entities/codebase/migrations.md
  - wiki/entities/apis/tmdb.md
  - wiki/concepts/operations/edge-function-deployment.md
---

# Phase 0.5 — First-party content enrichment

Branch: `phase-0.5-content-enrichment`. Completed 2026-04-11 at commit `c4a8916`. Backend only — no UI, no engine changes. Pure data/schema phase.

## What was built

Migration 017: adds `keywords TEXT[]`, `cast_top_5 TEXT[]`, `director TEXT`, `content_rating TEXT` to `titles`, plus partial work-queue index `(id) WHERE keywords IS NULL`. `runtime` already existed at `001:24` and was backfilled opportunistically (0 → 81.4%).

New code:

| Path | Runtime | Role |
|---|---|---|
| `supabase/functions/_shared/extract_fields.ts` | Node + Deno | Pure transformer: TMDb detail → `{ keywords, cast_top_5, director, content_rating, runtime }`. Defensive narrowing throughout. |
| `scripts/enrichment/backfill-enrichment.ts` | Node | One-time bulk backfill. Resume-safe via `WHERE keywords IS NULL` work queue. EPERM-retry on Windows. |
| `scripts/enrichment/tmdb-enrichment-client.ts` | Node | Rate-limited fetch wrapper (260ms gate, exponential backoff on 429/5xx, 404 → null). |
| `supabase/functions/enrich-new-titles/index.ts` | Deno | Ongoing enrichment, JWT-verified, 100 rows per invocation. |
| `supabase/cron/enrich_new_titles.sql` | pg_cron | Daily 06:30 UTC. **First file in `supabase/cron/`** — establishes the operational-vs-schema convention. |

13 `node:assert/strict` tests + 6 fixture files.

## Verification — row-count gates

| Field | Populated | Pct | Gate | Status |
|---|---|---|---|---|
| `keywords` | 19,993 | 100.0% | ≥80% | PASS |
| `cast_top_5` | 19,993 | 100.0% | ≥80% | PASS |
| `runtime` | 16,288 | 81.4% | ≥80% | PASS |
| `director` overall | 15,448 | 77.2% | ≥80% | MISS — split below |
| `director` movies | 9,965 / 9,998 | 99.7% | ≥95% (proposed) | PASS |
| `director` TV | 5,483 / 9,995 | 54.9% | best-effort | accepted |
| `content_rating` | 13,078 | 65.4% | ≥60% | PASS |

## Deviations

1. **Windows EPERM crash in checkpoint writer** — atomic `writeFileSync(tmp) → renameSync(tmp, final)` raced with VS Code/Claude Code file watchers on Windows at row ~17K of 20K. Fix: dropped tmp+rename for plain `writeFileSync`, added 3-attempt EPERM retry with 50ms busy-wait, reduced cadence every-row → every-50-rows. Lesson filed as IN-XPS-005.
2. **`runtime: 0` as TMDb sentinel** — TMDb returns `runtime: 0` as "no value", not "0 minutes". Movie extractor preserved 0; TV path already filtered `n > 0`. Fix: movie extractor now returns `null` if `runtime <= 0`. One affected production row patched.
3. **Director 77.2% miss accepted as structural TV catalogue limit** — `extractDirector` for TV reads `created_by[]` (showrunner concept), which is structurally empty for documentaries, reality, anthology, old/foreign titles. Movie path at 99.7% proves the extractor is correct. Policy split filed as IN-PX-07; widening follow-up filed as IN-PX-06.

## Lessons

- Atomic tmp+rename is Windows-hostile for files under VS Code / Claude Code observation.
- TMDb uses sentinel zeros, not NULL, for missing numeric data (`runtime`, `vote_count`, `popularity`, `episode_count`).
- TMDb `created_by[]` is the TV "showrunner" field, not a general director field.
- Postgres 17.6 on Supabase Pro (not 15.x as brief assumed); migration 017 features work identically.
- `supabase/functions/_shared/` cross-runtime pattern handles Node and Deno transparently; CLI auto-uploads shared modules.

## Parking-lot adds

IN-XPS-004 (service-role JWT in cron files → Supabase Vault before launch), IN-XPS-005 (Windows tmp+rename hostility), IN-PX-06 (TV director widening to `credits.crew[]` "Series Director"), IN-PX-07 (split director gate by media_type).
