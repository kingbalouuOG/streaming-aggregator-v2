---
title: Parking lot — all IN-XXX entries
type: register
tags: [register, parking-lot, in-xxx, status]
created: 2026-04-26
updated: 2026-07-06
sources:
  - raw/v2-strategy/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md
  - docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.7.md
  - raw/phase-summaries/phase-5.5-summary.md
related:
  - wiki/sources/implementation-notes-parking-lot-v0-3-4.md
  - wiki/concepts/operations/phase-history.md
  - wiki/registers/pre-launch-blockers.md
  - wiki/registers/deferred-items.md
---

# Parking lot — all IN-XXX entries

Status snapshot of every implementation note. Source of truth: `docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.7.md` (v0.7 published 2026-05-15 at Phase 5.5 close — 14 status flips + 2 new entries IN-XPS-014 + IN-PX-50, plus 4 review-pass follow-ups IN-PX-51..54). Previous v0.6 published 2026-05-07. Re-snapshot when the parking lot version bumps.

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
| IN-102 | Investigate existing `title_credits` sync scripts before rewriting | ✅ Incorporated (confirmed empty; left untouched — table dropped by migration 046, REPO-1 2026-06-10, apply pending) |
| IN-103 | Use existing TMDb append_to_response pattern for backfill | ✅ Incorporated |
| IN-104 | Embedding input template must match eval template exactly | ⚠ Partial (Phase 1 task; columns now populated) |
| IN-105 | Runtime backfill added to Phase 0.5 enrichment scope | ✅ Incorporated (81.4% post-fix for `runtime: 0` sentinel) |
| IN-106 | `title_genres` via static TMDb genre mapping | ✅ Incorporated (table left empty — dropped by migration 046, REPO-1 2026-06-10, apply pending) |
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
| IN-458 | `getAvailableTmdbIds` does not distinguish by `media_type` | ⏳ Re-targeted to Phase 6 (additive new RPC `get_available_tmdb_id_pairs`, not in-place return-shape swap) |
| IN-459 | Re-evaluate mood room coverage after 3 monthly runs | ⏳ Pending (post-launch action item) |
| IN-460 | Upgrade `actions/setup-python` when v6 ships (Node.js 20 deprecation) | ⏳ Time-triggered |
| IN-461 | Review `FORBIDDEN_WORDS` compound-noun carve-outs after May cron | ✅ Incorporated (H0 Stream D, 2026-07-06) — reviewed all 69 current labels; only "Bedtime Fairy Tales" trips the flat `Tales` check (kept alive by Jaccard stability, would fail on regeneration). Added `ALLOWED_COMPOUNDS = {"fairy tales"}` carve-out to `scripts/mood_rooms/label.py` `_validate_label`; bare `Tales` still blocked. |
| IN-462 | For You tab-switch preservation | ⏳ Re-targeted to Phase 6 (paired with IN-468 / IN-469 — designing the store shape pre-telemetry risks rework) |
| IN-463 | LLM thematic labels for anchored rooms | ✅ Incorporated (Phase 4.5 fast-follow — `mood_rooms.anchor_label_text`, `label-anchor-room` Edge Function, migration 034) |
| IN-465 | Backfill ~3,807 missing tmdb_ids | ✅ Incorporated (Phase 5.5, 2026-05-15) — `scripts/enrichment/backfill_missing_titles.ts` executed: 5,446 missing at run-time → 2,698 upserted / 2,748 TMDb-404 (deleted stubs stay missing forever) / 0 errored. `titles` grew 20,140 → 22,838. Investigation `docs/v2/investigations/in-465-catalogue-sync-gap.md` diagnosed Prime back-catalogue + TMDb `/discover` 500-page cap as root cause; pipeline-split finding (`daily-content-sync` cron never writes `titles`) means the backfill script's left-join query IS the recurring fix. Phase 6 IN-PX-50 wraps in scheduled Edge Function. |
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
| IN-XPS-001 | Privacy disclosure copy must align with Detail Page Signal Spec | ✅ Incorporated (Phase 5.5) — IN-PX-34 resolved: `docs/legal/privacy-policy.md` §2 mirrors the in-app "What Videx learns" modal verbatim plus DB-level table-by-table detail. Signup-flow legal spans converted to functional buttons (`OnboardingFlow.tsx`). |
| IN-XPS-002 | Profiles "Allow public username lookup" policy tightening | ✅ Incorporated (Phase 5 — migration 038 + `username_available` SECURITY DEFINER RPC; anon SELECT on profiles denied) |
| IN-XPS-003 | Verify pg_partman automatic partition creation after first month | ✅ Incorporated (H0 Stream D, 2026-07-06) — verified healthy: 1-mon interval, premake 2, 3-mon retention dropping tables, auto-maintenance on; maintenance + rollup crons `succeeded`. Empty `card_impression_daily_totals` is by-design (rollup >90d, earliest impression 2026-06-15). |
| IN-XPS-004 | Service-role JWT in cron migration files → Supabase Vault | ⚠→**Unblocked (H0 Stream D, 2026-07-06).** Supabase shipped JWT Signing Keys (GA mid-2025; projects auto-migrated 1 Oct 2025); legacy keys deprecated end-2026. Rotation is now a Joe-owned dashboard ceremony (standby→rotate→revoke) — **not automated** (live credential). Runbook rewritten; steps in console-actions §4. |
| IN-XPS-005 | Atomic tmp+rename is Windows-hostile for files under active observation | ✅ Incorporated (Phase 0.5 fix; lesson filed) |
| IN-XPS-006 | Delete account wiring | ✅ Incorporated (Phase 5.5, migration 042 applied 2026-05-15) — defensive belt-and-braces explicit DELETEs across 8 user-scoped tables. C11 throwaway-account smoke test confirmed every cascade target empty post-delete (including 113 `card_impressions` from a partitioned table); `auth.users` row gone. UI gate flipped with type-username-to-confirm UX. Supabase auto-grant on `public.*` functions means body's NULL `auth.uid()` raise is the actual auth gate (documented). |
| IN-XPS-007 | Service pricing config needs review cadence | ✅ Incorporated (H0 Stream D, 2026-07-06) — `platformPricing.ts` refreshed vs July-2026 UK prices (all 10 services re-verified). Next quarterly review ~Oct 2026. |
| IN-XPS-008 | Consider pre-built onboarding watched-grid title pool | 🅿 Consider after user testing |
| IN-XPS-009 | Retake Taste Profile limited to cluster selection only | 🅿 Deferred until Phase 4/5 touches files or feedback indicates problem |
| IN-XPS-010 | Supabase Pro→Free downgrade risk inventory | ⏳ Documented; no action unless cost optimisation comes up again |
| IN-XPS-011 | CI guard against `verify_jwt = false` drift on user-callable Edge Functions | ✅ Incorporated (Phase 5 — six per-function `config.toml` files set `verify_jwt = true`; `.github/workflows/edge-fn-jwt-guard.yml` blocks regressions) |
| IN-XPS-012 | Promote parity probe to CI smoke test | ✅ Incorporated (Phase 5 workflow file + Phase 5.5 IN-PX-33 property-level golden probe). **Activated 2026-05-15** — all 5 `PARITY_*` GitHub secrets configured + golden seeded (`scripts/test/foryou-parity-golden.json`, 6,083 bytes, 73 items across 8 sections). Future `recommendations-v2` PRs hard-fail on Edge / client divergence. |
| IN-XPS-013 | Pre-launch CORS tightening on user-callable Edge Functions | ✅ Incorporated (Phase 5 — `_shared/cors.ts` allow-list helper; applied to `render-foryou-rows` + `label-anchor-room`) |

