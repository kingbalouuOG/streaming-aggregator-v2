---
title: Parking lot — all IN-XXX entries
type: register
tags: [register, parking-lot, in-xxx, status]
created: 2026-04-26
updated: 2026-05-13
sources:
  - raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md
  - docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.6.md
related:
  - wiki/sources/implementation-notes-parking-lot-v0-3-4.md
  - wiki/concepts/operations/phase-history.md
  - wiki/registers/pre-launch-blockers.md
  - wiki/registers/deferred-items.md
---

# Parking lot — all IN-XXX entries

Status snapshot of every implementation note. Source of truth: `docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.6.md` (v0.6 published 2026-05-07, re-snapshotted 2026-05-09 with IN-PX-36..38 cluster-dominant follow-ups + IN-V3-001..003 v3-redesign follow-ups). Re-snapshot when the parking lot version bumps.

Status legend: ✅ Incorporated · ⏳ Pending · ⚠ Partial · 🛑 Discharged (will not do) · 🅿 Parked (revisit on trigger).

## Pre-Phase 0

| ID | Subject | Status |
|---|---|---|
| IN-PRE-001 | Profiles baseline migration (011) | ✅ Incorporated |

## Phase 0 — Instrumentation

| ID | Subject | Status |
|---|---|---|
| IN-001 | Dwell event must capture exit outcome | ✅ Incorporated |
| IN-002 | Detail view itself is NOT a positive signal | ✅ Incorporated |
| IN-003 | Dwell duration thresholds for negative weighting | ✅ Incorporated |
| IN-004 | Negative dwell session cap | ✅ Incorporated |
| IN-005 | Card impression tracking in dedicated table | ✅ Incorporated (migrations 014/015/016) |
| IN-006 | Session ID generation and propagation | ✅ Incorporated |
| IN-007 | Rename `dismiss` to `not_interested` | ✅ Incorporated |
| IN-008 | `getDismissedIds()` rewrite — transitional gap fix | ✅ Incorporated |
| IN-009 | Lifecycle manager module | ✅ Incorporated |
| IN-010 | Impression batcher module | ✅ Incorporated |
| IN-011 | pg_partman setup for card_impressions | ✅ Incorporated (RLS hardened by 015/016) |
| IN-012 | localStorage v1 clear on first v2 launch | ✅ Incorporated |
| IN-013 | Deep link click confidence tagging | ✅ Incorporated |

## Phase 0.5 — Content enrichment

| ID | Subject | Status |
|---|---|---|
| IN-101 | Validate row counts after backfill, not just schema | ✅ Incorporated |
| IN-102 | Investigate existing `title_credits` sync scripts before rewriting | ✅ Incorporated (confirmed empty; left untouched) |
| IN-103 | Use existing TMDb append_to_response pattern for backfill | ✅ Incorporated |
| IN-104 | Embedding input template must match eval template exactly | ⚠ Partial (Phase 1 task; columns now populated) |
| IN-105 | Runtime backfill added to Phase 0.5 enrichment scope | ✅ Incorporated (81.4% post-fix for `runtime: 0` sentinel) |
| IN-106 | `title_genres` via static TMDb genre mapping | ✅ Incorporated (table left empty) |
| IN-107 | Phase 0.5 sync split — backfill script + enrichment Edge Function | ✅ Incorporated |

### Cross-phase deviations from Phase 0/0.5

| ID | Subject | Status |
|---|---|---|
| IN-PX-01 | RLS event trigger pattern for partman-managed tables | ✅ Reference implementation (migration 016) |
| IN-PX-02 | Consolidate v1 `watched`/`removed` with v2 `marked_watched`/`watchlist_remove` | ✅ Incorporated (Phase 5 — migration 037 dropped `marked_watched` from event_type CHECK + read-side cleanup; latent INTERACTION_WEIGHTS rename fix in same PR) |
| IN-PX-03 | Impression dedup granularity revisit at Phase 3 | ⏳ Pending (precautionary) |
| IN-PX-04 | `@app_hidden_gems` localStorage purge is intentional no-op | ⏳ Documented (no action required) |
| IN-PX-06 | TV director extraction widening to `credits.crew[]` "Series Director" | 🅿 Deferred (Phase 1 eval shows TV clusters fine without it) |
| IN-PX-07 | Director row-count gate should split by media_type | ⏳ Not yet incorporated (policy change, no code impact) |

