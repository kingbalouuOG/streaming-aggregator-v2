# Phase REPO-1 — Documentation & Repo Hygiene: Summary

**Status:** Complete pending two Joe actions (migration 046 apply; raw/ wiki re-snapshot — see §4), 2026-06-10. Single-day phase.
**Branch:** `phase-repo-1-hygiene` (kickoff + 7 implementation commits + this close-out).
**Brief:** E&P brief §4. Gating purpose: PLAT-1's client refactor is now written under the tightened rules.
**Plan:** `docs/plans/2026-06-10-002-chore-phase-repo-1-hygiene-plan.md` — all four open questions resolved per CC recommendations.

## 1. What shipped

**Workstream A — docs.** Root duplicates deleted (`phase-2-6-decision`, `phase-2-6-variance-eval`); the four root-only eval docs moved to `phase-summaries/` — **with the three fingerprint scripts that read/write those paths as live I/O repointed** (a future eval run would otherwise have resurrected the dupes, and `check-cosine-drift` would have lost its baseline). Stale interim docs deleted (`MIGRATION_NOTES`, `component-specs`, `context-update-b1-e1`, `design-tokens.json`); operational SQL moved to `supabase/queries/`. `docs/v3-design/` → `docs/design/` (27-reference sweep across code comments, docs, live wiki pages); Search-V2 briefs co-located under `docs/design/search/`. README rewritten: stale facts fixed (`content_vector` sync stages died in migration 019; "quiz results" lingered from v1), the wiki-owned file inventory trimmed to a top-level map, ENG-1 reality reflected, CONVENTIONS linked.

**Workstream B — repo structure.** `scripts/` root: 12 files → 3 (+ subfolders). Deleted seven one-offs + the executed ADR-013 backfill (plan Q2); moved the parity probe to `scripts/test/foryou-parity-probe.mjs` (**the brief listed it as debris, but it's been load-bearing CI since ENG-1** — workflow paths + all live references updated) and `backfill_missing_titles.ts` to `scripts/enrichment/`. Migration 046 written (drop `title_genres` + `title_credits` — both confirmed 0 rows in production; the Feb "reserved" rationale expired with Phase 0.5's `cast_top_5` decision). `workers/api/` README stub created (D6) so PLAT-2 lands into an agreed home.

**Workstream C — tests & lint.** The 7 bespoke `npx tsx` test scripts converted to vitest suites with assertion intent preserved 1:1 — **`npm test` is the single entry: 14 files, 146 tests** (was 7 files / 50 under vitest + 7 scripts on the side). Lint ratchet: `@typescript-eslint/no-explicit-any` **warn → error** after a full burn-down (**72 instances → 0** — 3.5× the brief's ~20 estimate; typed via generated Database types + minimal wire interfaces, zero eslint-disables, zero behavioural change); `eslint-plugin-react` added with `react/jsx-no-leaked-render: error` (the numeric-falsy post-mortem rule — 101 JSX sites converted to ternaries via the rule's semantics-preserving autofix); `scripts/**` un-ignored under a relaxed Node profile. `docs/CONVENTIONS.md` written and linked from the README.

**Wiki lint pass** (per AGENTS.md): 332 links checked → 0 broken (1 fixed); **10 contradictions resolved** (frozen cheatsheet revived through ENG-1/REPO-1, migrations register through 046, ENG-1 parking-lot entries IN-PX-55/56/57 added to the register, RPC table-count corrected, eval-harness output convention, title_genres/credits staleness across 4 pages); 3 orphan source-pages repaired via supersession links; 13 pages updated; lint entry appended to `log.md`.

## 2. Acceptance (brief §4.5)

| Criterion | Status |
|---|---|
| `npm test` single entry, green; bespoke `test:*` gone | ✅ 146/146; 7 script entries deleted |
| `npm run lint` green; `no-explicit-any` at error | ✅ 0 errors (73 warnings: 39 pre-existing exhaustive-deps + scripts-profile warn tail) |
| No duplicate/orphaned docs | ✅ dupes deleted, eval docs single-homed, script writers repointed |
| Wiki lint: zero unresolved contradictions | ✅ 10/10 found were resolved. Separately, 4 registers are flagged for **ingest-scale rebuild** — they need the human-owned raw/ re-snapshot (§4), which the brief allows as a standalone doc-only follow-up |
| `CONVENTIONS.md` exists, linked from README | ✅ |

Plus throughout: typecheck, production build green at every commit.

## 3. Deviations from the brief

1. `any` burn-down was 72, not ~20 (plan Q1 — full burn-down approved and done).
2. `_inspect_foryou_parity.mjs` moved (CI-load-bearing), not deleted.
3. Four additional root eval docs moved beyond the two named dupes, with script-path repoints the brief didn't anticipate.
4. ADR-013 backfill script deleted (Q2, not on the brief's list).
5. `supabase/functions/**` stays lint-ignored (Deno) — PLAT-3 dissolves it; the brief's "un-ignore scripts" did not extend here.

## 4. Remaining Joe actions

1. **Apply migration 046** (Studio; take a manual snapshot first — destructive). Until applied, the PR's `typegen-check` stays red (it regenerates from the remote schema, which still has the two tables).
2. **Drop refreshed snapshots into `videx-wiki/raw/`** (engine strategy v1.8, orchestration v0.8, parking lot, ENG-1/Search-V2/5.5 summaries, schema snapshot) — then CC re-ingests and rebuilds the four flagged registers (`next-steps`, `deferred-items`, `open-questions`, `acceptance-gates`). Can land inside this PR or as a standalone doc-only follow-up (brief §2 allows either).

## 5. Process notes

Two sub-agents ran the heavy mechanical chunks in parallel (test conversion; any burn-down) with disjoint file scopes — both verified independently before commit. The `drift-allowed` marker rides commit `0e1edd7` (type tightening touched `bootstrap.ts`, a non-mirrored module — no `_shared` counterpart exists). In-phase bloat sweep: trivially satisfied; this phase was the sweep.
