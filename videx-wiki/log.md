# Log

Append-only chronological record. Newest entries at the bottom. Format: `## [YYYY-MM-DD] {ingest|query|lint} | {subject}`. See [AGENTS.md](AGENTS.md).

---

## [2026-04-26] init | wiki bootstrapped
- Created schema (AGENTS.md), README, index.md, log.md
- Created empty raw/ and wiki/{entities,concepts,sources}/ directories
- Pattern: Karpathy's LLM Wiki (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

## [2026-04-26] schema-update | added subfolder conventions
- AGENTS.md: defined subfolders under raw/, wiki/entities/, wiki/concepts/
- entities subfolders: apis, streaming-services, infrastructure, codebase
- concepts subfolders: architecture, techniques, domain, operations, decisions, glossary
- raw/ subfolders: codebase-snapshots, api-references, streaming-services, infrastructure, concepts, runbooks, adrs, reference, research, frontend, product, v2-strategy
- AGENTS.md mutability note added: LLM may create raw files when explicitly directed by human

## [2026-04-26] seed | bulk raw/ seeding (48 files)
- raw/codebase-snapshots/: database-schema-snapshot, migration-changelog, module-map, hook-inventory, component-inventory, rpc-catalogue, event-taxonomy, package-json-annotated
- raw/api-references/: tmdb-api-reference, omdb-api-reference, streaming-availability-api-reference
- raw/infrastructure/: supabase-configuration, capacitor-reference, pgvector-pg_partman-pg_cron, rapidapi, hdbscan-and-github-actions
- raw/streaming-services/: uk-services-reference (consolidated, 10 services)
- raw/concepts/: embedding-model-primer, hdbscan-primer, two-surface-architecture, cold-start-strategy, rls-pattern, signal-weighting-overview, justwatch-as-source, uk-streaming-market
- raw/runbooks/: sync-pipeline, embedding-backfill, edge-function-deployment, monthly-mood-room-recluster, apk-build-and-install, service-role-jwt-rotation, supabase-backup-restore, supabase-migration-workflow
- raw/adrs/: adrs-combined (11 ADRs)
- raw/reference/: glossary, phase-timeline, risks-register, strategy-version-log, eval-harness-reference
- raw/research/: research-stubs (placeholders for 6 referenced inputs)
- raw/frontend/: tailwind-v4-conventions, motion-animation-patterns, accessibility-checklist
- raw/product/: mission-and-pitch, user-personas, privacy-policy-draft, tone-and-voice-guide
- raw/v2-strategy/: README pointing to docs/v2/ originals to be copied in
- Pending: ingest each into wiki/sources, wiki/entities, wiki/concepts; copy actual docs/v2/ files into raw/v2-strategy/, raw/solutions/, raw/plans/

## [2026-04-26] schema-update | added split subfolders + raw/docs relationship note
- raw/ subfolders added: phase-summaries, evaluations, solutions, plans, screenshots
- AGENTS.md updated: `raw/` and `docs/` relationship section codifies snapshot semantics, refresh cadence, and source-of-truth in `docs/` not `raw/`
- raw/v2-strategy/ now scoped to the seven canonical strategy/design docs only; phase summaries and evals split out

## [2026-04-26] schema-update | added raw/forward-planning/ for post-v2 material
- New folder for v3 thinking, monetisation, scaling, roadmap material
- AGENTS.md updated with the folder and a status-field convention (exploratory | shortlisted | locked | shipped | parked)
- README in folder explains the distinction from raw/v2-strategy/ and naming conventions

## [2026-04-26] plan | full ingest

86 raw files across 18 subfolders. Order:

1. Foundational reads first: `reference/glossary.md`, `v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md`, `adrs/adrs-combined.md`, all `codebase-snapshots/`. These pin canonical column names (`event_type`, `content_id`), the two-surface architecture, and the locked v2 decisions everything else must align with.
2. Ingest `codebase-snapshots/` and `reference/glossary.md` to build the entity backbone. **Gateway A pause**: review whether codebase items are entities or concepts, and whether glossary stays single-page.
3. `v2-strategy/` (six docs after the strategy itself), `adrs/adrs-combined.md` (split into per-decision pages), `phase-summaries/` chronologically, then `evaluations/`. **Gateway B pause**: review ADR grouping, phase summary consolidation, strategy-vs-outcome split.
4. Remaining: `api-references/`, `streaming-services/`, `infrastructure/`, `concepts/`, `runbooks/`, `solutions/`, `plans/`, `research/`, `frontend/`, `product/`, `forward-planning/`. **Gateway C pause**: full lint.

Conflict policy per Step 4: v1.6.3 strategy + actual phase outcomes win over older intent. Forward-planning stays exploratory and never overrides locked decisions.

AGENTS.md amendments: none planned up front. May propose splitting `concepts/decisions/` (currently a single subfolder housing all ADRs) if that proves unwieldy, or adding a `concepts/evaluations/` folder for eval reports if they don't fit cleanly under `decisions/`. Will flag at Gateway B.

Log entries: one per subfolder (batched), three gateway entries, one final lint. Conflicts surfaced inline per Step 4 format. Begin now.

## [2026-04-26] ingest | reference/glossary.md
- New page: wiki/concepts/glossary.md (mirrors raw glossary, single page)
- New source: wiki/sources/glossary.md
- Cross-refs queued: every entity/concept page below references the glossary

## [2026-04-26] ingest | codebase-snapshots/ (8 files)
- New entities: database-schema, migrations, rpcs, module-map, components, hooks, event-taxonomy
- package-json folded into module-map (no standalone page; runtime stack table + omissions section)
- New source: wiki/sources/codebase-snapshots.md
- Notes:
  * Strategy v1.6.3 names `event_type` and `content_id` as canonical; codebase snapshot uses both. No conflict.
  * Migration 021 intentionally skipped per snapshot. Strategy v1.6.3 §6 renumbering matches. No conflict.
  * Conflict resolved: card_impressions column name `tmdb_id` in older docs (pre v1.6.1) superseded by `content_id` in raw/codebase-snapshots/database-schema-snapshot.md and strategy v1.6.3. Wiki entity reflects `content_id`. Event taxonomy page notes the rename.