## Phase 5.5 follow-ups (filed 2026-05-07 from Phase 5 review pass; resolved 2026-05-15)

Quality / hardening items (IN-PX-21..33) and pre-launch legal blockers (IN-PX-34, IN-PX-35) surfaced from the post-merge multi-agent review of PR #4 plus the Phase 5 close-out legal-disclosures audit. **All 14 in-scope entries closed at Phase 5.5 (PR #11, 2026-05-15).** IN-PX-29 / IN-PX-30 / IN-PX-32 stay open for Phase 6.

| ID | Subject | Status |
|---|---|---|
| IN-PX-21 | Regenerate `database.types.ts` and delete `as any` casts | ✅ Incorporated (Phase 5.5). 28 boundary casts removed across 11 files. `typegen-check.yml` CI gate prevents drift. ~~One retained cast for `editor_notes` (migration 040 unapplied — table not in schema).~~ **Migration 040 applied to prod in H0 Stream A (2026-07-06)** — it had a latent non-IMMUTABLE partial-index predicate (`now()`) that had silently blocked every apply; index fixed, table + seed note now live, `database.types.ts` regenerated with the `editor_notes` type. The defensive untyped cast in `fetchEditorNote` is now belt-and-braces, not a necessity. |
| IN-PX-22 | Embedding fetch caching for MMR (24h TTL) | ✅ Incorporated (Phase 5.5). New `embeddingCache.ts` module: 24h localStorage on client + per-Edge-instance Map. Cache key simplified post-review to `userId + taste_profiles.updated_at`. `clearEmbeddingCache()` wired into every signOut path (including `onAuthStateChange` SIGNED_OUT post-fixup). |
| IN-PX-23 | MMR partial-coverage fallback (>50% missing → genre-spread) | ✅ Incorporated (Phase 5.5). `applyMMR` returns `{ selected, bailedOut }`. Named constants `MMR_NULL_RATIO_BAIL = 0.5` + `MMR_MIN_SAMPLE = 4` at top of `diversity.ts`. |
| IN-PX-24 | Float32Array + cosine-norm precompute in MMR | ✅ Incorporated (Phase 5.5). Map shape change to `Map<string, { vec: Float32Array; norm: number }>` at MMR consumers. `cosineSimilarity` rewritten — ~3× hot-loop speedup. |
| IN-PX-25 | Test coverage for `computeContextualScore` and `applyMMR` | ✅ Incorporated (Phase 5.5). Vitest rig + 10 pure-function tests (5 contextual + 5 diversity including cached-norm precision-equivalence guard). |
| IN-PX-26 | `buildRowFromPool` options object refactor | ✅ Incorporated (Phase 5.5). Six call sites updated. |
| IN-PX-27 | `ViewingContext` type to source of truth (`types.ts`) | ✅ Incorporated (Phase 5.5). Moved from `weights.ts`; runtime cast in `contextual.ts` dropped; defensive narrowing at both DB boundaries. |
| IN-PX-28 | `edge-fn-jwt-guard` gap — central `supabase/config.toml` | ✅ Incorporated (Phase 5.5). Second grep pass added to workflow. |
| IN-PX-29 | `username_available` rate-limit at gateway | ✅ Incorporated (H0 Stream D, 2026-07-06) — migration `053`. **In-DB** per-IP fixed-window limit (30/min) inside the RPC, not gateway: the client calls PostgREST directly (never the Worker). Fails open when no IP attributable. |
| IN-PX-30 | Defence-in-depth in `extractUserIdFromJwt` | ✅ Incorporated (H0 Stream D, 2026-07-06) — `_shared/userScope.ts` throws under the `_no_auth_/` namespace. Runtime-assertion path chosen over `jose`+JWKS (JWKS-only verify would reject current legacy-HS256 tokens; revisit post IN-XPS-004 rotation). |
| IN-PX-31 | Trim `supabase/cron/*.sql` source-of-truth confusion | ✅ Incorporated (Phase 5.5). Three SQL files deleted; migration 039 is sole source; `supabase/cron/README.md` documents the now-empty directory. |
| IN-PX-32 | Mirror tree consolidation (`_shared/` as source-of-truth for leaf modules) | ⏳ Filed (Phase 6 — no drift incidents recorded; refactor warrants its own phase) |
| IN-PX-33 | Property-level parity probe (golden output) | ✅ Incorporated (Phase 5.5). `--update-golden` flag on the parity probe (now `scripts/test/foryou-parity-probe.mjs` — renamed from `scripts/_inspect_foryou_parity.mjs` in REPO-1) + JWT refresh script + activation (5 secrets + golden seeded for test user). |
| IN-PX-34 | Privacy Policy text + functional legal links | ✅ Incorporated (Phase 5.5). `docs/legal/privacy-policy.md` + `terms-of-service.md` authored with mandatory lawyer-vetting caveat footer. Rendered via `react-markdown` from `?raw` Vite imports. Signup-flow spans → buttons. Pre-launch solicitor review filed as new IN-XPS-014. |
| IN-PX-35 | Functional "Download my data" — GDPR Article 20 | ✅ Incorporated (Phase 5.5). Migration 043 `export_user_data` SECURITY DEFINER RPC. Frontend wires `@capacitor/filesystem` Documents directory write on native, Blob download on web. |

