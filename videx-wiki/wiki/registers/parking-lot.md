---
title: Parking lot — all IN-XXX entries
type: register
tags: [register, parking-lot, in-xxx, status]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md
related:
  - wiki/sources/implementation-notes-parking-lot-v0-3-4.md
  - wiki/concepts/operations/phase-history.md
  - wiki/registers/pre-launch-blockers.md
  - wiki/registers/deferred-items.md
---

# Parking lot — all IN-XXX entries

Status snapshot of every implementation note. Source of truth: `raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md`. Re-snapshot when the parking lot version bumps.

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
| IN-PX-02 | Consolidate v1 `watched`/`removed` with v2 `marked_watched`/`watchlist_remove` | ⏳ Pending (Phase 5/6 cleanup) |
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
| IN-451 | Use HDBSCAN, not k-means | ⏳ Not yet incorporated (entry stale; HDBSCAN shipped Phase 4.5) |
| IN-452 | Two-pass LLM labelling with editorial override | ⏳ Not yet incorporated (entry stale; shipped Phase 4.5) |
| IN-453 | Monthly re-clustering with stability constraints | ⏳ Not yet incorporated (entry stale; shipped Phase 4.5) |
| IN-454 | Mood Rooms for Tonight rotation logic | ⏳ Not yet incorporated (entry stale) |
| IN-455 | Python + GitHub Actions execution environment | ⏳ Not yet incorporated (entry stale; shipped Phase 4.5 per ADR-005) |
| IN-456 | psycopg2 direct PostgreSQL connection for bulk vector pulls | ⏳ Not yet incorporated (entry stale; shipped Phase 4.5) |
| IN-457 | HDBSCAN fallback plan if clustering quality is poor | ✅ Incorporated (UMAP preprocessing Option 1; full tune sequence completed) |
| IN-458 | `getAvailableTmdbIds` does not distinguish by `media_type` | ⏳ Not yet incorporated |
| IN-459 | Re-evaluate mood room coverage after 3 monthly runs | ⏳ Pending (post-launch action item) |
| IN-460 | Upgrade `actions/setup-python` when v6 ships (Node.js 20 deprecation) | ⏳ Time-triggered |
| IN-461 | Review `FORBIDDEN_WORDS` compound-noun carve-outs after May cron | ⏳ May 2026 review |
| IN-462 | For You tab-switch preservation | ⏳ Pending (Phase 5) |

> ⚠ The Phase 4.5 IN-451 to IN-456 entries are flagged "Not yet incorporated" in the raw parking lot but the work shipped per ADR-005, strategy v1.6.3 §5.2, and orchestration v0.3.3 actuals. Status here mirrors the parking lot for fidelity; entries should be flipped to ✅ in the next parking-lot revision once Phase 4.5 has its own end-of-phase summary file.

## Onboarding-flow specific

| ID | Subject | Status |
|---|---|---|
| IN-OB-001 | Genre taxonomy needs review during implementation | ⏳ Not yet incorporated |
| IN-OB-002 | Step 3 watched-grid round selection algorithm | ⏳ Not yet incorporated |
| IN-OB-003 | Selection state styling must match existing app design system | ⏳ Not yet incorporated |
| IN-OB-004 | Step 3 needs real poster art from TMDb | ⏳ Not yet incorporated |
| IN-OB-005 | Onboarding back button must preserve step state | ⏳ Not yet incorporated |

## Cross-phase

| ID | Subject | Status |
|---|---|---|
| IN-XPS-001 | Privacy disclosure copy must align with Detail Page Signal Spec | ⏳ Not yet incorporated |
| IN-XPS-002 | Profiles "Allow public username lookup" policy tightening | ⏳ Flagged, not scheduled |
| IN-XPS-003 | Verify pg_partman automatic partition creation after first month | ⏳ Scheduled post-Phase-0 verification |
| IN-XPS-004 | Service-role JWT in cron migration files → Supabase Vault | ⏳ Flagged for **pre-public-launch** |
| IN-XPS-005 | Atomic tmp+rename is Windows-hostile for files under active observation | ✅ Incorporated (Phase 0.5 fix; lesson filed) |
| IN-XPS-006 | Delete account wiring deferred (Phase 3 carry-forward) | ⏳ Flagged for **pre-public-launch** |
| IN-XPS-007 | Service pricing config needs review cadence (Phase 3 carry-forward) | ⏳ Flagged for pre-public-launch |
| IN-XPS-008 | Consider pre-built onboarding watched-grid title pool (Phase 3 carry-forward) | 🅿 Consider after user testing |
| IN-XPS-009 | Retake Taste Profile limited to cluster selection only (Phase 3 carry-forward) | 🅿 Deferred until Phase 4/5 touches files or feedback indicates problem |

## Counts

- Total entries: 56.
- ✅ Incorporated: 32.
- ⏳ Pending / Not yet incorporated: 18.
- ⚠ Partial: 1 (IN-104).
- 🛑 Discharged: 1 (IN-260).
- 🅿 Parked: 4 (IN-PX-06, IN-261, IN-XPS-008, IN-XPS-009).

## Pre-launch blockers (subset of pending)

See the dedicated [pre-launch-blockers register](pre-launch-blockers.md). The IN-XPS-004 / IN-XPS-006 / IN-XPS-007 entries are the parking-lot view of the same set.