## Phase 1 — Embeddings

| ID | Subject | Status |
|---|---|---|
| IN-201 | Use OpenAI `text-embedding-3-small` | ✅ Incorporated |
| IN-202 | pgvector with HNSW indexing | ✅ Incorporated (migration 018; index 156 MB) |
| IN-203 | pgvector wire format spike | ✅ Incorporated (`JSON.parse(row.embedding as string)` locked) |
| IN-204 | Embedding column naming — use `embedding`, not `content_vector` | ✅ Incorporated |
| IN-205 | Drop legacy `content_vector` column at end of Phase 1 | ✅ Incorporated (migration 019) |

## Phase 2 / 2.5 / 2.6 — Service fingerprints

| ID | Subject | Status |
|---|---|---|
| IN-250 | TMDb `/discover` backfill for BBC iPlayer, NOW TV, Sky Go | ✅ Done (Phase 2.5) |
| IN-260 | Exclusivity-weighted fingerprint A/B evaluation | 🛑 Discharged (Phase 2.6, ship v1_popularity) |
| IN-261 | Curation-based fingerprint refinement | 🅿 Parked (revisit if Phase 3 cold-start underperforms for mainstream users) |

## Phase 3 — Taste vector + hooks

| ID | Subject | Status |
|---|---|---|
| IN-301 | Hook-level rewrite scope (9 files + `useTasteProfile`) | ✅ Incorporated |
| IN-302 | Detail page "More Like This" batch query pattern | ✅ Incorporated |
| IN-303 | Quiz subsystem deletion and `interaction_log` drop | ✅ Incorporated (15 files deleted, migration 024) |

## Phase 4 — Ranking pipeline

| ID | Subject | Status |
|---|---|---|
| IN-401 | Slider haptic feedback at state transitions | ✅ Incorporated (`SliderTray` haptics) |
| IN-402 | Slider state shared between Profile and For You | ✅ Incorporated (Option C dual-access) |
| IN-403 | Slider parameter mapping (continuous to pipeline weight) | ✅ Incorporated (`weights.ts`) |
| IN-404 | `scoreCandidate` scale mismatch must NOT be carried forward | ✅ Incorporated (all components 0-1 normalised) |

## Phase 4.5 — Mood Rooms

| ID | Subject | Status |
|---|---|---|
| IN-451 | Use HDBSCAN, not k-means | ✅ Incorporated (Phase 4.5) |
| IN-452 | Two-pass LLM labelling with editorial override | ✅ Incorporated (Phase 4.5) |
| IN-453 | Monthly re-clustering with stability constraints | ✅ Incorporated (Phase 4.5) |
| IN-454 | Mood Rooms for Tonight rotation logic | ✅ Incorporated (Phase 4.5) |
| IN-455 | Python + GitHub Actions execution environment | ✅ Incorporated (Phase 4.5 per ADR-005) |
| IN-456 | psycopg2 direct PostgreSQL connection for bulk vector pulls | ✅ Incorporated (Phase 4.5) |
| IN-457 | HDBSCAN fallback plan if clustering quality is poor | ✅ Incorporated (UMAP preprocessing Option 1; full tune sequence completed) |
| IN-458 | `getAvailableTmdbIds` does not distinguish by `media_type` | ⏳ Re-targeted to Phase 5.5 (additive new RPC `get_available_tmdb_id_pairs`, not in-place return-shape swap) |
| IN-459 | Re-evaluate mood room coverage after 3 monthly runs | ⏳ Pending (post-launch action item) |
| IN-460 | Upgrade `actions/setup-python` when v6 ships (Node.js 20 deprecation) | ⏳ Time-triggered |
| IN-461 | Review `FORBIDDEN_WORDS` compound-noun carve-outs after May cron | ⏳ May 2026 review |
| IN-462 | For You tab-switch preservation | ⏳ Re-targeted to Phase 5.5 (zustand store dependency accepted; not built in Phase 5) |
| IN-463 | LLM thematic labels for anchored rooms | ✅ Incorporated (Phase 4.5 fast-follow — `mood_rooms.anchor_label_text`, `label-anchor-room` Edge Function, migration 034) |
| IN-465 | Backfill ~3,807 missing tmdb_ids | ⏳ Re-targeted to Phase 5.5 (script not yet written) |
| IN-466 | Server-side For You first paint | ✅ Incorporated (`render-foryou-rows` Edge Function, ADR-012) |
| IN-467 | Mirror tree consolidation evaluation | ⏳ Pending (criteria partially superseded by IN-PX-32) |
| IN-468 | SWR cache for For You | ⏳ Pending (warm-path p95 telemetry input needed) |
| IN-469 | Cold-start incidence assessment | ⏳ Pending (telemetry input needed) |

