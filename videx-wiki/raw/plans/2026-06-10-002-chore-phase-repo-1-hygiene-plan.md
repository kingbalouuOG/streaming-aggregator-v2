# Phase REPO-1 — Documentation & Repo Hygiene: Implementation Plan

**Status:** DRAFT v1 — awaiting Joe's review. No changes made.
**Branch:** `phase-repo-1-hygiene` (created from `main` @ `bbfd8bc`, the ENG-1 merge, 2026-06-10)
**Brief:** `docs/v2/Videx_v2_Engine_and_Platform_Hardening_Brief_v0.2.md` §4 (authoritative). Bounded cleanup landing **before PLAT-1** so the client refactor is written under the tightened rules.
**Recon performed (2026-06-10):** docs/ + scripts/ trees surveyed; eslint config read; lint warnings counted; `title_genres` / `title_credits` row counts checked in production.

## 0. Reality-checks against the brief

| Brief said | Found | Consequence |
|---|---|---|
| "~20 `any` instances" | **72** `no-explicit-any` warnings, concentrated exactly where the brief predicted (top 12 files ≈ 57, led by `useContentService` 9, `detailAdapter` 7, `useBrowse` 6) | Burn-down is ~3.5× the estimate — the phase's biggest chunk (Q1) |
| `title_genres` / `title_credits` "confirm empty" | **Both 0 rows in production** (verified today) | Parked drop is GO → migration 046. The 65-day-old `title_credits` memory ("reserved for Phase 0.5") is superseded — Phase 0.5 shipped `cast_top_5` columns instead; memory file cleaned up at close |
| `_inspect_foryou_parity.mjs` listed as deletable debris | **Load-bearing CI** — the `foryou-parity` workflow runs it (ENG-1 made it a merge gate) | MOVE to `scripts/test/`, don't delete; update workflow paths |
| Wiki raw/ lags (strategy v1.6.3, orchestration v0.3.3) | Now lags further: orchestration is v0.8, plus ENG-1 + Search-V2 + 5.5 summaries unsnapshotted | Re-snapshot is **Joe-owned** per AGENTS.md (Q4); ingest + lint are CC |

## 1. Workstream A — Docs consolidation