## Phase 5.5 new entries filed at close-out (2026-05-15)

| ID | Subject | Status |
|---|---|---|
| IN-XPS-014 | UK solicitor review of Privacy Policy + Terms of Service | ⏳ Filed (Phase 6 — **hard pre-launch blocker** for App Store / Google Play submission). The Phase 5.5 drafts are descriptive of current Videx behaviour but not lawyer-vetted. Placeholders `[your-contact-email-address — TBC]` + `[your-UK-postal-address — TBC]` left visible to signal not-launch-ready. Joe's decision pre-launch: email-only (legally sufficient under UK GDPR) vs. email + registered office address service (~£30-50/yr) vs. email + PO Box. Personal home address advised against. |
| IN-PX-50 | Scheduled catalogue-gap backfill as Edge Function | ✅ Incorporated (H0 Stream D, 2026-07-06) — Edge Function `supabase/functions/backfill-missing-titles/` + migration `054` (anti-join RPC `list_missing_title_ids` + weekly Sun 05:00 UTC cron, Vault-sourced service-role bearer per 039). Per-invocation cap 300 (Edge wall-clock); weekly cadence drains any backlog. **Deviation:** TMDb key uses the existing `TMDB_API_KEY` Edge secret (enrich-new-titles precedent), not Vault — avoids a second secret store and keeps the two TMDb-fetching functions consistent. Deploy order: function first, then migration 054. |
| IN-PX-51 | Hook `clearEmbeddingCache` into `onAuthStateChange` SIGNED_OUT | ✅ Incorporated (Phase 5.5 review-pass fixup, commit `e9c8560`). Surfaced by `kieran-typescript-reviewer` — original C5 implementation only fired on manual signOut callback, missing JWT expiry / multi-tab / server-side invalidation. UserId namespacing in the cache key prevented cross-user correctness contamination; this closes the docstring contract gap. |
| IN-PX-52 | Regenerate Edge `_shared/database.types.ts` for typed RPC calls | ⏳ Filed (Phase 6 — non-launch-blocking). The Edge `_shared/` tree doesn't have generated types; `render-foryou-rows/index.ts` still uses `(client.from('titles') as any).select(...)` patterns. `<Database>` generic not applied to Edge `createClient`. Current casts are correctness-equivalent, just type-unsafe. |
| IN-PX-53 | Compress embedding cache or cap to top-100 for Safari mobile | ⏳ Filed (Phase 6+ — only impacts Safari mobile prototype users; zero today). At 200 candidates × 1536 dims, localStorage write hits ~5MB which is Safari mobile's quota ceiling. Quota error is swallowed correctly (falls through to network fetch), but cache hit rate silently degrades. Options: cap top-100 / base64-encode ArrayBuffer / move to IndexedDB. |
| IN-PX-54 | CI check that every user-scoped table is referenced in `delete_own_account` + `export_user_data` | ⏳ Filed (Phase 6 — defensive). Audit was clean at Phase 5.5; if a future migration adds a new table with a `user_id` column, the RPCs silently leak that user's data (export omits it; delete may miss it depending on FK target). Fix: CI workflow querying `information_schema` and diffing against the table lists in 042 / 043. |

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

