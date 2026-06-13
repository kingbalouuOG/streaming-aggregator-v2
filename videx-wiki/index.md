# Index

Catalog of every page in this wiki. One line per page, grouped by category. Maintained by the LLM, see [AGENTS.md](AGENTS.md).

## Registers (at-a-glance)

- [Parking lot](wiki/registers/parking-lot.md) — Every IN-XXX entry with status.
- [Open questions](wiki/registers/open-questions.md) — Things to validate, from strategy + per-phase + risks.
- [Pre-launch blockers](wiki/registers/pre-launch-blockers.md) — What must happen before public launch.
- [Deferred items](wiki/registers/deferred-items.md) — What's parked and the trigger to revisit.
- [Acceptance gates](wiki/registers/acceptance-gates.md) — Every numerical threshold in one place.
- [Next steps](wiki/registers/next-steps.md) — E&P track: REPO-1 close-out → PLAT-1/2/3 → launch → ENG-2.
- [Cheatsheet](wiki/registers/cheatsheet.md) — Phases ↔ branches ↔ migrations ↔ features.
- [Registers index](wiki/registers/README.md) — This category.

## Entities

### APIs

- [TMDb](wiki/entities/apis/tmdb.md) — Primary content metadata, search, discover, watch-provider availability.
- [OMDB](wiki/entities/apis/omdb.md) — IMDb + Rotten Tomatoes ratings; gates Critically Acclaimed Home row.
- [Streaming Availability API](wiki/entities/apis/streaming-availability-api.md) — JustWatch-derived deep links and rent/buy pricing.

### Streaming services

- [UK streaming services (10 supported)](wiki/entities/streaming-services/uk-services.md) — Per-service TMDb/SA IDs, deep link strategy, pricing tiers, gaps.

### Infrastructure

- [Supabase](wiki/entities/infrastructure/supabase.md) — Postgres, Edge Functions, auth, cron, backups.
- [Capacitor](wiki/entities/infrastructure/capacitor.md) — Android wrapper, plugins, deep linking, build.
- [Postgres extensions (pgvector, pg_partman, pg_cron, pg_net)](wiki/entities/infrastructure/pgvector-pg_partman-pg_cron.md) — pgvector + HNSW, partitioning, native cron.
- [RapidAPI](wiki/entities/infrastructure/rapidapi.md) — SA API marketplace, auth, quotas, failure modes.
- [GitHub Actions](wiki/entities/infrastructure/github-actions.md) — CI workflows + monthly mood-room recluster.

### Codebase

- [Database Schema (Supabase)](wiki/entities/codebase/database-schema.md) — Snapshot of tables, extensions, triggers, RLS as of migration 032.
- [Migration Changelog](wiki/entities/codebase/migrations.md) — Every applied migration (gap at 021 intentional).
- [Supabase RPC Catalogue](wiki/entities/codebase/rpcs.md) — Every callable Supabase function.
- [Module Map (src/)](wiki/entities/codebase/module-map.md) — Annotated `src/` tree plus runtime stack.
- [Component Inventory](wiki/entities/codebase/components.md) — Every React component grouped by role.
- [Hook Inventory](wiki/entities/codebase/hooks.md) — One row per `useX` hook.
- [Event Taxonomy](wiki/entities/codebase/event-taxonomy.md) — Every emitted event, destination table, payload.

## Concepts

### Glossary

- [Glossary](wiki/concepts/glossary.md) — Acronyms, internal naming, recurring terms.

### Architecture

- [Two-surface architecture](wiki/concepts/architecture/two-surface-architecture.md) — Home (discovery) and For You (personalised) split.
- [Home surface](wiki/concepts/architecture/home-surface.md) — Recency-led, lightly personalised, max 7-9 rows.
- [For You surface](wiki/concepts/architecture/for-you-surface.md) — Heavy personalisation, sliders, mood rooms, max 7-8 rows.
- [Recommendation pipeline](wiki/concepts/architecture/recommendation-pipeline.md) — Multi-stage retrieval → ranking → row selection → ordering.
- [User taste vector v2](wiki/concepts/architecture/taste-vector.md) — 1536D weighted aggregate, decay, confidence floor, hybrid update.
- [Service fingerprints](wiki/concepts/architecture/service-fingerprints.md) — Per-service centroids for cold-start service-bias.
- [Mood Rooms](wiki/concepts/architecture/mood-rooms.md) — UMAP+HDBSCAN clustering, monthly cron, two-pass LLM labelling.
- [Sliders](wiki/concepts/architecture/sliders.md) — Four delivery sliders, Option C dual-access.
- [Onboarding flow](wiki/concepts/architecture/onboarding-flow.md) — 5 steps, ~90s target.
- [Cold-start strategy](wiki/concepts/architecture/cold-start.md) — Service fingerprints + watched-grid + genre, dynamic 4-band weights.
- [Signal architecture](wiki/concepts/architecture/signal-architecture.md) — Explicit and silent signals, interpretation matrix, impression batcher.
- [Lifecycle manager](wiki/concepts/architecture/lifecycle-manager.md) — Capacitor `appStateChange` centralisation, deep-link expected-background window.