## Onboarding-flow specific

| ID | Subject | Status |
|---|---|---|
| IN-OB-001 | Genre taxonomy needs review during implementation | ⏳ Not yet incorporated |
| IN-OB-002 | Step 3 watched-grid round selection algorithm | ⏳ Not yet incorporated |
| IN-OB-003 | Selection state styling must match existing app design system | ⏳ Not yet incorporated |
| IN-OB-004 | Step 3 needs real poster art from TMDb | ⏳ Not yet incorporated |
| IN-OB-005 | Onboarding back button must preserve step state | ⏳ Not yet incorporated |
| IN-OB-006 | Onboarding cluster taxonomy review under v2 engine assumptions | 🅿 Deferred (Phase 6 review, post-Phase-4.5 telemetry — three months of data lands ~July 2026) |

## Cross-phase

| ID | Subject | Status |
|---|---|---|
| IN-XPS-001 | Privacy disclosure copy must align with Detail Page Signal Spec | ⚠ Partial (in-app "What Videx learns" modal is app-specific and accurate; signup-flow Privacy Policy / Terms links are non-functional spans — see IN-PX-34) |
| IN-XPS-002 | Profiles "Allow public username lookup" policy tightening | ✅ Incorporated (Phase 5 — migration 038 + `username_available` SECURITY DEFINER RPC; anon SELECT on profiles denied) |
| IN-XPS-003 | Verify pg_partman automatic partition creation after first month | ⏳ Scheduled post-Phase-0 verification |
| IN-XPS-004 | Service-role JWT in cron migration files → Supabase Vault | ⚠ Partial (Phase 5 — migration 039 moved JWT into Vault; **same JWT value**, cryptographic rotation deferred to Phase 6+ pending Supabase JWT-format secret keys) |
| IN-XPS-005 | Atomic tmp+rename is Windows-hostile for files under active observation | ✅ Incorporated (Phase 0.5 fix; lesson filed) |
| IN-XPS-006 | Delete account wiring | ⏳ Re-targeted to Phase 5.5 (RPC + client wiring exist in production; UI gate + RPC audit + version-controlled migration are the gaps) |
| IN-XPS-007 | Service pricing config needs review cadence | ⏳ Flagged for pre-public-launch |
| IN-XPS-008 | Consider pre-built onboarding watched-grid title pool | 🅿 Consider after user testing |
| IN-XPS-009 | Retake Taste Profile limited to cluster selection only | 🅿 Deferred until Phase 4/5 touches files or feedback indicates problem |
| IN-XPS-010 | Supabase Pro→Free downgrade risk inventory | ⏳ Documented; no action unless cost optimisation comes up again |
| IN-XPS-011 | CI guard against `verify_jwt = false` drift on user-callable Edge Functions | ✅ Incorporated (Phase 5 — six per-function `config.toml` files set `verify_jwt = true`; `.github/workflows/edge-fn-jwt-guard.yml` blocks regressions) |
| IN-XPS-012 | Promote parity probe to CI smoke test | ✅ Workflow file added (Phase 5); enforcement pending `PARITY_*` repo secrets |
| IN-XPS-013 | Pre-launch CORS tightening on user-callable Edge Functions | ✅ Incorporated (Phase 5 — `_shared/cors.ts` allow-list helper; applied to `render-foryou-rows` + `label-anchor-room`) |

## Phase 5.5 follow-ups (filed 2026-05-07 from Phase 5 review pass)