1. **Delete root duplicates** `docs/v2/phase-2-6-decision.md` + `phase-2-6-variance-eval.md` (diff against the `phase-summaries/` copies first; keep those). Also dedupe-check the other `docs/v2/phase-*` root files (`phase-1-cluster-eval`, `phase-1-wire-format-spike`, `phase-2-service-discrimination-*`) against `phase-summaries/` — same rule: one home, `phase-summaries/`.
2. **Triage stale interim docs:** `docs/MIGRATION_NOTES.md`, `docs/component-specs.md`, `docs/context-update-b1-e1.md` — read, then delete if superseded (git history preserves; brief's default). `docs/Attributions.md` stays (licensing). `docs/funnel-queries.sql` + `docs/report-queries.sql` → move to `supabase/queries/` (the established home, next to `dashboard.sql`). `docs/design-tokens.json` → moves with the design folder (A3) if referenced, else delete.
3. **`docs/v3-design/` → `docs/design/`** (the "v3" naming collision with Phase 7). `git mv`, then a full reference sweep: docs cross-references, `videx-wiki/`, and **code comments** (e.g. `ForYouPage.tsx`, `ContentCard.tsx` cite `docs/v3-design/design-system.md §…`). Co-locate the split search briefs: `docs/v2/Phase_Search_V2_Design_Brief.md` + `Phase_Search_V2_Kickoff.md` join `docs/design/search/` next to the implementation brief + screens (Q3).
4. **Doc lifecycle rule** written down in `CONVENTIONS.md` (C3): active briefs/strategy in `docs/v2/`; superseded versions get a one-line "superseded by …" header; phase outputs only in `docs/v2/phase-summaries/`.
5. **Wiki refresh:** Joe drops updated snapshots into `videx-wiki/raw/` (engine strategy v1.8, orchestration v0.8, parking lot v0.7+ENG-1 section, the Search-V2 / 5.5 / ENG-1 summaries) — then CC re-ingests those files and runs a full **lint pass** (contradictions, orphans, broken links, stale dates), logged per AGENTS.md. Lint runs even if the drop slips (Q4).
6. **README (21KB):** verify against post-ENG-1 reality; trim sections the wiki now owns (architecture deep-dives) down to pointers; add the CONVENTIONS.md link (acceptance item).

## 2. Workstream B — Repo structure

1. **`scripts/` root cleanup** (12 files → 4):
   - **Move** `_inspect_foryou_parity.mjs` → `scripts/test/foryou-parity-probe.mjs`; update `.github/workflows/foryou-parity.yml` (trigger path + run command).
   - **Move** `backfill_missing_titles.ts` → `scripts/enrichment/` (the recurring catalogue-gap fix per Phase 5.5 C17/C18 — "genuinely reusable moves into the named subfolder"; IN-PX-50 wraps it in a cron later).
   - **Delete** (git history keeps them): `_inspect_bbc_sa.mjs`, `_inspect_impressions.mjs`, `_measure_foryou_pool_size.mjs`, `in-465-tmdb-sample.ts`, `sync-bbc-iplayer-backfill.mjs`, `visual.mjs`, `audit-results/`, and — not on the brief's list, recommend including (Q2) — `backfill-cluster-dominant-bootstrap.ts` (ADR-013 one-time backfill, executed 2026-05-08).
   - **Keep at root:** `sync-content.ts` (production pipeline), `debug-server.js` (npm script), `gen-android-icons.py` (asset tool).
2. **Migration 046 — drop `title_genres` + `title_credits`.** Both confirmed 0 rows. Destructive-between-phases per orchestration §3.3; manual Supabase snapshot first per §8.3; **apply is Joe's action** (permission gate, established ENG-1 precedent — never `db push`). Includes: code/scripts reference sweep (sync pipeline mentions), `database.types.ts` regen, wiki deferred-items register + migrations page update, stale memory cleanup.
3. **`workers/api/` created** with a README stub (locked D6: plain folder, no workspace split) so PLAT-2 lands into an agreed location.

## 3. Workstream C — Tests & lint

1. **One test runner.** Convert the 7 tsx-script tests to vitest suites (`test:enrichment`, `test:embeddings`, `test:fingerprints`, `test:search`, `test:search-recents`, `test:contentcard-search-props`, `test:search-attribution` — console-assert style → `describe/it/expect`), broaden the vitest `include` to cover `scripts/**/__tests__`, drop the per-script `package.json` entries and the ENG-1 single-file exclusion. `npm test` becomes the single entry; CI unchanged (already runs `npm test`). `eval:*` scripts stay — evals are not tests.
2. **Lint ratchet** (current config: recommended + react-hooks, `no-explicit-any` at warn, `scripts/**` fully ignored):
   - Add `eslint-plugin-react` with `react/jsx-no-leaked-render` (the numeric-falsy-renders-zero post-mortem rule; one production bite already).
   - **Burn down all 72 `any`s** (Q1): adapter/API boundaries typed via `database.types.ts` + explicit TMDb/OMDB response interfaces; then promote `no-explicit-any` warn → **error**.
   - Un-ignore `scripts/**` with a relaxed profile (console allowed, `no-explicit-any` stays warn there); `supabase/functions/**` stays ignored (Deno — PLAT-3 dissolves it).
3. **`docs/CONVENTIONS.md`** capturing the tribal rules: directory map (lib/hooks/components/adapters), test-vs-eval split, doc lifecycle (A4), migration-vs-cron ownership, migrations-are-Joe-applied + never-`db push`-while-ledger-has-gaps, the ADR-011 mirror rule (until PLAT-3), in-phase bloat sweep. Linked from README.

## 4. Acceptance (brief §4.5)

`npm test` single entry, green, tsx `test:*` scripts gone · `npm run lint` green with `no-explicit-any` at **error** · no duplicate/orphaned docs; wiki lint log shows zero unresolved contradictions · `docs/CONVENTIONS.md` exists, linked from README.

## 5. Commit sequence

1. B1 scripts cleanup + parity-workflow path fix + B3 `workers/api/` stub.
2. A1/A2 docs dedupe + stale-doc triage + SQL-file moves.
3. A3 `v3-design` → `design` rename + full reference sweep.
4. B2 migration 046 (file + reference sweep; **Joe applies**, then typegen regen).
5. C1 vitest consolidation.
6. C2a `any` burn-down (likely split into 2–3 mechanical commits by area: hooks / adapters / api+utils).
7. C2b plugin + rule promotions + scripts un-ignore.
8. C3 CONVENTIONS.md + A6 README trim + A5 wiki ingest/lint + close-out (summary, bloat sweep — trivially: this phase IS the sweep).

Each commit leaves `npm test` + `npx tsc --noEmit` + the production build green.

## 6. Open questions for Joe

1. **72 `any`s, not ~20** — full burn-down in-phase (recommended: it's mechanical, and PLAT-1 wants the error-level rule in force), or cap at the top files with targeted suppressions for a long tail?
2. **Delete `backfill-cluster-dominant-bootstrap.ts`?** One-time ADR-013 backfill, already executed; not on the brief's list. Recommend delete.
3. **Search-brief co-location direction** — `docs/design/search/` as the single home for the Search-V2 design briefs (kickoff + design brief move out of `docs/v2/`). Recommend yes, per brief §4.2-3.
4. **Wiki snapshot drop timing** — Joe-owned input (AGENTS.md: raw/ is human-written). Can land any time inside the phase; ingest + lint follow whenever it does. If it slips past the phase, the lint pass still runs and the re-ingest moves to a standalone commit later (brief allows doc-only items as standalone PRs).