## Phase ENG-1 follow-ups (filed 2026-06-10 at close-out)

Recorded in the docs parking lot v0.7 ENG-1 section; see `docs/v2/phase-summaries/phase-eng-1-summary.md` §5.

| ID | Subject | Status |
|---|---|---|
| IN-PX-55 | Cluster rep-list curation breadth — 13/16 onboarding clusters define only 2–4 representatives; tmdb 273481 missing. Bounds the synthetic recall eval. | ⏳ Filed (Joe-owned) |
| IN-PX-56 | `card_impressions` lacks `media_type` — movie/TV `content_id` collision class affects the `v_training_examples` join (migration 045). Pairs with IN-458. | ⏳ Filed |
| IN-PX-57 | Exploration-slot seen-set recent-1000 cap — revisit; likely absorbed by PLAT-3. | ⏳ Filed |

## Counts

- Total entries: **100** (Pre-PRE 1 + P0 13 + P0.5 7 + P0/0.5 cross 6 + P1 5 + P2 3 + P3 3 + P4 4 + P4.5 16 + OB 6 + XPS 14 + PX-21..35 15 + PX-36..38 3 + PX-39..45 7 + PX-50..54 5 + PX-55..57 3 + V3-001..003 3).
- ✅ Incorporated: **65** (H0 Stream D 2026-07-06 added: IN-PX-29, IN-PX-30, IN-PX-50, IN-XPS-003, IN-XPS-007, IN-461. Phase 5.5 close 2026-05-15 added: IN-PX-21..28 except 29/30/32, IN-PX-31, IN-PX-33, IN-PX-34, IN-PX-35, IN-PX-51, IN-XPS-001, IN-XPS-006, IN-465; bumped IN-XPS-012 from partial → ✅ on parity activation).
- ⏳ Pending / Not yet incorporated: **24** (H0 Stream D closed 6 of the prior 30; Phase 5.5 added: IN-XPS-014, IN-PX-52, IN-PX-53, IN-PX-54; reclassified IN-458, IN-462 to Phase 6; ENG-1 close 2026-06-10 added IN-PX-55, IN-PX-56, IN-PX-57).
- ⚠ Partial: **2** (IN-104; IN-XPS-004 — now unblocked but rotation is a pending Joe-owned dashboard ceremony).
- 🛑 Discharged: **1** (IN-260).
- 🅿 Parked: **6** (IN-PX-06, IN-261, IN-XPS-008, IN-XPS-009, IN-OB-006, IN-PX-42).

## Pre-launch blockers (subset of pending)

See the dedicated [pre-launch-blockers register](pre-launch-blockers.md). Phase 5.5 closed items 5 / 6 / 26 (delete + export + privacy/ToS pages); items 7 / 8 (privacy policy counsel review + controller details) collapsed into **IN-XPS-014** as a single solicitor-review blocker. The IN-XPS-004 / IN-XPS-007 entries remain.