Quality / hardening items (IN-PX-21..33) and pre-launch legal blockers (IN-PX-34, IN-PX-35) surfaced from the post-merge multi-agent review of PR #4 plus the Phase 5 close-out legal-disclosures audit.

| ID | Subject | Status |
|---|---|---|
| IN-PX-21 | Regenerate `database.types.ts` and delete `as any` casts | ⏳ Filed; ~30 min — additional dependent surfaced in Phase Search V2 (`src/lib/featureFlags.ts:47` for `user_feature_flags`) |
| IN-PX-22 | Embedding fetch caching for MMR (24h TTL) | ⏳ Filed |
| IN-PX-23 | MMR partial-coverage fallback (>50% missing → genre-spread) | ⏳ Filed |
| IN-PX-24 | Float32Array + cosine-norm precompute in MMR | ⏳ Filed (after IN-PX-22) |
| IN-PX-25 | Test coverage for `computeContextualScore` and `applyMMR` | ⏳ Filed |
| IN-PX-26 | `buildRowFromPool` options object refactor | ⏳ Filed |
| IN-PX-27 | `ViewingContext` type to source of truth (`types.ts`) | ⏳ Filed |
| IN-PX-28 | `edge-fn-jwt-guard` gap — central `supabase/config.toml` | ⏳ Filed |
| IN-PX-29 | `username_available` rate-limit at gateway | ⏳ Filed (Phase 6 — pre-public-launch) |
| IN-PX-30 | Defence-in-depth in `extractUserIdFromJwt` | ⏳ Filed (Phase 6 — pre-public-launch) |
| IN-PX-31 | Trim `supabase/cron/*.sql` source-of-truth confusion | ⏳ Filed |
| IN-PX-32 | Mirror tree consolidation (`_shared/` as source-of-truth for leaf modules) | ⏳ Filed (supersedes part of IN-467) |
| IN-PX-33 | Property-level parity probe (golden output) | ⏳ Filed (Phase 6 / before next Edge-client paired feature) |
| IN-PX-34 | Privacy Policy text + functional legal links | ⏳ Filed (**pre-launch blocker** — store-rejection risk) |
| IN-PX-35 | Functional "Download my data" — GDPR Article 20 | ⏳ Filed (**pre-launch blocker** — currently a fake-success toast) |

## Cluster-dominant follow-ups (filed 2026-05-08 alongside ADR-013)

Filed when bootstrap weights flipped from watched-grid-dominant to cluster-dominant; see ADR-013 in `wiki/concepts/decisions/`.

| ID | Subject | Status |
|---|---|---|
| IN-PX-36 | Existing prototype profiles need backfill (saved bootstrap is the anchor for `recomputeFromInteractions`) | ⏳ Filed |
| IN-PX-37 | Cluster-rep dedup edge cases — verify each title appears in exactly one cluster after reconciliation | ⏳ Filed |
| IN-PX-38 | Watched-grid candidate-pool restructure follow-up — service-availability filter restoration if the broader pool starves cold-start | ⏳ Filed |

## Phase Search V2 follow-ups (filed 2026-05-13 from close-out review pass)

Surfaced during the close-out three-agent review (`security-sentinel` SAFE-TO-MERGE, `kieran-typescript-reviewer` SHIP-IT, `performance-oracle` FIX-FIRST → fixed in commit `9ec4868`). Items below are post-merge follow-ups, not blockers.