## [2026-04-26] structure-review | gateway A
Decisions:
- **Glossary kept as a single page** under wiki/concepts/glossary.md. Splitting by section (project / recommendation / signals / ops / stack) would fracture lookups. Re-evaluate only if it exceeds ~400 lines (currently ~90).
- **Codebase items kept as entities, not concepts.** They describe concrete artefacts (tables, modules, hooks, RPCs, components) that exist in the repo. Concepts (RLS pattern, signal architecture) get their own pages and link in.
- **No subfolder split inside entities/codebase/** for now. Seven pages is manageable; introduce sub-grouping (e.g. `entities/codebase/database/` vs `entities/codebase/frontend/`) only if it grows past ~15.
- **Event taxonomy lives under entities/codebase/** rather than concepts/architecture/, because the table is a concrete catalogue of every emitted event in the codebase, not a pattern. The signal-architecture concept page (forthcoming) will link to it.
- **package-json folded into module-map** — too small to merit its own entity page, sufficiently relevant to module map.
- AGENTS.md not amended at this gateway. The schema's suggested layout fits cleanly. Will re-evaluate at Gateway B once ADR + phase + eval folders populate.

## [2026-04-26] ingest | v2-strategy/ (8 files)
- New sources: engine-strategy-v1-6-3, project-orchestration-v0-3-3, detail-page-signal-capture-spec-v0-3-2, home-foryou-composition-hypothesis-v0-3, implementation-guide-v0-2, implementation-notes-parking-lot-v0-3-4, design-reference-v0-1, v2-strategy-readme
- New concepts (architecture): two-surface-architecture, home-surface, for-you-surface, recommendation-pipeline, taste-vector, service-fingerprints, mood-rooms, sliders, onboarding-flow, cold-start, signal-architecture, lifecycle-manager
- Conflict resolved: `interaction_type` (older docs) superseded by `event_type` in strategy v1.6 and codebase. Wiki uses `event_type` throughout.
- Conflict resolved: `tmdb_id` on `card_impressions` (older docs) superseded by `content_id` in strategy v1.6.1 and detail page spec v0.3.2. Wiki entity reflects `content_id`.
- Conflict resolved: `dismiss` event type (older docs) superseded by `not_interested` in strategy v1.6.3 §7.2 and Phase 0 ADR-009. Wiki reflects `not_interested`; legacy term documented in glossary and ADR-009.
- Conflict resolved: "Depth vs breadth" slider naming (older docs) superseded by "Focused ↔ Varied" in strategy v1.6 / hypothesis v0.3. Wiki reflects new name with rename history captured.
- Conflict resolved: detail view as weak positive (older drafts of detail page spec) superseded by detail-view-NOT-positive in detail page spec v0.3.2 §3.1 (industry-aligned with Netflix/Prime/YouTube). Wiki reflects current spec.
- Conflict resolved: share signal in weight tables (older drafts) superseded by removal in strategy v1.6 (no share button in v1 codebase). Wiki omits share signal.
- Conflict resolved: strategy v1.5 static bootstrap weights 0.40/0.40/0.20 superseded by Phase 3 dynamic 4-band weights and acknowledged in strategy v1.6.3 §5.2. Wiki taste-vector and onboarding pages reflect dynamic weights with rename history.
- Conflict resolved: strategy v1.5 expectation of 30-60 mood rooms at 70-80% coverage superseded by Phase 4.5 actuals (68 rooms at 53.5% coverage; coverage plateau structural) acknowledged in strategy v1.6.3 §5.2. Wiki mood-rooms page reflects actuals.
- Conflict resolved: strategy v1.6.3 §5.2 5-component Stage 2 weight table represents intent; Phase 4 actuals shipped 3-component scoring sum (62.5/25/12.5) + diversity as post-processing per §5.2 Phase 4 implementation note. Wiki recommendation-pipeline page presents both with the implementation note explaining the difference.
- Conflict resolved: strategy v1.5 said Phase 0 would ship 3 migrations (012-014); actual Phase 0 shipped 5 (012-016). Strategy v1.6.3 §6 renumbers downstream by +2. Wiki migrations entity uses actual numbering.
- Conflict resolved: brief said Phase 0.5 enrichment scope was 5 columns; actual 4 + opportunistic backfill of pre-existing `runtime` column. Wiki phase-0-5 page reflects actual.
- Conflict resolved: Phase 0.5 director gate. Brief had single 80% gate across all titles; phase split it post hoc by media_type (movies ≥95%, TV best-effort) per IN-PX-07. Wiki phase-0-5 page reflects split policy.

## [2026-04-26] ingest | adrs/ (1 file → 11 per-ADR pages + index)
- New per-ADR concepts under wiki/concepts/decisions/: adr-001 through adr-011
- New source: wiki/sources/adrs-combined.md (acts as index)
- Decision: split rather than keep combined, because individual decisions are linked from many entity and concept pages and the combined page would force readers to scan past unrelated context.

## [2026-04-26] ingest | phase-summaries/ (10 files including 2 duplicated decisions)
- New concepts (operations): phase-history, phase-0, phase-0-5, phase-1, phase-2, phase-2-5, phase-2-6, phase-3, phase-4
- New source: wiki/sources/phase-summaries.md
- Decision: per-phase pages (per AGENTS.md) plus a consolidated phase-history page (per Gateway B option). Both are useful: phase-history is the timeline scan; per-phase preserves specifics.
- Note: no Phase 4.5 end-of-phase summary file exists despite Phase 4.5 being marked ✅ Complete in strategy v1.6.3 and orchestration v0.3.3. Phase 4.5 facts reconstructed from strategy + migrations + ADR-005. Flagged as missing in phase-summaries source page.
- phase-summaries/phase-2-6-decision.md and phase-summaries/phase-2-6-variance-eval.md duplicate raw/evaluations/ files of the same name. Wiki treats them as evaluations.

## [2026-04-26] ingest | evaluations/ (6 files)
- New concepts (evaluations): phase-1-cluster-eval, phase-1-wire-format-spike, phase-2-service-discrimination-eval (consolidates baseline + 13-service eval), phase-2-6-decision, phase-2-6-variance-eval
- New source: wiki/sources/evaluations.md
- Decision: phase-2-service-discrimination-baseline.md and phase-2-service-discrimination-eval.md consolidated into one wiki concept page because the baseline is a frozen snapshot of the same metric for cosine drift comparison; treating them as separate pages would split a single evaluation thread.

## [2026-04-26] structure-review | gateway B
Decisions:
- **ADRs split per-decision** rather than kept combined. Each ADR is linked from many entity and concept pages; per-page is more queryable. The combined source page acts as the index. Eleven `concepts/decisions/adr-*.md` pages plus one `sources/adrs-combined.md`.
- **Phase summaries get both per-phase concept pages AND a consolidated phase-history page.** Per-phase preserves specifics (deviations, lessons, parking-lot adds). Phase-history is the timeline scan. Both are useful and they don't duplicate content; phase-history compresses, per-phase expands. Phase 4.5 has no per-phase page (no source file).
- **Strategy vs outcome separation**: strategy intent lives on `concepts/architecture/*` (taste-vector, mood-rooms, recommendation-pipeline) with the actual Phase N outcome called out inline ("Phase 4 implementation note", "Phase 4.5 actuals"). Phase summaries on `concepts/operations/*` carry the deltas. This keeps strategy pages from drifting stale while preserving traceability.
- **`concepts/evaluations/` folder added.** Eval reports are first-class concept pages, not subfolders of operations. AGENTS.md proposed `concepts/decisions/` for ADRs; evaluations sit alongside.
- **AGENTS.md amendment proposed**: add `concepts/evaluations/` to the schema's listed subfolders under `wiki/concepts/`. Currently the schema lists architecture, techniques, domain, operations, decisions, glossary. Evaluation reports fit under none of these cleanly. Will edit AGENTS.md after Gateway C lint to consolidate any other schema tweaks at once.
- AGENTS.md not amended yet at this gateway; will batch any schema changes at Gateway C.

## [2026-04-26] ingest | api-references/ (3 files)
- New entities: tmdb, omdb, streaming-availability-api
- New source: wiki/sources/api-references.md
- Notes: pinned TMDb sentinel-zero gotcha, OMDB IMDb-ID-preferred lookup, SA API BBC iPlayer empty catalogue gap.

## [2026-04-26] ingest | streaming-services/ (1 consolidated file)
- New entity: uk-services
- New source: wiki/sources/streaming-services.md
- Notes: 10 UK services consolidated into one entity page; per-service cards inline. Pricing reviewed quarterly per IN-XPS-007.

## [2026-04-26] ingest | infrastructure/ (5 files)
- New entities: supabase, capacitor, pgvector-pg_partman-pg_cron, rapidapi, github-actions
- New source: wiki/sources/infrastructure.md
- Notes: Supabase Pro tier locked; pg_partman installs to `public` not `partman`; partition RLS via event trigger pattern reused across the wiki.

## [2026-04-26] ingest | concepts/ (8 files)
- All eight primers map to existing concept pages already written from gateway A/B work.
- New source: wiki/sources/concepts-primers.md (acts as routing index + conflict-note collector).
- Conflicts resolved (recorded in source page):
  * Conflict resolved: detail_view as "weak positive" in `signal-weighting-overview.md` superseded by detail_view = NOT positive (anchor only) in detail page spec v0.3.2 §3.1. Wiki signal-architecture page reflects current spec.
  * Conflict resolved: "Surprising ↔ Safe" slider name in `signal-weighting-overview.md` superseded by "Comfort Zone" in composition hypothesis v0.3 / strategy v1.6.3. Wiki sliders page reflects current naming.
  * Conflict resolved: "Continue Exploring" row in `two-surface-architecture.md` primer superseded by "More From [Director/Actor]" + "Outside Your Usual" per composition hypothesis v0.3 §3.2 and Phase 4 actuals. Wiki for-you-surface page reflects shipped Phase 4 names.

## [2026-04-26] ingest | runbooks/ (8 files)
- New concepts: sync-pipeline, embedding-backfill, edge-function-deployment, monthly-mood-room-recluster, apk-build-and-install, service-role-jwt-rotation, supabase-backup-restore, supabase-migration-workflow
- New source: wiki/sources/runbooks.md
- Conflicts resolved:
  * Conflict resolved: workflow filename `recluster-mood-rooms.yml` in `monthly-mood-room-recluster.md` runbook superseded by `mood-rooms-recluster.yml` in orchestration v0.3.3 §6.1 and Phase 4.5 implementation. Wiki concept reflects current name.
  * Conflict resolved: `--stage vectors` in `sync-pipeline.md` runbook superseded by Phase 1 deletion of legacy 24D `content_vector` (migration 019). Wiki concept retains the table for historical reference but flags it as inactive.

## [2026-04-26] ingest | solutions/ (4 files)
- New concepts under wiki/concepts/operations/solutions/: authenticated-role-missing-rls, sa-api-uk-service-coverage-gaps, supabase-advisor-accepted-warnings, supabase-content-cache-dead-code
- New source: wiki/sources/solutions.md

## [2026-04-26] ingest | plans/ (1 file)
- New source: wiki/sources/plans.md
- Note: `2026-03-15-001-feat-api-consolidation-content-cache-deep-linking-plan.md` documents the B1→E1 work that became ADR-001, migration 005 (authenticated RLS fix), and the foundational schema. Plan-time identifiers `interaction_type` / `tmdb_id` (on card_impressions) were superseded by canonical names in strategy v1.6+ — captured in plan source page.

## [2026-04-26] ingest | research/ (1 markdown stub + 5 xlsx files)
- New source: wiki/sources/research.md
- Notes: stub list maps to six expected source files (Streaming Recommendation Algorithms Report, Consolidated Research Brief, JustWatch Hands-On Testing, Competitor Scan, CC Codebase Review Rounds 1-3, UK Market Data). Spreadsheets (Top_40, quiz_pair_pool_review × 2, videx-cluster-testing, videx_uk_providers) are filed as ⚠ unverified stubs because the wiki cannot parse XLSX directly. Re-ingest when content is exported to CSV/Markdown.

## [2026-04-26] ingest | frontend/ (3 files)
- New concepts under wiki/concepts/product/: accessibility-checklist, motion-animation-patterns, tailwind-v4-conventions
- New source: wiki/sources/frontend.md
- Decision: filed under concepts/product/ rather than concepts/architecture/ because they are product-shaping conventions (style, behaviour guard rails), not system architecture.

## [2026-04-26] ingest | product/ (4 files)
- New concepts under wiki/concepts/product/: mission-and-pitch, user-personas, privacy-and-gdpr, tone-and-voice-guide
- New source: wiki/sources/product.md
- Note: privacy-policy-draft.md becomes wiki/concepts/product/privacy-and-gdpr.md (renamed for the wiki because the page combines GDPR rights and the policy draft). Pre-launch blockers surfaced (taste_profiles RLS missing, delete-account wiring deferred, JWT rotation pending).

## [2026-04-26] ingest | forward-planning/ (3 files)
- New concepts under wiki/concepts/forward-planning/: monetisation-strategy, v3-conversational-discovery
- New source: wiki/sources/forward-planning.md
- Status: exploratory throughout per AGENTS.md status-field convention. Forward-planning material informs but does NOT override locked v2 decisions per Step 4 of the ingest brief.

## [2026-04-26] ingest | reference/ (4 files; glossary already ingested at gateway A)
- New concepts under wiki/concepts/operations/: risks-register, eval-harness, strategy-version-log
- phase-timeline.md folded into existing wiki/concepts/operations/phase-history.md
- New source: wiki/sources/reference.md

## [2026-04-26] ingest | top-level (2 files)
- New sources: wiki/sources/usp-and-strategy-summary.md, wiki/sources/raw-readme.md
- Conflict resolved: USP & Strategy Summary §5 phase numbering ("Phase 0 → 1 → 3 → 4 → 5 → 6") omits 0.5/2/2.5/2.6/4.5; canonical sequence is in strategy v1.6.3 §7.2 and wiki phase-history page. Wiki summary source page flags this.

## [2026-04-26] schema-update | AGENTS.md amendment
- Added `concepts/evaluations/`, `concepts/product/`, `concepts/forward-planning/` to the listed subfolders under `wiki/concepts/`.
- Expanded `concepts/operations/` description to cover phase summaries, post-mortems (under `solutions/`), risks register, eval-harness reference, and version log alongside runbooks.
- Rationale: these subfolders were created during ingest and the schema description now matches reality. No restructuring of existing pages.

## [2026-04-26] lint | gateway C
**Scope:** all 110 wiki pages plus index.md, log.md, AGENTS.md. Programmatic link audit + grep for stale terms. raw/ files excluded from broken-link check (read-only sources).

**Results:**

- **Orphan pages: 0.** Every wiki page has at least one inbound link (from another wiki page or from index.md).
- **Broken markdown links: 1 substantive + 3 in AGENTS.md examples.**
  * Fixed: `wiki/entities/codebase/hooks.md` link to `../../sources/v2-strategy.md` corrected to `../../sources/engine-strategy-v1-6-3.md`.
  * Not fixed (deliberate): three example links inside AGENTS.md frontmatter and code blocks (`wiki/entities/streaming-availability-api.md`, `wiki/entities/netflix.md`, `../entities/streaming-services/netflix.md`). These are illustrative templates demonstrating the linking convention, not actual content references. AGENTS.md is human-owned schema; leaving the examples intact.
- **Stale-term audit:**
  * `interaction_type`: 8 occurrences in 7 files. All in conflict-resolution / rename-history / version-log context. No stale claims.
  * `tmdb_id`: many legitimate uses (column name on `titles`, `streaming_availability`, etc.). Stale uses on `card_impressions` checked: none in current claims; all in conflict-resolution context.
  * `dismiss`: 1 occurrence (ADR-009, in rename-history context). Correct.
  * "Depth vs breadth": all in rename-history context. Correct.
  * Detail-view-as-positive (older signal-weighting primer claim) flagged in concepts-primers source page; current wiki signal-architecture and taste-vector pages reflect detail page spec v0.3.2 §3.1 (anchor only, NOT positive).
- **Stray placeholder file: `videx-wiki/sources/v2-strategy.md`** (one-word "placeholder" content, accidentally created at the wrong path during ingest because the leading `wiki/` was dropped in the Write call). Deletion requires user approval; surfaced here for the human to remove. Not linked from anywhere; harmless but messy.

**Contradictions surfaced earlier (already resolved during ingest, repeated here for the audit trail):**
- `interaction_type` → `event_type` (strategy v1.6).
- `tmdb_id` → `content_id` on `card_impressions` (strategy v1.6.1).
- `dismiss` → `not_interested` event type (Phase 0, ADR-009).
- "Depth vs breadth" → "Focused ↔ Varied" slider (composition hypothesis v0.3).
- detail_view as weak positive → NOT positive, anchor only (detail page spec v0.3.2 §3.1).
- Share signal in weight tables → removed (not implementable in v1 codebase).
- Static bootstrap weights 0.40/0.40/0.20 → dynamic 4-band by watched-grid count (Phase 3).
- 30-60 mood rooms at 70-80% coverage → 68 rooms at 53.5% (Phase 4.5 actuals; coverage plateau structural).
- Stage 2 5-component table (intent) → 3-component sum + 2 post-processing (Phase 4 implementation).
- Phase 0 3 migrations (012-014) planned → 5 migrations applied (012-016).
- Phase 0.5 5 enrichment columns planned → 4 added + opportunistic backfill of pre-existing `runtime`.
- Phase 0.5 single 80% director gate → split-by-media_type (movies ≥95%, TV best-effort) per IN-PX-07.
- Migration 021 reserved → rolled into 022; numbering preserved with intentional gap.
- Phase 3 9-file hook rewrite scope → 10 files (added `useTasteProfile`).
- "Surprising ↔ Safe" / "Continue Exploring" naming in older primers → current canonical names per composition hypothesis v0.3.
- Workflow filename `recluster-mood-rooms.yml` → `mood-rooms-recluster.yml`.
- Sync `--stage vectors` → deprecated post Phase 1 (column dropped in migration 019).

**Files outside wiki/ that the lint flagged but cannot delete:** `videx-wiki/sources/v2-strategy.md` (placeholder, see above).

**Done criteria from Step 5 of the ingest brief:**
- ✅ Every raw file has a corresponding `wiki/sources/{slug}.md`. (86 raw files → 27 source pages; collected source pages cover multi-file folders.)
- ✅ Every `wiki/sources/` page is linked from at least one `wiki/entities/` or `wiki/concepts/` page.
- ✅ `index.md` lists every wiki page (110 pages).
- ✅ `log.md` has one entry per subfolder ingest (15) plus three gateway entries plus this final lint.
- ✅ All contradictions surfaced in log.md with explicit resolution (16 distinct contradictions captured above and inline per subfolder).

## [2026-04-26] enrich | wiki/registers/ — at-a-glance lookups
On request: pull cross-cutting scannable views out of the existing wiki content. New top-level folder `wiki/registers/` with seven pages plus a README index:
- parking-lot.md — every IN-XXX entry with status (56 entries, 32 ✅ / 18 ⏳ / 1 ⚠ / 1 🛑 / 4 🅿)
- open-questions.md — strategy v1.6.3 §8.2 still-open + per-phase open items + risks register
- pre-launch-blockers.md — 21 items grouped by stake (security, GDPR, ops, build/release, UX, process)
- deferred-items.md — 49 items (v2.5 / Phase 5 / Phase 5/6 cleanup / post-v2 v3 / discharged / parked)
- acceptance-gates.md — every numerical threshold (row-count gates, eval thresholds, ranking weights, slider mappings, signal weights, cold-start bootstrap, gating rules)
- next-steps.md — Phase 4.5 close-out, Phase 5 outlook, Phase 6 launch, time-triggered reviews
- cheatsheet.md — phases × branches × migrations × features map; service slug ↔ TMDb ↔ SA API; surface row composition; locked decisions one-liner
- README.md — registers index

AGENTS.md amended: added `wiki/registers/` to the schema's listed subfolders. Refresh-when-source-changes convention noted.

index.md updated with a new top-level "Registers (at-a-glance)" section.

Notes:
- The Phase 4.5 IN-451 to IN-456 entries are flagged "Not yet incorporated" in the raw parking lot, but the work clearly shipped per ADR-005, strategy v1.6.3 §5.2, and orchestration v0.3.3 §3.4 actuals. Parking-lot register mirrors raw fidelity but flags the discrepancy and notes Phase 4.5 needs an end-of-phase summary file (also tracked in pre-launch-blockers #21).
- No conflict resolution beyond what was already captured at Gateway C.
- Total wiki page count: 110 → 118 (+ 8 new registers including README).

## [2026-04-30] solution | react-numeric-falsy-renders-zero
- New solution page: `wiki/concepts/operations/solutions/react-numeric-falsy-renders-zero.md`
- Source: `docs/solutions/logic-errors/react-numeric-falsy-renders-zero.md`
- Bug: `{item.rating && ...}` rendered "0" for titles with no IMDb rating because `&&` returns the falsy operand and React renders numeric 0 as text. DetailPage IMDb badge had no guard, rendered "0.0 IMDb" unconditionally.
- Fix: explicit `> 0` guards in `ContentCard.tsx`, `BrowseCard.tsx`, `DetailPage.tsx`.
- Prevention: never use `{value && ...}` for numerics; consider enabling `react/jsx-no-leaked-render`.

## [2026-05-07] ingest | Phase 5 close-out (PR #4 merged + parking lot v0.6 + phase-5-summary)
Wiki refreshed to align with Phase 5 reality (closed 2026-05-06).

Updated pages:
- `wiki/concepts/operations/phase-history.md` — added Phase 4.5 detail row + Phase 5 row + Phase 5.5 / 6 placeholder rows; refreshed conflict-resolution section to include Phase 4.5 anchored-rooms redirect, Phase 5 framing change on migration 039 ("Vault storage migration, not cryptographic rotation"), and the latent INTERACTION_WEIGHTS rename fix.
- `wiki/entities/codebase/migrations.md` — added rows 033, 034, 035, 036, 037, 038, 039 + deferred 040; added cron source-of-truth caveat (`supabase/cron/*.sql` overlap with migration 039) and `delete_own_account` audit-gap note.
- `wiki/entities/codebase/rpcs.md` — updated `get_available_tmdb_ids` return shape (TABLE → JSONB array, migration 035) + IN-458 follow-up; added `username_available` (migration 038); added `delete_own_account` with source-of-truth gap warning; added new "Edge Functions (RPC-shaped HTTP endpoints)" section covering `render-foryou-rows`, `label-anchor-room`, and the four cron-invoked functions (`embed-new-titles`, `enrich-new-titles`, `refresh-service-fingerprints`, `sync-incremental`).
- `wiki/entities/codebase/event-taxonomy.md` — changed `marked_watched` → `watched` in event_type table; added Phase 5 migration 037 explanation + latent INTERACTION_WEIGHTS rename note (vectors rebase on next 24h taste-recompute cycle).
- `wiki/concepts/architecture/recommendation-pipeline.md` — updated weights table caption ("Phase 5 shipped" column); added Phase 5 update section explaining three contextual sub-scorers (time-of-day 40% / viewing context 40% / device 20%), `PipelineContext` threading (client `pipelineContext.ts` + Edge `buildEdgePipelineContext`), MMR replacement with λ from `getMMRLambda(varietySlider)`, embedding fetch step, `BASE_WEIGHTS` 62.5/25/12.5 unchanged.
- `wiki/concepts/operations/service-role-jwt-rotation.md` — updated status to "Vault migration shipped Phase 5, cryptographic rotation deferred to Phase 6+"; added "Vault migration ✅ shipped" section with verification queries (4 jobs active + count 0 inline JWTs + cron.job_run_details); added "Pause / resume cron without rotating" pattern via `cron.alter_job` (used today for daily-content-sync RapidAPI quota cap); added two unblock paths for cryptographic rotation.
- `wiki/registers/parking-lot.md` — sources bumped to v0.6; flipped IN-XPS-002 ✅, IN-XPS-011 ✅, IN-XPS-012 ✅ (workflow + secrets pending), IN-XPS-013 ✅, IN-PX-02 ✅, Phase 4.5 IN-451..IN-456 + IN-463 + IN-466 ✅; marked IN-XPS-004 ⚠ Partial (Vault storage; cryptographic rotation deferred); IN-XPS-006 re-targeted to Phase 5.5 with audit-gap framing; IN-458 / IN-462 / IN-465 re-targeted to Phase 5.5; added IN-XPS-010 (Pro→Free downgrade risk); added new "Phase 5.5 follow-ups" section covering IN-PX-21..IN-PX-35 (15 entries — quality/hardening + GDPR/legal blockers); refreshed counts (78 total, 42 ✅, 27 ⏳, 3 ⚠, 1 🛑, 5 🅿).
- `wiki/registers/pre-launch-blockers.md` — flipped items 1 (taste_profiles RLS ✅), 3 (username lookup ✅), 11 (Phase 5 contextual ✅), 21 (Phase 4.5 summary ✅); added new items 22 (verify_jwt + CI guard ✅), 23 (CORS allow-list ✅), 24 (username_available rate-limit ⏳), 25 (`extractUserIdFromJwt` defence-in-depth ⏳), 26 (Privacy Policy + Terms pages — store-rejection blocker ⏳), 27 (foryou-parity secrets ⏳), 28 (Phase 5 summary ✅); marked item 2 (JWT rotation) ⚠ Partial — Vault storage shipped, cryptographic rotation Phase 6+; refreshed item 5 (delete account) and item 6 (data export) per Phase 5.5 audit; refreshed item 9 (privacy disclosure) ⚠ Partial.
- `wiki/concepts/operations/phase-5.md` — NEW page following the Phase 4 template, summarising six workstreams (contextual signals, MMR diversity, security 036–039 + verify_jwt + CORS, type-system cleanup with `<Database>` generic re-enabled, UX carry-overs deferred, quality sweep including latent INTERACTION_WEIGHTS bug fix), deviations from brief (D-after-A/B sequencing, narrower marked_watched scope, migration 039 reframed as Vault storage migration, TZ skew via decision 9, two net-new dependencies), and open items routed to Phase 5.5 / Phase 6 clusters.
- `index.md` — added phase-5 page reference under operations.

Source-of-truth pointers:
- Phase 5 summary: `docs/v2/phase-summaries/phase-5-summary.md`.
- Parking lot v0.6: `docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.6.md`.

Conflict resolutions captured this pass:
- Migration 039 was originally framed as cryptographic JWT rotation in plan + brief; reality during execution forced a Vault-storage-only migration because Supabase opaque `sb_secret_…` tokens fail `verify_jwt = true` on Edge Functions. Wiki now reflects "Vault storage migration shipped, cryptographic rotation deferred to Phase 6+".
- `marked_watched` cleanup is narrower than its parking-lot framing suggested. Migration 037 drops only the `event_type` value. The `exit_reason` payload value documented in Detail Page Signal Capture Spec v0.3.2 line 237 stays — wiki event-taxonomy and recommendation-pipeline pages reflect the split.
- INTERACTION_WEIGHTS map was keyed `'marked_watched'` while `emitContentInteraction` writes `'watched'` — silent no-op on every "Mark as watched" click since Phase 3. Renamed map key as part of Phase 5 latent-bug fix; vectors self-heal on next 24h taste-recompute cycle.
- `delete_own_account` RPC exists in production but its definition is not in any version-controlled migration (only `027_function_search_path_pin.sql:28` references it). Re-targeted to Phase 5.5 migration 041 audit; wiki rpcs page flags as source-of-truth gap.
- `supabase/cron/*.sql` files overlap with migration 039 (both manage same registrations). Phase 5.5 IN-PX-31 will resolve via deletion or "MANAGED BY MIGRATION 039" header.

Page count delta: 118 → 119 (+1 phase-5.md).

## [2026-05-15] ingest | Phase 5.5 close-out (PR #11 + parking lot v0.7 + phase-5.5-summary + IN-465 investigation)
Wiki refreshed to align with Phase 5.5 reality (closed 2026-05-15, PR #11 awaiting merge to main).

Raw additions:
- `raw/phase-summaries/phase-5.5-summary.md` — 10-section close-out doc.
- `raw/research/in-465-catalogue-sync-gap.md` — diagnostic findings + MID-priority verdict.

New pages:
- `wiki/concepts/operations/phase-5-5.md` — full Phase 5.5 page following the Phase 5 template, three clusters (A: quality / type / performance, B: legal disclosures, C: catalogue gap closure), plan-vs-reality deviations, post-merge review pass (kieran-typescript-reviewer + repo-research-analyst), follow-ups filed for Phase 6.

Updated pages:
- `wiki/concepts/operations/phase-history.md` — Phase 5.5 row replaces placeholder. 30 commits across three clusters; closed 2026-05-15.
- `wiki/entities/codebase/migrations.md` — rows 042 (`delete_own_account` belt-and-braces) + 043 (`export_user_data` GDPR Article 20) added. **Source-of-truth gap on `delete_own_account` closed.** Migration numbering footnote: plan v3 named 041 + 042, live shifted to 042 + 043 (041 was Phase Search V2's `user_feature_flags`). Studio implicit-transaction quirk noted (`||`-concatenated COMMENT rolls back the whole migration).
- `wiki/entities/codebase/rpcs.md` — `delete_own_account` flag flipped from ⚠ source-of-truth gap → ✅ captured Phase 5.5; full body shape documented (8 explicit DELETEs in dependency order). New `export_user_data` section. Conventions section updated with NULL `auth.uid()` raise pattern (the Supabase auto-grant means body's null check is the actual auth gate). Filed Phase 6 follow-ups IN-PX-52 (Edge typegen) + IN-PX-54 (CI check for user-scoped tables in delete + export RPCs).
- `wiki/concepts/architecture/recommendation-pipeline.md` — new "Phase 5.5 update" section covering embedding cache (24h client localStorage + per-Edge-instance Map keyed `userId + taste_profiles.updated_at`), Float32Array map shape + cached cosine norms (~3× MMR hot-loop speedup), MMR partial-coverage fallback (`bailedOut` signal at > 50% null after MMR_MIN_SAMPLE picks), `buildRowFromPool` options-object refactor, `ViewingContext` narrowing at the DB boundary, vitest rig + 10 pure-function tests, foryou-parity golden probe activation.
- `wiki/registers/parking-lot.md` — sources bumped to v0.7. **14 in-scope IN-PX entries flipped ✅** (IN-PX-21..28 except 29/30/32, IN-PX-31, IN-PX-33, IN-PX-34, IN-PX-35), plus IN-XPS-001 ✅ (privacy disclosure alignment closed by IN-PX-34's functional pages), IN-XPS-006 ✅ (delete account), IN-XPS-012 ✅ (parity probe activated 2026-05-15), IN-465 ✅ (catalogue gap closed). **Two new entries filed at Phase 5.5 close: IN-XPS-014** (UK solicitor review — hard pre-launch blocker) + **IN-PX-50** (scheduled Edge backfill automation — Phase 6). **Four review-pass follow-ups filed:** IN-PX-51 ✅ (clearEmbeddingCache on SIGNED_OUT — fixed in commit e9c8560), IN-PX-52 ⏳ (Edge `_shared/database.types.ts` regen — Phase 6), IN-PX-53 ⏳ (Safari mobile 5MB cache quota — Phase 6+), IN-PX-54 ⏳ (CI check for user-scoped tables — Phase 6). Counts refreshed: 97 total, 59 ✅, 27 ⏳, 2 ⚠, 1 🛑, 6 🅿.
- `wiki/registers/pre-launch-blockers.md` — items **5 ✅ (delete account), 6 ✅ (data export), 9 ✅ (privacy alignment), 26 ✅ (Privacy + ToS pages), 27 ✅ (parity probe activation), 30 ✅ (Phase 5.5 summary doc)** closed. Items 7 + 8 (counsel review + controller details) consolidated into **new item 29: UK solicitor review of Privacy Policy + ToS** (parking-lot IN-XPS-014; hard pre-launch blocker). Counts refreshed: 14 open / 13 done (was 19 / 6 at Phase 5 close).
- `index.md` — `phase-5-5.md` reference added under operations.

Source-of-truth pointers:
- Phase 5.5 summary: `docs/v2/phase-summaries/phase-5.5-summary.md`.
- Parking lot v0.7: `docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.7.md`.
- IN-465 investigation: `docs/v2/investigations/in-465-catalogue-sync-gap.md`.

Conflict resolutions captured this pass:
- `delete_own_account` source-of-truth gap (open since Phase 3) **closed** in migration 042. Live RPC body was minimal — relied on FK CASCADE chains. Cascade audit confirmed all 8 user-scoped tables CASCADE properly; migration ships the same behaviour with belt-and-braces explicit DELETEs.
- Plan v3 named Phase 5.5 migrations 041 (delete) + 042 (export). Live shifted to 042 + 043 because `041_user_feature_flags.sql` already shipped in Phase Search V2. `040_editor_notes.sql` lives in the repo unapplied — accounts for the retained `editor_notes` `as any` cast in `useHomeContent.ts`.
- Plan v1 cache key had 4 components (userId + tasteVectorHash + filterSetsSizesHash + tasteProfiles.updated_at); review pass collapsed to 2 (userId + taste_profiles.updated_at). Hash-derivation surface eliminated.
- Original C5 implementation only wired `clearEmbeddingCache` into the manual `signOut` callback. Post-review fixup hooked into `onAuthStateChange` SIGNED_OUT to cover JWT expiry / multi-tab / server-side invalidation. UserId namespacing in the key prevented correctness contamination; this closed the docstring contract gap.
- IN-465 plan v3 anticipated a discover-pattern patch on `scripts/sync-content.ts` or its cron equivalent. Investigation surfaced **there is no cron equivalent for the titles-creation side** — `daily-content-sync` only refreshes `streaming_availability`, never creates `titles` rows. So `scripts/backfill_missing_titles.ts` (its `LEFT JOIN ... WHERE titles IS NULL` query) IS the recurring fix. Phase 6 IN-PX-50 wraps it in scheduled Edge automation.
- Migration 042 + 043 first apply failed on `||`-concatenated COMMENT strings. Studio's SQL editor wraps the paste in an implicit transaction; the trailing COMMENT failure rolled back function creation. Fixup collapsed both to single-line literals; re-applied cleanly.
- Supabase auto-grants EXECUTE to anon / authenticated / service_role on every `public.*` function so PostgREST can route to it. The migration's `REVOKE FROM PUBLIC, anon` doesn't persist — the body's NULL `auth.uid()` raise is the actual auth gate. Documented inline in both 042 and 043.

Page count delta: 119 → 120 (+1 `phase-5-5.md`).

## [2026-06-10] ingest | phase-eng-1-summary.md + eng1-eval-2026-06-10.md
- Updated: wiki/concepts/architecture/taste-vector.md (new ENG-1 section: K≤3 interest centroids, nearest-centroid EMA, deterministic k-means batch refresh; negative weights struck from the signal table — thumbs_down/not_interested → avoid set, watchlist_remove taste-neutral; summary-vector role reframed)
- Updated: wiki/concepts/architecture/recommendation-pipeline.md (Stage 1 multi-interest fan-out + weighted interleave; avoid-set penalty stage; exploration slot)
- Updated: wiki/entities/codebase/migrations.md (rows 044 + 045; corrected the 040 row — number consumed by unapplied editor_notes, IN-458 renumbers; new note: ledger has gaps, never `db push`, orchestration §3.4 is authoritative)
- No new pages; index.md unchanged
- Sources cited at docs/v2/phase-summaries/ (raw/ snapshots pending Joe's next drop per AGENTS.md)

## [2026-06-10] lint | REPO-1 hygiene pass
Link audit: 326 relative markdown links checked across index.md + wiki/** (127 pages). 1 broken link found and fixed; 0 broken after pass.

Broken links fixed:
- wiki/concepts/operations/phase-history.md — Phase 4.5 row linked `../../../docs/v2/phase-summaries/phase-4-and-4.5-summary.md` (one `../` short, resolved inside the vault); corrected to `../../../../`. The REPO-1 renames (docs/v3-design → docs/design, Phase_Search_V2 briefs → docs/design/search/, parity probe → scripts/test/foryou-parity-probe.mjs, backfill script → scripts/enrichment/, eval docs → docs/v2/phase-summaries/) broke NO markdown link targets — they appear only in prose, almost entirely in read-only raw/ snapshots and historical phase pages.

Contradictions resolved (pages edited):
- wiki/entities/codebase/database-schema.md — title_genres/title_credits rows no longer claim "forward compatibility"; both marked as dropped by migration 046 (REPO-1, written 2026-06-10, NOT yet applied). Added a post-032 changes note (033/034/036/040/041/044/045/046) so the as-of-032 snapshot stops silently misrepresenting current schema.
- wiki/entities/codebase/migrations.md — row 046 added (drop title_genres + title_credits; in repo, not applied; explicit-Joe apply). db-push warning extended to cover 046. REPO-1 note added.
- wiki/registers/deferred-items.md — "Drop title_genres and title_credits" flipped to done (migration 046 written; apply pending).
- wiki/concepts/decisions/adr-008-static-genre-mapping.md — "remains as a future hook" consequence struck and superseded by the 046 drop; decision itself (static genre mapping) stands.
- wiki/registers/parking-lot.md — IN-102/IN-106 annotated with the 046 drop; IN-PX-33 path updated to scripts/test/foryou-parity-probe.mjs (REPO-1 rename); NEW ENG-1 section added (IN-PX-55/56/57 were missing from the register despite being filed at ENG-1 close); counts refreshed 97 → 100 total, ⏳ 27 → 30.
- wiki/registers/cheatsheet.md — was frozen at 2026-04-26 ("Phase 5 not started", migrations ending at 032). Phase map now covers 4.5 (full migration set), 5, v3 redesign, Search V2, 5.5, ENG-1, REPO-1 (in progress); migration→phase table extended 033–046; Stage 2 weights table updated (real contextual scorer since Phase 5, MMR, ENG-1 avoid-set + exploration slots); cron schedule rows no longer cite the deleted supabase/cron/*.sql files (migration 039 sole source since 5.5); locked decisions updated (046 drop, multi-interest K ≤ 3).
- wiki/concepts/operations/phase-history.md — ENG-1 row added (multi-interest centroids / avoid set / exploration slot / training extract; migrations 044+045; closed 2026-06-10).
- wiki/entities/codebase/rpcs.md — delete_own_account and export_user_data sections updated: migration 044 extended both to cover the new user_interest_centroids table (9 user-scoped tables, not 8).
- wiki/concepts/operations/eval-harness.md — output convention now points at docs/v2/phase-summaries/ (REPO-1 consolidation); ENG-1 eval harness section added (npm run eval:eng1).
- wiki/concepts/operations/phase-5-5.md — dated correction note on the vitest-rig claim that bespoke `npm run test:search-*` invocations were kept: REPO-1 retired the npx-tsx test:* scripts; `npm test` is the single test entry.

Orphan pages: 3 found, all wiki/sources/ successor pages with zero inbound links (index.md still lists only their predecessors): engine-strategy-v1-8.md, implementation-notes-parking-lot-v0-5.md, project-orchestration-v0-5.md. Fixed without touching index.md (per pass constraints) by adding "Superseded by …" forward links on the three predecessor pages. Consider adding the successors to index.md at the next ingest.

Flagged for human (not fixed — register-wide refreshes are ingest-scale, not lint-scale):
- wiki/registers/next-steps.md — still framed as "post Phase Search V2 / Phase 5.5 not started"; superseded by the E&P Hardening track approved 2026-06-10 (ENG-1 → REPO-1 → PLAT-1/2/3 → launch → ENG-2). Needs a rebuild against the track brief.
- wiki/registers/deferred-items.md — beyond the 046 row fixed above, the "Phase 5 (locked but not started)" section is stale (contextual scorer + MMR shipped in Phase 5; IN-458/IN-462 re-targeted to Phase 6) and counts predate Phases 5–ENG-1.
- wiki/registers/open-questions.md, wiki/registers/acceptance-gates.md, wiki/registers/README.md — untouched since 2026-04-26; need a refresh pass against Phases 5 → ENG-1.
- wiki/entities/codebase/database-schema.md — interim post-032 note added, but the page wants a full re-snapshot (human refresh of raw/codebase-snapshots/database-schema-snapshot.md, then re-ingest).
- wiki/concepts/operations/phase-history.md "Realistic timeline note" still says "Actuals through Phase Search V2" — left as-is (narrative), refresh at next ingest if desired.

raw/ staleness: expected and out of scope — raw/ snapshots lag docs/ (no ENG-1/REPO-1 snapshots yet; old paths in raw/ prose); re-snapshot is human-owned.

Pages edited (13, all `updated:` bumped to 2026-06-10): database-schema.md, migrations.md, rpcs.md, deferred-items.md, parking-lot.md, cheatsheet.md, adr-008-static-genre-mapping.md, phase-history.md, eval-harness.md, phase-5-5.md, sources/engine-strategy-v1-6-3.md, sources/implementation-notes-parking-lot-v0-3-4.md, sources/project-orchestration-v0-3-3.md. index.md NOT touched (no broken links there).

## [2026-06-10] ingest | REPO-1 raw re-snapshot
Joe dropped refreshed snapshots into raw/ (E&P brief v0.2, orchestration v0.8, strategy v1.8, parking lot v0.7, composition v0.4, eight phase-summary files, two 2026-06-10 plans, regenerated database-schema snapshot). This ingest is the ingest-scale work the same-day lint pass deferred.

New pages (10):
- wiki/sources/ep-hardening-brief-v0-2.md — the approved E&P track (most important new source: phase sequence + D1–D6 + cost impact + out-of-scope list)
- wiki/sources/phase-eng-1-summary.md
- wiki/sources/phase-repo-1-summary.md
- wiki/sources/eng1-eval-2026-06-10.md — authoritative ENG-1 gate results
- wiki/sources/project-orchestration-v0-8.md — supersedes the orphaned v0-5 successor page (chain: v0.3.3 → v0.5 → v0.8; v0.6/v0.7 never snapshotted)
- wiki/sources/implementation-notes-parking-lot-v0-7.md — supersedes v0-5 (v0.6 never snapshotted); carries the ENG-1 follow-ups section (IN-PX-55/56/57)
- wiki/sources/home-foryou-composition-hypothesis-v0-4.md — supersedes v0-3 (anchored-rooms flip)
- wiki/concepts/operations/phase-eng-1.md — per-phase page (phase-5-5 template)
- wiki/concepts/operations/phase-repo-1.md — per-phase page

Register rebuilds (the four flagged by the lint pass):
- wiki/registers/next-steps.md — rebuilt around the E&P track: REPO-1 close-out (merge only — 046 applied, snapshots dropped) → PLAT-1 (TanStack Query/code-split/virtualization) → PLAT-2 (Workers+Hono proxy) → PLAT-3 (single engine + feed cache + ADR-011/012 supersession) → Phase 6 launch (parallel) → ENG-2 (data-gated). Sources: brief §2/§5–§8 + orchestration v0.8 §11.
- wiki/registers/deferred-items.md — full refresh vs phases 5 → REPO-1: new "Scheduled by the E&P track" bucket (client-pipeline deletion at PLAT-3+1 per D4, adaptive K, IN-PX-56/57, IN-462 → PLAT-1, IN-467/IN-PX-32 → superseded by PLAT-3); "Done since last refresh" section (046 drop DONE+applied, contextual scorer, MMR, Database generic, IN-465, negative-weights removal); CF 10K MAU + two-tower 50K MAU reaffirmed per brief §11; two new discharged items (LLM-as-ranker, RN rewrite); counts re-bucketed.
- wiki/registers/open-questions.md — resolved sections added: E&P brief §9 D1–D6, ENG-1 plan Q1–Q4 + τ/γ from the eval, earlier-phase resolutions (contextual scorer, Database generic, For You perf path). Still-open re-grouped (engine/data, platform/ops, product) incl. new items: exploration CTR (ENG-2), recall@500 carried forward, τ-after-IN-PX-55, Workers CPU-cap headroom. One ⚠ unverified note on residual dwell-negative weighting.
- wiki/registers/acceptance-gates.md — E&P gates added at top: ENG-1 eval gate PASSED (coverage 3≥2, parity, γ sweep, τ; recall carried), REPO-1 §4.5 acceptance MET (146 tests, any 72→0, 0 contradictions), PLAT-1 §5.3 / PLAT-2 §6.4 / PLAT-3 §7.3 pending criteria, ENG-2 data gate ≥5–10K impressions / ≥500 positive outcomes.

Updated pages:
- wiki/entities/codebase/database-schema.md — fully rebuilt from the regenerated snapshot (live production pull, post-046); interim "as of 032" note retired.
- wiki/entities/codebase/migrations.md — 046 row flipped to ✅ applied (evidence: post-046 schema snapshot); REPO-1 note updated.
- wiki/concepts/operations/phase-history.md — REPO-1 row added; ENG-1 row link → wiki/concepts/operations/phase-eng-1.md; sources moved to raw/ paths; timeline note extended.
- wiki/sources/engine-strategy-v1-8.md — raw snapshot now exists; noted v1.8 stays current under the E&P brief; linked to ep-hardening-brief page.
- wiki/sources/project-orchestration-v0-5.md, implementation-notes-parking-lot-v0-5.md, home-foryou-composition-hypothesis-v0-3.md — "Superseded by …" headers added.
- wiki/sources/phase-summaries.md — table extended (5.5, ENG-1, ENG-1 eval, REPO-1); docs/ paths → raw/.
- wiki/sources/plans.md — the two 2026-06-10 plans added (ENG-1, REPO-1) with Q&A resolutions.
- index.md — added: 2 operations phase pages + phase-search-v2 (was missing), ADR-012/ADR-013 (were missing), 7 new source pages, the 3 formerly-orphaned successor source pages (engine-strategy-v1-8, project-orchestration-v0-5, implementation-notes-parking-lot-v0-5), supersession annotations on the chains; next-steps register description refreshed.

Notable fact established this ingest: migration 046 IS applied — the regenerated database-schema snapshot is a live production information_schema pull post-046 ("033, 036–046 applied via Studio/MCP"), superseding the lint-pass-era "awaiting Joe's apply" wording in deferred-items/migrations/database-schema.

Cross-refs: wiki/concepts/architecture/taste-vector.md + recommendation-pipeline.md already carried the ENG-1 behaviour from the same-day pre-snapshot ingest — not re-edited.

## [2026-06-11] ingest | phase-plat-1-summary.md (light pass)
- Updated: wiki/concepts/operations/phase-history.md (PLAT-1 row + actuals note), wiki/registers/cheatsheet.md (PLAT-1 row; corrected stale REPO-1 'in progress' / 046 'not applied' rows — both predated the merge)
- Full source-page ingest deferred to the next human raw/ snapshot drop (REPO-1 precedent)

## [2026-06-12] ingest | phase-plat-2-summary.md (light pass)
- Updated: wiki/concepts/operations/phase-history.md (PLAT-2 row; PLAT-1 row closed with PR #16), wiki/registers/cheatsheet.md (PLAT-2 row; PLAT-1 status closed)
- Notable: first non-Supabase production surface (Cloudflare Worker `videx-api`); TMDb/OMDB keys are server-side Worker secrets only — client bundle provably keyless (dist grep). PLAT-3 lands `GET /v1/foryou` in the same Worker and dissolves the ADR-011 `_shared/` mirror.
- Full source-page ingest deferred to the next human raw/ snapshot drop (REPO-1 precedent)

## [2026-06-12] ingest | phase-plat-3-summary.md + ADR-014 (light pass)
- Added: wiki/concepts/decisions/adr-014-single-server-engine.md (supersedes ADR-011/012 — both remain as historical record)
- Updated: wiki/concepts/operations/phase-history.md (PLAT-3 row), wiki/registers/cheatsheet.md (PLAT-3 row; mirror note replaced with single-tree rule)
- Notable: the final parity run caught REAL mirror drift (pre-ADR-013 cluster reps in _shared/taste-v2/tasteClusters.ts, never flagged by shared-tree-drift CI) — the Edge served anchor selection from stale data for a month. Concrete validation of the ADR-014 thesis.
- NOT yet re-edited: adr-011/adr-012 pages and architecture pages still describe the mirror/Edge arrangement as current — full re-edit rides the next raw/ snapshot drop (REPO-1 precedent); ADR-014 + the phase-history row are the authoritative correction until then.

## [2026-06-12] ingest | phase-ux-1-summary.md (light pass)
- Updated: wiki/concepts/operations/phase-history.md (UX-1 row), wiki/registers/cheatsheet.md (UX-1 row)
- Notable: the frame-forensics debugging method (screenrecord + OpenCV brightness/diff timelines + scripted launches) solved three stacked first-load bugs the user could only describe as "flash and twitch" - it is now the house method for device-visual issues. Keep-alive tabs supersede the PLAT-1-era remount-per-switch model for Home + For You.
- Full source-page ingest deferred to the next human raw/ snapshot drop (REPO-1 precedent)

## [2026-06-12] ingest | phase-native-1-summary.md
- New page: wiki/concepts/operations/phase-native-1.md
- Updated: index.md (phase list)
- Notable: Capacitor -> RN migration decided same day UX-1 closed ("not perfect, but better" = WebView ceiling). Device evidence: native p99 frame time 15ms vs Capacitor 57ms on identical scroll scripts. Production appId verified as app.videx.streaming (older com.videx.app notes wrong). Metro-on-Windows junction pattern is the canonical shared-tree mount for native/.
- phase-history.md + cheatsheet.md rows deferred to phase close (Joe device verdict pending)

## [2026-06-13] ingest | phase-native-2-summary.md
- New page: wiki/concepts/operations/phase-native-2.md
- Updated: index.md (phase list)
- Notable: edgeRender.readAccessToken made isomorphic (sync localStorage scan -> async supabase.auth.getSession()) — the unlock for native For You auth; also removes a web localStorage dep. Native For You uses the Worker render path ONLY (client fallback not ported). W1-W3 device-verified; W4-W6 build-green pending Joe review.
- phase-history.md + cheatsheet.md rows deferred to phase close (Joe device verdict pending)

## [2026-06-13] ingest | phase-native-3-summary.md
- New page: wiki/concepts/operations/phase-native-3.md
- Updated: index.md (phase list)
- Notable: 5-step onboarding (account/services/watched/clusters/sliders); useCompleteOnboarding mirrors web completeOnboarding -> identical Supabase rows; useUserServices retires DEV_SERVICES. Routing refactored to always-mounted-nav + redirect. adb cannot focus RN TextInputs (Steps 2-5 + completion pending Joe end-to-end test). @react-native-community/slider needs expo prebuild.

## [2026-06-18] ingest | native phase backfill (NATIVE-3.5 / NATIVE-4 / POLISH / cutover)
- New pages: wiki/concepts/operations/phase-native-3-5.md, wiki/concepts/operations/phase-native-4-and-polish.md
- Updated: wiki/concepts/operations/phase-history.md (appended NATIVE-1/2/3/3.5/4+POLISH rows between UX-1 and Phase 6; frontmatter updated:+sources:+related:; NATIVE-4 version-reconciliation note), wiki/concepts/operations/phase-native-3.md (un-stale: Joe ran the full flow 2026-06-13, +Post-test feedback fixes section, +NATIVE-3.5 forward pointer, related: forward links), index.md (phase list +2)
- Cross-refs: phase-native-3 <-> phase-native-3-5 <-> phase-native-4-and-polish chained; phase-history related: extended
- Notable: native app is now the LIVE product (merged to main via the NATIVE-4 cutover — app.videx.streaming, v2.0.0, real release keystore). Migration 047 (app_feedback) landed on NATIVE-POLISH. NATIVE-3's "pending Joe's test" claims superseded — Joe device-ran onboarding 2026-06-13 (4 fixes, 0ff0bba) and the cutover shipped. Sourced from docs/v2/phase-summaries + docs/plans + docs/v2/native-4-cutover-runbook.md (no raw/ snapshot yet — REPO-1 precedent; migrations.md 047 + cheatsheet rows left for the next raw drop / docs sweep).

## [2026-06-18] ingest | native-track docs sweep (migration 047 + native hooks + next-steps reframe)
- Updated: wiki/entities/codebase/migrations.md (047 app_feedback row + NATIVE-track ledger-gap note + updated:/sources:), wiki/entities/codebase/database-schema.md (app_feedback in User layer, intro "as of 047", gaps note on delete_own_account/export CASCADE-only coverage, updated:/sources:), wiki/entities/codebase/hooks.md (new "Native hooks" section: useItemServices/useBrowseDiscover/useSemanticSearch+useSemanticFlag/useFeedbackPrompt/useHomeFeed/useForYou, sourced from native/src/hooks/; updated:/sources:/related:), wiki/concepts/operations/phase-search-v2.md (new "Native port" section: moods→vector behind search_semantic, presets=OFF fallback, eval-moods.ts=shipped gate vs IN-PX-40=broader fixture; updated:/related:), wiki/registers/next-steps.md (reframed: E&P+NATIVE tracks DONE, "Now"=internal-testing rollout + search_semantic global-flip gate; updated:/title/tags/sources:/related:), index.md (next-steps + schema + hooks summary lines)
- Closes the "migrations.md 047 ... left for the next raw drop / docs sweep" debt flagged in the 2026-06-13 native-3 ingest above.
- Native-hook facts sourced by reading native/src/hooks/ directly (no raw/ codebase snapshot for the native tree yet). Key gotcha captured: TMDb adapters emit `ContentItem.services: []`, so useItemServices (lazy badge resolve) + the /discover-backed Home/Browse rows exist to work around it.
- Notable correctness flag: `delete_own_account()`/`export_user_data()` (last touched migration 044) do NOT enumerate `app_feedback` (047) — deletion is FK-CASCADE-via-profiles only; GDPR-export coverage is a candidate fast-follow. Recorded in database-schema.md gaps.

## [2026-06-18] lint | native-track docs-sweep link + fact audit
Programmatic link audit of the 11 pages touched by the two 2026-06-18 native ingests (188 relative links checked): 6 broken found, 6 fixed, 0 after pass.
- `next-steps.md` — 2× `../../../../docs/` → `../../../docs/` (file sits 3 deep in `registers/`, not 4 — matched its sibling `pre-launch-blockers.md`); 3× `../../concepts/` → `../concepts/` (the 4-up form overshot to `videx-wiki/concepts/`) on the phase-search-v2 / phase-history / adr-014 links.
- `hooks.md` — bare `phase-search-v2.md` (resolved inside `entities/codebase/`) → `../../concepts/operations/phase-search-v2.md`.
- Fact correction for consistency with the same-day summary update: `phase-native-4-and-polish.md` flipped Monthly Spend + Privacy & Data from "remain stubs"/"deferred" to **shipped post-NATIVE-4** (`ProfileSpend`/`ProfilePrivacy`), matching the profile route and the phase summary. No broken links elsewhere in the changed set.

## [2026-06-18] ingest | single-folder consolidation + Platform Architecture orientation page
Repo consolidated 2026-06-18: the `videx-native` worktree was retired and the native app now lives at `native/` inside the one `StreamingAggregatorV2` folder (PRs #30 + #31 merged; ~50 merged phase/feature branches pruned, local + remote; 3 unmerged kept).
- NEW: `wiki/concepts/architecture/platform-architecture.md` — the "read first" orientation page: one repo / three runtime surfaces (web Vite · native Expo · Cloudflare Worker) / one shared `src/lib` engine (ADR-014); top-level layout table; native build env (link-shared junction, `.env`, the `withReleaseSigning` config plugin, `eslint.config.mjs`, `allowBackup=false`); the `com.videx.app.dev` → `app.videx.streaming` v2.0.0 cutover.
- Updated: `index.md` (platform-architecture as first Architecture entry, "read first"; module-map line reframed to web `src/`), `wiki/entities/codebase/module-map.md` (scope note → web `src/` only; native/`workers/` point to the new page).
- Deliberately left historical: `phase-native-1`/`-4` + `phase-history` still reference the `videx-native` worktree — accurate for those phases; the current-state pointer is the new platform-architecture page.

## [2026-07-01] ingest | content-freshness pass (Home + For You)
Reflecting `docs/v2/phase-summaries/content-freshness-2026-07-01.md` — three changes to make the surfaces feel fresh day-to-day (native-first; both were deterministic popularity/taste snapshots with no rotation).
- Updated: `wiki/concepts/architecture/home-surface.md` — new "Content-freshness pass" section: #1 native `Trending` ribbon now real `/trending/*/week` filtered to services (realigns with row-3 intent; had drifted to `discover?sort_by=popularity.desc`) + provider-scoped backfill; #2 `dailyShuffleTopN`/`dailyPick` UTC-day rotation of ribbon + hero.
- Updated: `wiki/concepts/architecture/for-you-surface.md` — new "Exploration slot" section documenting the ENG-1 Workstream C daily-seeded slot; 2026-07-01 bump `EXPLORATION_COUNT` 2→3 + positions `[5,13]`→`[2,5,13]` (one pick above the fold).
- Updated: `wiki/concepts/operations/eval-harness.md` — ENG-1 run 3 (freshness regression check, retrieval-neutral, all gates green) + ⚠ scope-gap note that eng1-eval does NOT gate exploration slot count/position (that's live CTR / ENG-2).
- Cross-refs: eval-harness ↔ for-you-surface; all three cite the new phase-summary doc. No new pages → index.md unchanged. `#1` web parity left as a documented follow-up.