### Techniques

- [Embeddings (text-embedding-3-small)](wiki/concepts/techniques/embeddings.md) — OpenAI 1536D, locked template, HNSW, wire format.
- [HDBSCAN (UMAP + density-based clustering)](wiki/concepts/techniques/hdbscan.md) — Pure HDBSCAN failed; UMAP+HDBSCAN ships.
- [RLS pattern](wiki/concepts/techniques/rls-pattern.md) — Three roles, partition RLS via event trigger.

### Domain

- [JustWatch as upstream source](wiki/concepts/domain/justwatch.md) — Transitive dependence; iPlayer / Sky Go gaps are upstream.
- [UK streaming market overview](wiki/concepts/domain/uk-streaming-market.md) — Subscription landscape, pricing pressure, FAST.

### Decisions (ADRs)

- [ADR-001 — WatchMode replaced by Streaming Availability API](wiki/concepts/decisions/adr-001-watchmode-replaced-by-sa-api.md)
- [ADR-002 — Two-surface architecture (Home + For You)](wiki/concepts/decisions/adr-002-two-surface-architecture.md)
- [ADR-003 — Supabase Free → Pro tier](wiki/concepts/decisions/adr-003-supabase-pro.md)
- [ADR-004 — 24D archetype vector replaced by 1536D embedding](wiki/concepts/decisions/adr-004-1536d-embeddings.md)
- [ADR-005 — HDBSCAN runs in Python + GitHub Actions](wiki/concepts/decisions/adr-005-hdbscan-python-github-actions.md)
- [ADR-006 — `card_impressions` is a dedicated partitioned table](wiki/concepts/decisions/adr-006-card-impressions-dedicated-table.md)
- [ADR-007 — v1 archived as Git tag, not run in parallel](wiki/concepts/decisions/adr-007-v1-archived-as-tag.md)
- [ADR-008 — Static genre mapping retained over `title_genres`](wiki/concepts/decisions/adr-008-static-genre-mapping.md)
- [ADR-009 — `dismiss` event renamed to `not_interested`](wiki/concepts/decisions/adr-009-not-interested-rename.md)
- [ADR-010 — pg_partman + monthly partitions for `card_impressions`](wiki/concepts/decisions/adr-010-pg-partman-card-impressions.md)
- [ADR-011 — Edge Function shared modules duplicated into `_shared/`](wiki/concepts/decisions/adr-011-edge-function-shared-modules.md)
- [ADR-012 — Server-side For You render via `render-foryou-rows`](wiki/concepts/decisions/adr-012-server-side-foryou-render.md)
- [ADR-013 — Cluster-dominant bootstrap weights](wiki/concepts/decisions/adr-013-cluster-dominant-bootstrap-weights.md)

### Operations

