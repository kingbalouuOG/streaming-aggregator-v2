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

## [2026-07-06] ingest | H0 Stream A — measurement & integrity fixes
One PR (`fix/h0-measurement-integrity`) delivering roadmap H0 items 0.2–0.5, the 0.7 dashboard, and 0.8's beta blockers. Brief: `docs/strategy/briefs/h0-stream-a-measurement-fixes.md`. Verified against the live DB (project fmusugdcnnwiuzkbjquo) + root CI gate (tsc/lint/vitest all green, 171 tests).
- **Design decision documented (the one that rides this PR): taste-vector event-identity dedup.** Neither taste path deduped by event identity — the 24h recompute replayed every `user_interactions` row and the incremental EMA applied each emit — so a tester's 4× repeated mark-watched multiplied a title's weight 4×. Rule adopted: dedup per (content_id, media_type, event_type), **apply once / keep latest**, on BOTH paths (`dedupeInteractionsByIdentity` on recompute; `hasPriorInteraction` guard on incremental). This finally *enforces* the "Combination rules" §1/§2 that taste-vector.md had documented but code never implemented. Polluted prototype vectors self-heal on the next 04:00 UTC recompute (no migration). Full write-up + rationale in `wiki/concepts/architecture/taste-vector.md#event-identity-dedup-h0-stream-a-2026-07-06`.
- Updated: `wiki/concepts/architecture/taste-vector.md` (new "Event-identity dedup" subsection under Update strategy; `updated` → 2026-07-06).
- Updated: `wiki/registers/next-steps.md` ("Stream A delivered" note under the H0 exit gate — 0.2/0.3/0.4/0.5/0.7/0.8 breakdown).
- Updated: `wiki/registers/parking-lot.md` (IN-PX-21 — migration 040 `editor_notes` now applied to prod; the retained cast is now belt-and-braces).
- DB changes (live): migration 040 `editor_notes` applied (was blocked by a non-IMMUTABLE `now()` index predicate — the real reason it "never applied"; repo file fixed to match) + seed note; migration 048 drops `availability_reports.service_id` NOT NULL (the "All"-default reports were silently failing a NOT NULL insert — the reason the table had 0 rows ever). `database.types.ts` regenerated.
- No new pages → `index.md` unchanged. Native items (onboarding funnel rows, Sentry crash capture, password-reset round-trip) still need device-build verification.

## [2026-07-06] ingest | H0 Stream D — security & ops batch (PR chore/h0-security-ops)
Executed brief `docs/strategy/briefs/h0-stream-d-security-ops.md`. One PR of code + a Joe-facing console-actions doc; DB verified read-only via Supabase MCP (project fmusugdcnnwiuzkbjquo). No migrations applied to prod (files only — 053/054 change a live RPC + add a cron; Joe applies on next deploy).
- Updated: `wiki/registers/pre-launch-blockers.md` — closed items 10 (pg_partman verified healthy), 12 (pricing), 24/25 (IN-PX-29/30); item 2 (IN-XPS-004) reclassified unblocked→Joe ceremony; item 13 partial (workflow shipped, awaiting 2 Joe secrets); item 14 options documented; item 4 confirmed still-disabled via advisor. Counts refreshed (open 14→11).
- Updated: `wiki/registers/parking-lot.md` — IN-PX-29/30/50, IN-XPS-003, IN-XPS-007, IN-461 → ✅ Incorporated; IN-XPS-004 ⚠→unblocked. Counts ✅59→65, ⏳30→24.
- Rewritten: `wiki/concepts/operations/service-role-jwt-rotation.md` — JWT Signing Keys shipped (GA mid-2025, auto-migrated 1 Oct 2025; legacy keys deprecated end-2026); new standby→rotate→revoke ceremony; IN-XPS-004 unblocked, left to Joe (live credential).
- Updated: `wiki/concepts/operations/supabase-backup-restore.md` — documented the new automated `db-backup.yml` monthly encrypted off-site workflow + restore path.
- Findings: (a) D1 Play gate is real & current (12 testers / 14 continuous days; personal accounts ≥13 Nov 2023; org exempt) — Joe must check account type/date; ~3–4 wk lead time if it applies, schedules Stream E. (b) pg_partman healthy; empty `card_impression_daily_totals` is by-design (rollup >90d, earliest impression 2026-06-15). (c) IN-461: only "Bedtime Fairy Tales" trips the flat forbidden check → `fairy tales` carve-out.
- Code (not wiki): migrations 053 (username_available rate-limit) + 054 (backfill RPC+cron), Edge Function backfill-missing-titles, `_shared/userScope.ts` `_no_auth_/` guard, `platformPricing.ts` refresh, `scripts/mood_rooms/label.py` carve-out, `.github/workflows/db-backup.yml`.
- No new wiki pages → index.md unchanged. CI green (tsc + 163 tests + lint warnings-only).