| ID | Subject | Status |
|---|---|---|
| IN-PX-39 | Replace `catch (err: any)` in `src/hooks/useSearch.ts:138, 223` with `unknown` + narrowing helper. Flagged by `kieran-typescript-reviewer`. Trivial. | ⏳ Filed (Phase 5.5) |
| IN-PX-40 | 20-query semantic-eval fixture authorship (`scripts/test/search-semantic-fixtures.json`). Gates `search_semantic` flag-flip from Joe-only → prototype users. B6 commit landed a 2-query stub. | ⏳ Filed (Joe — author at own pace, then verify `search-semantic-eval` workflow goes green) |
| IN-PX-41 | Per-user feature flag UI — Studio SQL is fine for Joe, but flipping flags for prototype users (post-eval-green) wants either an admin UI surface or a documented runbook. | ⏳ Filed (decide pre-rollout) |
| IN-PX-42 | Consider extracting `<SearchInput>`, `<CategoryPills>`, segmented control, toggle row, slider, sheet primitive when a 2nd consumer appears. Kickoff §7 H6 risk note kept primitives narrow this phase. | 🅿 Parked (revisit when a 2nd consumer materialises) |
| IN-PX-43 | **Search-as-signal Level 1 — search-attribution boost.** When a positive interaction (`watched`, `watchlist_add`, `deep_link_click`, `thumbs_up`) lands within 60s of a `search` in the same session, multiply its taste-vector weight by 1.3. In-memory cache on the incremental path, two-query DB read on the 24h batch recompute. Filed 2026-05-14 as a Phase Search V2 follow-up after Joe asked what search data was feeding taste; the original Phase Search V2 plan deferred consumption to "Phase 3 search-as-signal" — Level 1 is the cheap fast-follow before the full Phase 3 work. | ✅ Incorporated (2026-05-14, `phase-search-v2-attribution-boost` branch) |
| IN-PX-44 | **Search-as-signal Level 2 — embed query into taste vector directly.** Add `'search'` to `TASTE_RELEVANT_EVENTS` with a small positive weight (~0.15), embed the query via `embed-query`, nudge the vector toward the embedding. Gate on "at least one result tapped within session" to suppress fruitless queries. Privacy: queries already persist to `user_interactions.metadata`; expansion needs surfacing in the GDPR Article 20 export work (IN-PX-35). | ⏳ Filed — defer until 20-query semantic-eval fixture (IN-PX-40) gives subjective ground truth on query-embedding quality. |
| IN-PX-45 | **Search-as-signal Level 3 — full Phase 3 search-as-signal pipeline.** Co-clustering queries, attribution windows beyond 60s, weight calibration against held-out engagement, query-pattern detection (e.g. recurring "for the kids" queries → soft-context flag). Roadmapped per `videx-wiki/raw/forward-planning/roadmap-search-v2-entity-and-signal.md`. Phase, not commit. | ⏳ Filed (post family-tester engagement data) |

## v3 editorial-redesign follow-ups (filed 2026-05-09 from end-to-end review)

Surfaced during the end-to-end visual review against the design reference. UI shipped; data layer pending.

| ID | Subject | Status |
|---|---|---|
| IN-V3-001 | Long Read editorial-spotlight data layer (`long_reads` table parallel to `editor_notes`) — currently a hardcoded sample in `LongRead.tsx` | ⏳ Filed |
| IN-V3-002 | Taste-v2 surface for hero match% + per-title mood signals — match% wires to ranker output when present, mood is hardcoded "contemplative" | ⏳ Filed (IN YOUR PLAN client-side signal: ✅ wired) |
| IN-V3-003 | Wire "Refine by feeling" mood refiner to taste-v2 — UI complete and hidden behind `MOOD_REFINER_ENABLED=false` flag in `ForYouPage.tsx` pending the data-layer work | ⏳ Filed |

## Counts

- Total entries: **91** (Pre-PRE 1 + P0 13 + P0.5 7 + P0/0.5 cross 6 + P1 5 + P2 3 + P3 3 + P4 4 + P4.5 16 + OB 6 + XPS 13 + PX-21..35 15 + PX-36..38 3 + PX-39..45 7 + V3-001..003 3).
- ✅ Incorporated: **43** (IN-PX-43 search-attribution boost shipped 2026-05-14).
- ⏳ Pending / Not yet incorporated: **38** (IN-V3-002 IN YOUR PLAN portion ✅ shipped; the match%/mood portion remains pending).
- ⚠ Partial: **3** (IN-104, IN-XPS-001, IN-XPS-004).
- 🛑 Discharged: **1** (IN-260).
- 🅿 Parked: **6** (IN-PX-06, IN-261, IN-XPS-008, IN-XPS-009, IN-OB-006, IN-PX-42).

## Pre-launch blockers (subset of pending)

See the dedicated [pre-launch-blockers register](pre-launch-blockers.md). The IN-XPS-004 / IN-XPS-006 / IN-XPS-007 / IN-PX-34 / IN-PX-35 entries are the parking-lot view of the same set.