- [Phase history](wiki/concepts/operations/phase-history.md) — Compressed timeline.
- [Phase 0 — Instrumentation](wiki/concepts/operations/phase-0.md)
- [Phase 0.5 — First-party content enrichment](wiki/concepts/operations/phase-0-5.md)
- [Phase 1 — Content embeddings](wiki/concepts/operations/phase-1.md)
- [Phase 2 — Service fingerprints](wiki/concepts/operations/phase-2.md)
- [Phase 2.5 — TMDb watch/providers backfill](wiki/concepts/operations/phase-2-5.md)
- [Phase 2.6 — Fingerprint signal refinement](wiki/concepts/operations/phase-2-6.md)
- [Phase 3 — User taste vector v2 + hook rewrites](wiki/concepts/operations/phase-3.md)
- [Phase 4 — Ranking pipeline & row composition](wiki/concepts/operations/phase-4.md)
- [Phase 5 — Contextual signals, MMR, pre-launch hardening](wiki/concepts/operations/phase-5.md)
- [Phase 5.5 — Quality, legal & catalogue hardening](wiki/concepts/operations/phase-5-5.md)
- [Phase Search V2 — Filtered + semantic search](wiki/concepts/operations/phase-search-v2.md)
- [Phase ENG-1 — Multi-interest retrieval & signal quality](wiki/concepts/operations/phase-eng-1.md)
- [Phase REPO-1 — Documentation & repo hygiene](wiki/concepts/operations/phase-repo-1.md)
- [Phase NATIVE-1 — React Native shell bootstrap](wiki/concepts/operations/phase-native-1.md) — Capacitor → RN migration phase 1: Expo shell, shared engine tree via junction, device evidence.
- [Phase NATIVE-2 — Design fidelity + core loop](wiki/concepts/operations/phase-native-2.md) — RN migration phase 2: Videx typography, Home parity, Detail + deep links, auth, Watchlist/Browse/For You.
- [Phase NATIVE-3 — Onboarding + real service prefs](wiki/concepts/operations/phase-native-3.md) — RN migration phase 3: 5-step onboarding (account→services→watched→clusters→sliders), taste bootstrap, retires DEV_SERVICES.
- [Sync pipeline runbook](wiki/concepts/operations/sync-pipeline.md)
- [Embedding backfill runbook](wiki/concepts/operations/embedding-backfill.md)
- [Edge Function deployment runbook](wiki/concepts/operations/edge-function-deployment.md)
- [Monthly mood room recluster runbook](wiki/concepts/operations/monthly-mood-room-recluster.md)
- [APK build and install runbook](wiki/concepts/operations/apk-build-and-install.md)
- [Service-role JWT rotation runbook](wiki/concepts/operations/service-role-jwt-rotation.md)
- [Supabase backup and restore runbook](wiki/concepts/operations/supabase-backup-restore.md)
- [Supabase migration workflow runbook](wiki/concepts/operations/supabase-migration-workflow.md)
- [Risks register](wiki/concepts/operations/risks-register.md)
- [Evaluation harness reference](wiki/concepts/operations/eval-harness.md)
- [Strategy version log](wiki/concepts/operations/strategy-version-log.md)
- [Solution: Authenticated role missing RLS policy](wiki/concepts/operations/solutions/authenticated-role-missing-rls.md)
- [Solution: SA API UK service coverage gaps](wiki/concepts/operations/solutions/sa-api-uk-service-coverage-gaps.md)
- [Solution: Supabase Security Advisor accepted warnings](wiki/concepts/operations/solutions/supabase-advisor-accepted-warnings.md)
- [Solution: Client-side cache never written (dead code)](wiki/concepts/operations/solutions/supabase-content-cache-dead-code.md)
- [Solution: Numeric 0 rendered as text under `&&` guard](wiki/concepts/operations/solutions/react-numeric-falsy-renders-zero.md)

### Evaluations

- [Phase 1 — Cluster coherence evaluation](wiki/concepts/evaluations/phase-1-cluster-eval.md)
- [Phase 1 — pgvector wire format spike (IN-203)](wiki/concepts/evaluations/phase-1-wire-format-spike.md)
- [Phase 2 / 2.5 — Service discrimination evaluation](wiki/concepts/evaluations/phase-2-service-discrimination-eval.md)
- [Phase 2.6 — Fingerprint variant decision](wiki/concepts/evaluations/phase-2-6-decision.md)
- [Phase 2.6 — Bottom-half variance eval](wiki/concepts/evaluations/phase-2-6-variance-eval.md)

### Product

- [Mission and pitch](wiki/concepts/product/mission-and-pitch.md)
- [User personas](wiki/concepts/product/user-personas.md)
- [Privacy and GDPR](wiki/concepts/product/privacy-and-gdpr.md)
- [Tone and voice guide](wiki/concepts/product/tone-and-voice-guide.md)
- [Accessibility checklist](wiki/concepts/product/accessibility-checklist.md)
- [Motion animation patterns](wiki/concepts/product/motion-animation-patterns.md)
- [Tailwind v4 conventions](wiki/concepts/product/tailwind-v4-conventions.md)

### Forward planning

- [Monetisation strategy exploration v0.1](wiki/concepts/forward-planning/monetisation-strategy.md) — exploratory.
- [V3 Conversational Discovery & Semantic Search Strategy v0.1](wiki/concepts/forward-planning/v3-conversational-discovery.md) — exploratory.

## Sources