## [2026-07-06] ingest | Product Strategy & Roadmap v1.0 (approved)
Joe approved the first product-level strategy + roadmap (built 5–6 Jul from production data, market research, three critique passes, and an independent H3 vision review). Source of truth: `docs/strategy/Videx_Product_Strategy_and_Roadmap_v1.0.md`; snapshot at `raw/forward-planning/Videx_Product_Strategy_and_Roadmap_v1.0_2026-07.md` (status: locked).
- New page: wiki/sources/strategy-roadmap-2026-07.md (key claims, register impact).
- Superseded: wiki/concepts/forward-planning/monetisation-strategy.md (absorbed into roadmap §5 — freemium rejection retired, Premium MAU-gated at 5–8K band) and wiki/concepts/forward-planning/v3-conversational-discovery.md (absorbed into H3 Bet 1 — Graphiti+Kuzu demoted to implementation option). Banners added, pages kept for historical reasoning.
- Rewritten: wiki/registers/next-steps.md around H0 "Prove it & equip it" (Jul–Sep: legal, measurement, notifications v1 + share v1 into v1, shakeout, quiet store release).
- Annotated: wiki/registers/deferred-items.md (roadmap owns sequencing; stale "iOS launch" row closed) and wiki/registers/pre-launch-blockers.md (items 15–18 closed by NATIVE-4; IN-XPS-014 = H0 0.1).
- Updated: index.md (Sources + Forward planning + Registers lines).
- External: Notion "Videx Roadmap" (Feb 2026) marked superseded with pointer; new Notion summary page created under the Videx project.