## [2026-07-06] ingest | H0 Stream C — DIY launch-compliance pack (Decision 6)
Executed the re-scoped H0 item 0.1 (Decision 6, 6 Jul): the paid solicitor review is deferred to the H2 monetisation gate, so launch compliance is now DIY. Stream C output landed under `docs/legal/`; this is the doc trail (registers already handled in PR #50 — IN-XPS-014 not re-edited here).
- Parked: `docs/legal/solicitor-briefing-pack.md` — banner-marked as the standing brief for the **H2** engagement (will also cover Premium consumer-contract terms / DMCCA + affiliate ASA/CMA disclosures); solicitor shortlist removed per Decision 6.
- New: `docs/legal/launch-compliance-checklist.md` — the actionable roadmap-0.1 checklist: ICO registration (Tier 1 £52/yr, £47 by DD; public-register address caveat), policy accuracy pass, contact route (email-only), hosted policy URLs, store forms.
- New: `docs/legal/store-privacy-disclosures.md` — copy-ready Google Play Data Safety + Apple App Privacy answers (no third-party sharing; no tracking; crash-reporting + push-token rows flagged as H0-conditional).
- Policy edits: `privacy-policy.md` + `terms-of-service.md` — contact set to email-only `privacy@videx.app`, `[TBC]` placeholders + "not lawyer-vetted" caveat footers removed; §2 brought current (click-out `link_type`/`price_shown` disclosed; `user_interest_centroids`/`user_feature_flags`/`app_feedback` added; push notifications left as a clearly-marked, non-rendered pending slot for Stream B Phase 1).
- Worker: `GET /privacy` + `/terms` on `workers/api` (Hono) render the same `docs/legal/*.md` (single source) to HTML via a small purpose-built renderer (`workers/api/src/policyPages.ts`, 10 unit tests) bundled as text (wrangler `[[rules]]` Text rule). Store-listing URLs; browser smoke-test is the Worker deploy step in the checklist.
- Open dependencies flagged for Joe: register the `videx.app` domain + stand up the `privacy@` mailbox before publishing; deploy the Worker and record the `workers.dev` URL. No migrations added (048+ reserved by Streams B/D).

## [2026-07-06] ingest | Decision 6 — solicitor review deferred to H2 monetisation gate
Joe's call after a practical-blocker analysis: neither the stores nor UK GDPR require lawyer-vetted policies (they require a policy URL, accurate disclosures, working data rights, and the ICO fee). Roadmap v1.0 updated in place (Decision 6, H0 0.1 rewritten as a DIY launch-compliance checklist, §5 compliance gates moved to a single H2-entry solicitor pass bundling consumer terms + affiliate disclosures, new Low residual-risk row).
- Updated: wiki/registers/next-steps.md (0.1 row + exit gate), wiki/registers/pre-launch-blockers.md (header note — item 29 re-scoped), wiki/registers/parking-lot.md (IN-XPS-014 status), wiki/sources/strategy-roadmap-2026-07.md (six decisions; register impact).
- The Stream C solicitor briefing pack is parked for the H2 engagement; Stream C's live session redirected to the DIY checklist.

## [2026-07-06] ingest | Notifications v1 + Share v1 (H0 Stream B)
Reflecting the H0 Stream B build (brief `docs/strategy/briefs/h0-stream-b-notifications-share.md`). Retention loop (arrival + leaving-soon push) + growth loop (share → OG title page), shipping inside v1. Migrations renumbered 048–052 → **055–059** (Streams A/D hold 048/053/054) and DEPLOYED to prod (tables + `send-notifications` function + 08:00 UTC cron live; project fmusugdcnnwiuzkbjquo). Delivery gated on the native rebuild + FCM/APNs credentials.
- New page: `wiki/concepts/architecture/notifications-v1.md` — the two alert types, data model (migrations 055–058), first-value-moment consent, the 08:00 UTC Edge Function (dedup/cap/bundling/receipt-pruning), native `expo-notifications` client, and the clean type-separation for the future Premium leaving-soon gate.
- Updated: `wiki/entities/codebase/event-taxonomy.md` — added the `share` explicit event (growth signal, NOT ranking; migration 058) + a "Notification deliveries (separate table)" section for `notification_deliveries`. Bumped `updated` to 2026-07-06.
- Updated: `index.md` — Notifications v1 under Architecture.
- Legal: push data-model note at `docs/legal/notifications-data-model.md` feeds the DIY launch-compliance pack + `store-privacy-disclosures.md` (paid solicitor pass deferred to H2 per Decision 6 — the note carries forward to that engagement).

## [2026-07-07] lint | H0 audit fix batch
Branch `fix/h0-audit-findings` — precise fix batch from the four-stream code audit, one commit, no scope creep. (1) `android-release.yml` injects `EXPO_PUBLIC_SENTRY_DSN` into `native/.env` (empty secret = SDK disabled, as today). (2) `deploy-worker.yml` now watches `docs/legal/privacy-policy.md` + `terms-of-service.md` (the Worker bundles them at build — legal edits redeploy). (3) Native `trackInteraction.ts` ports the web `hasPriorInteraction` dedup guard (A4 first-occurrence rule; event still logged, incremental apply skipped). (4) `send-notifications` arrival + leaving-soon queries filter `stream_type IN ('subscription','free')` — rent/buy/addon churn no longer fires alerts. (5) Migration 060 `claim_push_token` SECURITY DEFINER RPC fixes the RLS-blocked ownership move (offline sign-out / reinstall → stale row → user A's alerts reach user B's device); `native/src/notifications/push.ts` registers via the RPC. (6) Worker `/t/` route: real 404 for unknown titles (max-age=300, never the 24h-cached junk 200), canonical/og:url derived from request origin, `posterUrl` escaped. (7) Migration 053 (NOT yet applied to prod) prefers `cf-connecting-ip`, falls back to the LAST x-forwarded-for hop (first is spoofable), fail-open kept. (8) `platformPricing.ts`: Apple One Individual 14.95→18.95, Apple TV+ annual ≈mo 7.42→7.50 (£89.99/yr). (9) Privacy Policy §2 push subsection published from the pending slot per its own instructions; compliance-checklist box ticked. (10) Comment nits: push.ts migration 049→056, send-notifications config.toml 052→059.

## [2026-07-10] ingest | beta-feedback fixes: reset flow, deep links, title CTA
Branch `fix/reset-deeplinks-title-cta-2` — founder beta feedback (2026-07-09), one PR.
- **Reset-hang root cause**: `native/src/app/reset-password.tsx` sat on "Verifying your reset link…" forever. Supabase's implicit-flow reset link 302-redirects to `videx://reset-password#access_token=…` (tokens in the URL *fragment*); the HTTP→custom-scheme hop drops the fragment, so the app got bare `videx://reset-password`, matched neither the access_token nor code branch, never called setPhase, and had no timeout. Fixed: added the `verifyOtp({type:'recovery',token_hash})` path (query param survives the hop — the preferred path once the email template is switched), kept implicit-fragment + PKCE `?code` as fallbacks, added explicit expired/used-link and timeout (12s) error states with a "request a new link" CTA, and a settle-once guard.
- **Dedicated Forgot-password route**: new `native/src/app/forgot-password.tsx` (email field → "check your email" confirmation → resend with 30s cooldown), registered in `_layout.tsx`; `AuthScreen.tsx` "Forgot password?" now routes there (carries the typed email) instead of firing inline.
- **Prime deep link iOS**: `src/lib/deepLinks.ts` `getDeepLink` gained a `platform` arg; FORCE_SEARCH_FALLBACK is now per-platform — Prime forces search on Android only, uses the exact SA Universal Link on iOS/web. Native `WhereToWatch.tsx` passes `Platform.OS`. `openDeepLink.native.ts` got a per-service app-vs-browser reality comment block; telemetry (confidence↔link_type) deliberately unchanged.
- **Title-page CTA**: extracted the `/t/` renderer into pure `workers/api/src/titlePage.ts`; store CTA is now UA-aware (android→Play, ios→"Coming soon to the App Store" behind `APP_STORE_URL`/`IOS_APP_STORE_LIVE` consts, other→neutral "Get Videx"+Play+"iOS coming soon"). Edge cache key varies by coarse platform bucket (`?p=android|ios|other`, ≤3 variants/title). New vitest suite `titlePage.test.ts` (15) + `deepLinks.test.ts` (9).
- New runbook: `wiki/concepts/operations/auth-email-smtp.md` — custom SMTP sender (Resend free tier), SPF/DKIM/DMARC DNS (hard-blocked on the `videx.streaming` domain registration), branded templates incl. the token_hash reset-link change, redirect allowlist verify, E2E test. Updated `index.md`.
- Verify: root `tsc --noEmit` clean, root `vitest` 205 pass, `native tsc --noEmit` clean, `workers/api vitest` 33 pass. (expo-lint: only 2 pre-existing findings in parallel-agent-owned files.)

## [2026-07-10] ingest | nav + onboarding beta-feedback polish
Branch `feat/nav-onboarding-polish` — founder-reported beta feedback (2026-07-09), native only. No Supabase migrations; no feed/Worker/`useHomeFeed` changes (parallel agent owns those).
- Tab rename + reorder (`native/src/app/(tabs)/_layout.tsx`): Home tab user-labelled **"New"** (concept name unchanged, route/file `index` unchanged); order now **For You · New · Browse · Watchlist · Profile** so users land on the personalised surface. Updated `wiki/concepts/architecture/two-surface-architecture.md` + `home-surface.md` (label note; concept name kept).
- Curating interstitial (`native/src/app/curating.tsx`, registered in `app/_layout.tsx`): on-brand "Curating your Videx" hold (Fraunces display, single slow kicker fade respecting reduce-motion via `AccessibilityInfo.isReduceMotionEnabled`, no bare spinner) shown after onboarding until the first For You payload resolves, then `router.replace('/(tabs)/foryou')` (6s backstop). Onboarding completion now routes here instead of `/(tabs)`. **`first_home_view` moved here** from the Home first-paint (landing is now For You); event **name retained** for funnel continuity. Home `index.tsx` no longer consumes the just-onboarded bit.
- Resume-loop bug fix: `native/src/onboardingDraft.ts` (new, MMKV `videx-onboarding-draft`) persists step + all selections during onboarding, restored synchronously on mount, cleared on completion. Original start timestamp + `startedLogged` flag persisted so duration stays sane and `onboarding_started` never double-fires on resume. `OnboardingFlow.tsx` seeds state from the draft; back-button floor uses a separate `floorStep`. Root cause: step/selections were `useState`-only and the `(tabs)` guard remounts the flow (auth session restore), resetting step to `session ? 1 : 0` (= step 2, selections gone).
- Step 4 layout jump: `StepClusters.tsx` title now two fixed lines ("What do you love to" / "watch?") so the "N selected" chip can't rewrap it and jump the cards.
- Privacy/Terms in Profile → Privacy & Data (`ProfilePrivacy.tsx`): new `native/src/components/LegalSheet.tsx` (minimal markdown-to-Text renderer, no new deps) + `native/src/legal/policyContent.ts` (legal copy mirrored from `docs/legal/*.md` — **keep-in-sync** obligation documented in the module header, same discipline as the SA-service mapping). Same sheets also wired into the onboarding StepAccount ToS links (previously dead text).
- Updated: `wiki/concepts/architecture/onboarding-flow.md` (Step 1 live legal links, Step 4 two-line title, Resume persistence + Curating interstitial sections, events note), `two-surface-architecture.md`, `home-surface.md`.

## [2026-07-10] ingest | Feed composition — paid-titles row + service-row paywall fix
Branch `feat/paid-titles-row-composition`. Founder beta feedback (2026-07-09): per-service rows surfaced titles whose only availability on that service was rent/buy, so tapping in hit an unexpected paywall.
- Per-service rows now `stream_type IN ('subscription','free')` (was `+'addon'`) in `src/lib/recommendations-v2/rows/home/perServiceChart.ts`. `'addon'` excluded as a separate paid entitlement (same "surprise paywall" reasoning; matches the 2026-07-07 audit note-4 alert-query convention).
- New shared row builder `src/lib/recommendations-v2/rows/home/paidRow.ts` ("New to rent or buy") — newest rent/buy titles on the user's services, `release_date DESC`, dedup-aware. `fetchPaidTitles` (client singleton, native Home) + `fetchPaidTitlesScoped` (explicit client, Worker For You).
- Native Home (`native/src/hooks/useHomeFeed.ts` + `native/src/app/(tabs)/index.tsx`): added `paid` to `HomeFeed`; row order is now Recently added → Free tonight → Trending → Spotlight → New to rent or buy → Genre spotlights → Calendar strip → Per-service rows.
- For You (`src/lib/server/foryouRender.ts` `ForYouPayload.paidTitles` + `src/lib/recommendations-v2/edgeRender.ts` `WorkerRenderPayload.paidTitles` + `native/src/app/(tabs)/foryou.tsx`): renders between Continue exploring and Mood Rooms.
- Payload shape changed → native `QUERY_CACHE_BUSTER` v3→v4. `scripts/test/foryou-parity-golden.json` needs `--update-golden` regen against live secrets before parity CI is clean (probe snapshot not extended to `paidTitles`; flagged for Joe pre-merge).
- Updated: wiki/concepts/architecture/home-surface.md, for-you-surface.md (row lists + payload note). Verify: root `tsc --noEmit` clean, `vitest run` 181/181, native `tsc --noEmit` clean (checked via main-checkout node_modules). Web does not consume `paidTitles` — noted legacy-surface parity gap. No migrations.

## [2026-07-13] ingest | H0 execution status pass (week-1 delta) + risk register
- Updated: wiki/registers/next-steps.md — H0 table now carries live status markers; week-1 delta note (v2.1.0→v2.1.4, videxstreaming.com, 4-reviewer pre-launch audit PRs #73–#78, migrations 062–065). Engineering side of H0 effectively complete; critical path = closed-test recruiting (Play 12-tester/14-day gate CONFIRMED on the account) + ICO.
- Updated: wiki/concepts/operations/risks-register.md — R-015 marked mitigated (off-site encrypted monthly pg_dump, public+auth schemas, verified); R-016 added (claim_push_token possession-as-proof model, ACCEPTED by design per the 2026-07-12 review).
- Updated: wiki/concepts/operations/auth-email-smtp.md (2026-07-11 — recorded here for the log): domain corrected to videxstreaming.com; Step 4a rewritten around the /reset HTTPS bridge (Gmail never activates custom-scheme hrefs); template silent-save verification steps.
- Source-of-truth changes this rides with: docs/strategy/Videx_Product_Strategy_and_Roadmap_v1.0.md gained a §6 H0 status block + §7 per-item markers (strategy content unchanged); docs/strategy/briefs/h0-device-test-checklist.md CLOSED with outcomes.

## [2026-08-25] ingest | Catalogue pipeline repair (A1 + A2)
Branch `fix/catalogue-pipeline-a1-a2`, from `docs/plans/2026-08-25-001-fix-catalogue-speed-freshness-plan.md` (workstreams A1 and A2 only; B and C untouched).

**Root cause found during implementation, not in the plan: TMDb returns 401 to every Edge Function call.** `backfill-missing-titles` (2026-08-23) logged `TMDb 401` 300 times and finished `failed=300, upserted=0`; `enrich-new-titles` (2026-08-25) the same, 100/100. `TMDB_API_KEY` is invalid/revoked. **No amount of A1/A2 work writes a title until Joe rotates it** — the catalogue stays frozen at 22,864 rows, newest `2026-06-07`.

Two plan claims corrected against live evidence:
- pg_net's 30s sever does **not** kill the function (the 08-23 backfill ran 105s and returned 200 past it). What it kills is the *outcome* — nothing downstream learns the result. The real casualty is the Edge Function wall-clock limit: 62 of 145 incremental runs since 2026-03-31 (**42.8%**) are stuck at `status='running'`. That is the plan's "~40% of runs hang and re-fetch", now exact — `getLastSyncTimestamp()` reads only completed runs.
- `titles_added=925` on 2026-08-18 confirmed phantom: zero titles created that day.

A1 — migration 066 (`sync_log`): adds `availability_added`/`_updated`/`_removed` (additive, **not** a rename — `sync_history`, `supabase/queries/dashboard.sql` and `scripts/sync-content.ts` are untouched), repurposes `titles_added` to mean real title rows, relabels 65 historic rows (19,811 phantom "titles added" moved across), adds `heartbeat_at` + `reap_stale_sync_runs()` (62 rows on first call), widens the `sync_type` CHECK to allow `'backfill'`, and rebuilds `sync_history`. Both functions aggregate failures by `(scope, message)` into `error_details` and persist them on the failure path. `backfill-missing-titles` writes its own `sync_log` row — the first honest `titles_added` — and aborts on a TMDb 401/403 rather than burning 300 rate-limited calls.

A2 — migration 067: `enqueue_function_call(text, jsonb)` (allow-listed, fire-and-forget via pg_net so the handoff survives isolate teardown), `sync_log.chain_state`, `count_missing_title_ids()` (~2.3s — chain start/end only). `backfill-missing-titles` → 50 rows / 18s per slice, flushing titles **and** skips every 10 rows (was 100 / end-of-run). `sync-incremental` → resumable `(changeType, service, cursor)` position in `chain_state`; a chain that dies or exhausts depth is marked `failed` on purpose so the window is re-covered.

Caught while dry-running 066: the `sync_history` rebuild had to become DROP + CREATE (replace cannot reorder view columns) and re-declare `security_invoker = on`, which migration 026 set and a plain recreate would silently have dropped.

- Updated: `wiki/concepts/operations/sync-pipeline.md` (self-chaining section, "reading sync health" — `cron.job_run_details` is not evidence a job ran, TMDb-401 failure row, catalogue-growth health checks), `wiki/concepts/operations/risks-register.md` (R-010 Medium→High and marked materialised; R-017 credential expiry, R-018 killed long jobs ✅, R-019 backlog drain rate).
- Verify: root `tsc --noEmit` clean, native `tsc --noEmit` clean, `vitest run` 229/229. `supabase/functions/**` is eslint-ignored and outside the root tsconfig, so the two functions were checked with a standalone `tsc --noEmit --noResolve` pass instead (no local Deno).
- **Migrations 066 + 067 are NOT applied.** Both must be applied before the functions are redeployed — the new code writes `chain_state`, `availability_*` and `sync_type='backfill'`, and calls `reap_stale_sync_runs` / `enqueue_function_call`.
- Out of scope and still open: A3 (queue is `tmdb_id ASC`), A4 (22,260-row bulk clear — needs Joe's go-ahead), A5 (daily cadence). SA quota question stays deferred until A1/A2 land and usage is re-measured.

## [2026-08-25] ingest | Chain delivery watchdog + downstream slicing
Branch `fix/chain-delivery-and-downstream-slicing`. Follow-up to the A1/A2 PR (#84), driven by the first live run rather than by plan work.

**The catalogue is unfrozen.** `TMDB_API_KEY` was rotated and the first chain added **379 titles with 0 errors** — `titles` 22,864 to 23,243, newest `created_at` moving from 2026-06-07 to the same afternoon. 216 of 595 queue-head rows were genuine dead TMDb stubs (36%), which independently supports A3's case for reordering off `tmdb_id ASC`. The 62 stuck `sync_log` rows were reaped automatically on the first invocation.

**Then the chain died at slice 12 with an Edge Runtime 502**, exposing two defects in the A2 design:

1. *Slice sizing was backwards.* Workers linger minutes past the end of their request (shutdown events trailed to 16:05:37, three minutes after the last slice), so twelve 18s invocations inside 3.5 minutes exhausted the concurrent-worker allowance. **Invocation count is the scarce resource, not duration** — single invocations of 105s and 128s complete fine. Slices resized 50 rows/18s to 250 rows/75s, depth 40 to 12: same coverage for a quarter of the invocations, plus a 3s pre-handoff pause.
2. *The handoff was not watched.* `enqueue_function_call` returning successfully only means pg_net **queued** the request — structurally the same blind spot as `cron.job_run_details` = 'succeeded', one layer down. Migration 068 adds `resume_stalled_chains()` on a 5-minute pg_cron (pure SQL, so it cannot itself be severed), restarting chains from their saved depth, recording delivery status via a new `chain_state.last_request_id`, and giving up after 5 attempts. Resuming bumps the heartbeat so the 10-minute reaper cannot close a row out from under a nursed chain. Duplicate slices are possible and safe — all slice writes are idempotent.

**Downstream was the bottleneck the repair exposed.** 379 titles landed against 100/day of enrich and embed capacity. This is not lag: `embed-new-titles` skips `keywords IS NULL`, and `match_titles_by_vector` cannot retrieve a NULL embedding, so an unenriched title **cannot appear in For You at all**.
- `embed-new-titles`: switched from `embedSingle` per row to `embedBatch` — the shared client always supported it — so 100 titles go per OpenAI request instead of 1. Also sliced (500/slice, 6,000/chain).
- `enrich-new-titles`: sliced (250/slice, 3,000/chain), TMDb 401/403 fail-fast, own `sync_log` row.
- Both now log to `sync_log` (`sync_type` 'enrich'/'embed', added to the CHECK in 068) with aggregated `error_details`.

Also: a slice refusing at `MAX_CHAIN_DEPTH` now closes its `sync_log` row rather than returning bare, which would have left the watchdog resuming a finished chain until its retry budget ran out.

- Updated: `wiki/concepts/operations/sync-pipeline.md` (slice-sizing rule and its evidence, handoff watchdog, the idempotency requirement for any new sliced job, downstream-is-invisible-catalogue section, two new failure rows, embedding-coverage health checks, manual chain triggers), `wiki/concepts/operations/risks-register.md` (R-018 amended; R-020 silent handoff loss, R-021 titles that cannot be recommended).
- Verify: root `tsc --noEmit` clean, native `tsc --noEmit` clean, `vitest run` 229/229, all four Edge Functions clean under a standalone `tsc --noResolve` pass. Pre-existing type errors in `refresh-service-fingerprints` left alone (untouched by this branch).
- Migrations 066 + 067 are APPLIED. **068 is not** — apply before redeploying the four functions.
- Still open: A5 (daily cadence) becomes safe once the chain is proven at the new sizing; A3 supported by the 36% dead-stub rate at the queue head; A4 probably unnecessary.

## [2026-08-26] ingest | Catalogue pipeline repair closed out
Migrations 066/067/068 all applied, all four Edge Functions redeployed, and the queues drained live. **The pipeline is repaired end to end.**

- `titles` 23,243, **99.81% carrying embeddings**. The residual 43 are TMDb-404 stubs that can never enrich, so `genuinely_pending` is 0.
- enrich chain: 414 to 43 in **154s**, 371 enriched, 0 errors, 2 slices — four days of work at the old 100/day cap.
- embed chain: 171 to **0**, 70s, 0 errors, `queue_at_end: 0`.

One bug was caught by the drain itself and fixed: the drain check read `fetched < SLICE_LIMIT` as "queue empty", which is only true if the slice got THROUGH what it fetched. A budget-truncated slice was reporting `queue drained` with rows still pending — no data lost, but chains stopped short and said they had finished. All three row-count-driven jobs now carry a `truncated` flag. Recorded on the sync-pipeline page as a rule for future sliced jobs, along with the note that `sync-incremental` avoided it by deriving completion from its loops rather than a row count.

Also fixed this session: `sync-incremental`'s chain depth cap raised 10 to 20 after the 2026-08-26 06:00 catch-up run processed 3,518 changes across 30 slices and still hit its cap — a stall trap, since `getLastSyncTimestamp()` only advances on a completed run, so an unfinishable window would re-burn SA quota forever.

- Updated: `wiki/concepts/operations/sync-pipeline.md` (completion-vs-short-fetch rule).
- Next: **A5** (daily backfill cadence) is now the sensible next step. A3 is supported by the measured 36% dead-stub rate at the queue head. A4 looks unnecessary.

## [2026-08-26] ingest | A5 — daily backfill cadence + bulk embedding writes
Branch `feat/a5-daily-backfill-cadence`. Migration 069.

**A5 turned out to be necessary, not just an optimisation.** The gap was *growing* under weekly cadence: `count_missing_title_ids()` 22,260 (08-25) to 22,729 (08-26), and that is after a chain removed 595 entries — so the daily SA sync adds ~1,000 gaps/day against a weekly chain's ~428/day. Inflow beat drain, so the backlog could never close. The original plan's "74 weeks to drain" was optimistic, not pessimistic. Daily cadence nets ~2,000/day and clears ~22.7k in about eleven days. **This is what makes A4 unnecessary.**

Three parts to 069:
- `backfill-missing-titles` weekly to **daily 05:00** (a 12-slice chain is ~16 min, clear of the 06:00 sync).
- `embed-new-titles` **06:45 to 07:15**: daily backfill gives enrich real work every day, and a full enrich chain runs 06:30 to ~06:46, overlapping the old slot. Overlap is not destructive (embed selects `keywords IS NOT NULL`, so it correctly reports drained) but the stragglers would wait a day.
- `bulk_set_title_embeddings(int[], text[])`: one statement per chunk instead of one UPDATE per row.

That third one came from measuring rather than assuming. Batching the OpenAI calls yesterday only moved the bottleneck: two live chains ran **200 rows/78s** and **171 rows/70s**, about 400ms/row, all of it PostgREST round trips — capping embed near 2,400 rows/day against the ~1,900/day daily backfill will produce. A 25% margin was too thin to build a cadence change on. The function refuses a length mismatch rather than letting `unnest()` pad with NULL and overwrite good embeddings.

- Updated: `wiki/concepts/operations/sync-pipeline.md` (full cron schedule table with the two ordering constraints, why-daily-not-weekly with the growth figures, and the per-row-round-trip lesson), `wiki/concepts/operations/risks-register.md` (R-019 addressed and A4 retired; R-022 per-row round trips capping sliced jobs).
- Verify: root `tsc --noEmit` clean, `vitest run` 229/229, edge functions clean under standalone `tsc --noResolve`. The `unnest(a,b)` zip and `::vector` cast were dry-run against live as read-only SELECTs.
- **069 not applied.** Apply, then redeploy `embed-new-titles` (backfill has docstring changes only).
- Remaining from workstream A: **A3** (queue still `tmdb_id ASC`) is now a latency nicety rather than a drain problem. **A4 retired.** Exit criterion to watch: `count_missing_title_ids()` falling ~2,000/day then flattening near zero.

## [2026-08-26] ingest | Workstream A closed — A3 shipped, three commits recovered
PR #86 merged; migrations 069 + 070 applied; all four Edge Functions redeployed from a freshly pulled `main`.

**Workstream A is complete.** A1 (observability), A2 (slicing/chaining), A3 (queue ordering), A5 (daily cadence) all shipped. **A4 retired** — the one-off bulk burst was only ever needed because the scheduled path could not keep up, and at daily cadence it does.

A3 shipped with its rationale inverted. The plan justified it as "the queue head is dead low-ID stubs that mostly 404"; by implementation time that was **already solved** — zero rows below tmdb_id 10000 remained, the skip-list having recorded 2,016 confirmed 404s. What justified shipping it anyway was the user-facing half: the head went from tmdb_id 11,035-12,278 (pre-2000 catalogue) to 250/250 titles available within the last 30 days. Verified live post-deploy: 270 of the head's availability rows fall inside 30 days.

Two defects found by the end-to-end run, both fixed in the same PR:
- `titles_processed` counted rows **fetched**, not attempted — a chain logged 3,000 while 2,453 entries left the queue. Same class of defect migration 066 exists to remove, in the very job it was written for.
- `enrich-new-titles` re-fetched dead rows once per **slice** (8 rows, 56 wasted calls in one chain). Trivial waste, real cliff: past `SLICE_LIMIT` dead rows the chain wedges permanently. Fixed with `titles.enrich_skipped_at` + matching partial index — the same shape as `backfill_skips`.

**Process failure worth remembering:** PR #85 was merged three commits behind its branch tip, silently dropping the stall-trap fix, the `truncated` drain-check fix, and a wiki entry. It surfaced only because a later branch cut from `main` was missing a field, and it left the deployed functions ahead of `main` with no way to tell from behaviour alone. Recovered by cherry-pick. Logged as **R-023**; the mitigation is to check the commit count on the merge screen and to redeploy from a freshly pulled `main`, never a local tree.

- Updated: `wiki/concepts/operations/sync-pipeline.md` (queue-ordering section with the cost warning), `wiki/concepts/operations/risks-register.md` (R-019 A3 marked shipped; R-023 added).
- State at close: 24,496 titles, gap 20,276, 99.97% carrying embeddings, 0 chains running. Exit criterion to watch: `count_missing_title_ids()` falling ~1,450/day net and flattening near zero over ~14 days.
- **Next: R-010 — nothing alerts.** Everything built this week is legible but silent; a human still has to read `sync_history`. That is the gap that let the original 79-day freeze happen.

## [2026-08-26] ingest | R-010 — pipeline health alerting
Branch `feat/r010-pipeline-health`. Migration 071 + `scripts/health/pipeline-health.ts` + `.github/workflows/pipeline-health.yml`.

Closes the last open item from the catalogue work. A1 made failures **legible**; this makes them **loud**.

**The design rule, worth carrying to any future job: alert on the absence of expected success, not the presence of errors.** The 79-day freeze produced zero errors — cron said `succeeded`, the functions returned 200, `sync_log.errors` was 0. Any conventional error hook would have stayed silent throughout. `catalogue-growing` ("nothing new in `titles` for 48h") would have caught it on day two.

**Runs on GitHub Actions, not as an Edge Function** — deliberately. Do not monitor Supabase from inside Supabase: we have watched pg_net sever calls at 30s and the Edge Runtime refuse invocations with a 502, and a monitor invoked by pg_cron inherits both, so in exactly the scenarios worth alerting on the alarm would be the broken part. Actions is independent, already holds the secrets, and a failed run emails the repo owner — so it is the delivery mechanism at no extra cost. No new vendor, no new secret.

Ten assertions, each mapped to a failure actually observed this week, not a hypothetical. `pipeline_health` (071) is the watchman's watchman: each run heartbeats, the next asserts that heartbeat is fresh, so a skipped Actions run is reported rather than silently missed.

Thresholds are deliberately loose (48h staleness, 25% error *rate* with a 20-error floor, 7-day gap comparison) because **an alert that cries wolf gets muted, which recreates the original problem in a more irritating form**. `sync-did-work` is scoped to the SA sync only: enrich and embed legitimately process zero once drained, so asserting "did work" on them would go red precisely when the pipeline is healthiest.

- Verified: all ten assertions run as SQL equivalents against live. Nine pass; `no-failed-runs` correctly reports 2 — today's depth-capped 06:00 sync and yesterday's reaped chain — both of which fall outside the 25h window by tomorrow.
- Updated: `wiki/concepts/operations/sync-pipeline.md` (monitoring section with both design rules and the assertion table), `wiki/concepts/operations/risks-register.md` (**R-010 mitigated**).
- **Migration 071 must be applied**, or checks 4 and 8 fail with "relation pipeline_health does not exist". No function redeploy needed.
- Residual: a sustained GitHub Actions outage goes unnoticed. Far smaller than the zero coverage it replaces.

## [2026-08-26] ingest | B1 + B4 — cold-start latency
Branch `feat/b1-b4-cold-start-latency`. Migration 073. First of workstream B.

**The cause of the 5s cold open is a cold index, not round trips.** Measured back-to-back on live, same query twice:

| | Time | Buffers |
|---|---|---|
| Cold | **4,155.679 ms** | `shared hit=3546 read=508` |
| Warm | **12.365 ms** | `shared hit=4054` (`read=0`) |

336x, entirely those 508 HNSW pages coming off disk. The index is evicted whenever the DB idles, and a pre-launch app is idle almost always — so it is always cold for a real user, while any developer who has just been querying measures the warm number. `warmup-foryou` covered this and was retired in the Worker migration with no replacement.

- **B1**: `warm_recommendation_caches()` every 5 min via pg_cron, using a REAL embedding (HNSW traversal is query-point dependent; a zero vector walks an unrepresentative part of the graph). pg_cron rather than a Worker cron because what is warmed is Postgres's own buffer cache — the opposite call to the health check in 071, and both are right: monitoring must be independent of what it watches, work should sit close to the data. Records to `cache_warm_status`, asserted by the daily health check, because a stopped warmer fails nothing and silently restores the 4s.
- **B4a**: the `getAvailableTmdbIds` hoist in `fetchHomeFeed`. Removing it naively REGRESSES things — the localStorage cache is written only after the RPC resolves, so racing `buildFilterSets` makes both miss and both fire a 1.2-2.9s / 256KB RPC. The hoist existed for that reason. Real fix: in-flight de-duplication (promise shared by cache key, cleared in a `finally`). Then the hoist is unnecessary and seven requests stop queueing behind availability.
- **B4b**: three sequential genre spotlights, sequential because each fed `exclude` for the next. Now fetched concurrently from the same starting exclusions with collisions resolved in order afterwards — identical dedup guarantees, one round trip instead of three, slight over-fetch so rows still fill.

- New page: `wiki/concepts/architecture/cold-start-latency.md`. Updated: `index.md`, `risks-register.md` (R-024 cold index, R-025 caches that populate on completion do not dedup concurrent callers).
- Verify: root `tsc --noEmit` clean, native `tsc --noEmit` clean, `vitest run` 229/229, eslint clean on changed shared-lib files.
- **073 not applied.** No function redeploys needed. Post-apply check is `read=0` on the EXPLAIN in the migration footer.
- Still open in B: B2 feed pre-warm, B3 SQL-side availability (stops shipping a 256KB id array), B5 `/v1/home`, B6 stale-while-revalidate.

## [2026-08-26] ingest | B1 follow-up — halfvec HNSW so the index actually fits
Branch `perf/halfvec-hnsw-index`. Migration 074.

**073's warmer ran, succeeded, and did not work.** Cron runs five minutes apart: 2,637ms, then 87ms on a manual run 12s later, then 1,797ms at the next tick. The index was being evicted between every tick.

Cause, and the check that should have preceded 073: `idx_titles_embedding_hnsw` was **191MB against 224MB of `shared_buffers`** — 85% of the entire pool for one index, competing with the heap and every write the sync chains do. No cron interval fixes a working set larger than the cache.

Fix: pgvector 0.8 `halfvec` expression index on `(embedding::halfvec(1536))` — ~95MB, fits alongside the 22MB heap, and needs no data migration because the column stays `vector(1536)`. Measured precision error on two real embeddings: **1.9e-7**.

`match_titles_by_vector` was not a straight operator swap — it feeds the whole recommendation pipeline. It now retrieves 2x candidates through the halfvec index and **re-ranks at full precision**, so returned distances stay exact and ordering is unchanged bar pathological ties. Gated on `npm run eval:eng1`.

Also verified before dropping the old index that nothing else depends on it: the only other function using `<=>` is `get_mood_rooms_for_user`, which distances against `mood_rooms.centroid`.

- Updated: `cold-start-latency.md` (sizing finding + halfvec section), `risks-register.md` (R-026 — warming cannot help when the object exceeds the cache).
- **074 not applied.** CREATE INDEX takes a SHARE lock on `titles` (blocks writes, not reads) — apply outside the 05:00-07:15 pipeline window. Real test is `cache_warm_status.duration_ms` staying consistently low across several ticks.

## [2026-08-26] ingest | B3 — availability filtering in SQL
Branch `perf/b3-sql-availability`. Migration 075.

Measured the payload before building: `get_available_tmdb_ids` returns **43,234 ids = 328,790 bytes (~321 KB)** — larger than the plan's 256KB estimate — and the mood-room RPCs take the same array as a *parameter*, so it goes up as well as down on every Home load.

The observation that made it cheap: availability is only enormous as a flat id list. Per title it is tiny (**1.26 services average**, max 7). Migration 075 denormalises it to `titles.available_services` (GIN), so every query filters with one `.overlaps()` and fetches nothing extra.

**Native Home now fetches the id list zero times, down from twice.** `fetchGenreSpotlight`/`fetchCriticallyAcclaimed` take services and filter in SQL; `fetchPopular` filters TMDb trending so it cannot be a predicate on our own query — it asks about the ~40 ids it holds via a new `filterToAvailable`. `buildFilterSets` dropped from the Home path entirely: Home only ever used its `availableTmdbIds` field, so its dismissed/thumbs-down/watchlist reads were dead weight.

This supersedes B4's in-flight-dedup plumbing on this path — that existed to make one 321KB fetch serve two callers; now there are none.

Guards, because a denormalised column is only safe if something checks it: row-level trigger, `refresh_title_available_services()` for repair/bulk loads, and `count_available_services_drift()` asserted daily by the health check. The trigger fires per row, so bulk loads must disable it and refresh after.

Also note the **empty-array convention fails open**: `services.length === 0` means no filter, so a caller that gets it wrong silently shows unavailable titles rather than erroring.

Deferred deliberately (none crossing a mobile connection): mood-room RPCs, `foryouRender`/`ranker` (server-side + KV-cached), web `useForYouContent` (legacy).

Also captured `docs/v2/evaluations/2026-08-26-eng1-eval-post-halfvec.md` — ENG-1 gates all PASS for migration 074, but with the honest note that section B's recall gate passes as 0/2 vs 0/2 and proves nothing; the real verification was an exact-vs-approximate A/B (200/200 overlap, 20/20 identical top-20 positions).

- New: `wiki/concepts/architecture/cold-start-latency.md` B3 section. Updated `risks-register.md` (R-027 drift).
- Verify: root + native `tsc --noEmit` clean, `vitest run` 229/229, eslint clean on changed files.
- **075 not applied.** No function redeploys; B3 is client code shipping with the next native build.

## [2026-08-26] ingest | B6 — paint from the persisted cache on launch
Branch `perf/b6-stale-while-revalidate`. No migration, native-only.

The plan framed B6 as "persistence already exists; the app just does not prefer speed on launch". The persistence was in fact **wired correctly** — `PersistQueryClientProvider`, MMKV, `maxAge`/`gcTime` both a day, cache buster. The render gates were the bug.

Both Home and For You did `if (isLoading) -> spinner; if (!data) -> failure`. While the persister restores, queries are **paused**: `isFetching` false, so `isLoading` false, `data` still undefined — so both screens fell through to the failure branch and rendered *"Couldn't load tonight's shelf"* / `<NotReady/>` for a frame on every cold start, right before the cached payload would have painted. Same before `useUserServices` resolved (`enabled: !!services` false). **The app was rendering "nothing yet" as "something broke".**

Second issue: the query key embeds the service list, so when services resolve the key changes and the new key has no in-memory data — dropping to empty even while the old key had content. Fixed with `placeholderData: keepPreviousData`.

Both hooks now expose `isBootstrapping` (restoring OR services unresolved) and both screens branch on it before testing `data`. Revalidation deliberately unchanged — stale entries still refetch in the background, just behind visible content.

Worth recording as a pattern: **any query keyed on another query's result needs both `useIsRestoring` and `keepPreviousData`**, and the screen must branch on bootstrapping before `data`.

Also corrected an assumption of mine mid-implementation: I expected `useHomeFeed` to have no `staleTime` and was going to add one. It already had 30 minutes, which was already right. Left alone.

- Updated `wiki/concepts/architecture/cold-start-latency.md` (B6 section + the pattern; B2 marked parked-not-pending with the reasoning).
- Verify: root + native `tsc --noEmit` clean, `vitest run` 229/229, `npx expo lint` clean (the one warning at index.tsx:56 is pre-existing — checked against main).
- Workstream B now: B1 ✅, B3 ✅, B4 ✅, B6 ✅, B2 parked, **B5 open**.

## [2026-08-26] ingest | C2 — retrieval headroom, and a latent 074 bug
Branch `feat/c2-retrieval-headroom`. Migration 076. First piece of Workstream C.

**Workstream C validated from impression data first.** The plan's headline (4.2x average, 52x max) is all-time and **Home-dominated** — C is written about For You. A 14-day window makes For You look healthy (avg 1.00, max 1) but that is a sampling artefact: only 2 users with 1 session each, so repetition physically cannot appear. The real signal is that views-per-title scales with return visits:

| For You sessions | Distinct titles | Views/title |
|---|---|---|
| 1 | 18 | 1.00 |
| 2 | 20 | 2.10 |
| 6 | 40 | 2.93 |
| **9** | **29** | **4.45** |

Nine sessions, 129 impressions, 29 distinct titles from a catalogue of 24,496. That is the deterministic pipeline.

**C is less greenfield than the plan implies.** `applyAvoidPenalty(scored, avoidSet, embeddingMap, gamma)` already exists as a score-penalty stage with a tunable gamma, and `seenIds` is already fetched every render (90-day window, cap 1000) — it is just wired only to `selectExplorationCandidates` and demotes nothing. C1 is "add a second penalty alongside the first", not new machinery.

**C2 (this PR): pure headroom, no behaviour change.** `DEFAULT_CANDIDATE_LIMIT` 500 to 800, `PER_CENTROID_CANDIDATE_LIMIT` 200 to 400. A pure top-K pool cannot absorb demotions — evicting from the head shrinks the result rather than reaching deeper. Affordable because of B1: 23ms at 200, 33ms at 400, 38ms at 500.

**Found a bug I introduced in 074.** `match_titles_by_vector` THROWS for any `match_limit` above 500 — 074 set `hnsw.ef_search` to `match_limit * 2` (capped 4000) but the extension's valid range is 1..1000. Invisible because every caller used 200 or 500; C2 would have broken For You on its first request. Migration 076 clamps breadth to 1000 and **raises** above `match_limit` 1000 rather than silently returning ~1000 rows.

Method note worth keeping: `SELECT set_config('hnsw.ef_search','3000',true)` returns '3000' happily at the top level — the range check only fires when the index scan uses it. Probing a GUC directly is not a test of what a function will do with it.

**Next: C1** at the gentler threshold chosen — bury at 4+ views without engagement, park below that, decaying with recency. Engagement = any of detail_view / dwell_event / watched / deep_link_click / watchlist_add / thumbs_up / share. The plan's clicked-but-not-converted nuance is deferred: only 10 `deep_link_click` rows exist, nothing to tune against.

**Validation caveat, recorded honestly:** the plan says validate C1 via exploration CTR, not offline eval. With ~10 users and 42 For You impressions in 14 days there is no CTR signal and no A/B to run. C1 ships on reasoning; the check is re-measuring views-per-title for multi-session users in a few weeks.

- Verify: root + native `tsc --noEmit` clean, `vitest run` 229/229, eslint clean.
- **076 not applied.** No redeploys — C2 is shared-lib constants consumed by the Worker.

## [2026-08-26] ingest | C1 — two-stage engagement fatigue
Branch `feat/c1-engagement-fatigue`. No migration; **Worker redeploy required** (`foryouRender` is Worker-side).

New `recommendations-v2/fatigue.ts` demotes titles the user has been shown and ignored, mirroring `applyAvoidPenalty` exactly — subtract from `finalScore`, re-sort — so rows, MMR and exploration all see the adjusted order without knowing fatigue exists.

| Stage | Trigger | Penalty |
|---|---|---|
| Park | 1-3 views, no engagement | 0.04/view (max 0.12) |
| Bury | **4+** views, no engagement | 0.50 |

Both decay linearly to zero over 21 days — that decay is what makes parking temporary rather than a permanent blacklist. Engagement (`detail_view`, `dwell_event`, `watched`, `deep_link_click`, `watchlist_add`, `thumbs_up`, `share`) exempts a title entirely: repetition only matters for things being ignored.

Threshold 4 chosen as the gentler option. The heaviest real user averages 4.45 views/title, so 4 catches the actual problem while leaving normal repeat exposure alone — and with no CTR signal available, an over-eager bury would degrade relevance in a way we could not measure for weeks.

**Depended on C2.** Demoting from a pure top-K pool surfaces nothing new; it shuffles the same K and shrinks what is usable. C2's deeper retrieval is what these demotions fall behind. Landing them separately made C1 a small, reversible step.

13 unit tests cover the curve: park/bury step, no escalation past the threshold, linear decay to zero, engagement exemption, non-mutation, and a reproduction of the real 4.45-views case. `vitest run` 242/242 overall.

**Recorded honestly: C1 ships on reasoning, not evidence.** The plan specifies validating via exploration CTR rather than offline eval, but ~10 users and 42 For You impressions a fortnight gives no CTR signal and no A/B. The check is re-measuring views-per-title for multi-session users in a few weeks.

Two caveats written onto the surface page: `card_impressions` has no `media_type`, so fatigue keys on `content_id` alone and a film/series TMDb-id collision would demote one wrong title (same limitation as the existing `fetchSeenContentIdsScoped`); and the plan's clicked-but-not-converted nuance is deferred because 10 `deep_link_click` rows is nothing to tune against.

- Updated: `wiki/concepts/architecture/for-you-surface.md` (Engagement fatigue section, placed with the exploration slot as the other scoring concern).
- Verify: root + native `tsc --noEmit` clean, `vitest run` 242/242, eslint clean.
- Remaining in C: **C3** (per-session ordering variation) — still needs the cache-key decision, since the feed is KV-cached 20 min and a per-session seed would either bust it every open or be ignored.

## [2026-08-26] ingest | C3 — per-open ordering variation. Workstream C complete.
Branch `feat/c3-session-ordering`. No migration; **Worker redeploy required**.

`bucketedShuffleBands` added beside the existing `dailyShuffleTopN`, reusing its PRNG but doing a different job: shuffling within contiguous bands of 4 rather than the whole head. A head shuffle can send a rank-1 match to rank 20 — right for Home's popularity rails, wrong for a personalised feed. Banding bounds the fall.

**The seed is deliberately NOT in the cache key.** A cached payload already carries its bucket's ordering, so the feed re-orders exactly when the 20-minute feed cache turns over — zero extra cache entries, zero hit-rate change. The cache-pressure objection I raised when proposing C3 turned out not to exist once framed this way. `ORDERING_BUCKET_MINUTES` must track the Worker's `FORYOU_CACHE_TTL_SECONDS`; both files now carry a comment naming the coupling, since a longer bucket stops variation and a shorter one varies invisibly.

**Applied to the row input only.** `selectExplorationCandidates` keeps its daily seed and fixed splice positions [2,5,13], so the day's exploration pick survives while the material around it rotates. Shuffling its input would have made `EXPLORATION_SLOT_POSITIONS` meaningless — which is also the decisive argument against the client-side alternative, along with splitting ordering across two codebases, breaking `card_impressions.position` semantics, needing a web duplicate, and waiting on a native build.

12 unit tests. The load-bearing one is that nothing ever crosses a band boundary — that invariant is the entire reason banding was chosen. Also: stability within a bucket (no flicker), change across buckets, per-user variation, timezone-independent boundaries, trailing partial bands.

- Updated `wiki/concepts/architecture/for-you-surface.md` (C3 section, with the cache-key reasoning and why not client-side).
- Verify: root + native `tsc --noEmit` clean, `vitest run` 254/254, eslint clean.
- **Workstream C is complete**: C1 ✅ C2 ✅ C3 ✅. Remaining from the whole plan: **B5** only (`/v1/home` aggregator), and B2 parked.

## [2026-08-27] ingest | B5 — /v1/home aggregator. The plan is complete.
Branch `feat/b5-home-aggregator`. No migration; **Worker redeploy required**.

Home was making ~15-20 round trips per uncached load from the device (~10 TMDb via the proxy, ~9 Supabase). `/v1/home` collapses that to one.

**The blocker that shaped the design.** `lib/api/tmdb.ts` cannot run server-side — PLAT-2 commit 6 removed the API key from client code entirely, and the module's own comment calls direct mode "a keyless degraded path". It is also axios- and localStorage-bound. The Worker could have called its own `/v1/tmdb` proxy over loopback and reused it unchanged, but that turns every Home render into ~8 extra self-requests to avoid writing 60 lines. Hence `src/lib/server/tmdbServer.ts`: plain fetch, explicit key, only the four endpoints Home needs, axios-shaped envelope so row builders read identically on both paths.

**Scoped variants, following `fetchPaidTitlesScoped`.** `fetchGenreSpotlight` gained an optional trailing client (public `titles` only, no UserScope). `fetchPerServiceChartsScoped` needs BOTH a client and a scope — titles/streaming_availability are public but the click-ordering read hits `user_interactions`, which is user-owned. The ordering rule is now one shared function so the two paths cannot drift.

**The client path stays as the fallback.** This is a second implementation, not a move: row builders are shared, but composition (interleave, dedup, hero extraction, daily rotation) is duplicated and both files say so. Deleting the client path would leave Home with no fallback when the Worker is down — For You accepts that, Home should not, since it is where a user lands when For You fails.

Cache keyed on **services + clusters, not `taste_vector_updated_at`**: Home is not personalised by the taste vector (only spotlights use clusters), so a taste interaction should not bust it. Still per-user, because per-service rows are click-ordered from the user's own history. 10-min TTL, single-flighted, and an empty Home is never cached — a user mid-onboarding would otherwise get a blank shelf pinned for the TTL.

Client side: `tryFetchHomeFromWorker` returns null and never throws, with a **shape guard** — a payload missing its arrays would render an empty shelf that looks real, and the Worker caches its own responses, so drift could pin a blank Home. 12s timeout, tighter than For You's 20s, because Home has a working local path to fall back to.

- Verify: root + native + worker `tsc --noEmit` clean, `vitest run` 260/260 (6 new on the Home cache key), `expo lint` clean (one pre-existing warning).
- **The remediation plan is now complete**: A1-A3/A5 ✅ (A4 retired), B1/B3/B4/B5/B6 ✅ (B2 parked), C1-C3 ✅.
- ⚠ **Unverified on a device.** B3, B4, B6 and now B5 are all client-side changes sitting in main with no native build cut. Four changes to the cold-open path validated only by types, tests and reasoning. A build and a timed cold launch is the outstanding work.

## [2026-08-27] ingest | Worker deploy broken by a build-time define; /v1/home verified live
PR #99, branch `fix/worker-bundle-dev-define`. One-line import redirect. New risk **R-028**.

**The B5 merge deployed nothing.** `deploy-worker.yml` failed on the #98 merge with `Uncaught ReferenceError: __DEV__ is not defined at src/lib/api/tmdb.ts:19`. The chain: `homeRender` -> `contentAdapter` -> `../api/tmdb` for `buildPosterUrl`/`buildBackdropUrl`. `api/tmdb.ts` reads `__DEV__` at module scope — a Vite/Metro define with no equivalent in the Workers runtime — so importing through it both dragged axios into the bundle and made the script unloadable. Cloudflare rejected the upload, the previous version stayed live, and **C1, C3 and B5 were all absent from production while `main` looked green**.

`api/tmdb.ts:282` only *re-exports* those two builders from `./imageUrls`, which has no imports of its own. Fix was to import from there directly.

| | Before | After |
|---|---|---|
| Bundle | 903.90 KiB | 715.67 KiB |
| gzip | 201.61 KiB | 158.60 KiB |
| `__DEV__` references | 1 (fatal) | 0 |
| `axios` in bundle | present | absent |

**The lesson worth keeping.** Root, native and Worker `tsc --noEmit` were all clean, 260/260 tests passed, eslint passed. None of them can see this class of failure: the types are correct and the logic is correct, but the module graph pulls a define that only exists under a bundler. The deploy is the only gate that catches it, and it runs *after* merge. `cd workers/api && npx wrangler deploy --dry-run --outdir .wrangler-check` reproduces it in seconds — run it on any PR that adds a `src/lib` import to the Worker.

Generalises past this repo: a shared source tree consumed by three runtimes (Vite, Metro, workerd) means "compiles" and "bundles for the target" are different questions.

- Verified live after merge (`videxstreaming.com`): `/v1/home?services=netflix` -> `401 {"error":"unauthorized"}`; `/v1/definitely-not-a-route` -> `404`, proving the 401 is a registered route and not a catch-all; `?services=notaservice` -> `400 {"error":"unknown service id"}`, proving validation runs ahead of the JWT check and so could only come from B5's own handler.
- Android build dispatched on `main` at `9bc69d9` (`workflow_dispatch` is build-only — only a `v*` tag submits to Play).

## [2026-08-27] ingest | Device verification on iOS; available_services ordering bug (R-029); C3 confirmed
Migration 077, PR #108. Plus the CI/delivery work that made a device test possible at all (PRs #101-#105) and the OTA groundwork (#106-#107).

**The plan's client-side half is finally verified on hardware.** Everything from B3 to B6 had sat in `main` validated only by types, tests and reasoning. Joe's report on an ad-hoc iOS build: speed "significantly better", element load times "fantastic".

**B5 confirmed from the edge logs, not by feel.** Supabase `edge_logs` separates callers by user agent — the app sends `Videx/8 CFNetwork/...`, the Worker sends none. In a 35-minute window: **68 requests from the Worker across 12 paths, 28 from the app across 8**, and the app's are almost all writes (impressions, watchlist, interactions, auth). Two further proofs: `jose/v6.2.3` hitting `/auth/v1/.well-known/jwks.json` is `verifySupabaseJwt` inside the Worker, and a `genre_ids=cs.{99,80}&available_services=ov.{...}&limit=160` query — a **Home** row — came from the Worker. Home renders server-side.

**B3 confirmed in the same logs.** `available_services=ov.{apple,bbc,channel4,itvx,netflix,prime,skygo}` is `.overlaps()` filtering in SQL. The 321KB payload is gone from the Home path; `get_available_tmdb_ids` was called once, by For You's hard filter, which is correct.

**Then the health check failed: drift 821.** See R-029 for the full diagnosis. Short version: `streaming_availability` rows were written before the `titles` row existed, 821 of 821, so 075's trigger updated zero rows and raised nothing. B3 is what made it user-visible — Home's spotlights filter on the column in SQL, so those titles were invisible to them. Home was fast that day and also quietly missing that morning's new titles.

Migration 077 adds an `AFTER INSERT` trigger on `titles`, repairs the existing rows, and asserts drift is 0 before committing. **The fix was proved rather than assumed**: the failing order (availability first, title second) was reproduced inside a `DO` block ending in an unconditional `RAISE`, which returned `TRIGGER OK — got {netflix,prime}` and rolled back; 0 probe rows and drift 0 afterwards. That beats waiting for the next 05:00 run to find out.

**C3 verified from `card_impressions`, after a false negative of my own.** First attempt aggregated `min(position)` per title and reported "0 moved" — wrong, because `position` is the index *within a row*, not a global feed index, so it collapsed across rows and the join fanned out. Ranking titles by first-appearance time instead, across two consecutive 20-minute buckets (16:22 and 16:45): **18 titles in both, 14 moved, average displacement 0.89, max displacement 2, zero violations of the band-of-4**. That is `bucketedShuffleBands` exactly — local reordering strictly bounded by band width. Random shuffling would show large displacements; C3 not running would show none.

- **Telemetry gap found:** `card_impressions.metadata` is null on every row and there is no row-identity column, so feed order cannot be reconstructed exactly for a multi-row surface — the C3 check had to go through a time-ordering proxy. Worth fixing before any placement analysis.
- **Delivery:** TestFlight was unusable (`App Not Available for your Apple Account` despite App Store Connect showing the tester as installed with 50 sessions; Apple ID, team-invite status and group membership all ruled out). EAS ad-hoc internal distribution went around it. `eas build` cannot run from Windows — the junction tree fails to package with symlink EPERM — so ad-hoc has to be dispatched from the Linux runner like every other build; `eas device:create` does work locally, since it never builds a tarball.
- **Iteration:** `expo-updates` added (#107) after repairing the stale lockfile (#106). `runtimeVersion: fingerprint` so an update is only served to builds whose native side matches; `fallbackToCacheTimeout: 0` deliberately, because anything higher blocks launch on a network round trip and would partly undo the very cold-open work being measured. JS-only changes now ship in ~60s via `eas update --channel preview`.
- **Lockfile finding:** nothing in CI ran `npm ci` inside `native/` — the native workflows use `npm install`, which tolerates drift. So native release builds were never reproducible; every AAB and .ipa floated its transitive tree.

## [2026-08-27] ingest | Novelty eval — the C-workstream metric was measuring the wrong thing
`scripts/evaluation/novelty-eval.ts`, `npm run eval:novelty`. Read-only, no migration, no new RPC.

**The plan's metric could not answer its own question.** The C workstream existed to fix "For You shows the same titles in the same order every time", and proposed *average impressions per title* as the check. That figure scales with how often the app is opened, so it cannot separate rotation quality from usage intensity: during heavy testing it rose **1.62 → 6.23 while rotation was demonstrably working**. A metric that degrades the more the product is used is measuring usage.

**Session-over-session novelty** is the metric that answers it: of the titles shown this session, how many were absent from the previous one. Per-session-pair, so session count cannot distort it. `card_impressions.session_id` is a real uuid and never null, and `source_surface` separates for_you from home, so sessions are read directly rather than inferred from gaps.

**0% is usually correct, and the script says so.** `ORDERING_BUCKET_MINUTES` is deliberately matched to the Worker's 20-minute feed-cache TTL, so two sessions inside one bucket are served the same cached payload and *must* score 0%. The output prints the gap since the previous session, marks with `!` only those 0% rows whose gap exceeds the bucket, and the summary reports the two counts separately. Without that, the healthy baseline reads as a 29% failure rate.

Baseline (2026-08-27), 9 sessions / 2 users / 30 days: **median 18% new**, range 10–65%, first-seen titles entering every session, both 0% rows at 0–1 min gaps, **zero flagged**. The one 21-minute gap — crossing a bucket boundary — scored 40% new, independently corroborating the C3 verification done from position data.

- Paginates to exhaustion. PostgREST caps an unpaginated read at 1000 rows and returns page one with no error and no truncation signal; that silence already produced one wrong number during this investigation.
- Verify: `npx tsc --noEmit` clean, `npx eslint` clean, runs clean against prod read-only.
- Follow-up recorded in the plan doc, **not actioned**: the 20-minute bucket means a close-and-reopen inside 20 minutes shows an identical feed — correct for anti-flicker, but it is exactly the scenario behind the original complaint. If it still feels static once real users arrive, the lever is decoupling ordering from the cache TTL (vary order on read, one cached payload) rather than shortening the TTL, which would cost re-renders. Watch, do not change on current evidence.

## [2026-08-27] ingest | For You hero rotation — the slot was exempt from its own telemetry (R-030)
PRs #114 (log + promote) and #115 (correct the ranking signal). Worker deploy + OTA; no migration.

Joe reported the For You hero stuck on one title **for months**. Not tuning — structural, in two parts.

**The hero logged nothing.** `recordImpression` has exactly one caller, `PosterCard`. The hero renders as `MagazineHero`, and `recommended.shift()` removes it before any PosterCard sees it. So the largest card on the page produced no `card_impressions` row, ever. C1 fatigue is computed entirely from that table, so the hero accrued zero views and was **structurally immune to the mechanism built to stop repetition** — everything below it demoted, the hero could not. The novelty eval reads the same table, so its median-18% baseline never included it either. The stuck title had **4 impressions across all users and 0 interactions**.

**My first fix would have made it worse.** #114 promoted the least-seen title in the top band, ranked on total impressions. But the hero is excluded from the row, so its rivals at ranks 2-4 log a row impression on every open while the incumbent logs only its single hero impression — "least seen" therefore always selects the incumbent, and each open adds +1 to all of them so the gap is constant. It would also have overridden C3's per-open shuffle, which was already rotating that slot. Caught after merging, corrected in #115.

**What works.** Log the hero with `metadata->>role = 'hero'`, and rank the slot on hero-slot history (`fetchHeroViewsScoped`) rather than a global counter. This converges because the counter is incremented by the decision it drives: hold the slot, become less eligible for it. Confirmed live within minutes — *One Battle After Another* held 3 turns, then yielded to *Havoc*.

- Ranks on hero history, **not** the fatigue penalty: C1 exempts engaged titles, and the hero is the card most likely to be tapped, so honouring that exemption would pin exactly the title that has been over-shown.
- Band-limited to `HERO_CANDIDATE_BAND = 4`; ties keep ranking order, so equal freshness still means best match wins.
- The `role` metadata also starts closing the row-identity gap that forced the C3 verification through a time-ordering proxy.
- Caught in review of my own draft: the impression `useEffect` sat below the loading/error early returns, violating the Rules of Hooks.
- **Home's hero has the identical blind spot** — same `MagazineHero`, still logs nothing. Not fixed; the ask was For You.

## [2026-09-08] ingest | SA quota incident — 11 days blind, four green ticks, and the move off RapidAPI
PRs #121-#129, migration 078. New risks **R-031** to **R-034**.

**What happened.** A2 unfroze the catalogue, which raised availability changes from ~600/day to ~4,200/day — and with them the API request volume. On 29 Aug the RapidAPI quota ran out. Every subsequent run hit 429s, and because the per-page catch swallows fetch errors to keep one bad service from aborting the other seven, **all 32 (change_type, service) loops "completed", the run was marked `completed`, and the window advanced past data nobody had fetched**. Four consecutive days of green ticks over ~96 hours of skipped changes, at 128 wasted requests a day. See R-031 — the generalisable half is that *"the loop finished" is not "the work was done"*.

**Instrument before tuning.** The brief's step 1 was to record SA requests per run and take a baseline BEFORE optimising (#121, migration 078). That ordering paid for itself twice: it revealed the 128-requests-for-nothing pattern, and it later let the catch-up be sized against a measured 213-requests-per-36h rather than a guess.

**Two of the brief's five steps were wrong, and the data said so.**
- *Page size* — no such parameter exists. `/changes` is fixed at 25 per page. The docs list every accepted parameter and none controls result count. Dead end.
- *Lookback overlap* — the premise ("36h on a 24h cadence, so a third is re-fetched") misread the code: `MAX_SINCE_LOOKBACK_SECONDS` is a floor applied via `Math.max(lastCompleted, now-36h)`, so it never extends a healthy window. Measured across real runs: overlap **0.00h** when runs succeed; the 36h only engages after a failure, which is catch-up working. Trimming it would have saved nothing and dropped data after a failure.
- What the docs DID surface: `catalogs` takes a comma-separated list (up to 32), so per-service calls could be batched. Estimated from `streaming_history`: only **~13%**. Real, modest, not the answer.

**The answer was the plan, not the code.** Measured usage ~213 requests/day ≈ 6,400/month against a free tier of 1,000. Pre-A2's ~30/day fitted only because the pipeline was broken. And the API has **no pay-as-you-go** — quota is a hard wall — so there was nothing to optimise toward. Moving to the vendor direct (#126) costs **$49/mo vs ~$69 on RapidAPI for identical 25,000 requests**; the vendor names the markup explicitly. See R-032.

**Verified with one request, not two hundred.** Before switching, a single live `/changes` call confirmed the direct channel's envelope matches the parser (`changes[]`, `hasMore`, `showId`, `showType`, `service.id`, `streamingOptionType`) — and revealed it returns **no `x-ratelimit-*` headers**, so the quota fast-path added in #122 cannot fire there and the exhausted-retries branch is the real guard. Same discipline settled the recovery question: an over-old `from` returns `HTTP 400 parameter "from" cannot be more than 31 days in the past`, which proved the 11-day gap was recoverable after an earlier probe had wrongly suggested otherwise.

**The safety rails correctly blocked the recovery.** `SA_REQUEST_BUDGET` (500) and `MAX_CHAIN_DEPTH` (20) are sized for a normal daily window. A backlog recovery is not one. Rather than weaken the defaults for every scheduled run, both became per-invocation overrides stamped onto `chain_state` (#127), so a run that spends more than usual records what it was *allowed* to spend.

**Outcome.** Catch-up: `since` = 28 Aug 06:12 → **completed**, 27 slices, **594 requests** (I had estimated ~1,400 — over by 2.3x, because a longer window fills pages more completely rather than adding partial ones), **14,431 changes** recovered — 3,605 added, 8,661 updated, **2,165 removed**. That last number matters most: titles that had left services while we were blind and were still being shown as available.

- **R-033**: the 4 errors on the first good run were a real data-loss bug — delete-then-insert with no transaction, plus `String(err)` on a `PostgrestError` yielding `[object Object]`. Fixed in #128 and proven in production within the hour: the catch-up hit 20 link-less changes and **preserved all 20 rows**, with legible messages. The delete+insert is still not transactional.
- **R-034**: `no-failed-runs` counted raw failures in a 25h window, so it stayed red all day over a failure two later runs had already recovered from. Fixed in #129. Its sibling `catalogue-growing` was left alone — it was a true positive (newest title 54.5h old because we were blind), and 2,497 titles are queued for the next backfill.
- Steady state now: ~213 requests/day ≈ **26% of the 25,000/month** Starter plan.

## [2026-09-08] ingest | Search-term logging on native — the emitter existed, nobody called it
PR: search-term logging (Session 1 of the quick-filters/presets plan). Migration **079**. Ingested `raw/plans/2026-09-08-001-brief-…` and `raw/plans/2026-09-08-002-recommendation-…`.

- New pages: `wiki/sources/quick-filters-and-search-presets-brief-2026-09-08.md`, `wiki/sources/quick-filters-and-search-presets-recommendation-2026-09-08.md`
- Updated: `wiki/concepts/architecture/signal-architecture.md` (new "Search events" section + `search` added to the `user_interactions` routing row), `wiki/concepts/product/privacy-and-gdpr.md` (30-day search-text retention row; search added to behavioural signals; corrected two stale "wiring deferred" claims on export/erasure; new §10 gap section), `wiki/registers/parking-lot.md` (IN-V3-003 closed; IN-SL-001..003 filed), `index.md`

**The feature was a wiring job, not a build.** `emitSearch` has written `user_interactions` rows since Phase Search V2 and the web has called it since 2026-05. Native never did — so the brief's "there is no search-term logging anywhere today" was half right: the mechanism existed, the data did not. Live check before writing anything: 9 event types present in production, `search` absent, **zero rows**. Deletion (042) and export (043/061) already covered the table, so the gap was policy text and a retention position, not schema.

**"Settled queries only" is the whole privacy promise, and the timer does more work than it looks.** A typed query logs once, when its results have arrived *and* the text has held still for ≥ 1.5 s — or on submit / first result tap. The §5.3 rule that "a strict prefix of the next query is not emitted" needs no lookahead: every keystroke restarts the timer, so a prefix can only settle if the user actually stopped on it. The one real trap was the 300 ms search debounce — short-circuiting the settle timer on submit would otherwise log the *prefix* the results happened to be for, so the emit also waits for the debounce to catch up.

**Retention is on the field, not the table.** Migration 079 (pattern: 014's `card_impressions_rollup`) rolls `search` rows older than 30 days into `search_terms_daily` — day, normalised term, mode, count, median result count, **no user column** — then nulls `metadata.query` and *keeps the row*, because the search-attribution recompute reads only `created_at` + `session_id`. The cutoff is a whole-day boundary rather than `now() - 30 days`, so a single day is never split across two runs and its median stays computable; retention is therefore 30–31 days, and the policy states the shorter number. The migration says in a comment that the aggregate needs no delete/export coverage, so the IN-PX-54 drift check reads it as intentional rather than as a gap.

**Rehearsed against live, destroyed nothing.** The rollup ran on synthetic rows inside a transaction forced to roll back: `"  The   BEAR  "` and two `"the bear"` collapsed to one term (n=3, median 20), the app-authored semantic phrase stayed separable by `mode`, the filter row with `query: null` contributed nothing, recent text was untouched, and the stripped rows kept `mode`/`category`/`result_count`. The delete/export exit criterion was verified the same way against the real `joegreenwas@gmail.com` account with `request.jwt.claims` set — export returned all 3 `search` rows with full metadata; `delete_own_account()` left 0 interactions, 0 search rows, 0 profile rows — then rolled back. Account intact at 87 interactions afterwards.

**One promise we cannot keep, found by checking rather than assuming.** Policy §10 says signed-in users get notified in-app 30 days before a material change. Nothing implements it: the policy is a static string, there is no stored version (no `profiles` column, no consent table), no changelog surface. The push transport exists but is blocked on FCM/APNs credentials and carries recommendations, not legal notices. Filed as IN-SL-003 — a product decision for Joe, not a wiring task.

**Two follow-ups before merge (Joe, same day).** The emission now ships **dark** behind a per-user `search_logging` flag, default false — the policy text is live from the same build, but nothing is written for a user until Joe turns the flag on having told them. That is the interim consent mechanism standing in for the §10 notice; IN-SL-003 stays open for H1 and no notice UI was built. And the attribution boost is now gated on **content intent**: `lookup` and `semantic` qualify, `filter` qualifies only with a `mood_key`, a bare filter apply does not. Session 2's quick-filter chips would otherwise emit a `filter` row on every chip change and boost every subsequent interaction on New and For You by 1.3x. `isContentIntentSearch` is the single definition, shared by the emit path and the batch recompute — the batch query now selects `metadata` rather than duplicating the rule as a PostgREST filter, because two copies drifting apart is the bug this prevents. Four cases unit-tested.

**Filed in passing.** IN-SL-001: native Browse/search results call `recordImpression` nowhere, so search CTR has no denominator — which the presets measurement plan depends on. IN-SL-002: the semantic path runs `defaultFor([])` as a no-op post-filter, so a "free" constraint cannot be expressed on it at all; `stream_type` never reaches the vector path's post-filter. IN-V3-003 (web "Refine by feeling" refiner) closed as retired — Joe's call; it is a fourth overlapping taxonomy, to be deleted in the presets session.

## [2026-09-08] ingest | First real search capture disproved the settle heuristic
Follow-up on the same PR. New page: `src/lib/search/settledQuery.ts` (+ tests). Updated: `wiki/concepts/architecture/signal-architecture.md`.

**The row landed, and it landed four times.** `search_logging` flipped on for the test account, OTA published to the `preview` channel from CI, one search on the device for "severance" — and production got `sev` (56), `severence` (0), `sever` (41), `severance` (13), ~2.8 s apart in one session.

**The reasoning that shipped was wrong, and only real data could show it.** The implementation skipped §5.3's prefix rule on the argument that it "falls out of the timer": every keystroke restarts the 1.5 s wait, so a prefix can only settle if the user stopped on it. People do not type that way. They type in bursts and read the results between them, and by elapsed time a mid-word pause is identical to a finished query.

**The damage was to a metric, not just to volume.** §6 makes zero-result rate the retrieval-bug tripwire — above ~10% is "a bug to chase". That one session reports 25%, entirely from a typo the user corrected two seconds later, and `search_terms_daily` would have counted `sev` and `sever` as terms somebody meant to search for. Left alone this would have sent the first month of analysis after a retrieval problem that does not exist.

**Fix: hold, don't write.** A settled query is buffered; the next settled query supersedes it when either is a prefix of the other. The bidirectional test is the part that earns its keep — the real capture backspaced (`severence` → `sever`), and a forward-only prefix check still emits three of the four rows. Terminal signals (submit, result tap, cleared box, leaving the screen) flush immediately; an 8 s idle catches a search abandoned in place, deliberately generous so a pause-then-resume cannot write the prefix. The four captured rows were deleted rather than left as the first data point.

## [2026-09-08] ingest | Two more captures: a typo the prefix rule missed, and two searches it lost
Same PR, third iteration on the same hook. Updated: `src/lib/search/settledQuery.ts`, `native/src/hooks/useSearchLogging.ts`, `wiki/concepts/architecture/signal-architecture.md`.

**The prefix rule worked the first time by luck.** Capture two was `severenc` (0 results) then `severance` (13). Those diverge at character six, so neither is a prefix of the other, and the reconciler judged the correction a brand-new search and wrote the abandoned typo — the exact failure the fix was for, 50% zero-result rate this time. Capture one had only collapsed because the user paused on the stem `sever` long enough for it to settle, giving the prefix chain no hole. Fix: keep the bidirectional prefix test, add edit distance ≤ 2 on queries of 4+ characters. The length floor keeps `cat`/`dog` apart; the trade accepted knowingly is that `the bear`/`the bees` would merge, which costs one data point instead of fabricating a zero.

**The same round lost two real searches.** "The Bear" and "Lord of The…" produced no rows at all. Both were held, and no following query, tap, clear or 8 s idle ever came before the app left. Buffering does not remove the failure mode, it swaps it: fabricated rows become lost rows. Holding is only safe if every way of leaving writes first, so app-background (`appState.subscribe`, the same subscriber the impression batcher uses for its buffer) and Browse losing focus (`useFocusEffect` — switching tabs never unmounts the screen) are now terminal signals alongside submit, tap, clear and unmount. A hard kill with no background event still drops the held query; that under-count is accepted as the safer of the two failures.

**Worth recording as method.** Three rounds, three defects, none of which any amount of reading would have found — each needed one person typing one title on one phone. The heuristic was wrong in a different way each time, and each time the evidence was a timestamp gap: ~2.8 s (settle timer racing a typist), 8.09 s (idle timer firing 90 ms before the superseding query settled), and silence.

## [2026-09-08] ingest | The search-logging gate moved into the emitter
Post-merge follow-up, before Session 2 starts. Updated: `src/lib/storage/interactions.ts`, `native/src/hooks/useSearchLogging.ts`, new `src/lib/storage/__tests__/emitSearchGate.test.ts`.

**Found by reading the next session's own plan.** Session 2 (§10) instructs the implementer to call `emitSearch(...)` directly from the quick-filter store on every chip change. The `search_logging` gate lived in the native hooks, so that call would have bypassed it and logged for every user — undoing the ships-dark position the policy text now depends on. The gate is a safety property, and a safety property each call site has to remember is not one, so it moved into `emitSearch`.

**Two deliberate consequences.** The three web call sites are now gated too, so the web app logs nothing unless a user's flag is on — the consent story should not have a hole just because a surface predates the flag (no deployment workflow exists for the web app, so this is likely moot in practice). And the attribution boost is gated with the write: recording the timestamp while writing no row would let the incremental path boost a search the nightly recompute cannot see, and the recompute, as source of truth, would take it back. Flag off now means the search is invisible to the whole system, consistently.

**The test is the point, and it was checked by breaking it.** This suite is otherwise pure-function only; `emitSearchGate.test.ts` uses `vi.mock` deliberately, because a gate is exactly what a later refactor removes without anything else failing. Deleting the gate line makes two of the five fail — verified, rather than assumed from a green run.

## [2026-09-08] ingest | Session 2: quick filters, and the documentary that was three different things
Session 2 of the quick-filters plan. New pages: `src/lib/content/documentary.ts`, `src/lib/content/quickFilter.ts` (+ tests), `native/src/state/quickFilter.ts`, `native/src/hooks/useQuickFilterLog.ts`, `native/src/hooks/useDocumentariesBackfill.ts`, `native/src/components/QuickFilterNotices.tsx`. Updated: `wiki/concepts/architecture/home-surface.md`, `wiki/concepts/architecture/for-you-surface.md`.

**The chip strip was decorative, and the bug underneath it was that "documentary" meant three incompatible things.** `contentAdapter` sets `type: 'doc'` for genre 99 on both media types — which also erases whether the title is a film or a series. `titleAdapter` sets `type: row.media_type` and never `'doc'`, even with 99 present. `useBrowseDiscover`'s "Docs" segment asked TMDb for genre-99 MOVIES only. So the same title was a `doc` arriving via search and a `movie` arriving via the engine, and a chip written against `item.type === 'doc'` would have scored zero on For You — which is entirely engine-sourced. §1.1 settles it as a genre predicate, and Browse's discover call gained the TV half it never had.

**`contentMediaType` is the half of the fix that is easy to miss.** "Movies and TV mean media type alone and INCLUDE documentaries" cannot be implemented against `item.type`, because `'doc'` has already overwritten it on the TMDb path — a documentary film and a documentary series are indistinguishable by that field. The `id` prefix (`movie-` / `tv-`) still carries it, so that is the source and `type` is the fallback. Without this, a documentary film would have failed the Movies chip.

**Tests were placed where they could actually run, which meant moving code.** There is no native test runner, and the root vitest suite covers `src/`, `scripts/` and `workers/` only — so the chip threshold, the thin-rail rule and the category predicate were all initially sitting in `native/` where nothing could reach them. The pure half moved to `src/lib/content/quickFilter.ts`; `native/src/state/quickFilter.ts` keeps only the `useSyncExternalStore` store and re-exports the rest, so no call site changed. The cases that earn their keep are the ones reading would not have caught: a documentary film surviving the *Movies* chip, a documentary counting toward BOTH its media type and Documentaries when deciding chip visibility, and one match short of 8 hiding the chip.

**Two things the plan said that turned out to be traps.** §10 names `native/src/lib/quickFilter.ts` as the home for the store — but `native/src/lib` is the junction to the shared tree, so that path would have put a native-only React store into the web and Worker bundles. It went to `native/src/state/` instead. And §10's `emitSearch` call from the store would have bypassed the `search_logging` gate; that was fixed ahead of this session by moving the gate into the emitter (PR #133), so the store's call is safe as written.

**§1.2's empty-state button needed Browse to read a route param**, which the session brief said not to touch. Joe's call: add the param read (six lines, seeding the initial filter value only), because "Browse all documentaries" landing on an unfiltered grid is the dead end the empty state exists to avoid.

**The measurement that decides the thresholds is in the event.** A chip change emits `mode: 'filter'` with `rails_visible` and `items_visible` captured as of the tap — deliberately excluding the Documentaries backfill, which lands a moment later, because the question §6 asks is "was filtering in place enough?". Whether 4 and 8 were the right numbers is answerable from those two fields alone.

**Not yet verified on a device.** Session 1's record here is three defects across four rounds of on-device testing, none of which reading found, so the same budget applies before this merges. Typecheck, lint (0 errors), 328 unit tests, `eval:eng1` and `eval:novelty` all pass — but every one of those is blind to the thing that matters, which is what the page looks like when a chip is tapped.

## [2026-09-09] ingest | The consent gap has a real subject
Updated: `wiki/registers/parking-lot.md` (IN-SL-003 escalated, IN-SL-004 filed), `wiki/concepts/product/privacy-and-gdpr.md`.

**Found by asking before flipping a flag.** The request was to turn `search_logging` on for "the other testers". Enumerating them first showed the population is not what that phrase implies: six of Joe's own accounts, six empty `@example.com` shells, the store-review account — and `macky_01@hotmail.com`, a real person who signed up on 21 Jun 2026, completed onboarding, picked 8 services and came back across four sessions to 23 Aug. Joe does not know who they are; most likely a TestFlight or Play closed-test tester.

**Why this matters more than one flag.** IN-SL-003 — §10 promises signed-in users 30 days' in-app notice before a material change, and nothing implements it — was deferred to H1 on the tacit assumption that the user base was Joe. It is not. There is now someone the promise is owed to, and no channel to reach them except knowing their email address.

**Why nothing is wrong today, which is worth stating precisely because it inverts easily.** That user's flag is off, so no search text is captured for them, so no material change has occurred *for them*. §10 falls due when the flag is turned on, not when the policy text changed. The per-user flip **is** the consent point — this is the ships-dark design working exactly as intended rather than failing.

**Amended later the same day — the provenance guess was wrong, and the flag went on anyway.** Checking the Play closed-test tester list ruled that cohort out, and the iOS build history (14 builds, oldest finished 29 Jun) ruled out iOS eight days over. No web deploy has ever existed. So "TestFlight or Play closed-test tester" was falsified; the account is simply **unidentified**, with the Play *internal* testing track and a directly shared APK still unchecked. The behavioural evidence points at a real person rather than a self-created test account: three active days spread over two months where every deliberate test account has one, an address and username matching neither test convention, and four deep-link click-outs to three services in the first session. Joe then decided to enable `search_logging` for them regardless — a public user judged extremely unlikely given the distribution channels, most plausibly a contact on a separate address. The §10 notice was **not** given, because there is no channel to give it. Recorded plainly rather than smoothed, with the condition that would reopen it: identification as a member of the public.

**Recorded as a standing position (IN-SL-004), not a task.** ON for Joe's six accounts (he is the data subject). OFF for the unidentified user pending IN-SL-003. OFF *permanently* for `reviewer@videxstreaming.com` — capturing an app reviewer's search text yields no product signal and belongs in nobody's database. The last one is written down specifically so a future "turn it on for everyone" pass does not sweep it up.

## [2026-09-09] ingest | Quick filters verified on device — and Movies, not Documentaries, is the thin case
Follow-up on the same PR (#134), after OTA to the iOS preview build. Updated: `wiki/concepts/architecture/home-surface.md`.

**It works, and the instrumentation proves it rather than the screenshot.** `card_impressions.metadata.filter` stamps correctly on cards and heroes for all three categories (Movies 80+2, TV 71+1, Documentaries 13+1), and five `mode: 'filter'` rows landed with their rail counts. The point of putting `rails_visible` / `items_visible` in the event was that a filter row otherwise says a chip was tapped and nothing about whether the result was worth looking at. First use of them, first surprise.

**§1.3's arithmetic was right in shape and wrong in direction.** It reasoned that "the Home payload is interleaved movie/TV roughly 1:1, so Movies or TV leaves about half of every rail, comfortably above the thin threshold" — and that Documentaries alone would need a backfill. The measured split: **All 14 rails / 206 items · TV 13 / 141 · Movies 7 / 62 · Documentaries 1 / 15**. TV barely loses a rail. Movies loses half of them. This payload is TV-heavy, so the thin case is *Movies*, which is the one category the plan assumed was safe.

One session is not "routinely thin" and `THIN_RAIL_MIN` has not been touched on the strength of it. But §1.3 explicitly said to "log rail-visibility on every filter application and revisit only if the data shows Movies/TV routinely thin" — this is that signal appearing on day one, pointing at a rail nobody expected. If it holds across users, the answer is probably a second backfill rather than a lower threshold: dropping the threshold to keep a two-item row is how you get a page of stubs.

**Documentaries came through at 1 rail / 15 items at tap time**, which is precisely the case the lazy backfill exists for — and the page never reached the empty state, so the extra rail arrived in time.

**The For You strip is still unverified.** Every filter event and every stamped impression carries `surface: 'new'`. Nothing exercised the chips on For You, so the longer-row slicing (36 rendered, 20/15 shown, up to 20 filtered), the mood-rooms hiding rule and the For You hero re-pick have device evidence of exactly none. Worth being precise about that rather than reading "it works" across both surfaces from a test that only touched one.

## [2026-09-09] ingest | For You verified too — and the thin category flips between surfaces
Same PR (#134). Updated: `wiki/concepts/architecture/for-you-surface.md`, `wiki/concepts/architecture/home-surface.md`.

**For You now has device evidence.** Filter events landed with `surface: 'forYou'`, and impressions stamped on cards and heroes for both categories tried (Movies 37+2, TV 9+1). The hero rows are the useful ones: a filtered hero impression can only exist if the re-pick fired, so `recommendedForYou[0]` is demonstrably being taken from the filtered row rather than the raw payload.

**The finding: the thin category is not a property of the app, it is a property of the surface and the user.** Yesterday's New numbers said Movies was thin (7 of 14 rails) and TV was fine (13). For You, same account, same minute, says the opposite:

| surface | All | Movies | TV |
|---|---|---|---|
| New | 14 rails / 206 | **7 / 62** | 13 / 141 |
| For You | 6 rails / 69 | 5 / 55 | **2 / 10** |

Which is coherent rather than contradictory. New is built from recency and per-service charts — a TV-heavy pool. For You is built from a taste vector that happens to be film-leaning. So each surface goes thin on whatever the *other* one is made of.

**This undercuts §1.3's framing, not its decision.** §1.3 reasoned that only Documentaries would need help and authorised one backfill for it. The measurement says any category can be the thin one, depending on whose feed it is — so "which category needs a backfill" has no fixed answer, and a second hardcoded backfill would just be guessing at a different constant. If this holds across more users, the shape worth considering is a backfill triggered by the measured `rails_visible`, not by the category name. Not built; recorded so the next session has the number rather than the assumption.

**Two thresholds are now doing visible work.** TV on For You survives at 10 items across 2 rails — just above the `CHIP_MIN_MATCHES = 8` bar, so the chip renders. A slightly more film-leaning profile would drop it below 8 and the TV chip would correctly not appear at all, which is §1.5 behaving exactly as designed. No Documentaries events were recorded on For You; the likeliest reason is that the chip was never rendered, for the same reason.

## [2026-09-09] ingest | Android carried no update channel, so it received no OTA at all

**Confirmed, then fixed.** Issue #137 suspected that the Gradle-built AAB had no EAS Update channel baked in. It does not. The 2.2.0 AAB's manifest carries six `expo.modules.updates` keys and not `UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY`, which is the one holding `expo-channel-name`; `expo-updates` reads the absent key as `{}`. Probing `u.expo.dev` exactly as that binary does returns `400 Bad Request` with `"channel-name": Required`, so the app never got as far as a fingerprint comparison. Every JS-only publish since Android reached Play was iOS-only, silently.

**Two failures, not one.** The channel is the delivery bug. The CI error that surfaced it is separate: a Gradle-built AAB never appears in `eas build:list`, so the OTA workflow's reachability check had nothing to compare against and failed every Android publish on "no build found" — an error that read like a fingerprint mismatch but only ever meant "unverifiable".

**A third fact worth keeping.** The shipped AAB's baked fingerprint is `c4eaa115…` and the production channel serves nothing for it, while today's Android publish sits at `e9f62ccc…` and is served. So the channel fix alone would have changed nothing for the installed build. A new AAB was always required. Why the Android fingerprint drifted between the 27 August build and now is not established; nothing fingerprint-relevant was committed in between and the build-time computation correctly ignored the generated `android/` tree, which leaves dependency resolution under `npm install` with the known-stale native lockfile as the open candidate.

- New page: wiki/concepts/operations/ota-updates.md
- Fix: native/plugins/withUpdatesChannel.js writes the channel at prebuild; expo-updates' own plugin is registered later by prebuild-config and so runs first, including the branch that deletes that key, which is why writing it from app.json's plugin list wins
- Guards: android-release.yml now asserts the channel is in the AAB and publishes its baked fingerprint as an artifact; ota-update.yml compares Android against that artifact instead of `eas build:list`

## [2026-09-09] ingest | Presets, one-intent Browse, and the first real semantic eval
PR #139 (branch `feat/native-presets-and-routing`), Session 3 of the quick-filters/presets recommendation. Updated: `wiki/concepts/operations/phase-search-v2.md`, `wiki/registers/parking-lot.md` (IN-SL-002 closed, IN-V3-003 code removal recorded). New: `wiki/concepts/evaluations/semantic-search-quality.md`.

**Browse stopped being three modes.** The screen held typed search, semantic mood and filter-only discover as mutually exclusive states, each clearing the others. That is why the brief's motivating sentence was inexpressible — not because any axis was missing, but because a mood tap called `setFilters(DEFAULT_FILTERS)`. One `intent` object now, and nothing clears anything else.

**The eval fixture was run for the first time, and it found two things the code could not tell us.**

The first is a rig defect. `search-semantic-eval.ts` scored the raw `match_titles_by_vector` output, with none of the quality floor the app applies afterwards. So it was grading rows no user can ever see — "something easy and warm I can half-watch" was being scored against *Snug And Cozi* and *Home Made Easy*, both zero votes. Applying the app's own floor before scoring took the known-title half from 7/8 to 8/8 on its own.

The second is a product finding, and it is the one worth carrying forward. The long preset **phrases** retrieve the right register: `slow` returns *Small Things Like These*, *The Quiet Girl*, *I'm Thinking of Ending Things*; `late` returns *The Haunting of Hill House* and *Marrowbone*. The short **sentences** a person would actually type do not — they match surface words:

| Typed sentence | What came back |
|---|---|
| "something fast and fun where I don't have to think" | the *Fast & Furious* franchise |
| "something easy and warm I can half-watch" | *Hot Frosty*, *Melting Me Softly*, *Country Comfort* |
| "something long and absorbing I can sink into" | *The Abyss*, *Deep*, *Deep Sea*, *Deeply* |
| "something we can all watch together" | *As We See It*, *Here We Go* |

"fast", "warm", "deep"/"sink", "we". Every one is a word match.

**What that means for the flag.** The free-text route shipped as specified and it is safe — `search_semantic` is per-user and default-off, the banner says *"Reading that as a feeling, not a title"* rather than pretending, and *"Search titles instead"* is one tap away. But flipping the flag turns on both paths at once, and this measurement says the preset path is ready and the free-text path is not. It is also the first hard evidence for the query-understanding step in §8.2: the gap that step closes is exactly the distance between those two tables.

**A corollary nobody had to argue for.** *Free to watch* was given `phrase: null` on design grounds — cost is a fact, not a feeling. Its sentence duly scored nothing and could not have scored anything. The card contributes a filter instead, and migration 080 (`subscription_included_titles`) is what makes that filter real on the semantic path, closing IN-SL-002.

**Also closed here:** the last surviving copy of the §0.2 documentary bug, in `semanticRetrieval`'s post-filter — it restricted Docs to the movie table and subtracted genre-99 titles from Movies, the opposite of `documentary.ts` on both counts, so a documentary series was unreachable from either segment on the semantic path. Session 2 fixed the other two paths; this was the third.

**Device testing then found two more, both in the controls above a described result.** Joe exercised the OTA on 2026-09-09; the deep link from the title-hit card works. The instrumentation caught what the screen did not.

The **category pills rendered on the described route**. They filter Mode A's list, and a described grid comes from the engine, which never sees `category` — so tapping Movies changed nothing visible while quietly re-running Mode A and writing a log row. Three rows landed for one query ("epic fantasy"), one per pill tapped, same session, seven seconds apart. A control that looks like it works and does not is worse than no control; media type on that route is `filters.contentType`, which *is* applied server-side.

**`result_count` described the wrong list.** Those three rows all read 0 while a full semantic grid was on screen, because Mode A finds no title called "epic fantasy" — which is exactly why the query routed to the engine. Left alone, every described query would have been recorded as a failed search, and the zero-result rate §8.2 makes a first-class metric would have been measuring the opposite of what it claims. The logger now takes the rendered list.

The pattern is worth naming, because it is the third session in a row to hit it: **the defects that survive CI are the ones where a control is attached to the wrong data source.** Session 1 and Session 2 each found three this way; neither type checking nor tests can see them, because every individual piece is correct. Querying `user_interactions` after the fact is what makes them visible — the screen looked fine.


## [2026-09-09] ingest | The store forms said we do not collect search history. We do.
Updated: `docs/legal/store-privacy-disclosures.md`, `docs/legal/launch-compliance-checklist.md`, `wiki/concepts/product/privacy-and-gdpr.md`.

**The answer sheet asserted the opposite of the truth.** Apple's "explicitly NOT collected" list carried *Search History*, justified as *"app-internal genre/taste selection is Product Interaction, not web/app search history"*. That reasoning was correct when written — the app collected genre picks, not typed text. It stopped being correct on 2026-09-08, when search-term logging shipped and began storing the words users type.

**Found by looking at the release rather than the code.** v2.3.0 merged on 2026-09-09 and is the first *native* binary carrying search logging — iOS had it by OTA, Android had never had it at all. Its iOS build reached TestFlight before anyone checked the disclosures. Nothing in CI could have caught this: the code was correct, the in-app policy was correct, and the only wrong artefact was a markdown file describing two web forms.

**What the forms now need:** Play *App activity → In-app search history*; Apple *Search History*. Both Linked to You, neither used for tracking.

**Purpose is Analytics + Personalisation, deliberately not App Functionality.** Search works with logging off — the flag defaults to off and most accounts have never had it on. The rows exist to measure the funnel and to feed the search-attribution boost. Claiming App Functionality would have overstated the need, which is the easy mistake in the other direction.

The sheet also now records the follow-up answers both forms ask for and that are easy to get wrong under time pressure: the text is linked to `user_id`, it is nulled after 30 days but the row survives, there is **no** in-app opt-out (so Play's "users can choose" does not apply), export and erasure both cover it, and the text reaches TMDb and OpenAI without a user identifier — collected, not shared.

**The generalisable bit.** A policy change and a store-form change are two obligations with two owners, and satisfying the first is exactly what makes the second overdue. The sheet's own "re-submit triggers" note listed push notifications and crash reporting. Search logging was a third trigger that nobody had written down, so nothing pointed at it when it shipped. The note now names it, and the compliance checklist carries it as an open item.

**Not re-submitted.** Both forms are due with v2.3.1, after Session 4.


## [2026-09-09] ingest | Five chips replaced two rows, and Browse started counting what it shows
Updated: `wiki/concepts/operations/phase-search-v2.md`, `wiki/registers/parking-lot.md` (IN-SL-001 closed).

**Session 4 of the quick-filters recommendation, and the last of the four.** `RefineRow` is five one-tap chips over five existing `BrowseFilters` fields — *Just films*, *Newer*, *Under 2h*, *Free to watch*, *Higher rated* — with the count line, *More filters* and *Sort* folded into the same block. It replaces both the category pill row and the separate Filters/Sort row, so a screen that carried two rows of controls above the grid now carries one.

**The pills were removed rather than moved, on their own merits.** Session 3's device testing caught them rendering on the described route, where the grid comes from the engine and `category` is never sent: tapping *Movies* changed nothing on screen while quietly re-running Mode A and writing a log row. `useSearch` lost its `SearchCategory` parameter with them, and with it the last copy of the §0.2 documentary bug's mechanism — post-filtering on `item.type`, which the TMDb adapters overwrite with `'doc'`, so a *Docs* segment hid every documentary series while *TV* hid documentary films.

**The substantive difference is that a chip refetches.** Both `useBrowseDiscover` and `useSemanticSearch` key their queries on every filter axis, so writing one field re-runs the query rather than thinning the ~40 hits already on screen. The pills could only ever subtract. The row is hidden on a confident title hit, where there is nothing to refine about a title the user has already named.

**Zero results now name what to undo.** "Try loosening the filters" does not say which of five taps emptied the grid, so the only recovery was to clear everything. Each chip declares its part of speech — "Nothing free films" reads as a bug — and a noun chip switches the opener: *"No recent films under two hours"*, *"Nothing free under two hours — try removing Under 2h."*

**IN-SL-001 closed: Browse had never recorded a single impression.** Every result set went through `PosterGridCard`, which did not call `recordImpression`. A `search` row gave `result_count` and a later `detail_view` gave the click, but nothing said *which* results were seen — so search CTR, the headline number of the measurement plan, had no denominator and could not be computed at all. The grid and the title-hit card now record on `'search'` or `'browse'`, stamped with the route and the active chips.

**Two logging changes fell out of the removal.** The typed-search log deduped on `(query, category)`; rather than drop the field, `route` took the slot, because it answers the same question — is this a second search over the same text? — and genuinely varies, since *"Search titles instead"* re-answers one query two ways with two result counts. And the filter-intent log stopped being gated on `!semanticMode`: that gate existed so a preset tap could not log twice, but the tap handler already sets exactly one intent, and the gate meant a FilterSheet apply on the semantic path wrote nothing at all. Every refine toggle would have inherited the same silence.

**One thing deliberately not logged.** Removing the last chip with no text and no preset lands on the empty state, and an empty state is not a search. Logging it would enter a zero-result row for a user who had just cleared their filters — which reads in the measurement plan as exactly the retrieval failure the zero-result rate exists to catch. The FilterSheet already applied that rule; the chips now do too.


## [2026-09-09] ingest | Device testing the refine row found the pool, not the row
Updated: `wiki/concepts/evaluations/semantic-search-quality.md` (Finding 3), `wiki/registers/parking-lot.md` (IN-SL-005 filed).

**The instrumentation worked on the first try, which is itself the news.** `card_impressions` had never held a single Browse row in its history — 8,134 `home` and 1,154 `for_you` and nothing else. One device session produced `search` rows on both the title and described routes and `browse` rows on the preset and filter routes, positioned 0–11, stamped with the route and the active chips. Search CTR has a denominator for the first time.

**The route-as-identity change is visible in the log and behaves as designed.** Joe typed one sentence and it wrote two rows: `route: described` with 29 results, then `route: lookup` with 0 after tapping *Search titles instead*. Under the old `(query, category)` dedupe those would have collapsed into one row, losing the fact that the user rejected the described answer — which is the single most interesting thing a described search can tell us.

**What device testing did NOT cover.** No refine chip was tapped. The one `mode: 'filter'` row from the session carries `runtime: 'over_120'`, which is not a chip value, so it came from the FilterSheet. The chips remain unverified on a device; the row rendered, and that is all that is established.

**Two observations that turned out to be one number.** The described route returned 2019 and 2023 titles for *"something recent that isn't rubbish"*, and the *New & actually good* preset returned exactly 2 titles. Neither is a bug in the refine row and both have the same cause.

The typed sentence is embedded, not parsed: "recent" and "rubbish" are matched as *words*, never as a release-date floor or a rating floor. That is Finding 2 restated, and the refine chips are the manual bridge until the §8.2 query-understanding step exists.

The preset is arithmetically doomed. `match_titles_by_vector` takes no filter arguments, so `semanticRetrieval` fetches 150 nearest neighbours and post-filters. Only 1.82% of the 34,563 embedded titles were released in the last 12 months, and 0.42% are both recent and rated 7+. Measured against a real probe vector, of 150 candidates *Just films* leaves 123, *Under 2h* 91, *Higher rated* 32 — and *Newer* leaves **7**, with *Newer* + *Higher rated* leaving **2**. The logged `result_count` for that preset tap is 2. The measurement predicts the screen exactly.

**Deepening the pool is not available.** Migration 076 caps the RPC at 1,000 and its error text says why: past the HNSW `ef_search` ceiling the index returns roughly a thousand rows *while reporting success*, so a deeper query silently lies. At the cap *Newer* reaches 34 and the preset 10 — five times better, still thin, and paid for with 1,000 rows of metadata per chip tap on a phone.

**Nothing was changed on the strength of it.** `candidateLimit` stays at 150: raising a retrieval parameter on one probe vector and no eval run is exactly what the fixture rig exists to prevent. *Newer* stays on the row, because unlike the `cost` chip withheld from the Mode A grid it is not inert — it does what it says over a genuinely thin slice, and the zero-result copy names it as the thing to remove. A true but disappointing answer with a labelled exit is a different object from a control that does nothing.

**The generalisable bit.** Three sessions in a row found controls attached to the wrong data source. This one found a control attached to the *right* source with the wrong cardinality behind it — which type checking, tests and a working UI all pass cleanly, and which only arithmetic over the live catalogue exposes. The question "does this control reach its data?" now has a sibling: "and is there enough of it once it gets there?"


## [2026-09-09] ingest | The refine chips work; the preset asks for the wrong neighbourhood
Updated: `wiki/concepts/evaluations/semantic-search-quality.md` (Finding 3 rewritten), `wiki/registers/parking-lot.md` (IN-SL-005 corrected).

**Correcting the previous entry before anything else.** It reported *Newer* leaving 7 of 150 candidates, measured with `release_date >= current_date - 365 days`. The code does not do that — `buildPostFilter` compares `release_year >= currentYear - 1`, a year floor. Re-measured with the right predicate: **21 of 150**, and Newer + Higher rated leaves 6 rather than 2. The catalogue slice is 4.9% and 1.05%, not 1.82% and 0.42%. The finding's direction survives; its magnitude was overstated by roughly a factor of three.

**The chips are verified on a device, and the count line is a bad witness.** Tapping *Under 2h* on a described "epic fantasy" grid logged `refine: runtime, on: true` and refetched — but `result_count` stayed 56 both sides, so on the screen nothing appeared to happen. The impressions show it plainly: *Bāhubali: The Epic* (224 min) and *The Green Knight* (130 min) left the grid and everything below them closed up. The count did not move because the engine truncates to `resultLimit: 60` from a 150-candidate pool, so removing twenty long films still leaves enough to fill the cap. The control works; the number chosen to prove it works cannot, whenever the pool exceeds the cap. Claiming the count line as the refetch indicator was wrong.

**The preset's real problem is not selectivity, it is the query.** *New & actually good* returns 2 titles where 363 in the catalogue meet its criteria. Its phrase — *"a recent, well-reviewed film or series … that both critics and audiences rated highly"* — is a statement **about** a title, not a description **of** one, so nearest-neighbour retrieval lands on titles whose overviews use that vocabulary. It returned **Mr. Scorsese**, a documentary series about a director and his critical reception. The query asked for well-reviewed things and got a programme about reviewing.

The rule needed here already exists in the codebase. *Free to watch* carries `phrase: null` because cost is a fact, not a feeling. "New and actually good" is also a fact — two metadata predicates and nothing else — so the card should carry no phrase and resolve down `/discover`, where recency and rating are applied server-side across the whole catalogue rather than across 150 embedding neighbours. Not changed here: it is a Session 3 artefact and the change belongs beside an eval run.

**A third cause, and a new one.** *Mousetrap* (2026) and *Mayday* (2026), both visible on the New tab, have **no row in `titles` at all** — the only Mayday rows are unrelated series from 2003 and 2013. New reads TMDb `/discover` live; vector search can only return what has been ingested and embedded. So part of "why isn't this recent thing here" is not ranking, retrieval or filtering, but ingest. Scope unestablished; wants its own pass.

**What "Newer" means, since three paths spell it differently.** Semantic and client-side use `release_year >= currentYear - 1`; `/discover` uses an exact `today - 365 days`. In September 2026 the first admits 2025 and 2026 — up to about 21 months. The looseness is deliberate and documented: `ContentItem` carries a year, not a date, and tightening it would empty the grid every January. Worth knowing that a chip labelled *Newer* can honestly return something 20 months old.

**The generalisable bit, updated.** The previous entry said the sibling question to "does this control reach its data?" is "and is there enough of it once it gets there?". There is a third: **"is it asking for the right thing?"** Cardinality was the visible symptom and the query was the cause, and only reading the two returned titles by name — rather than counting them — showed which.


## [2026-09-09] ingest | The card asked for well-reviewed things and got a programme about reviewing
Updated: `wiki/concepts/evaluations/semantic-search-quality.md` (Finding 3 outcome), `wiki/registers/parking-lot.md` (IN-SL-005 cause 1 closed).

**Joe asked for it done properly with an eval run, so here is the run.** `new-good` now carries `phrase: null`, joining `free` as a **fact card**. A tap composes filters only and resolves down `/discover`, where recency and rating are applied server-side across the whole catalogue rather than across 150 embedding neighbours.

**The evidence that settled it was five titles, not a metric.** The retired phrase — *"a recent, well-reviewed film or series from the last year that both critics and audiences rated highly"* — scored p@10 0.00, but so does every diagnostic entry in the fixture, so the number alone said nothing new. Reading the top five did:

| rank | title | why it matched |
|---:|---|---|
| 1 | **Voir** (2021) | a series in which *"film lovers examine the cinematic moments that thrilled"* them |
| 2 | The Favourite (2018) | the word *favourite* |
| 3 | The Great (2020) | the word *great* |
| 4 | Blockbuster (2022) | the word *blockbuster* |
| 5 | Nightcrawler (2014) | crime **journalism** |

Not one is recent. Not one was chosen for being well-reviewed. A statement **about** a title is not a description **of** one, and no synopsis reads like a review blurb — so the nearest neighbours were programmes about acclaim and titles named with praise words.

**The outcome, measured against Joe's real seven-service stack.**

| path | qualifying | on screen |
|---|---:|---:|
| semantic (phrase + post-filter) | — | **2** |
| `/discover` (filter-only) | 99 films + 106 series = **205** | **40** |

The first card in the new grid is *Mayday* (2026, 8.0) — one of the two titles Joe named from the New tab as obviously missing. Script kept at `scripts/test/newgood-path-compare.mjs`.

**Gated eval metrics are identical either side** — p@10 1.000, MRR 0.900, against thresholds 0.9 and 0.75. That is the expected and correct result: nothing about retrieval moved, one card simply stopped calling it. An eval that had *changed* here would have meant the change did something it was not supposed to.

**The fixture keeps the evidence rather than the phrase.** The entry now queries the card's sentence, matching how `free` is held, and its `_note` preserves the retired phrase's measurement verbatim so a future session that re-adds a phrase has to justify it against that number. The sentence scores 0.00 as well, which is the point: neither text has a semantic answer, because the card is not a feeling. The test that guarded this became a rule about **fact cards** rather than a hardcoded exception for `free`, plus a new assertion that a phrase-less card must carry a non-empty filter patch — otherwise it is a no-op button.

**Two of the three causes are still open**, and this fix does not touch them: filter-after-retrieval still thins *Newer* on the described route and still needs a filtered RPC variant, and *Mousetrap* (2026) still has no `titles` row at all. What changed is that the card no longer depends on either.

**The generalisable bit.** Three entries ago the lesson was "does this control reach its data?", then "is there enough of it?", then "is it asking for the right thing?". This one adds the method rather than the question: **the metric was 0.00 before and after and told us nothing; the five titles told us everything.** A score compresses an answer to a number, and the number is the same whether retrieval is slightly wrong or asking a category error. Read the rows.


## [2026-09-09] ingest | A chip is not a wish: the refine row was re-arming the taste boost

- Updated: wiki/concepts/architecture/signal-architecture.md (the `refine` exclusion, the local-and-expiring flag read, the full metadata table, migration 081)
- Updated: wiki/concepts/operations/phase-search-v2.md (new addendum — what the review sent back)
- Updated: wiki/registers/parking-lot.md (IN-SL-006, IN-SL-007, IN-SL-008 closed; IN-SL-009 filed for follow-up B)
- Source: docs/plans/2026-09-09-001-review-quick-filters-search-presets.md, findings 1–5 and 8 plus the nits

Follow-up A of the review of PRs #131–#142. Six should-fix findings and nine
nits, all on Browse and in the logging path. Three of the six were the same
defect, and it is the one worth remembering.

**A later session wrote metadata that an earlier session's rule read as
intent.** Session 1 wrote `isContentIntentSearch`: a `search` row with
`mode: 'filter'` earns the 60-second 1.3× taste boost only if it carries a
`mood_key`, because a mood preset tapped with the semantic flag off is a real
statement of what the user wants while a bare filter apply is a re-slice of
the page already on screen. Session 4, three PRs later, wrote a refine row
that stamped `mood_key: intent.moodKey` on every chip toggle — a reasonable
thing to log, and it satisfied Session 1's rule exactly. So every chip tapped
while a preset was lit re-armed the boost, and because typing no longer clears
the preset, a chip on a typed grid boosted off a stale one.

Nothing failed. No test broke, no row looked wrong, and the two definitions
sat in files neither session had reason to open together. The only thing that
found it was somebody reading both.

Fixed at both ends deliberately. The call site now builds its row through
`refineLogMetadata` — a function rather than an object literal, because what
makes the row safe is the fields it does *not* have and absence is not
something a call site can be trusted to keep getting right. The predicate also
excludes any `filter` row carrying a `refine` key outright: the batch
recompute still has to judge the rows already written to production, and a
rule that holds only while every caller remembers is not a rule.

The same row carried the typed text, which the migration 079 rollup counted a
second time under `mode='filter'`. It is null now.

**The other finding with teeth was the flag read.** `getFlag` called
`supabase.auth.getUser()` — a network request — *before* consulting its own
memo, so the "a flag-off user costs no network at all" promise written in the
hook's own header was false by one auth round trip per settled query. And the
memo never expired, so a flag turned **off** mid-session, which is the only
mechanism we have for withdrawing consent (IN-SL-003), kept logging until the
app restarted. `getSession()` reads storage; the memo now expires in ten
minutes. The hook also recorded a query in its once-per-search dedupe set
before the gate ran, so a query settled while the flag was off could never be
logged again for that mount — turning consent ON reached the next app launch
rather than the next search.

**Three Browse fixes that are all the same shape: a control acting where it
cannot be seen.** Filters thinned "other matches" on the title-hit route while
the refine row and *More filters* were both hidden by that layout. The
zero-result copy named *Free to watch* as the chip to remove on the one grid
that ignores `cost`. And it named a chip at all before checking whether Mode A
had returned anything, so gibberish plus a lit chip read "try removing Newer"
— one tap further from an answer. The category pills were deleted for exactly
this; it came back three times in the layouts around them.

**One deletion.** `selectPresets` carried a "not the same as last week" guard
that could not fire — the rotation already differs week to week whenever there
is more than one candidate, and when there is one there is nowhere to go. The
tests that appeared to cover it passed on the rotation alone. Gone, with the
property asserted directly.

Migration 081 applied live and verified: job 24 unchanged in name and
schedule, cutoff now `(now() AT TIME ZONE 'UTC')::date`, `ON CONFLICT` adding
rather than overwriting.


## [2026-09-09] ingest | "Hail Mary" found nothing; "Project Hail" found the film

- Updated: wiki/concepts/operations/phase-search-v2.md (whole-word title matching)
- Updated: wiki/registers/parking-lot.md (IN-SL-011 closed; IN-SL-010 filed; IN-SL-005 gains a third named example)
- Source: device testing of the review follow-up, 2026-09-09 evening

Two findings from twenty minutes on a handset, and the smaller one is the
better story.

**A user typed two of a title's three words and got nothing.** "Hail Mary"
returned an empty grid; deleting it and typing "Project Hail" returned
*Project Hail Mary* immediately. Both are substrings of the same title, and
`titleMatchScore` scaled every partial match by how many CHARACTERS of the
title the query accounted for, giving a match that starts the title far more
credit than one inside it. "hail mary" is nine of seventeen characters and
does not start it: 0.32 against a floor of 0.5 — **less than "sever" scores
against "Severance"**, which is the case the floor exists to reject.

The floor was not wrong. The measurement under it was. Characters cannot
tell "named two of the three words" apart from "matched an arbitrary run of
letters", and those deserve opposite answers. The scorer now recognises a
contiguous run of whole title words and scores it like a prefix — because a
prefix IS such a run, the one starting at word 0, and where the words sit
says nothing about how well the title was remembered. Coverage takes the
larger of the character share and the word share, so no existing score can
fall: "project hail" stays at exactly 0.60. "sever" stays at 0.47, because a
partial word names nothing however it is measured.

A partial name still cannot clear the confidence bar on the match alone, so
prominence has to supply the rest — about 256 votes. That is deliberate: it
is what stops an obscure title that merely contains the words from opening a
card.

Two things compounded the original failure and neither is fixed by this. The
film has no `titles` row at all, so the Postgres substring path — which
would have matched it exactly as the user typed it — returned nothing. That
is the same ingest gap as *Mousetrap* and *Mayday*, now with a third named
example and a user actively looking for it. And once the query routed to the
described layout, the genres carried in from a Comfort tap plus the recency
and rating floor from *New & actually good* emptied the semantic grid too.

**The other finding is bigger and has no fix yet.** Trying to reproduce review
finding 5 — the banner naming the last card tapped rather than the card
whose phrase is running — showed that the state it describes cannot be
produced by tapping. The four preset cards render only in the pre-search
state, and every card sets a phrase or a filter, so the first tap makes the
other three disappear. Getting back to them means *Clear all*, which resets
exactly what the second tap was supposed to build on.

So the two-tap composition the recommendation is built on — its motivating
sentence is described as two taps throughout — is not reachable in the
shipped UI, and has not been since the presets landed. Composition itself
works: the five refine chips cover cost, recency, runtime, media type and
rating, which is most of what the constraint cards carry, and card-plus-chips
is what real usage does. What is missing is the path the plan describes.
Filed as IN-SL-010 for a product decision rather than patched, because the
answer is a layout question, not a bug.

Worth noting how both were found. The first came from a user forgetting a
title, which no fixture contains. The second came from trying to reproduce a
finding a code review had made with confidence — the reviewer read the state
machine correctly and never asked whether the UI could reach that state.

## [2026-09-09] ingest | The reserve was treated as seen, and the diversity bill came due
Updated: `wiki/concepts/architecture/for-you-surface.md` (the reserve is not something the user has seen), `wiki/concepts/operations/phase-search-v2.md` (`released` moved inside the vector scan), `wiki/registers/parking-lot.md` (IN-SL-005 cause 2).

**One sentence caused two bugs: "render the rows longer so a filter has something to draw on."**

The first is a definition problem. Cross-row dedup exists so one screen never shows a title twice, and `usedIds` was the set of everything already placed. Lengthening both long rows to 36 quietly redefined "already placed" to include a reserve nobody sees, and that set was handed to Outside Your Usual and to New to rent or buy. Up to ~37 unseen titles were excluded from two rows that render unfiltered — so the change that was allowed to alter only the filtered view altered the unfiltered one. `usedIds` now splits: the full 36 still dedups the two long rows against each other, because a filter can pull any of them into view; everything built afterwards is given the visible head only, 20 + 15.

**The trade is explicit rather than avoided.** A title can now sit in the reserve tail AND in Outside Your Usual. It is never visible twice unfiltered, and a duplicate under a filter is a smaller fault than silently thinning two rows that are always on screen. The test fails in both directions — one case for the tail staying eligible, one for the visible head staying excluded — because a dedup rule that only gets tested in one direction is how this happened in the first place.

**The second is a claim that was never measured.** The PR said the cost of the longer render was "bytes, not compute", and costed the bytes carefully: 295 B mean per `ContentItem`, ~10.6 KB more payload. Nobody costed the compute. MMR is quadratic in `k` over 1536-d vectors, and `buildRowFromPool` passed `limit` straight to `k`, so `k` went 20 → 36 on one row and 15 → 36 on the other.

| k | 15 | 20 | 36 |
|---|---:|---:|---:|
| p50 | 31 ms | 54 ms | 170 ms |

The three MMR passes in a cold render went from ~93 ms to ~318 ms. `MMR_MAX_K = 20` brings it back to ~108 ms.

**The measurement is a benchmark because production has nothing to read.** The review asked for a week of `renderMs` either side of the change. `ForYouPayload.renderMs` exists, and it is returned in the payload and logged by the web client's browser console — the Worker never writes it to a log line. So Workers Logs and the dashboard hold no history of it, and no amount of dashboard access would have produced the comparison. What answers the question instead is `scripts/evaluation/mmr-cost-bench.ts` over the real shape: 800 post-filter candidates, the top 200 holding embeddings, λ 0.7. Deterministic arithmetic beats absent telemetry, and the honest version of "we could not measure it in production" is to say so and measure it somewhere the number means something.

**The cap costs nothing visible, and that is a property rather than luck.** Greedy MMR is prefix-stable: each pick depends only on what was already selected, so its first 20 are the same whether it was asked for 20 or 36. Only the reserve changes character — score order with `applyGenreSpread` applied instead of MMR order — which is what a filter that keeps a handful of the tail actually needs.

**Separately, *Newer* stopped being applied to a pool chosen without it.** The device-testing entry above measured one probe vector: of 150 candidates, *Newer* left 7. Across the eval fixture's sixteen queries the mean is **7.4**, and all sixteen come back under 20. The chip emptied the grid rather than narrowing it, and the cause was never the catalogue — 363 titles qualify — but the order of operations.

Migration 082 gives `match_titles_by_vector` a `min_release_year` argument applied inside the candidates CTE. The two-argument form is dropped rather than left beside the new one, because two overloads both accepting `(vector, integer)` make every existing two-argument call ambiguous.

**It is not the same lever as `candidateLimit`, which was costed and rejected here three entries ago.** That objection was a thousand rows of metadata per chip tap on a phone. `match_limit` stays at 150, so the client still fetches at most 150 rows; only the internal graph traversal widens to the `ef_search` ceiling.

**I predicted it would not close the gap, and I was wrong.** The reasoning was sound and the conclusion was not: pgvector applies a `WHERE` clause after the HNSW traversal unless `hnsw.iterative_scan` is on, it is not set anywhere here, and a predicate keeping ~5% of the catalogue needs roughly 3,000 candidates to fill 150 rows against an `ef_search` ceiling of 1,000. So the migration comment was written to say the funnel was wider and still open. Applied and measured, it returns **150.0 of 150 on all sixteen queries**, for +25 ms at p50.

**The plan explains it, and nothing else would have.** Only 1,690 of 34,563 embedded titles clear the floor — 4.89% — and at that selectivity Postgres judges a sequential scan cheaper than the index:

```
Seq Scan on titles  (rows=1690, Rows Removed by Filter: 32881)
  -> Sort  (quicksort, 250kB)                    67 ms
```

No index scan at all, so every qualifying row is distance-computed and the answer is brute-force exact. The caveat is still true — it just attaches to the *other* branch. At a 2010 floor (51% of the catalogue) the planner keeps the index and post-filters, and there a selective predicate would return short. Which means `v_ef := c_max_ef` is doing nothing on the path *Newer* actually takes, and is the right setting for the path it does not.

**Exactness here is a property of catalogue size, not a contract.** The sequential path is O(embedded rows). An order of magnitude more titles and it stops being the cheap plan, the planner returns to the index, and recall degrades to the behaviour predicted above. `iterative_scan = 'relaxed_order'` is the fix at that point, with its own latency profile and its own measurement. All of this is now in the migration comment, replacing the confident wrong version.

**The post-filter stays behind the push-down on purpose.** It is a no-op when the RPC honoured the floor. It is the only thing enforcing the floor when the RPC call falls back to the two-argument form — which it does on any database predating 082, because PostgREST resolves an RPC by argument NAMES, so a Worker deployed ahead of its migration would otherwise return an empty grid for every semantic search with a chip lit.

**The documentary predicate finally reaches every surface.** §1.1 settled what a documentary is a fortnight ago and the native surfaces adopted it; five web branches still read `item.type === 'doc'`, which only the TMDb adapters ever write and which they write for genre 99 on BOTH media types. So each one was wrong in both directions at once: Movies dropped documentary films, Docs found nothing that arrived from the engine, and `buildTasteMeta` collapsed 'doc' to 'movie' — routing every documentary SERIES to the film detail page and logging a movie interaction against a series id.

The worst two were not in the review's list at all. Both the web Browse *Docs* segment and Home's *Docs* category fetched movies only and constrained neither call to genre 99 — so each returned every film on the user's services, and no documentary series could appear on either. The review asked for a grep and a list; reading what the grep returned, rather than only the three lines it cited, is what found them. `useContentService.ts` carries the same branch and has no callers, so it was left for whoever deletes the hook.

**The generalisable bit, twice over.** Two entries back the lesson was to read the rows rather than the score. This one is the same instinct pointed at two different documents.

**A PR that names the cost it measured has told you which cost it did not.** "Bytes, not compute" was a true sentence, carefully evidenced, and a complete answer to the wrong half of the question.

**And a caveat is a prediction, so it has to be measured like one.** The HNSW post-filter caveat was written into the migration before the migration ran, from correct facts about pgvector, and it described the wrong branch of the planner. It survived only because the after-measurement came back at 150 of 150 — a number good enough to be suspicious of, which is the only reason `EXPLAIN` got run at all. A result that beats the prediction is evidence the prediction was wrong, not evidence of a win.

## [2026-09-09] query | "the two-card compose is unreachable" — what are the options?

- Updated: docs/plans/2026-09-08-002 §2.3 (correction + decision), §9.2 (settled), §6 (reopening metric)
- Updated: wiki/registers/parking-lot.md (IN-SL-010 discharged by decision)
- Decision: Joe, 2026-09-09

The finding was that the four preset cards vanish after the first tap, so the
two-tap composition the recommendation is built on cannot be performed. The
question was what to do about the layout. The answer turned out not to be a
layout question at all, and the useful part is how that became visible.

**Checking the cards against the chips first changed the shape of the
problem.** Three of the four constraint cards add nothing the refine row does
not already carry: *New & actually good* is `released` + `minRating`, which is
*Newer* + *Higher rated*; *Free to watch* is `cost`; *Finish it tonight* is
`contentType` + `runtime`. Only *Whole family* has filters with no chip.

**And `intent.phrase` is a single string.** A second phrase-bearing card
replaces the first rather than stacking, so two vibe cards could never have
composed as a query whatever the layout did. The mental model in §2.3 —
cards stack — was half wrong independently of the bug.

Between those two facts, exactly one composition was ever real: a vibe card
plus a phrase-less constraint card, where the vibe's phrase survives and the
constraint's filters merge. That one is reachable today through the chips.
The brief's own motivating sentence — "a new film I don't have to pay for
that isn't cheesy crap" — is three chips and needs no card at all.

So the capability was never missing. What is missing is the card-shaped route
to it, and the plain words on the cards, which are the thing that teaches a
new user that anything composes. That is a real loss and a small one.

**Decision: the refine row is the composition surface; the layout is not
rebuilt.** Restoring a card row above the results would put back a second
control cluster over the grid, which is precisely what Session 4 removed on
device evidence.

**The part worth keeping is the reopening condition.** It is a metric in §6
rather than a note to revisit: a *Clear all* followed by a preset tap within
about ten seconds is the observable form of "I wanted to stack these", and
the preset rows already carry everything needed to count it. Two weeks of
real use decides whether the card affordance goes back — into the refine
block, not above the grid.

The general lesson: before designing around a missing interaction, check
whether the capability is missing or only the route to it. Here three of four
cards were duplicates of controls already on screen, and the fourth was the
only thing at stake.

## [2026-09-10] query | review remainders 2–6 (PR follow-up to #148)
- Correction to the [2026-09-09] released push-down entry above: "363 titles qualify" is the *New & actually good* count (released + minRating ≥ 7). The *Newer* (released only) count is **1,690** of 34,563 — the figure the migration 082 EXPLAIN was run against. History is not rewritten; this entry supersedes that sentence.
- Filed: wiki/registers/parking-lot.md IN-SL-012 (title-hit whole-word-run boundary; tests pin it).
- Code alongside: `workers/api/src/index.ts` logs one `foryou_render` line with renderMs per cold render; `.github/workflows/typegen-check.yml` now fails instead of skipping when the Supabase token secret is missing; `src/lib/database.types.ts` gains `min_release_year` on `match_titles_by_vector` by hand pending the first real typegen run; `docs/legal/store-privacy-disclosures.md` lists the quick-filter `category` key.
- Not done here: Follow-up A's six device acceptance cases (remainder 3) still need a device.

## [2026-09-10] query | search review closed (PRs #143, #148, #149 merged)
- Updated: wiki/concepts/operations/phase-search-v2.md (addendum "Review closed")
- Filed: wiki/registers/parking-lot.md IN-SL-013 (Follow-up A device cases, the one remainder still open)
- Verified today: `typegen-check` ran for real for the first time (secret set) and passed on #149 after one formatting fix to the hand-typed Args block.

## [2026-09-10] ingest | Roadmap v1.1 + the 10 September review
- New raw (Joe-directed): raw/forward-planning/Videx_Product_Strategy_and_Roadmap_v1.1_2026-09.md, raw/forward-planning/Videx_Roadmap_Review_2026-09-10.md
- New page: wiki/sources/strategy-roadmap-2026-09-v1-1.md
- Updated: wiki/registers/next-steps.md (10 Sept "Now" block; 13 July section kept as history), wiki/concepts/architecture/notifications-v1.md (credentials were verified 13 Jul — page had said "blocked" for two months), wiki/registers/parking-lot.md (IN-SL-003 clause), index.md
- Decisions recorded: iOS-first release; H0 dated close-out; H1 two-track replan; principle 3 restated; monetisation plumbing → H2 entry.

## [2026-09-10] query | service coverage wave 1 (roadmap v1.1 item 1.5)
- Shipped: HBO Max (`hbo`), Discovery+ (`discovery`), Crunchyroll (`crunchyroll`), MUBI (`mubi`), Pluto TV (`plutotv`) — `ServiceId` union, TMDb + vendor id mappings, logo tiles, brand colours, deep links with search fallback, onboarding/profile tiles, Worker `VALID_SERVICE_IDS`, pricing, fingerprints. Videx reuses the vendor's slug for all five, so the existing rows needed no migration.
- **The roadmap's premise was wrong.** "Rows already flow from the vendor" was true in March and not since. `sync-incremental`'s `SA_SERVICES_GB` enumerated 8 of the vendor's 17 GB catalogues, and the `changes` walk only ever looks at that list — so the other nine received no updates at all, ever. HBO Max launched in the UK on 26 March, six days after the last bulk `sync-content.ts` pass that would have caught it, and had **zero** rows. The other four were frozen at 16–20 March: Pluto TV's 196 rows included **157 for titles that had left the service**, 80% wrong rather than merely old.
- Fixed: the five are now in `SA_SERVICES_GB` (floor goes 4×8=32 to 4×13=52 requests per run; a healthy day measured ~145 against a 500 budget, so ~175 now). New `scripts/sync/backfill-service-catalogue.ts` walks a catalogue listing directly (20/page, cursor-paginated) rather than per title, with `--dry-run` and a `--prune` that is refused on an incomplete walk. Run against production 10 Sept: hbo +485 · plutotv 142 (−157 stale) · discovery 140 (−6) · mubi 60 (−26) · crunchyroll 72 (−1). `count_available_services_drift()` = 0 after.
- Two latent bugs found and fixed on the way. **`PROVIDER_ID_VARIANTS` mapped 1899 → 337 as "Disney+ Basic with Ads"; TMDb 1899 is HBO Max** — inert only while Videx ignored HBO Max, and it would have canonicalised every HBO Max availability into Disney+. **`build-service-fingerprints.ts` derived its service list from an unpaginated query** capped at 1,000 rows, silently dropping small catalogues; that is why Discovery+'s fingerprint was still April's 13-title one. See [service-fingerprints](wiki/concepts/architecture/service-fingerprints.md).
- Updated: wiki/entities/streaming-services/uk-services.md (10 → 15, plus the 1899 correction), wiki/registers/cheatsheet.md, wiki/concepts/glossary.md, wiki/concepts/architecture/service-fingerprints.md, wiki/registers/parking-lot.md (IN-SC-001, IN-SC-002)
- Deliberately not done: Sky Go as a NOW alias — not a one-line mapping (NOW's tiers are `addon` rows and Videx has no notion of which Sky pack a user holds), so it stays wave 2. My5 / UKTV Play / STV / S4C untouched, as briefed. Store privacy forms unchanged: service selections were already a declared category, and five more possible values is not a new data type.
- Not verified: on-device acceptance. See parking-lot IN-SC-002.

## [2026-09-10] query | wave 1 device review — deploy ordering, and IN-UX-001
- **The app can ship a new service id before the Worker knows it.** Joe onboarded a fresh account onto the five new services only and got "Couldn't load your feed" on every surface. Not a code defect: the ad-hoc build carried the new ids while the production Worker still held the ten-id allowlist, so `/v1/foryou` and `/v1/home` both answered `{"error":"unknown service id"}` (400) before auth. `deploy-worker.yml` runs on merge to main, and the PR was unmerged. Dispatched it against the branch with Joe's approval; all five ids now return 401 to an unauthenticated probe, i.e. accepted.
- **Lesson worth keeping:** `VALID_SERVICE_IDS` is a client/server contract, and the client can reach a device before the server moves. Any future service addition must land the Worker first, or the two must ship together. Same shape as the OTA problem below.
- **An app-version bump orphans the ad-hoc build.** The over-the-air route could not be used at all: the newest preview build was 2.3.0 (`d8507cd5`) while the 2.3.1 release produced a production build only (`e844d787`). The branch's own fingerprint was `e844d787`, identical to 2.3.1 — the wave-1 changes move the fingerprint not at all. `ota-update.yml`'s verify step caught it and refused, correctly. Cut an ad-hoc 2.3.1 build instead (`ios-release.yml -f profile=preview`, 8m46s). **Every release that bumps the app version needs a preview build behind it or over-the-air review stops working.**
- Filed: wiki/registers/parking-lot.md IN-UX-001 (text fields and buttons need two taps, reported app-wide). Pre-existing and unrelated to wave 1, which touches no `TextInput`. The textbook cause does not fit — Browse's field has no scroll parent and there is no global keyboard-dismiss wrapper — so it is handed off rather than guessed at: docs/plans/2026-09-10-002-handoff-double-tap-inputs.md.

## [2026-09-10] query | wave 1 closed — PR #153 merged, device review passed
- Merged 17:19 UTC. Worker redeployed from `main`; build and typecheck green.
- Verified on device (Joe): a fresh account onboarded onto the five new services **only** loads every surface, and **the deep links open**. That was the one acceptance item no amount of data checking could settle, so IN-SC-002 is closed.
- **Still unverified, by timing rather than doubt:** the daily sync has not run since `sync-incremental` was deployed at ~16:20 UTC — the last run was 06:00 UTC with 106 SA requests. The 06:00 UTC run on 11 Sept is the first to walk 13 catalogues instead of 8. Check with `select started_at, status, titles_processed, sa_requests from sync_log order by started_at desc limit 1;` and confirm rows for the five services carry a `last_verified_at` of that date.
- Open from this work: **IN-SC-001** (Videx holds titles for only 899 of ~4,876 catalogue entries across the five; a title-ingestion job, worst for anime) and **IN-UX-001** (double-tap, handed off, session started).
- No change to the store privacy forms: service selections were already a declared category and five more values is not a new data type.

## [2026-09-11] query | the title backfill was never slow — IN-SY-001 was underneath it
- **Correction to yesterday's reading.** The catalogue gap is not 17,103 and the backfill is not draining 6x slow. The pipeline uses `count_missing_title_ids()`, which excludes `backfill_skips`; a raw `LEFT JOIN` does not. The real queue is **411**, cleared in 12 seconds at 05:00 today. Migration 069's cadence is doing exactly what it was sized for. Measure this with the function, never with the join.
- **What the skip list actually is.** All 17,104 skips are `tmdb_404` against ids that were never TMDb ids. `sync-incremental` has been storing the vendor's internal `showId` in the `tmdb_id` column since `b29bdf1` (1 Apr). Filed as **IN-SY-001**; 58,718 rows affected, 27,644 of them attached to a real but wrong title and rendering on cards with a link to different content. March's 40,832 bulk rows are clean.
- **The fallback branch was never live.** `/changes` returns no TMDb id at all — checked against the API today. So `change.show?.tmdbId` has never executed, and there is no correct id at the point of use. Resolving per change costs ~33,000 requests/month against a 25,000 quota, so this is an architecture decision, not a patch.
- Sync left running by Joe's call rather than paused; the aim is a fix before tomorrow's 06:00 UTC run. Handoff: docs/plans/2026-09-11-001-handoff-sync-tmdb-id-corruption.md.
- First 13-catalogue sync ran this morning: 121 SA requests (was 106 on 8 catalogues), 1,954 titles, completed. Wave 1's forward pipeline works. The 899 wave-1 rows took their ids from `/shows/search/filters`, which returns a real `tmdbId`, so they are unaffected by IN-SY-001.

## [2026-09-11] query | IN-SY-001 fix — vendor-id → TMDb-id map for the incremental sync
- **Shape chosen: map + daily `/changes` + bounded lookup fallback.** `/changes` carries no TMDb id, so every `showId` now resolves through `sa_show_map` (migration 083, text PK) before anything is written. One map read per page; a miss costs one `/shows/{id}` lookup (verified: `/shows/6` → `tv/66732`, so the endpoint takes the vendor's own id) capped at 200 per chain (`lookupBudget` body override), answer written back. Unresolved changes are skipped and counted (`chain_state.stats.unresolved`), never written under the vendor id. A map-read failure — including the table not existing — is a fetch failure, so the run fails loudly and the window is not advanced. `deno check` clean.
- **Map seeded by the walk.** `backfill-service-catalogue.ts` upserts every entry it sees on any non-dry run; `--map-only` seeds without touching availability; `--map-out`/`--map-in` save and replay a walk so the measuring dry-run is never paid for twice. `--prune` now leaves `tmdb-backfill` rows alone (they are TMDb-sourced; a vendor-scoped prune would have deleted ~290 on NOW).
- **Numbers re-verified live** before acting: 40,832 March rows clean; since April 31,074 orphaned + 28,409 with a title, of which 765 are correct `tmdb-backfill` rows → 27,644 colliding. `backfill_skips`: 16,692 of 17,104 are since-April orphan ids; **412 are not** — so prune the list, do not truncate it. `streaming_history` since April: 108,592, all with a `sync_run_id`. Walk cost (dry-run): netflix 429 requests / 8,567 entries (complete, 4m16s); prime 1,200 requests (ceiling) / 24,000+ entries, NOT complete (10m41s; resume cursor `18530713:0`).
- **Later the same day, with Joe in the loop:** Joe applied 083; the map was seeded from the saved walks (31,767 rows); the function deployed as v32 through the MCP; one chain enqueued at 11:24 UTC completed with the window consumed — 683 changes, 0 fetch failures, 101/101 written titles matching the vendor's, `unresolved` 539 because the 200-lookup budget ran out on the eleven unmapped catalogues. **Nothing has written a vendor id since.** Still Joe's: the cleanup decisions, and the `--map-only` walks of the other catalogues. Run list and the four decisions with SQL: docs/plans/2026-09-11-002-plan-sync-tmdb-id-cleanup.md. The sync was left running as Joe asked; until the deploy it keeps writing vendor ids, which the walk rebuild removes.
- **IN-SC-001 can ride the same walks** (raised by the wave-1 session mid-way): `--include-unknown-titles` on the walk script writes availability rows for entries `titles` lacks, and the 05:00 `backfill-missing-titles` chain creates the titles — no third `titles` writer. Off by default; the anime composition shift is Joe's call after `npm run eval:fingerprints`.
- **Evening: cleanup complete, IN-SY-001 closed.** Joe approved the recommendations and `--include-unknown-titles`. Skip list pruned 17,104 → 412; 13 catalogues walked (7,786 requests; Prime twice — the first attempt's writes died on a transient "fetch failed" at row 5,400 with nothing persisted, so the script gained write retries and `--rows-in` replay); Apple and Prime cleaned by date rather than `--prune` (channel addons); 102,537 history rows repaired through the map, 6,055 deleted. **0 rows from the corrupt writer remain**; 18,502/18,566 rebuilt titles match the vendor's; drift 0. Two findings filed: **IN-SC-003** — the vendor lists only 318 NOW titles today (vs ~1,840 in March; `now.addon` agrees), so the prune of NOW's March tiers matched vendor truth; and the title queue is **58,029** (Prime/Apple buy-rent long tail), draining over 3–4 weeks — Joe's lever is to drop buy/rent-only title-less rows if that is too much. Baseline `eval:fingerprints` before the run: FAIL (max 0.985, mean 0.809) — re-run after a Sunday refresh.
- New: wiki/concepts/operations/solutions/sync-vendor-show-id-in-tmdb-id.md
- Updated: wiki/concepts/operations/sync-pipeline.md (vendor id resolution section + health query), wiki/entities/apis/streaming-availability-api.md (`/changes` has no TMDb id; `/shows/{id}` takes the vendor id; listing returns both ids), wiki/entities/codebase/migrations.md (083), wiki/registers/parking-lot.md (IN-SY-001 → ⚠ partial), index.md

## [2026-09-11] query | "can Videx send a title to a smart TV?" — feasibility research
- Five research agents (Roku ECP; Android TV Remote v2 + Fire TV; Samsung Tizen + LG webOS; Apple TV Companion + DIAL + Matter Casting + competitors; RN/Expo local-network implementation). Full write-up with sources: `docs/strategy/briefs/send-to-tv-feasibility.md` (not yet snapshotted into raw/).
- **Answer:** per TV platform, not per service; LAN-only; mostly reverse-engineered; pairing prompt on the TV. App-level launch feasible on Roku/Google TV/Samsung/LG/Apple TV; Fire TV and Sky/Virgin/Freely closed. Title-level launch proven only for LG+Netflix, Apple TV by URL, Roku+Disney+. Netflix removed phone casting to most TVs 2025-11. No standard before ~2028 (Matter Casting is Amazon-only + per-app whitelist). Effort 2–12 eng-weeks.
- **Recommendation: park** (not on Roadmap v1.1). Joe has not yet decided; register row filed as parked-pending-decision. If revisited: reframe as "Open on TV"; 2-day Home Assistant bench test before any app code.
- New page: wiki/concepts/forward-planning/send-to-tv-feasibility.md
- Updated: wiki/registers/deferred-items.md (Parked row, 12 → 13), wiki/sources/forward-planning.md (table row), index.md
- Note for Joe: copy the brief into `raw/forward-planning/` when convenient so the wiki page has a raw source.

## [2026-09-11] query | IN-UX-001 — the first tap was dismissing the keyboard, on the list nobody checked
- **What it was.** On Browse, typing a query and going straight for a title lost the first tap: it dismissed the keyboard, and the second opened the detail page. Joe's own sentence identified it; the counter confirmed it — a poster card logs `touch → DEAD`, then a clean reaction 887ms later on the retry.
- **Why the triage missed it, and why the register was right to say the obvious cause did not fit.** The search asked whether the nine files containing a `TextInput` had a scroll parent. Browse's field genuinely has none — that part of the entry was correct. But the scrollable that matters is **not the one holding the text field, it is the one holding whatever is tapped next**. On Browse that is the results `FlashList`, which no `TextInput` search would ever surface. The rule to carry forward: audit scrollables against *what can be tapped while a keyboard is up*, not against where the field lives.
- **Fixed** on three call sites reachable while the Browse field holds focus — the results `FlashList`, the presearch presets, and `FilterSheet` (it opens over a live keyboard because `RefineRow` already persists taps) — plus `ReportSheet` and `ProfilePrivacy`, which were the same class. The other 20 scrollables are deliberately untouched: the fault is scoped to scroll views (a `Pressable` outside one takes its first tap with the keyboard up, measured on device) and no text field can be focused on those screens.
- **Ruled out on device, each with a number rather than an impression:** new-architecture touch handling; react-native-screens intercepting after a transition; control placement — the same control pair behaves identically outside the navigator, inside a screen, and inside its ScrollView; NativeWind's `className` interop, paired against plain `style` throughout; and JS-thread blocking — 0 stalls while three 500KB+ query-cache re-serializations landed alongside the dead taps.
- **The synchronous query persister is exonerated but still worth a look.** `queryPersist` uses `createSyncStoragePersister`, so it `JSON.stringify`s the whole cache onto the JS thread up to once a second. Measured at 528KB with zero stalls, so it is not this bug and not urgent — but it scales with browsing.
- **Method note.** Four probe iterations, two of which were instrument bugs, not app bugs: `onTouchStartCapture` does not exist in RN 0.85's `ViewProps`, and `onPressIn` fires ~1ms BEFORE the bubbled `onTouchStart` on `Pressable`, so v2's dead-tap timer scored every button press dead. Both red counts in that run were the probe. Verify the instrument before believing a red number.
- **Incidental:** the native lint gate is broken in a fresh worktree. `native/` has no ESLint of its own and `eslint.config.mjs` borrows the root's plugins, but the root can no longer satisfy `@babel/core`. Runs clean as `cd native && NODE_PATH="$(pwd)/node_modules" npx expo lint`.
- **Fix verified on device 2026-09-13** by Joe, with the counter still running over the fix: search, then straight to a title with the keyboard up — 0 dead taps, title opens on the first tap.
- Probe branch `debug/touch-probe` is diagnostic only and is never merged. Kept rather than deleted: it is a working dead-tap and JS-stall detector for the next touch report.

## [2026-09-14] query | native lint gate — correcting the IN-UX-001 diagnosis, and pinning ESLint
- **Correction to the 2026-09-11 incidental note.** That entry said the root "can no longer satisfy `@babel/core`". Wrong: the root lockfile lists `@babel/core` 7.29.0 and `eslint-plugin-react-hooks` 7.0.1 declares it as a dependency. The main checkout's root install was simply stale — ESLint 9.39.4 and the hooks plugin present, `@babel/core` missing. A worktree lives under the main checkout, so with no root install of its own, module resolution walked up into that stale install. The `NODE_PATH` workaround only papered over it.
- **The real defect was quieter.** `expo lint` version-checks with `require('eslint')` but runs the lint through `npx eslint`. With no root install, `npx` downloads the latest ESLint (10.10.0 at the time), outside the hooks plugin's `≤ ^9` peer range and different from root's pin. With the root installed, `npx eslint` resolves 9.39.4 and the old gate passes.
- **Fix:** `native`'s `lint` script now runs `../node_modules/eslint/bin/eslint.js src` with `expo lint`'s own cache location (`.expo/cache/eslint/`, gitignored). Same inputs, same result on current `main` (0 errors, 1 pre-existing warning at `(tabs)/index.tsx:263`). No new dependencies, no lockfile change. Without a root install it now fails at once with a missing-module error instead of downloading an unpinned ESLint.
- **The gate is now `npm run lint` in `native/`, after a root `npm install`/`npm ci`.** Updated: native/README.md, docs/CONVENTIONS.md, both ESLint config comments, wiki/concepts/architecture/platform-architecture.md. Older handoff plans still say `npx expo lint`; they are historical and left as written.
- Still not in CI: `typecheck-lint.yml` covers the root only, which is how this rotted unnoticed.

## [2026-09-14] query | native lint now runs in CI
- `typecheck-lint.yml` gains a `Lint (native)` step after the root lint: `npm run lint` in `native/`, on every PR and push to `main`. Closes the gap in the entry above: the native gate had never run in CI, which is how it rotted unnoticed.
- **No native install in CI.** Measured on a clean root `npm ci` with `native/node_modules` and `native/.expo` moved aside: same result (0 errors, 1 pre-existing warning at `(tabs)/index.tsx:263`), and ESLint creates its own cache directory. The native config takes ESLint and every plugin from the root and is not type-aware, so it never reads native's install. The step costs seconds rather than a native `npm install`.
- `native/src/lib`, the postinstall junction, will not exist in CI. The native config already ignores `src/lib/**`; the shared tree is linted by the root config.
- Not added: native `tsc --noEmit`. That does need native's install for React Native and Expo types, so it is a separate decision.

## [2026-09-14] query | root npm audit triage — 23 advisories → 0, no majors, no blanket `audit fix`
- **Baseline** (clean root `npm ci` on `main` 141b41c): 23 (1 low, 7 moderate, 14 high, 1 critical); 8 in prod `dependencies`. All pre-existing — no recent PR touched the root lockfile.
- **Fixed in three commits, one group each, every bump inside the existing major:** (1) `axios` ^1.13.5 → ^1.20.0, which also brings `form-data` 4.0.6 and `follow-redirects` 1.16.0; (2) lockfile-only in-range update of the prod transitives `tar` 7.5.22, `@xmldom/xmldom` 0.8.15, `minimatch` 10.2.6, `brace-expansion` 1.1.18/5.0.9, `ws` 8.21.3; (3) `vite` 6.4.3, `vitest`/`@vitest/ui` 4.1.11, plus in-range `rollup`, `postcss`, `picomatch`, `nanoid`, `js-yaml`, `undici`, `browserslist`, `@babel/core`, `@humanfs/node`, `fflate`. Root `npm audit` and `npm audit --omit=dev` both report 0. Gates: `tsc --noEmit` clean, lint 0 errors (72 warnings), vitest 41 files / 453 tests, `vite build` clean.
- **Reachability, recorded because it decides what matters next time:**
  - `@capacitor/cli` (tar critical, xmldom high, minimatch prod path) is not needed by anything that ships. It runs only under the legacy `cap:*` scripts. Its `tar.extract` calls unpack its own bundled template archives (`config.cli.assets.*`), and `plist.parse` reads iOS `Info.plist` / Cordova plugin plists — there is no `ios/` and no Cordova plugin. No untrusted archive or XML path.
  - Nothing in `src/`, `scripts/` or `workers/` parses XML or archives.
  - `axios` is imported only by `src/lib/api/tmdb.ts` + `omdb.ts` (web tree hooks, and native via the junction). The Worker bundle (wrangler dry-run, sourcemap checked before and after) contains no axios, form-data, follow-redirects or `ws`; PLAT-3 W1 had already split `imageUrls.ts` out for exactly this. No Node script imports tmdb/omdb, so the Node-adapter advisories (proxy SSRF, form-data CRLF, redirect header leak) had no runtime; the root web tree has never been deployed (see IN-SL-003).
  - `ws` sits under `@supabase/realtime-js`; nothing calls `.channel()`, and in the Worker realtime's websocket factory uses the platform `WebSocket`.
  - The rest were dev-only (lint, test, build tooling).
- **Lockfile churn:** ~790 lines across the three commits; most of commit 3 is rollup's 21 per-platform binaries moving together. Zero major-version changes (diffed package-by-package). One addition to note: rollup 4.63.0 upstream declares optional `@napi-rs/lzma-linux-x64-gnu` (linux-x64 only, published by the napi-rs maintainer) — genuine, not a stray.
- **Deferred:** IN-DEP-001 — `native/` still resolves axios 1.17.0, inside the vulnerable range, and it is what the device runs. Its own PR: the "stale native lockfile" reason first given for deferring was wrong — PR #106 repaired it on 2026-08-27, and it matches `native/package.json` today. Native `npm audit --omit=dev`: 29 (13 high, 16 moderate). IN-DEP-002 — retire the legacy Capacitor wrapper (`@capacitor/cli`, `android/`, `capacitor.config.ts`, `cap:*` scripts); Joe's call.
- Updated: wiki/registers/parking-lot.md (new "Dependency hygiene" section, IN-DEP-001/002)
- **Follow-ups, same day:**
  - Joe approved deleting the legacy Capacitor build path (IN-DEP-002).
  - Handoffs written for both follow-ups, to run in fresh sessions after #160 merges: `docs/plans/2026-09-14-001-handoff-native-npm-audit.md` and `docs/plans/2026-09-14-002-handoff-retire-capacitor-wrapper.md`.
  - Native chain lookup found `decode-uri-component` 0.2.2 under `expo-router` → `query-string` 7.1.3. That puts it in the app bundle, not tooling, and it fixes only via a major, so the native session must establish reachability before deciding.

## [2026-09-14] query | IN-DEP-002 — legacy Capacitor wrapper retired from the root tree
- **Deleted** (branch `chore/retire-capacitor-wrapper`, off `main` 582295e, which contains #160): tracked root `android/` (78 files, incl. `keystore.properties.example`), `capacitor.config.ts`, the `cap:sync` / `cap:open` / `build:android` / `dev:android` scripts, `@capacitor/cli` + `@capacitor/android` (`npm uninstall`), `scripts/gen-android-icons.py` (hardcoded absolute path into root `android/app/src/main/res`; only README and CONVENTIONS named it), the ESLint ignores for `android/**` and `capacitor.config.ts`, and the `.gitignore` Capacitor block + `android/keystore.properties`. Generic `*.apk` / `*.aab` / `*.jks` / `*.keystore` / `keystore.properties` ignores kept; `native/.gitignore` ignores its own `/android`.
- **Pre-check:** nothing in `native/` or `.github/` referenced root `android/`. Every workflow hit is `native/android/`.
- **Kept:** the `@capacitor/*` runtime plugins, which `src/` still imports. `@capacitor/browser` has **zero imports** (src, workers, native/src), so it is a removal candidate for a later change. Also kept: the `capacitor` chunk in `vite.config.ts`, historical docs, and `native/` untouched. `supabase/functions/_shared/cors.ts` still names `capacitor.config.ts` in a comment and allow-lists `capacitor://localhost`. That is an Edge Function runtime decision, left alone.
- **Lockfile:** 71 entries removed (`@capacitor/cli` / `android` plus the `@ionic/utils-*`, `native-run`, `tar`, `@xmldom/xmldom`, `plist`, `xml2js` chain), 0 added, 0 version changes. 16 surviving entries gained `dev: true` (and `@babel/core` gained `peer: true`): they were reachable from prod only through `@capacitor/cli`.
- **Gates:** root `npm ci`; `tsc --noEmit` clean; lint 0 errors / 72 warnings (baseline); vitest 41 files / 453 tests; `vite build` clean; `npm audit` 0. `workers/api` `wrangler deploy --dry-run` bundles (720 KiB).
- Updated: wiki/registers/parking-lot.md (IN-DEP-002 ✅), wiki/entities/infrastructure/capacitor.md (retired banner), wiki/concepts/operations/apk-build-and-install.md (obsolete banner), wiki/concepts/architecture/platform-architecture.md, wiki/entities/codebase/module-map.md, wiki/registers/pre-launch-blockers.md (item 16 superseded), wiki/concepts/glossary.md (PWA row), index.md; also README.md, docs/CONVENTIONS.md.
- Joe's main checkout may still hold an untracked `android/` directory with a local `keystore.properties` or keystore. This change did not touch it; delete it by hand after merge.

## [2026-09-14] query | `@capacitor/browser` removed (IN-DEP-002 follow-up)
- The one runtime plugin flagged in the wrapper retirement (PR #162) as having no imports. A whole-repo grep (everything except `node_modules`, the lockfile, `docs/plans`, `raw/` and this log) found it only in root `package.json` and two wiki tables. `native/package.json` never listed it, and it was not in the `vite.config.ts` `capacitor` chunk. `openDeepLink.ts` uses `AppLauncher` + `window.open`.
- `npm uninstall @capacitor/browser`: the lockfile loses only that package's entry and its root dependency line. No other entry changed.
- Gates: root `npm ci`; `tsc --noEmit` clean; lint 0 errors / 72 warnings (baseline); vitest 41 files / 453 tests; `vite build` clean; `npm audit` 0.
- Updated: wiki/entities/infrastructure/capacitor.md and wiki/entities/codebase/module-map.md (plugin rows removed).

## [2026-09-14] query | native npm audit triage (IN-DEP-001) — 29 → 19, axios fixed, a reachable deep-link DoS guarded in code
- **Baseline** (`native/` on `main` 582295e, `npm audit --omit=dev --package-lock-only`): 29 (13 high, 16 moderate). Gates on `main` before any change: native lint 0 errors / 1 warning (`(tabs)/index.tsx:263`), native `tsc --noEmit` 0 errors, root vitest 41 files / 453 tests.
- **Fixed, three commits, no majors:**
  1. `axios` ^1.17.0 → ^1.20.0; the lockfile changes the axios entry only.
  2. Lockfile-only `npm update` of the tooling transitives: brace-expansion 5.0.9, browserslist 4.28.9, baseline-browser-mapping 2.11.23, js-yaml 4.3.2, nanoid 3.3.19, postcss 8.5.28, shell-quote 1.10.0, @xmldom/xmldom 0.8.15 / 0.9.12, `@expo/metro` 56.0.2 (nested metro 0.84.5), `@expo/config-plugins` 56.0.16, `@expo/prebuild-config` 56.0.23. Diffed package-by-package: 21 minor/patch changes, 17 nested additions (the metro 0.84.5 family), 0 majors.
  3. The deep-link guard below. Result: 19 (4 high, 15 moderate).
- **`decode-uri-component` is reachable, and no dependency fixes it:**
  - **Path:** Expo Router's `getInitialURL` (cold) and `subscribe` (warm) → `getStateFromPath` → `parseQueryParams` → `query-string` 7.1.3 `parse` → `decode-uri-component` 0.2.2 (GHSA-vcc3-ghjq-m6fr). `videx://` is a plain custom scheme, so any page or app can open one.
  - **Measured in Node:** `%FF`×500 in the query (1.5 KB) blocked parsing for 25 s; a well-formed 12 KB query took 0 ms.
  - **Why no dependency fix:** expo-router 57.0.21 (latest) and 58.0.0 (next) still pin `query-string` ^7.1.3, so an SDK bump would not help. `decode-uri-component` 0.5.0 is ESM-only, so an `overrides` pin under CommonJS `query-string` 7 is out.
  - **Decision (Joe):** mitigate in our code. `native/src/app/+native-intent.tsx` `redirectSystemPath` → `src/lib/deepLinkQueryGuard.ts` `stripMalformedQuery` drops any query that native `decodeURIComponent` rejects; the slow path only runs on that rejection.
  - **Tests:** 16 vitest cases; fuzzed against the real `query-string` (2,000 valid queries up to ~4 KB, worst parse 0.75 ms; 20,000 mixed queries, 0 disagreements with a per-key/value decode).
- **Not reachable, deferred (IN-DEP-004):**
  - `uuid` 7.0.3 via `xcode`: only `uuid.v4()` with no buffer, during prebuild. It accounts for the `@expo/*`, `expo`, `expo-splash-screen` and `@sentry/react-native` derived entries.
  - Root `metro` 0.84.4 → `image-size` 1.2.1: no `image-size` release is outside the range. Expo CLI uses the nested metro 0.84.5, which has no `image-size`; root 0.84.4 is held only by `@react-native/community-cli-plugin`, which nothing here runs.
- **Merged `main` (#161–#163) into the branch:** the only conflicts were this log and parking-lot.md, where both sides had appended; both sides were kept. On the merged tree: native lint **0 problems** (#161 fixed the `:263` warning); `tsc` 0 errors; root vitest 42 files / 469 tests.
- **Gates on this branch before the merge** (clean root + native `npm ci`): native lint 0 errors / same 1 warning; `tsc` 0 errors; root vitest 42 files / 469 tests; `npx expo export --platform android` clean (one 9.4 MB Hermes bundle, which contains `redirectSystemPath`, `+native-intent` and the `axios/1.20.0` version string).
- **Shipping (Joe):** next store build, not OTA. Device check owed:
  - TMDb surfaces load;
  - a password-reset email link still verifies;
  - a KB-long `%FF` link opens without a stall.
- Updated: wiki/registers/parking-lot.md (IN-DEP-001 closed; IN-DEP-003 mitigated, device check pending; IN-DEP-004 deferred)

## [2026-09-14] query | `capacitor://localhost` dropped from the CORS allow-lists (IN-DEP-002 follow-up)
- **Two allow-lists carried it:** `supabase/functions/_shared/cors.ts` (`STATIC_ALLOWED_ORIGINS`, imported today by `label-anchor-room` and `embed-query`) and the `videx-api` Worker's Hono `cors()` origin list (`workers/api/src/index.ts`). Removed from both.
- **Why it's safe:**
  - No shipped client sends that origin. The Capacitor wrapper is gone (#162).
  - The Expo app calls through native `fetch`, which sends no `Origin` header, so CORS never gates it.
  - The web `src/` tree has never been deployed (IN-SL-003).
- **Kept:** `https://localhost`, `http://localhost(:port)` and the `VIDEX_ALLOWED_DEV_ORIGINS` hook. `https://localhost` is the old Capacitor WebView origin as well, and would be the next candidate to drop.
- **Correction:** the old `cors.ts` comment had the defaults swapped. `capacitor://localhost` is the iOS WebView default, `https://localhost` Android's. The Worker's comment was already right.
- **Checks:**
  - `isAllowedOrigin`, run under `tsx` (no local Deno): `capacitor://localhost` rejected with no ACAO header; `https://localhost`, `http://localhost` and `http://localhost:5173` allowed; a foreign origin and `null` rejected.
  - Worker: `wrangler deploy --dry-run` bundles (720 KiB); ESLint clean on `index.ts`.
  - Root `tsc --noEmit` clean.
- **Deploy:**
  - The Worker change ships on merge through `deploy-worker.yml`.
  - The Edge Function change only takes effect once `label-anchor-room` and `embed-query` are redeployed. No workflow deploys Edge Functions, so that is a manual step.
- Updated: wiki/entities/codebase/rpcs.md, wiki/registers/pre-launch-blockers.md (item 23). The Phase 5 pages and summaries that list the original allow-list are history, left as written.

## [2026-09-14] query | #164 device check passed on a fresh ad-hoc iOS build — IN-DEP-003 closed
- **What was checked:** PR #164 (native npm audit triage, IN-DEP-001), merged 2026-09-14 as `ee96840`: axios 1.20.0 in `native/`, the in-range tooling updates, and the deep-link query guard (`native/src/app/+native-intent.tsx` → `stripMalformedQuery` in `src/lib/deepLinkQueryGuard.ts`) for GHSA-vcc3-ghjq-m6fr (`decode-uri-component` 0.2.2 under expo-router → `query-string` 7; IN-DEP-003).
- **OTA could not reach the phone:** #164's lockfile update moved the native fingerprint. The preview update's runtime `b0e3c78c…` did not match the installed build's `e844d787…`, so a new binary was needed.
- **Fresh ad-hoc build:**
  - EAS build `213af0ce-29b4-4c0c-89cf-8544fb6c3879`;
  - profile `preview`, channel `preview`;
  - runtime `b0e3c78c3e692bf34d1636dab951bbba74d1eb5a`;
  - app 2.3.1 (11), from `main` `7ead274`;
  - not submitted to TestFlight.
- **Device check (Joe, iPhone, 2026-09-14) — all passed:**
  - TMDb surfaces load: Home rails, Browse discover, search, detail "More like this";
  - a password-reset email link verifies, cold start and warm;
  - `videx://detail/movie-550` opens the detail page;
  - a KB-long `videx://detail/movie-550?a=%FF%FF…` link opens without a stall.
- **Shipping unchanged (Joe):** production gets axios 1.20.0 and the guard with the next store build, not OTA.
- **Filed separately, not fixed here:** a pre-existing New tab pull-to-refresh problem found in the same session. The spinner is cut off under the status bar and snaps shut with no clear refreshed signal. It is being fixed in its own session.
- Updated: wiki/registers/parking-lot.md (IN-DEP-003 closed, device-verified; IN-DEP-001 device check recorded; Counts bullet). Still open on IN-DEP-003: remove the guard once expo-router leaves `query-string` 7.

## [2026-09-14] query | pull-to-refresh on New / For You — half a spinner, snapped shut, no completion cue (IN-UX-002)
- **Report (Joe, iPhone):** pulling New showed half a spinner under the status bar. It vanished as the finger lifted, with nothing to say a refresh had happened. Joe then confirmed on device that For You does the same.
- **Not #161:** that PR only changed the `onRefresh` `useCallback` dependency.
- **Causes, from RN 0.85.3 source (`RCTPullToRefreshViewComponentView.mm`, `RCTScrollViewComponentView.mm`, `RefreshControl.js`):**
  1. *Cut off:* no header, and a full-bleed hero, so the scroll view starts at y=0. `UIRefreshControl`'s ~60pt band sits under the Dynamic Island. `progressViewOffset` IS applied on iOS in 0.85 (as a `bounds` shift), contrary to the brief, but the control is the scroll view's `refreshControl`, behind the content, so it would hide behind the hero instead.
  2. *Snap:* `refreshing` went false as soon as the KV-cached `refetch()` resolved, often mid-gesture. Checked and ruled out: a `RefreshControl` JS/native desync (`_onRefresh` + `forceUpdate` batch with `setRefreshing(true)`).
  3. *No signal:* the Worker usually returns the same titles.
- **Fix (JS-only, both tabs):** `RefreshableScrollView` + `usePullToRefresh` + `src/lib/utils/pullToRefresh.ts`.
  - iOS: the native control keeps the gesture and the hold with `tintColor="transparent"`, and an overlay chip spinner sits at `insets.top + 8`. Its opacity follows the drag and is pinned while refreshing, so bounces and spring-back don't flash it.
  - Android: native disc with `progressViewOffset`.
  - A 700 ms minimum hold, then a 1.2 s pill: *Updated just now* / *You're up to date* / *Couldn't refresh*. It compares rendered title ids, because For You's payload carries a per-fetch `wallclockMs` and reference equality would always say "updated".
  - iOS holds the control open under the pill, so it lands in the gap, not on the hero kicker.
  - VoiceOver/TalkBack announcement.
  - The hero stays full-bleed.
- **Rejected:** re-running the Reveal cascade on refresh, because remounting rows re-fires `recordImpression` and would feed C1 fatigue.
- **Gates** (clean root + native `npm ci`):
  - native lint 0 problems;
  - native `tsc --noEmit` 0 errors;
  - root vitest 43 files / 477 tests (+8);
  - `npx expo export --platform android` clean (one 9.4 MB Hermes bundle).
- **No dependency or native-config change**, so the fingerprint should match the ad-hoc build `213af0ce` (`b0e3c78c…`). OTA to `preview` / iOS is Joe's call, and must run from CI.
- **Open (Joe):**
  - device check on both tabs;
  - decide whether a pull should bypass the Worker KV feed cache. Today a pull cannot surface picks newer than the 04:00 UTC recompute or the last taste change.
- Updated: wiki/registers/parking-lot.md (IN-UX-002 filed, ⚠ fix built)

## [2026-09-14] query | IN-UX-002 closed — device-verified, no KV bypass on pull
- **OTA:** `ota-update.yml` on `fix/native-pull-to-refresh`, channel `preview`, iOS (run 34841564484). Update runtime `b0e3c78c3e692bf34d1636dab951bbba74d1eb5a` = installed build `213af0ce`.
- **Device check (Joe, iPhone):** passed on New and For You ("looks great").
- **Decision (Joe): pull-to-refresh keeps reading the Worker KV feed cache.**
  - For You: 20-min TTL, and the key resets on `taste_vector_updated_at` / sliders / services. Ordering reshuffles on the matching 20-min bucket.
  - Home: 10-min TTL, and the key resets on services / clusters.
  - A bypass would mostly recompute the same picks, for a cold render per pull, 30/min rate-limit exposure and a reshuffle on every pull.
  - Revisit if testers find "You're up to date" unsatisfying. Cheaper option then: refresh only entries older than ~2 min.
- Updated: wiki/registers/parking-lot.md (IN-UX-002 ✅)

## [2026-09-14] query | ingestion floor, addon-tier interim, entitlement brief
- **Why the queue was 58k, answered with data:** the March catalogue was built TMDb-first (~20k titles by popularity, then the vendor asked per title), so Videx only ever held Prime/Apple rent-buy rows for popular titles; the vendor's stores are 52,496 (Prime) and 30,067 (Apple) entries. The 10,132 titles created from the queue before any floor look like the existing catalogue (72% under 100 votes) and include titles that plainly should have existed — Harry Potter, The Matrix, John Wick (HBO Max), The Truman Show (Paramount+), Léon, The Terminator (channels), Shaun of the Dead, Sin City (rent). So the tier is the wrong knife.
- **Relevance floor** in `backfill-missing-titles` (Joe's choice): 20 TMDb votes when included with a subscription/free somewhere, 200 when rent/buy-only or channel-only; skipped titles recorded as `backfill_skips.reason = 'below_floor'` (reversible). Language deliberately not a criterion.
- **Addon-tier interim (IN-SC-004):** migration 084 excludes `stream_type = 'addon'` from `available_services` (For You / Home had been treating 11,895 channel-only Prime titles as "on Prime"); `detailAdapter.channelOptions` + a labelled "Via a channel" list in the native where-to-watch; the share page skips addon rows. Search hits and fingerprints were already right.
- **Brief written:** `docs/strategy/briefs/addon-entitlements.md` — channels as sub-entitlements of the parent, one entitlement per channel however bought, curated picker, availability follows entitlement. Handoff for a fresh session: `docs/plans/2026-09-14-001-handoff-addon-entitlements.md`.
- Updated: wiki/concepts/operations/sync-pipeline.md (floor + addon sections), wiki/entities/codebase/migrations.md (084), wiki/registers/parking-lot.md (IN-SC-004)
- Not verified here: the native component (no native node_modules on this machine) — review only; CI build + device check with the next release.

## [2026-09-14] ingest | Videx_Growth_Loops_Strategy_v0.1_2026-09.md (raw/forward-planning)
- New page: wiki/sources/growth-loops-strategy-v0-1.md (five loops, foundations, G0–G5 order, measures; §8 Q1/Q2 answered; §3 audit corrections recorded)
- New page: wiki/concepts/forward-planning/growth-loops.md (status shortlisted; verified current state vs net-new; proposed routing position pending ADR-015; decisions list)
- Updated: index.md (Forward planning + Sources)
- Plan written alongside: docs/plans/2026-09-14-003-feat-phase-g0-g1-growth-foundations-and-sharing-plan.md (audit of items 1–8, G0/G1 tasks, migrations pre-assigned 085–088, 19 decisions for Joe). Plan only; nothing implemented or applied.
- Corrections found: the strategy's §3 audit predates H0 Stream B (Share v1 + `/t/` OG title pages shipped July 2026); the shipped title URL is `/t/{type}/{tmdbId}`, not `/t/{slug}`; Notifications v1 migrations are 055–060 (an older memory note said 048–052).
- Not updated: registers (parking-lot, open-questions, next-steps) — wait for Joe's decisions; AGENTS.md step 2 ("discuss takeaways with the human") deferred to the plan review.

## [2026-09-14] query | G0/G1 decisions taken; execution shape agreed
- Joe took all 19 decisions in plan §9 (title URL with cosmetic slug; rooms shared as `shared_rooms` snapshots; `/list/` reserved for G2; D5 stands → ADR-015 in S1; `.well-known` on the Worker; Apple + Google via id token with a placeholder-username migration; in-app pending link + Android Install Referrer; `growth_events` table; `via` + `src`; no flag; `IN-GR` family).
- Product answers recorded in plan §9b (share copy fallbacks, "tell someone" on arrival first then leaving-soon, anonymous no-expiry room snapshots with the Worker page as the non-user journey, providers per platform, recipient actions, share glyph placement, all loops launch together).
- Execution: five sessions (S1 links → S2 attribution ‖ S3 sign-in → S4 sharing → S5 verification); migrations re-assigned 085 shared_rooms / 086 handle_new_user / 087 growth_events. S1 handoff: docs/plans/2026-09-14-004-handoff-growth-s1-links.md.
- Updated: wiki/concepts/forward-planning/growth-loops.md (status locked, decisions section)
- Still not updated: registers — `IN-GR` opens in S1; open-questions D5 row closes with ADR-015.

## [2026-09-15] query | title queue drained; device validation; available_services = included only
- **Drained the 45,636-title queue in a day** with `scripts/sync/drain-title-queue.ts` (PR #170 fixed two loop-pacing bugs found on the way: downstream loops burned cycles on trickles, and embed counted unembedded rather than embed-ready titles). 138 chains, 0 failed; 9,127 titles created, 38,076 held under the floor (~80% of the tail). Overnight crons then ran clean: queue 0, sync 15 unresolved / 1,759 changes, pipeline-health green once the queue was empty (it had failed only on `gap-not-growing` since the 12th).
- **Device validation (Joe, ad-hoc iOS via OTA):** HBO Max chip + deep link on The Matrix; "Via a channel" on Léon with the Prime link opening; Prime-only For You free of channel-only titles; new Crunchyroll titles searchable; share page shows rent/buy only; New visibly refreshed. All six passed.
- **Found on device:** rent/buy-only Prime titles (Nick and the Jade Tree, One Night Only) in New/For You with no chip. Cause: `available_services` counted rent/buy rows since 075 (24,744 "on Prime" vs 11,309 included) while card chips come from TMDb providers. **Migration 085** (awaiting Joe) narrows the column to subscription/free; every rent/buy surface reads `streaming_availability` directly and is unaffected — confirmed before writing it.
- **Floor applied retroactively:** 6,975 of the 10,132 pre-floor titles (12–14 Sept) deleted with `below_floor` skips written first; 11 test interactions orphaned.
- Updated: wiki/entities/codebase/migrations.md (085), wiki/concepts/operations/sync-pipeline.md (column semantics + retro floor), wiki/registers/parking-lot.md (IN-SC-004)

## [2026-09-15] query | catalogue walks scheduled (plan §3.1 closed)
- `.github/workflows/catalogue-walks.yml`: weekly Monday 02:00 UTC for netflix + the ten small catalogues (~1,050 requests), monthly on the 2nd at 01:00 UTC for Prime + Apple (~4,100). Both `--prune --include-unknown-titles` per Joe's decisions; per-service request ceilings (prime 3,500 · apple 2,500 · others 1,000) so a ceiling stop refuses the prune rather than deleting off a partial listing. `workflow_dispatch` with services / dry_run / max_requests; per-catalogue summary table; logs as an artifact; one run at a time. Clear of the 04:50–07:45 cron window and the 1st-of-month recluster. Quota: ~14,500 of 25,000/month with the daily sync.
- Walk script now takes its env from the environment as well as `.env` (`SUPABASE_URL` accepted for `VITE_SUPABASE_URL`), which is how it runs in CI.
- Needs Joe: the `SA_API_KEY` repository secret (the other two already exist), then one `dry_run` dispatch to prove the wiring.
- Updated: wiki/concepts/operations/sync-pipeline.md (cron table + map seeding), wiki/registers/cheatsheet.md (schedules), docs/plans/2026-09-11-002 §3.1

## [2026-09-15] query | add-on channel entitlements built (IN-SC-004, migration 086)
- **Found first:** For You never used `available_services` — `get_available_tmdb_ids` read every `streaming_availability` row (71,798 ids vs 17,527 included for a Netflix/Prime/Apple/BBC/ITVX user), so 084/085 fixed Home, not For You. Wiki 084/085 rows and the sync-pipeline column note corrected; the applied 085 SQL comment is left as history.
- **Decisions (Joe):** `titles.channel_services` token array maintained by the existing trigger (two-writers rule is about creating title rows); fix For You in 086 keeping the JSON-array return; apply in the evening, let the 04:00 UTC recompute pick it up; NOW passes as ordinary chips; curated channels take the 20-vote floor (skip-row delete approved in principle, exact count first — 2,153 at write time). Open questions resolved in-session: Apple name merge via `channel_id` in the registry; no stored route preference.
- **Measured:** 20 ms BitmapOr (two GIN) vs 178 ms old RPC vs 615 ms join; 7,234 titles get tokens; drift 0; all 11 users' For You availability sets shrink once (e.g. 72,658 → 18,166).
- **Built:** migration 086; `src/lib/entitlements/channels.ts`; hard filters, Home render, For You render, Worker `channels=` contract (registry-checked, unknown dropped, cache keys hashed); native `ServicePicker` (onboarding + Profile), channels in the onboarding draft/completion, For You/Home send channels, Where to Watch tier-1 held channels; backfill floor; privacy policy + in-app policy list `user_service_addons`.
- **Verified here:** root `tsc` clean; vitest 58/58 (new channels + classifier + cache-key tests); root and native lint 0 errors; `wrangler deploy --dry-run` bundles; live PostgREST accepts quoted `:`/`.` elements in `or=()`.
- **Not yet:** 086 apply (Joe, evening) → typegen regen → Worker deploy from `main` → `backfill-missing-titles` deploy → skip-row delete (count again) → ad-hoc iOS build + device check → close IN-SC-004.
- **086 applied (Joe, same day):** verified live — registry 28 rows, 7,234 titles with tokens, drift 0, `get_available_tmdb_ids(text[],text[])` only, delete/export include `user_service_addons`; sample user's For You set 17,417 ids, Prime + Shudder + STUDIOCANAL adds 460. Generated types matched the hand-written ones; typegen-check green on re-run. Skip rows to release re-counted: 2,153 (1,454 movie / 699 tv). Advisors: RLS initplan on the new policy (follow-up), unused new index (expected); nothing new in security.

## [2026-09-15] query | IN-SC-004 closed; channel picker design brief
- **Shipped:** PR #176 merged (`ddad952`, Joe). Worker deployed from `main`; smoke-tested on `videxstreaming.com` — `/v1/health` 200, `channels=` over 30 ids → 400 on `/v1/foryou` and `/v1/home`, a valid list reaches auth (401). `backfill-missing-titles` v13 deployed (curated channels → included floor, `verify_jwt` true). Skip-row release (Joe approved): exactly 2,153 `below_floor` rows deleted in a guarded transaction; `below_floor` 45,051 → 42,898, missing-title queue 2,323 for the 05:00 UTC chain.
- **Device check passed (Joe)** on ad-hoc iOS build `4ce93447` (EAS preview from `main`). IN-SC-004 closed.
- **Feedback:** the channel chip panel is ambiguous — open by default and spanning both grid columns, so it reads as belonging to Netflix as much as Prime. Filed IN-SC-006; wrote a design brief for Claude Design mock-ups covering onboarding step 2, Profile → Streaming Services, the Profile row and Where to Watch: `docs/strategy/briefs/service-picker-design-brief.md`.
- **Filed:** IN-SC-007 (RLS initplan on `user_service_addons`).
- Updated: wiki/registers/parking-lot.md (IN-SC-004 closed, IN-SC-006, IN-SC-007), wiki/concepts/product/addon-channel-entitlements.md (status, limitations)

## [2026-09-15] query | services picker Direction B built (IN-SC-006)
- **Input:** Joe's Claude Design hand-off (README + artboards; the artboard JSX was not in the export, the README is the spec) — kept at `docs/design/service-picker-direction-b.md` with the decisions below.
- **Decisions (Joe):** drop the "N titles only here" meta and the sort by titles unlocked (registry order, no migration); Profile save stays on screen with a "Saved" card, no toast on Profile home; "I have this" on a channel that is also a service adds the service; build in this session.
- **Built (branch `feat/service-picker-direction-b`):** `ServicePicker` (40px badges, names wrap, channel strip inside the selected Prime/Apple/NOW tile — "Any channels inside?" / held names / "Channels unavailable · Retry"); `ChannelSheet` (per-parent bottom sheet, 250ms ease-snap, swipe-down/backdrop/Done all close, failed card + Retry; RN core Animated + PanResponder since no `GestureHandlerRootView` is mounted — JS-only, OTA-able); onboarding meta "Tick what you pay for. N selected." and "N services · M channels"; Profile → Streaming Services header subtitle, dirty-gated "Save changes", in-place "Saved" card naming added channels; Profile row "N services · M channels" + 4-badge stack, spend "· services only"; Where to Watch held rows "via Prime Video · a channel you hold", "I have this" pill (parent held, curated only) saving immediately with a top `Toast` + Undo; NOW/Prime/Apple descriptions; shared `heldChannelCount` + `registryRowForToken` with tests.
- Updated: wiki/registers/parking-lot.md (IN-SC-006 built), wiki/concepts/product/addon-channel-entitlements.md (limitations)

## [2026-09-15] query | IN-SC-006 closed; channel logos; onboarding step-2 Back
- **Direction B:** PR #178 merged, device check passed (Joe). IN-SC-006 closed.
- **Channel logos (Joe approved the download):** the 10 non-service channels got the TMDb/JustWatch provider images, same source as the 15 service logos — found through each channel's sample title in `/v1/tmdb/{type}/{id}/watch/providers` (GB). Downloaded from `image.tmdb.org` (332×332), resized to 200×200 RGBA into `src/assets/channels/<channel_id>.png` (~200 KB total): acorn_tv, bfi_player, curzon, hayu, itvx_premium (same art as ITVX), lionsgate_plus, mgm_plus, now_cinema, shudder, studiocanal. NOW Entertainment has no provider logo and reuses `now.png` (Joe). Five tiles carried a parent overlay — the "prime video | CHANNELS" band on Curzon, Lionsgate+, MGM+ and Shudder, the Apple TV mark on STUDIOCANAL — so they were cropped to the brand area and padded back to a square with their own background (no extra downloads; clean brand-only variants exist on TMDb only for Shudder and Curzon). `ChannelLogo` renders them in the channel sheet; an unbundled registry channel still falls back to the monogram.
- **Onboarding Back on step 2 was a redirect loop:** Back → `/auth` → session → `/` → (tabs) guard → not onboarded → `/onboarding`, draft restores step 2. Now a "Leave setup?" alert that signs out and returns to `/auth` (Joe's choice). Copy corrected from the proposal: `signOut` wipes the onboarding draft by design (it is not per-user), so the alert promises only that the account stays and setup can be finished on the next sign-in.
- Updated: wiki/registers/parking-lot.md (IN-SC-006 closed), docs/design/service-picker-direction-b.md (logos)

## [2026-09-15] query | channel follow-ups (087) and v2.4.0 prep
- **Decisions (Joe):** one migration **087** for the channel follow-ups; growth migrations renumber 085/086/087 → **088/089/090** (plan 2026-09-14-003, S1 handoff and growth-loops page updated; PR #172's `085_shared_rooms.sql` needs renaming in the growth track); fix IN-SC-005 now and let the 2 Oct Prime + Apple walk repopulate; held channels count in **both** search places; release **v2.4.0** to both stores.
- **IN-SC-005 measured:** 4 of 93 popular titles on two or more Prime channels (TMDb GB), none on Apple. 0 duplicates on the new key live.
- **Built:** 087 (RLS initplan; unique key + `addon_id`; `subscription_included_titles` + `p_channel_tokens`); per-channel dedup in `sync-content.ts` and `backfill-service-catalogue.ts`, channel-scoped addon deletes in `sync-incremental`; `TitleHitCard` best link + "Included" count held channels; semantic "Free" filter sends held tokens; CI now installs `native/` and runs its `tsc`; version 2.4.0 (iOS 12, Android 15); `docs/legal/store-privacy-disclosures.md` names channel selections (no form change: same declared category).
- **Order:** apply 087 → merge → redeploy `sync-incremental` → tag `v2.4.0` (TestFlight + Play internal) → Joe submits for App Store review.
- Updated: wiki/registers/parking-lot.md (IN-SC-005, IN-SC-007), wiki/concepts/product/addon-channel-entitlements.md, wiki/entities/codebase/migrations.md (087), wiki/concepts/operations/sync-pipeline.md, wiki/concepts/forward-planning/growth-loops.md (renumbered)

## [2026-09-15] query | 087 applied; v2.4.0 tagged
- **087 applied (Joe)** before #180 merged; verified live (index key includes `addon_id`, policy uses `(SELECT auth.uid())`, 3-arg `subscription_included_titles` only, 0 duplicates, drift 0, types match). Advisor no longer flags `user_service_addons` → IN-SC-007 closed. #180 CI all green, including the new native `tsc` step.
- **#180 merged** (`08bb233`); `sync-incremental` redeployed from that commit (per-channel addon deletes live).
- **v2.4.0** (iOS build 12, Android versionCode 15) tagged on `08bb233` and pushed → `ios-release.yml` (EAS → TestFlight) and `android-release.yml` (AAB → Play internal) started from the tag.
- **Android tag run failed before building** (run 34996078580, step *Set up Android SDK*): `android-actions/setup-android@v3` defaults to `packages: "tools platform-tools"` and the runner's cmdline-tools 16.0 has no `tools` package (`sdkmanager tools` → exit 1). Not a 2.4.0 code problem. Fixed in `android-release.yml` with `packages: 'platform-tools'`; because a tag run uses the tag's copy of the workflow, the Play upload is re-run by dispatching `android-release.yml` on `main` with `submit: true` after the fix merges (same versionCode 15).
- **Uploads done:** Android re-run on `main` after #181 merged (run 34996693718, `submit: true`) — AAB signed with the upload key (99:CE:FF:7E), submitted to **Play internal**. iOS tag run 34996078542 — EAS build 16:37–16:45 UTC, `eas submit --latest` to **TestFlight** succeeded at 17:47 UTC after a 62-minute wait on Apple processing (v2.3.1 took 1 min, v2.3.0 10 min; EAS status showed no incident — slow Apple processing, not a failure).
- Left for Joe: App Store review submission in App Store Connect with the 2.4.0 "What's New"; Play production stays gated on the 12-tester closed test. Store privacy forms need no change (channel selections fall under the declared service-selections row).
- Still open: IN-SC-005 closes after the 2 Oct Prime + Apple walk.
- Updated: wiki/entities/codebase/migrations.md (087 applied), wiki/registers/parking-lot.md (IN-SC-007 closed, IN-SC-005)
- **Filed:** IN-SC-005 (unique index / writer dedup drop a second channel on the same parent).
- **Flag:** the growth plan (docs/plans/2026-09-14-003) still assigns 086 to `handle_new_user`, and PR #172 carries `085_shared_rooms.sql` against main's 085 — both need renumbering in the growth track.
- New page: wiki/concepts/product/addon-channel-entitlements.md. Updated: index.md, wiki/entities/codebase/migrations.md (084/085 corrections, 086), wiki/concepts/operations/sync-pipeline.md, wiki/registers/parking-lot.md (IN-SC-004, IN-SC-005)
## [2026-09-14] ingest | Growth S1 links (ADR-015, migration 088)
- New page: wiki/concepts/decisions/adr-015-object-urls-and-inbound-links.md (object URLs Worker-owned on the web, Expo Router on device; `/t/`, `/room/`, `/list/` grammar; `via`/`src` contract; room snapshot rule; inbound mapping contract)
- New page: wiki/concepts/techniques/inbound-deep-linking.md (association files, intent filters, `+native-intent` mapper, pending link, stack base, room snapshots, journeys, gotchas)
- Updated: wiki/registers/open-questions.md (D5 trigger resolved), wiki/registers/parking-lot.md (IN-GR family opened, IN-GR-001..004), wiki/entities/codebase/migrations.md (088), wiki/concepts/forward-planning/growth-loops.md (status, routing position locked), index.md (ADR-014 line was missing, added with ADR-015; technique page; growth-loops line)
- Verified live before building: Vercel answers 404 at `/.well-known/*` and `/room/*` (routes needed); the Worker runs on cached `/t/` hits (`x-videx-cache: hit`), so no zone HTML cache rule; `onboarding_events` RLS rejects null-user inserts; production `delete_own_account` = 044 body and `export_user_data` = 061 body.
- Plan corrections: the native app has no anchored-room screen and no global-room surface (sharing lives on the For You room cards; IN-GR-003); `AnchorRoomPreview` carried 4 thumbnails only, so the For You payload gained `titleRefs`; `detail/[id]` and `room/[id]` are outside the tabs auth guard, so a signed-out recipient sees the object before `/auth`; `(tabs)/_layout.tsx` needed no change.
- Not done here: apply 088, dashboard routes, fingerprints (IN-GR-001), App Store flip (IN-GR-002), rebuilds, device checks (S5).
- Renumbered 2026-09-15 on rebase: 085–087 merged first (included-only services, channel entitlements, channel follow-ups), so `shared_rooms` is migration 088 and its `delete_own_account` / `export_user_data` bodies are rebuilt from 086 (production matched 086 on 2026-09-15).

## [2026-09-15] query | Growth S1 post-merge verification
- PR #172 merged (41e63c4) and deployed (Deploy API Worker run 35004200254, success). Joe applied 088 and added the four dashboard routes.
- 088 verified live: `shared_rooms` + index, RLS on, 0 policies, no anon/authenticated grants, 0 rows; `delete_own_account` / `export_user_data` cover `shared_rooms` and still cover `user_service_addons`.
- Live curls on videxstreaming.com:
  - `/.well-known/apple-app-site-association` 200 `application/json`, exact AASA; Apple CDN (`app-site-association.cdn-apple.com/a/v1/videxstreaming.com`) 200.
  - `/.well-known/assetlinks.json` 200 `application/json`, `sha256_cert_fingerprints: []` (IN-GR-001 still open).
  - `/t/movie/550?via=share` → 301 `/t/movie/550-fight-club-1999?via=share`; page has the slugged canonical, smart banner, `videx://detail/movie-550?via=share`.
  - `/list/x` 404 noindex; unknown `/room/{uuid}` 404 "Room not found" noindex; `/v1/room/{uuid}` JSON 404; `POST /v1/share/room` without a token 401; `/delete-account` 200.
- Found: titles cached before the deploy (e.g. `/t/movie/603`) still served the pre-slug page from the same cache key, until their 24h TTL. Follow-up PR adds `PAGE_CACHE_VERSION` to page cache keys and regenerates `database.types.ts` for 088 (typegen-check would otherwise fail on the next migration PR).
- Updated: wiki/entities/codebase/migrations.md (088 applied), wiki/concepts/forward-planning/growth-loops.md (status), wiki/registers/parking-lot.md (IN-GR-001 note), wiki/concepts/techniques/inbound-deep-linking.md (cache-version gotcha)

## [2026-09-15] query | Growth S1 closed: summary written, IN-GR-001 closed
- Summary: docs/v2/phase-summaries/phase-growth-s1-summary.md (what shipped across #172, #183, #184; live verification; plan corrections; notes for the S2–S5 handoffs). Not snapshotted into raw/ (human-owned).
- IN-GR-001 closed: Play App Signing uses the same key as the upload key (Joe checked Play Console); the live `assetlinks.json` and Google's Digital Asset Links API return the one fingerprint.
- Rebuilds held until the other growth streams finish (Joe), so universal/app links are not active on devices yet; device checks move to S5.
- Updated: wiki/registers/parking-lot.md (IN-GR-001 ✅, counts), wiki/concepts/forward-planning/growth-loops.md (status)

## [2026-09-15] query | Growth S1 reviewed in the strategy thread; S2/S3 handoffs written
- S1 summary reconciled into the plan (§11a): migrations renumbered 088/089/090; room sharing on For You cards only (IN-GR-003); no sign-in guard on detail/room screens; cold-start stack change (IN-GR-004); PAGE_CACHE_VERSION; §10 facts answered.
- New: docs/plans/2026-09-15-001-handoffs-growth-s2-s3.md (parallel sessions with file ownership; IN-GR-005..009 reserved for S2, IN-GR-010..014 for S3; S2 adds the object to the Play referrer for an Android deferred deep link; S3 files the Apple token-revocation gap as IN-GR-010).
- Updated: wiki/concepts/forward-planning/growth-loops.md (updated date, ADR-015 heading, Shipped section)

## [2026-09-15] ingest | Growth S2 attribution (migration 090, growth_events)
- Built on feat/growth-s2-attribution: `growth_events` (090: RLS on, no policies, 12-month pg_cron retention at 03:30 UTC, `delete_own_account` / `export_user_data` rebuilt from 088 with the caller's rows and every row of any install the caller used; export v1.3); Worker `POST /v1/growth/events` (validated against the shared contract `src/lib/growth/growthEvents.ts`, optional JWT sets user_id, `GROWTH_RATELIMIT` 60/60s on install id else IP) and `preview_fetched` / `preview_opened` from the `/t/` and `/room/` handlers via `waitUntil` (`uaClass.ts`); Play referrer now carries `t=` / `r=`.
- App: install id (`native/src/installId.ts`, MMKV `videx`), first touch (`native/src/attribution.ts`), `link_opened` from `+native-intent`, `first_open` from RootLayout, `signup_completed` + `first_home_view.via/src` from `curating.tsx`. Android Play Install Referrer as a local Expo module (`native/modules/play-install-referrer`), not `react-native-play-install-referrer` (legacy-bridge Java module); a referrer naming an object becomes the pending link.
- Verified before writing: production `delete_own_account` / `export_user_data` still 088's (shared_rooms yes, growth_events no); `growth_events` absent; 03:30 UTC free in `cron.job`; sign-out removes named MMKV keys only (install id survives).
- Updated: wiki/entities/codebase/event-taxonomy.md (growth_events section, first_home_view via/src), wiki/entities/codebase/migrations.md (090), wiki/concepts/forward-planning/growth-loops.md (status), wiki/registers/parking-lot.md (IN-GR-005..009)
- Plan corrections: Apple label should be *Linked to You* (signup rows carry user_id), Play also needs *Device or other IDs* for an app-level id; deletion must reach pre-sign-up install rows; existing installs updating would each send a `first_open` (flagged `prior_install`).
- Not done here: apply 090 + typegen (Joe), Worker deploy on merge, post-deploy curl/select checks, store forms, Kotlin compile (first CI Android build), device checks (S5).

## [2026-09-16] query | Growth S2 reviewed in the strategy thread; S3 status; S4 handoff written
- S2 summary reconciled into the plan (§11b): store labels corrected (Apple Linked to You; Play Device or other IDs), deletion by install id (IN-GR-009), prior_install heuristic (IN-GR-006), local Install Referrer module uncompiled (IN-GR-005).
- S3 recorded as draft PR #187, conflicting with main after S2; blocked on Joe (089, providers, Google clients, env vars). Decisions IN-GR-010/011 with recommendations in plan §9d (Confirm email on before providers; build Apple token revocation in S3 once the key exists); IN-GR-012/013/014 assigned to S3.
- New: docs/plans/2026-09-16-001-handoff-growth-s4-sharing.md (share copy with the availability line, share events, notification delivery_id + notification_opened, session origin + "Tell someone", dashboard switch; runs in parallel with S3's finish; IN-GR-015..019 reserved).
- Updated: wiki/concepts/forward-planning/growth-loops.md (status, Shipped: S2, S3, S4 lines)

## [2026-09-15] ingest | Growth S3 sign-in (PR #187)
- Hosted Supabase Auth checked via `GET /auth/v1/settings`: email on, Apple off, Google off, `mailer_autoconfirm` true; `auth.identities` email only.
- Built: Apple (iOS) + Google sign-in via `signInWithIdToken`; migration 089 (placeholder username + `username_chosen`, not applied); `/choose-username`; onboarding skips the account step for a signed-in person and sends an already-onboarded provider account out of onboarding; `useCompleteOnboarding` no longer overwrites `profiles.username` with the email prefix (would have broken provider sign-ups on a UNIQUE clash).
- Plan corrections: Google on iOS needs Supabase "Skip nonce check"; Apple's black button is not allowed on a dark UI (WHITE used); the prompt is a full-screen step, not a modal (reached by replace, nothing beneath); the prompt runs before Curating, not only from the tabs guard, so the pending link still resumes; the app displays `user_metadata.username`, not `profiles.username`; `expo prebuild --platform ios` does not run on Windows (entitlement evidence taken from `expo config --type introspect`).
- New register rows: IN-GR-010 (Apple token revocation, decision), IN-GR-011 (auto-linking with Confirm email off, decision), IN-GR-012 (pending link consumed early on `/auth` provider sign-up), IN-GR-013 (Profile username edit skips `profiles`), IN-GR-014 (policy text).
- Updated: wiki/registers/parking-lot.md, wiki/entities/codebase/migrations.md (089), wiki/concepts/product/privacy-and-gdpr.md (sign-in providers), wiki/concepts/forward-planning/growth-loops.md (status, Shipped)

## [2026-09-16] ingest | Growth S3 follow-ups (IN-GR-010..014)
- Built in the S3 thread after #187 merged (branch feat/growth-s3-followups).
- IN-GR-011: Step 1 "Check your email" + `ResendConfirmation`; `AuthScreen` handles `email_not_confirmed`; Worker `/reset` bridge accepts `type=email|signup` → `videx://confirm-email` (new `confirm-email.tsx`, `verifyOtp`); `inboundLink` passes it through.
- IN-GR-012: `app/auth.tsx` consumes the pending link only once onboarding is known complete.
- IN-GR-013: `ProfileAccount.tsx` writes `profiles.username` then `user_metadata`.
- IN-GR-010: `supabase/functions/revoke-apple-token` + `_shared/appleClientSecret.ts` (ES256 client secret, Web Crypto; vitest now includes `supabase/functions/_shared/__tests__`); `deleteAccount` re-authorises with Apple on iOS first.
- IN-GR-014: privacy policy §2 "Sign-in details", §6 username wording; in-app mirror re-synced (it lacked S2's attribution paragraph).
- New: IN-GR-020 (Android cannot revoke), IN-GR-021 (confirmation link on another device), IN-GR-022 (pre-existing `deno check` errors in `_shared/userScope.ts`).
- Updated: wiki/registers/parking-lot.md, wiki/concepts/operations/auth-email-smtp.md (Confirm signup template), wiki/concepts/product/privacy-and-gdpr.md, wiki/concepts/forward-planning/growth-loops.md; docs/v2/launch/release-runbook.md steps 6–7

## [2026-09-16] query | Growth S3 reviewed in the strategy thread; S4 handoff updated
- S3 reconciled into the plan (§11c): full-screen name step, white Apple button, revocation by re-authorisation (no storage), Confirm email off until the rebuild reaches testers (S5 sequencing: rebuild → testers update → flip → provider checks), in-app policy mirror drift fixed.
- S4 handoff header and ownership rewritten: no parallel session; main carries S1–S3; IN-GR-023..027 reserved for S4 (015–019 unused).
- Recommendation recorded: run android-release.yml build-only now to compile S2's Kotlin referrer module (IN-GR-005) before S5.
- Updated: wiki/concepts/forward-planning/growth-loops.md (status, Shipped: S3 line)

## [2026-09-16] ingest | Growth S4 sharing (feat/growth-s4-sharing)
- Built: share copy with the UK availability line (`src/lib/growth/shareCopy.ts`), shared service labels (`serviceLabels.ts`, Worker re-exports), `neutraliseRoomLabel` moved to `roomSnapshot.ts`; `ShareButton` emits `share_initiated` / `share_completed` with surface, moment, to_surface and platform_reports_completion; `?via=share` and `&src=push` on shared URLs; `sessionOrigin.ts` + `useSessionOrigin`; "Tell someone" button state and `TellSomeoneBanner` on the detail page; `send-notifications/compose.ts` with `delivery_id`, `via`, `service_id`, `expires_on` (vitest, `deno check`); `notification_opened` once per tap; `growth-dashboard.sql` §1 on `share_initiated`, §6a–d; `metrics-dashboard.sql` growth pointer.
- Plan corrections: the handoff's rent-or-buy example ("Apple TV and Prime") does not match the Worker labels the copy must use ("Apple TV+ and Prime Video"); `notification_opened` had no metadata field in the `GrowthEvent` union (added); an arrival-led push can claim leaving-soon rows under one ticket, so "single-title" is judged by the lead group, not row count; a room card cannot send `share_initiated` before its snapshot exists.
- New register rows: IN-GR-023..027.
- Updated: wiki/entities/codebase/event-taxonomy.md, wiki/concepts/architecture/notifications-v1.md, wiki/concepts/forward-planning/growth-loops.md, wiki/registers/parking-lot.md; docs/strategy/briefs/h0-device-test-checklist.md (S4-1..11)

## [2026-09-16] ingest | Growth S4 close-out (merged and deployed)
- PR #192 merged (`adf2882`); CI Build, Typecheck and Deploy API Worker green; `/t/tv/95396` still 301s to the slugged URL and lists Apple TV+ under "Stream now" (moved label map live).
- `send-notifications` deployed by Joe: version 8, active, `verify_jwt` true, deployed `index.ts` + `compose.ts` match the merge; unauthenticated POST 401.
- New: docs/v2/phase-summaries/phase-growth-s4-summary.md (for the strategy thread: what shipped, query shapes, plan corrections, S5 notes).
- Noted: Android Release run on `386e26a` succeeded (first compile of the S2 referrer module, IN-GR-005); "Pipeline health" workflow failing since 15 Sept, unrelated to S4.
- Updated: wiki/concepts/forward-planning/growth-loops.md (status), wiki/concepts/architecture/notifications-v1.md (deploy recorded), wiki/registers/parking-lot.md (counts)

## [2026-09-16] query | Growth S4 reviewed in the strategy thread; build phase closed; S5 handoff written
- S4 reconciled into the plan (§11d): labels shared with the Worker, lead-title rule for push payloads, room-card event after the snapshot, replay mitigation (IN-GR-027), banner placement.
- IN-GR-005: compile proven by the 16 Sept build-only Android run (35105642503); runtime moves to S5 check B3. Register row updated.
- New: docs/plans/2026-09-16-002-handoff-growth-s5-verification.md (Joe's pre-steps: 2.5.0 bump, production + preview iOS builds, Android with submit, testers update, Confirm email flip, store forms; matrix A links / B attribution / C sign-in / D sharing and push; register cleanup; phase summary; strategy doc v0.2 draft; G2 readiness view).
- Noted, unrelated: "Pipeline health" workflow failing since 2026-09-15.
- Updated: wiki/concepts/forward-planning/growth-loops.md (status: build complete, unverified; Shipped: S4 + build-phase lines)

## [2026-09-16] ingest | IN-SY-002 — pipeline-health `gap-not-growing` false alarm (fix/pipeline-health-stale-gap)
- Cause: the check compared the whole titles gap with a 7-day baseline, but the 06:00 sync's new titles wait for the next 05:00 backfill, so the 09:00–14:00 check always counted them. 15 Sept (2,323 vs 31) and 16 Sept (39 vs 31) were false alarms; 11–14 Sept were real (IN-SY-001 walks).
- Verified the age signal before building on it: every `streaming_availability` writer (sync-incremental, sync-content.ts, backfill-service-catalogue.ts) deletes and re-inserts, so `created_at` is "last rewritten". Kept it: the reset only moves time forward (can undercount, never overcount; 207 of 77,179 titles had min(created_at) in the last 24h). Rejected `sa_show_map.first_seen_at` and `streaming_history`: 25 of the 16 Sept 39 were removed 13 Sept and re-added that morning, so both would have called them stale.
- New: `supabase/migrations/091_count_stale_missing_title_ids.sql` (178ms EXPLAIN ANALYZE on production; verification SQL in header), `database.types.ts` entry.
- Changed: `scripts/health/pipeline-health.ts` check 4 judges the stale gap (growth vs oldest `detail.stale_gap` in 7 days; ceiling 2,500 = one full chain's titles); detail reports arrivals; heartbeat writes `stale_gap` next to `gap`; a missing RPC fails the check and names migration 091.
- Dry run 2026-09-16 15:29 UTC, before apply: 11/12, `gap-not-growing` FAIL "count_stale_missing_title_ids() does not exist — apply supabase/migrations/091_count_stale_missing_title_ids.sql in Studio", exit 1.
- Joe: apply 091 in Studio, merge, then `gh workflow run "Pipeline health"`. The workflow stays red until both land.
- Updated: wiki/concepts/operations/sync-pipeline.md (monitoring section), wiki/concepts/operations/risks-register.md (R-010), wiki/registers/parking-lot.md (IN-SY-002, counts), wiki/entities/codebase/migrations.md (091)

## [2026-09-16] ingest | IN-SY-002 close-out (docs/in-sy-002-closeout)
- Joe applied migration 091 in Studio; the header's verification SQL passed.
- PR #198 merged (`f5968be`). It had no conflicts; it was held only by typegen-check, which had run before the apply and passed on re-run.
- Manual `Pipeline health` run https://github.com/kingbalouuOG/streaming-aggregator-v2/actions/runs/35132581820: 12/12 green; `gap-not-growing` reported `stale gap 0 (no baseline within 7d yet; limit 2500); today's arrivals awaiting backfill: 39`. Heartbeat 18:09 UTC wrote `gap: 39`, `stale_gap: 0` (the first stale-gap baseline).
- Updated: wiki/registers/parking-lot.md (IN-SY-002 closed, counts), wiki/entities/codebase/migrations.md (091 applied), wiki/concepts/operations/risks-register.md (R-010)

## [2026-09-17] ingest | IN-GR-032 custom Sign in with Apple button (fix/apple-button-custom)
- PR #200: the system `AppleAuthenticationButton` in `native/src/components/auth/ProviderSignIn.tsx` replaced with a custom `Pressable` to Apple's HIG custom-button rules (logo file from Apple Design Resources, unaltered; title wording; 43% title-to-height proportion; white style; 12pt radius; minimum size and margins; no smaller than Google). Rules recorded in the component's comment block.
- Decision (Joe): both provider buttons 44pt with 19pt labels; the planned 56pt/18pt breaks the HIG proportion rule (App Review evaluates custom Apple buttons).
- Device gotcha: NativeWind's native `inlineRem` is 14, so `h-11` = 38.5pt (the 44pt logo overhung the button) and `h-14` = 49pt, not the 56pt older comments assume. Fixed with `h-[44px]`.
- Verified: native tsc + lint, root vitest 798/798; OTA to preview/ios (runs 35207493746, 35210155629) passed reachability; device check passed on Joe's iPhone (sign-in screen and onboarding Step 1).
- Updated: wiki/registers/parking-lot.md (IN-GR-032 closed, counts)

## [2026-09-17] ingest | Growth S5 device verification: G0/G1 verified on iPhone and Android
- Ran matrix A to D on 2.5.0 (iPhone ad-hoc, Android Play internal) with Joe; evidence from growth_events, notification_deliveries, auth and edge logs, adb; snapshot at docs/v2/phase-summaries/evidence/growth-s5-growth-events.md (C5 deletion removed the iPhone install's rows, IN-GR-009).
- New: docs/v2/phase-summaries/phase-growth-g0-g1-summary.md (S1 to S5, matrix results, defects, plan corrections, measures, Joe's remaining steps, G2 readiness).
- New: docs/plans/2026-09-17-001-handoff-apple-button-custom.md (IN-GR-032, since closed in PR #200), docs/plans/2026-09-17-002-handoff-notification-prompt-after-onboarding.md (IN-GR-034).
- Fixes: PR #196 App Store CTA live (IN-GR-002); PR #201 Play App Signing key in assetlinks.json (IN-GR-001 reopened: Play signs with a Google key, not the upload key) plus Joe's Google Android OAuth client; PR #197 IN-GR-028 (signed-out watchlist writes; replace, not push, to /auth), IN-GR-030/031 (delete dialog), IN-GR-033 (passive Sign In), OTA'd to the iPhone preview channel.
- Updated: wiki/registers/parking-lot.md (001 reopened and fixed; 002, 004, 005, 012, 027 closed; 009 seen in practice; 021 note; +028..034), wiki/concepts/forward-planning/growth-loops.md (status: G0/G1 verified on device; S5 shipped line), wiki/concepts/techniques/inbound-deep-linking.md (two signing keys, Google OAuth SHA-1, asset links cache, replace-to-auth gotcha, verified list), wiki/concepts/architecture/notifications-v1.md (consent change IN-GR-034, device-verified block, cap-clearing test technique), wiki/entities/codebase/event-taxonomy.md (verified notes), wiki/registers/next-steps.md (growth track block).
- Process notes: first iOS build after new entitlements needs a local interactive EAS credentials pass; Confirm email flip moves to the public 2.5.0 release because 2.4.0 is live on the App Store.
- Strategy doc v0.2 drafted at docs/strategy/Videx_Growth_Loops_Strategy_v0.2.md for Joe's approval; not snapshotted into raw/.

## [2026-09-17] query | Growth S5 reviewed in the strategy thread; G0/G1 phase closed
- S5 reconciled into the plan (§11e): matrix coverage vs §7, three standing rules (both Android keys; interactive eas build after entitlement changes; deletion last on a separate install), code review of #197 approved with two notes (IN-GR-035 initializing guard folded into the IN-GR-034 handoff step 8; delete → /auth notice races the tabs guard).
- Strategy v0.2: two edits applied (§4 Loop 1 URL grammar; §6 release-together decision); status stays "draft for Joe's approval" until Joe says so, then v0.1 gets the superseded header and v0.2 is snapshotted into raw/ (human-owned).
- Next: release steps (Joe), IN-GR-034 session, then G2 households planning from the summary's readiness view.

## [2026-09-17] ingest | Videx_Growth_Loops_Strategy_v0.2_2026-09.md (approved by Joe)
- Raw snapshot created on Joe's approval (raw/forward-planning/Videx_Growth_Loops_Strategy_v0.2_2026-09.md); v0.1 marked superseded in docs/strategy.
- Updated: wiki/sources/growth-loops-strategy-v0-1.md (now covers v0.1 → v0.2), index.md (source + concept lines)
- Roadmap v1.1 gained §7a "Status pass 2026-09-17" (App Store live, Support URL, G-phases as the third H1 track, 2.5.0 release steps, IN-GR-034, code sweep); wiki/sources/strategy-roadmap-2026-09-v1-1.md mirrors it. The raw/ copy of the roadmap is Joe's to refresh.
- New handoff: docs/plans/2026-09-17-003-handoff-growth-code-sweep.md (review-then-fix sweep of the G0/G1 surface, after the IN-GR-034 session).

## [2026-09-17] query | Growth G0/G1 code sweep (chore/growth-code-sweep)
- Nine reviews over the growth diff (security, data integrity, TypeScript, races, five finder angles). Fixed: export/delete cross-account install-id sweep (migration 092), /list links routed to a missing screen and pended, username check error read as "taken", username_available self-exclusion (092), provider sign-in dismissAll skipping the link resume, confirm-email late success, IN-GR-035, sign-out after delete, delete dialog Back/double-start, referrer timeout, install id CSPRNG, unbounded page-view inserts, install-id rate-limit bypass (new GROWTH_IP_RATELIMIT), body read before length, nested metadata, orphaned-token FK 500, share cap, duplicate room snapshots, push-open ordering, bridge copy, plus reuse/duplication cleanups.
- Filed IN-GR-036..045; closed IN-GR-008, 035; IN-GR-009 scope corrected.
- Updated: wiki/registers/parking-lot.md, wiki/entities/codebase/migrations.md (092), plan §11f, both 17 Sept handoffs. Summary: docs/v2/phase-summaries/phase-growth-code-sweep-summary.md.
- Note: 091 was already taken by the IN-SY-002 pipeline-health fix (applied 16 Sept), so the sweep migration is 092; the pipeline-health failures flagged on 16 Sept were that false alarm, since fixed.

## [2026-09-17] query | Migration 092 applied and verified; sweep PR #203 merged
- Live checks: `username_available` self-excludes (`IS DISTINCT FROM auth.uid()`), `export_user_data` and `delete_own_account` scope the install-id join to `user_id IS NULL`, explicit deletes present, SECURITY DEFINER on all three, grants intact. One test install is still shared by two accounts; its identified rows are now protected either way.
- Updated: wiki/entities/codebase/migrations.md (092 applied).

## [2026-09-17] query | IN-GR-036 and 042 closed on Joe's decision; release versions bumped
- deleteAccount: a failed Apple revoke is reported (console + Sentry warning) and deletion goes ahead; a closed Apple sheet still cancels. Rationale: erasure must not depend on Apple or the Edge Function; a token that could not be revoked cannot be revoked later without the user anyway.
- wrangler.toml: [observability.logs] invocation_logs = false (the /reset token_hash travels in the URL).
- native/app.json: 2.5.0 build 14 / versionCode 17 for the release binaries (16 went to Play internal in S5).

## [2026-09-17] query | G2 household loop planned in the strategy thread
- Four audits over the live tree. Findings that shape the plan: the personal `watchlist` table has no DDL or RLS in the repo; `withUserScope` forbids cross-user reads by construction; `profiles` is owner-readable only (no display name); the push cap is global and the delivery ledger cannot key a nudge; `/list/:id` is a 404 stub with no preview telemetry; the pending-link writer does not skip list objects despite the parser's comment (made deliberate in H3); the Play referrer has no list key; a "For both of you" row needs no new RPC (G5).
- Plan: docs/plans/2026-09-17-004-feat-phase-g2-household-loop-plan.md (audit, architecture, sessions H1–H5, migrations 093/094, tests, risks, 15 decisions for Joe). Registers untouched until decisions land.
- Updated: wiki/concepts/forward-planning/growth-loops.md (status + G2 note).