- [Glossary](wiki/sources/glossary.md) — `raw/reference/glossary.md`.
- [Codebase Snapshots](wiki/sources/codebase-snapshots.md) — Eight extracts under `raw/codebase-snapshots/`.
- [V2 Strategy README](wiki/sources/v2-strategy-readme.md) — `raw/v2-strategy/README.md`.
- [Engine & Platform Hardening Brief v0.2](wiki/sources/ep-hardening-brief-v0-2.md) — The E&P track: ENG-1 → REPO-1 → PLAT-1/2/3 → ENG-2, decisions D1–D6 locked.
- [Recommendation Engine v2 Strategy v1.8](wiki/sources/engine-strategy-v1-8.md) — Current engine ground truth (supersedes v1.6.3).
- [Recommendation Engine v2 Strategy v1.6.3](wiki/sources/engine-strategy-v1-6-3.md) — Superseded by v1.8.
- [Project Orchestration v0.8](wiki/sources/project-orchestration-v0-8.md) — Current: §3.4 migration table + §11 E&P locks (supersedes v0.5).
- [Project Orchestration v0.5](wiki/sources/project-orchestration-v0-5.md) — Superseded by v0.8.
- [Project Orchestration v0.3.3](wiki/sources/project-orchestration-v0-3-3.md) — Superseded by v0.5.
- [Detail Page Signal Capture Spec v0.3.2](wiki/sources/detail-page-signal-capture-spec-v0-3-2.md) — Signal taxonomy and capture spec.
- [Home and For You Composition Hypothesis v0.4](wiki/sources/home-foryou-composition-hypothesis-v0-4.md) — Current: anchored-rooms flip on the For You row (supersedes v0.3).
- [Home and For You Composition Hypothesis v0.3](wiki/sources/home-foryou-composition-hypothesis-v0-3.md) — Superseded by v0.4.
- [Implementation Guide v0.2](wiki/sources/implementation-guide-v0-2.md) — CC workflow runbook.
- [Implementation Notes Parking Lot v0.7 (+ ENG-1)](wiki/sources/implementation-notes-parking-lot-v0-7.md) — Current snapshot incl. IN-PX-55/56/57 (supersedes v0.5).
- [Implementation Notes Parking Lot v0.5](wiki/sources/implementation-notes-parking-lot-v0-5.md) — Superseded by v0.7.
- [Implementation Notes Parking Lot v0.3.4](wiki/sources/implementation-notes-parking-lot-v0-3-4.md) — Superseded by v0.5.
- [Phase ENG-1 Summary](wiki/sources/phase-eng-1-summary.md) — Multi-interest centroids, avoid set, exploration, training extract.
- [ENG-1 Eval 2026-06-10](wiki/sources/eng1-eval-2026-06-10.md) — Gate results: coverage/parity/γ/τ green, recall carried forward.
- [Phase REPO-1 Summary](wiki/sources/phase-repo-1-summary.md) — Docs/scripts/test/lint cleanup, migration 046, CONVENTIONS.md.
- [Design Reference v0.1](wiki/sources/design-reference-v0-1.md) — Visual reference index.
- [ADRs Combined](wiki/sources/adrs-combined.md) — Index for the eleven per-ADR pages.
- [Phase Summaries (collected)](wiki/sources/phase-summaries.md) — Index for the per-phase pages.
- [Evaluations (collected)](wiki/sources/evaluations.md) — Index for evaluation reports.
- [API references](wiki/sources/api-references.md) — TMDb, OMDB, SA API references.
- [Infrastructure](wiki/sources/infrastructure.md) — Supabase, Capacitor, pgvector, RapidAPI, GitHub Actions.
- [Streaming services](wiki/sources/streaming-services.md) — UK services consolidated reference.
- [Concept primers](wiki/sources/concepts-primers.md) — Eight primers under `raw/concepts/`.
- [Runbooks](wiki/sources/runbooks.md) — Eight operational runbooks.
- [Solutions](wiki/sources/solutions.md) — Four post-mortems.
- [Plans](wiki/sources/plans.md) — Implementation plans.
- [Research](wiki/sources/research.md) — Research stubs and spreadsheets.
- [Frontend](wiki/sources/frontend.md) — Tailwind, Motion, accessibility.
- [Product](wiki/sources/product.md) — Mission, personas, privacy, tone.
- [Forward planning](wiki/sources/forward-planning.md) — Post-v2 horizon (exploratory).
- [Reference](wiki/sources/reference.md) — Glossary, phase timeline, risks, eval harness, version log.
- [USP and Strategy Summary](wiki/sources/usp-and-strategy-summary.md) — Top-level design-review framing.
- [raw/ README](wiki/sources/raw-readme.md) — Drop-zone convention.
