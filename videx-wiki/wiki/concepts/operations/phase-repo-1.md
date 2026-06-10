---
title: Phase REPO-1 — Documentation & repo hygiene
type: concept
tags: [phase, repo-1, hygiene, docs, lint, vitest, conventions, migration-046, e-p-track]
created: 2026-06-10
updated: 2026-06-10
sources:
  - raw/phase-summaries/phase-repo-1-summary.md
  - raw/plans/2026-06-10-002-chore-phase-repo-1-hygiene-plan.md
  - raw/v2-strategy/Videx_v2_Engine_and_Platform_Hardening_Brief_v0.2.md
  - raw/codebase-snapshots/database-schema-snapshot.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/operations/phase-eng-1.md
  - wiki/entities/codebase/migrations.md
  - wiki/entities/codebase/database-schema.md
  - wiki/registers/acceptance-gates.md
  - wiki/sources/ep-hardening-brief-v0-2.md
  - wiki/sources/phase-repo-1-summary.md
  - wiki/concepts/operations/solutions/react-numeric-falsy-renders-zero.md
---

# Phase REPO-1 — Documentation & repo hygiene

Closed 2026-06-10 (single-day phase). Branch `phase-repo-1-hygiene` (kickoff + 7 implementation commits + close-out). Second phase of the [E&P Hardening track](../../sources/ep-hardening-brief-v0-2.md) (brief §4). Gating purpose: PLAT-1's client refactor is written under the tightened rules. Cost delta £0 (one dev dependency: `eslint-plugin-react`).

## What was delivered

**Workstream A — docs.** Root duplicates deleted (`phase-2-6-decision`, `phase-2-6-variance-eval`); four root-only eval docs moved to `docs/v2/phase-summaries/` with the three fingerprint scripts that read/write those paths repointed (live I/O — a future eval run would have resurrected the dupes). Stale interim docs deleted (`MIGRATION_NOTES`, `component-specs`, `context-update-b1-e1`, `design-tokens.json`); operational SQL moved to `supabase/queries/`. `docs/v3-design/` → `docs/design/` (27-reference sweep incl. code comments and live wiki pages — kills the "v3" naming collision with Phase 7); Search-V2 briefs co-located under `docs/design/search/`. README rewritten (stale facts fixed; wiki-owned inventory trimmed; CONVENTIONS linked).

**Workstream B — repo structure.** `scripts/` root: 12 files → 3 (+ subfolders). Seven one-offs + the executed ADR-013 backfill deleted; the parity probe moved to `scripts/test/foryou-parity-probe.mjs` (**brief listed it as debris; it's load-bearing CI since ENG-1** — workflow paths updated); `backfill_missing_titles.ts` → `scripts/enrichment/`. **Migration 046** written: drop `title_genres` + `title_credits` (both confirmed 0 rows; the Feb "reserved" rationale expired with Phase 0.5's `cast_top_5`). Applied by Joe post-close — the regenerated [schema snapshot](../../entities/codebase/database-schema.md) (2026-06-10) is a live pull post-046. `workers/api/` README stub created (D6) so PLAT-2 lands into an agreed home.

**Workstream C — tests & lint.** 7 bespoke `npx tsx` test scripts → vitest suites, assertions preserved 1:1 — **`npm test` single entry: 14 files / 146 tests** (was 7 files / 50 + 7 scripts). Lint ratchet: `@typescript-eslint/no-explicit-any` warn → **error** after a full burn-down (**72 → 0**, 3.5× the brief's ~20 estimate; typed via generated Database types + minimal wire interfaces, zero eslint-disables); `eslint-plugin-react` + `react/jsx-no-leaked-render: error` (the [numeric-falsy post-mortem](solutions/react-numeric-falsy-renders-zero.md) rule — 101 JSX sites autofixed to ternaries); `scripts/**` un-ignored under a relaxed Node profile. `docs/CONVENTIONS.md` written, linked from README.

**Wiki lint pass** (rode the phase): 332 links → 0 broken; 10 contradictions resolved; 3 orphan source pages repaired via supersession links; 13 pages updated. Four registers flagged for ingest-scale rebuild — completed at the 2026-06-10 raw re-snapshot ingest.

## Acceptance (brief §4.5) — all met

See [acceptance-gates](../../registers/acceptance-gates.md). `npm test` single + green (146/146) · lint 0 errors with `no-explicit-any` at error · no duplicate/orphaned docs · wiki contradictions 10/10 resolved · CONVENTIONS.md linked. Typecheck + production build green at every commit.

## Deviations from the brief

1. `any` burn-down 72 not ~20 (full burn-down, plan Q1). 2. Parity probe moved not deleted (CI-load-bearing). 3. Four extra root eval docs moved with unanticipated script repoints. 4. ADR-013 backfill script deleted (plan Q2). 5. `supabase/functions/**` stays lint-ignored (Deno; PLAT-3 dissolves it).

## Process notes

Two sub-agents ran the heavy mechanical chunks in parallel (test conversion; any burn-down) with disjoint file scopes, verified independently before commit. `drift-allowed` marker on commit `0e1edd7` (type tightening touched `bootstrap.ts` — non-mirrored, no `_shared` counterpart). In-phase bloat sweep trivially satisfied: this phase WAS the sweep.
