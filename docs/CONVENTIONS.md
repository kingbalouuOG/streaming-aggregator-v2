# Videx Conventions

Written down in REPO-1 (E&P brief §4.4-3) so PLAT-1 onward is built
under explicit rules rather than tribal knowledge. When this document
and reality disagree, fix one of them in the same PR.

## Where things live

| Path | What belongs there |
|---|---|
| `src/lib/` | Business logic — API clients, cache, storage, pure domain modules. No React. |
| `src/lib/api/` | Third-party + Supabase data access (TMDb, OMDB, SA, content queries, cache layer). |
| `src/lib/adapters/` | Data-model bridges: external/API shapes → UI interfaces. Wire-shape interfaces live next to the adapter that consumes them, typed to the fields actually accessed. |
| `src/lib/recommendations-v2/`, `src/lib/taste-v2/` | The engine. **Mirrored** into `supabase/functions/_shared/` per ADR-011 — see Mirror rule below. |
| `src/hooks/` | React service layer. Hooks orchestrate `lib/`; they do not contain business logic that `lib/` could own. |
| `src/components/` | UI. Design citations point at `docs/design/design-system.md`. |
| `scripts/` | Node tooling, in named subfolders (`evaluation/`, `enrichment/`, `embeddings/`, `fingerprints/`, `mood_rooms/`, `test/`). **Nothing one-off lands at the root** — root is reserved for `sync-content.ts`, `debug-server.js`, `gen-android-icons.py`. Investigation artefacts are deleted when the investigation closes (git history preserves them). |
| `workers/api/` | Cloudflare Worker (PLAT-2+). Plain folder, no workspace split (locked D6). |
| `supabase/migrations/` | Schema evolution only — see Migrations below. |
| `supabase/queries/` | Operational/analytics SQL run by humans (dashboard, funnel, report queries). |
| `supabase/cron/` | Intentionally empty — cron registrations live inside the migration that owns the consuming schema (see its README; IN-PX-31). |

## Tests vs evals

- **Tests** are vitest suites in `__tests__/` directories beside their source (`src/**` and `scripts/**`). `npm test` is the **single** test entry; CI runs it. No bespoke `npx tsx` test scripts — that pattern was retired in REPO-1.
- **Evals** (`npm run eval:*`, `scripts/evaluation/`, fingerprint eval scripts) are diagnostic gates that hit real services and produce dated reports. They are run deliberately, not by CI-on-every-push, and their reports land in `docs/v2/phase-summaries/`.
- Tests must be hermetic: the vitest config stubs Supabase env so pure-function suites can never reach production even by accident.

## Lint

- `npm run lint` must be **0 errors** at all times. `@typescript-eslint/no-explicit-any` is **error** in `src/` (burned to zero in REPO-1 — keep it there; type via `database.types.ts` for Supabase rows and minimal wire interfaces for third-party APIs). `react/jsx-no-leaked-render` is error — `cond ? <X/> : null`, never bare `count && <X/>`.
- `scripts/**` runs a relaxed profile (warn-level any/unused, CJS allowed for `debug-server.js`). `supabase/functions/**` is ignored (Deno) until PLAT-3 removes it.

## Documents

- **Active** briefs/strategy/orchestration live in `docs/v2/`. The orchestration doc's §3.4 migration table is the authoritative applied-status record (NOT the Supabase migration ledger — it has gaps from Studio applies).
- **Phase outputs** (summaries, eval reports, decision docs) land **only** in `docs/v2/phase-summaries/`. Scripts that write reports write there.
- **Superseded** versions get a one-line "superseded by …" header, not deletion; version bumps rename the file (`git mv`) so history follows.
- **Design** docs live in `docs/design/` (renamed from `v3-design` in REPO-1 — "v3" means Phase 7 only). `design-system.md` is the design source of truth.
- **Plans** live in `docs/plans/` (`YYYY-MM-DD-NNN-type-slug-plan.md`); post-mortems in `docs/solutions/`.
- The **wiki** (`videx-wiki/`) synthesises all of it — read `videx-wiki/AGENTS.md` before operating there. `raw/` is human-owned snapshots; wiki ingest rides the phase PR.

## Migrations

- Numbered, sequential, in `supabase/migrations/`. Schema evolution only — recurring-job registration lives inside the migration that owns the consuming schema.
- Additive within a phase; destructive only between phases, as the final migration of the phase that makes it safe, after a manual snapshot.
- **Applying is a Joe action** (Studio SQL editor). Never `supabase db push`: the migration ledger has gaps (033, 036–046 applied outside it) and a push would replay applied migrations and apply the intentionally-unapplied `040_editor_notes.sql`.
- Every new user-scoped table updates `delete_own_account()` + `export_user_data()` in the same migration (IN-PX-54).
- After applying: regenerate `src/lib/database.types.ts` (typegen-check CI enforces the match).

## Mirror rule (ADR-011 — until PLAT-3)

A change to `src/lib/recommendations-v2/**` or `src/lib/taste-v2/**` that has a counterpart under `supabase/functions/_shared/` must be applied to both in the same commit; `shared-tree-drift` CI enforces tree-level lockstep on the PR. Client-only modules in those trees (e.g. `bootstrap.ts`, `interactionUpdate.ts`, `kmeans.ts`) have no mirror — use a `drift-allowed: <reason>` marker in the PR body when a PR touches only those. PLAT-3 deletes the entire apparatus; do not extend it.

## Phase process

Feature branch (`phase-<name>`) → CC plan → Joe reviews plan → implementation in green commits (typecheck + `npm test` + build pass at every commit) → eval gate where the phase has one → phase summary in `docs/v2/phase-summaries/` → wiki ingest rides the PR → Joe merges. Every phase ends with an **in-phase bloat sweep**: dead code deleted, touched docs updated, no new one-off scripts at `scripts/` root.