## [2026-07-06] ingest | H0 Stream D — security & ops batch (PR chore/h0-security-ops)
Executed brief `docs/strategy/briefs/h0-stream-d-security-ops.md`. One PR of code + a Joe-facing console-actions doc; DB verified read-only via Supabase MCP (project fmusugdcnnwiuzkbjquo). No migrations applied to prod (files only — 053/054 change a live RPC + add a cron; Joe applies on next deploy).
- Updated: `wiki/registers/pre-launch-blockers.md` — closed items 10 (pg_partman verified healthy), 12 (pricing), 24/25 (IN-PX-29/30); item 2 (IN-XPS-004) reclassified unblocked→Joe ceremony; item 13 partial (workflow shipped, awaiting 2 Joe secrets); item 14 options documented; item 4 confirmed still-disabled via advisor. Counts refreshed (open 14→11).
- Updated: `wiki/registers/parking-lot.md` — IN-PX-29/30/50, IN-XPS-003, IN-XPS-007, IN-461 → ✅ Incorporated; IN-XPS-004 ⚠→unblocked. Counts ✅59→65, ⏳30→24.
- Rewritten: `wiki/concepts/operations/service-role-jwt-rotation.md` — JWT Signing Keys shipped (GA mid-2025, auto-migrated 1 Oct 2025; legacy keys deprecated end-2026); new standby→rotate→revoke ceremony; IN-XPS-004 unblocked, left to Joe (live credential).
- Updated: `wiki/concepts/operations/supabase-backup-restore.md` — documented the new automated `db-backup.yml` monthly encrypted off-site workflow + restore path.
- Findings: (a) D1 Play gate is real & current (12 testers / 14 continuous days; personal accounts ≥13 Nov 2023; org exempt) — Joe must check account type/date; ~3–4 wk lead time if it applies, schedules Stream E. (b) pg_partman healthy; empty `card_impression_daily_totals` is by-design (rollup >90d, earliest impression 2026-06-15). (c) IN-461: only "Bedtime Fairy Tales" trips the flat forbidden check → `fairy tales` carve-out.
- Code (not wiki): migrations 053 (username_available rate-limit) + 054 (backfill RPC+cron), Edge Function backfill-missing-titles, `_shared/userScope.ts` `_no_auth_/` guard, `platformPricing.ts` refresh, `scripts/mood_rooms/label.py` carve-out, `.github/workflows/db-backup.yml`.
- No new wiki pages → index.md unchanged. CI green (tsc + 163 tests + lint warnings-only).
