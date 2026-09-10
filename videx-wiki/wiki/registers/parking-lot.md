---
title: Parking lot — all IN-XXX entries
type: register
tags: [register, parking-lot, in-xxx, status]
created: 2026-04-26
updated: 2026-09-09
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
| IN-XPS-014 | UK solicitor review of Privacy Policy + Terms of Service | 🅿 **Re-scoped 2026-07-06 (Roadmap v1.0 Decision 6): paid review DEFERRED to the H2 monetisation gate** (bundled with Premium consumer terms + affiliate disclosures); H0 0.1 is a DIY launch-compliance checklist (ICO fee, contact details, accuracy updates, hosted policy URLs, store forms). Originally filed (Phase 6 — hard pre-launch blocker for App Store / Google Play submission). The Phase 5.5 drafts are descriptive of current Videx behaviour but not lawyer-vetted. Placeholders `[your-contact-email-address — TBC]` + `[your-UK-postal-address — TBC]` left visible to signal not-launch-ready. Joe's decision pre-launch: email-only (legally sufficient under UK GDPR) vs. email + registered office address service (~£30-50/yr) vs. email + PO Box. Personal home address advised against. |
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
| IN-V3-003 | Wire "Refine by feeling" mood refiner to taste-v2 — UI complete and hidden behind `MOOD_REFINER_ENABLED=false` flag in `ForYouPage.tsx` pending the data-layer work | 🛑 **Closed — retired 2026-09-08.** Joe's decision in the [presets recommendation](../sources/quick-filters-and-search-presets-recommendation-2026-09-08.md) §2.1/§7: the strip is a *fourth* overlapping taxonomy that duplicates the Browse presets by label but not by definition. Delete it rather than re-point it; removal happens in the presets session (§10 Session 3). **Code removed 2026-09-09 (PR #139):** `MOOD_CHIPS`, `MOOD_GLYPHS`, `MOOD_REFINER_ENABLED`, the dead JSX branch and the `activeMood` state are gone from `ForYouPage.tsx`, and the orphaned `MOOD_GLYPH_NAMES` map went with them from `genreGlyphs.ts` / `genreIcons.tsx`. The "In your mood" row itself stays — it is the recommendation row, not part of the refiner — with its copy collapsed to the only branch that was ever reachable. |

## Search-term logging follow-ups (filed 2026-09-08 at Session 1 close-out)

Found while wiring `emitSearch` on native. See the [recommendation source page](../sources/quick-filters-and-search-presets-recommendation-2026-09-08.md).

| ID | Subject | Status |
|---|---|---|
| IN-SL-001 | **Native Browse/search results record no impressions.** `browse.tsx` renders its `FlashList` with `PosterGridCard` and never calls `recordImpression`, so search and filter result sets are invisible to `card_impressions`. Consequence: search CTR cannot be computed properly — a `search` row gives `result_count`, and a later `detail_view` gives the click, but there is no denominator for *which* results were actually seen. The presets measurement plan (§6: "tap → `detail_view` within the 60 s window (needs §4's impression fix for CTR proper)") depends on this. | ✅ **Closed 2026-09-09 (PR for the refine-row session).** `PosterGridCard` and `TitleHitCard` now record impressions and stash click context, the same way `PosterCard` does on the rail surfaces. Surface is `'search'` when text is on screen and `'browse'` for a preset or filters alone; `metadata` carries the route (`title` / `described` / `lookup` / `preset` / `filter`) and the active refine chips, so a refined result set is not silently pooled with an unrefined one — the same reasoning as `metadata.filter` on New and For You. The title-hit card is position 0 and the grid below it starts at 1, because it is the most prominent result on the most retrieval-shaped route and omitting it would have left the denominator missing exactly the result most likely to be clicked. Both are opt-in via `surface`: Watchlist passes none, since a saved list is not a ranked surface and its impressions would dilute the CTR of the surfaces that are. |
| IN-SL-002 | **Free-only filter on the semantic path needs a `stream_type`-aware availability filter.** `useSemanticSearch` runs `semanticSearch` with `defaultFor([])` — a no-op post-filter — so a "free" (subscription-included, per Joe's 2026-09-08 decision) constraint cannot be expressed on the semantic path at all. `titles.available_services` records service membership but the free/rent/buy distinction lives in `stream_type`, which the vector path does not carry into its post-filter. Blocks any constraint-led preset that says "free tonight" while `search_semantic` is on. | ✅ **Closed 2026-09-09 (PR #139, presets session).** Migration 080 adds `subscription_included_titles(integer[], text[])`: given the candidate ids the vector search just returned plus the user's services, it returns those with a `subscription` or `free` row. Scoped to the candidate set rather than the catalogue, so it is an index lookup on the existing `idx_sa_lookup` and needs no new index. `addon` counts as PAID, matching `paid_only_titles` (064), so the two cannot disagree; empty services means any service, so a user with no stack gets an honest filter rather than an empty grid. `semanticRetrieval` takes `subscriptionIncludedOn` and — importantly — stops truncating to `resultLimit` before the availability check, or a user whose top 60 happened to be rentals would have seen nothing. Fails open on RPC error. Verified live: of 150 candidates, Netflix+Disney → 77, any service → 145, Apple alone → 0. |
| IN-SL-003 | **Privacy policy §10 promises an in-app change notification that does not exist.** §10 commits to notifying signed-in users at least 30 days before a material change takes effect. Verified 2026-09-08: the policy is a static string rendered on demand, with no stored policy version (no `profiles` column, no consent table), no changelog surface and no notice UI. The push transport exists but is blocked on FCM/APNs credentials and carries recommendations, not legal notices. The 2026-09-08 search-logging change is the first live test of the promise. **Escalated 2026-09-09: this has a real subject, and the promise has now been tested.** Production has one user who is not Joe — `macky_01@hotmail.com`, signed up 21 Jun 2026, completed onboarding, 8 services picked, active on 3 distinct days across two months (21 Jun, 19 Jul, 23 Aug) — **and they remain unidentified.**

Ruled out, in order: **iOS** (all 14 iOS builds postdate their signup; the oldest finished 29 Jun, eight days later); **the Play closed-test cohort** (Joe checked the tester list, they are not on it); **the web app** (no `vercel.json`, `netlify.toml` or equivalent has ever been committed, and no web deploy workflow has ever existed). Still unchecked: the Play **internal** testing track, which has its own tester list separate from closed testing; a directly shared APK, which appears in no Play list; or a sign-up on Joe's own device during a demo.

Evidence they are a real person rather than a self-created test account: they return a month apart, twice, where every deliberately-created test account has exactly one active day; the address and username (`macky_01@hotmail.com` / "ninjago") match neither test-account convention in use (`@example.com`, `joegreenwas+alias@gmail.com`); and the first session includes four deep-link click-outs to three different services. (Their single `onboarding_completed` event with `duration 0` looks synthetic but is not — every account created before July has exactly one, because the funnel instrumentation was expanded in early July.)

**Decision, Joe, 2026-09-09: `search_logging` enabled for this account without giving §10 notice.** Reasoning recorded as given: a public user is judged extremely unlikely given the distribution channels, the account is most plausibly a contact testing on a separate address, and the residual risk is therefore low. The notice §10 promises was **not** given, because there is no channel to give it. What limits the exposure: raw query text is nulled after 30 days, the aggregate carries no user link, and export/erasure both cover search rows (verified 2026-09-08). **Revisit if they are ever identified as a member of the public** — that would change the basis of this decision, not merely its paperwork. | ⏳ Filed (Joe-owned — needs a product decision, not just wiring) |

| IN-SL-004 | **`search_logging` rollout position, recorded so it is not lost.** ON for all six of Joe's own accounts (`joegreenwas@gmail.com` + five `+alias` accounts) — he is the data subject, so no consent question arises. ON for `macky_01@hotmail.com` since 2026-09-09 by Joe's explicit decision, without §10 notice and while still unidentified — see IN-SL-003 for the reasoning and the condition that would reopen it. Deliberately OFF **permanently** for `reviewer@videxstreaming.com`: it is the store-review account, so capturing reviewers' search text yields no product signal and puts an app reviewer's typing in the database. The six `@example.com` accounts have zero interactions, so flipping them is a no-op. Anyone doing a future "turn it on for everyone" pass must not sweep up the reviewer account. | ✅ Recorded 2026-09-09 |

## Phase ENG-1 follow-ups (filed 2026-06-10 at close-out)

Recorded in the docs parking lot v0.7 ENG-1 section; see `docs/v2/phase-summaries/phase-eng-1-summary.md` §5.

| ID | Subject | Status |
|---|---|---|
| IN-PX-55 | Cluster rep-list curation breadth — 13/16 onboarding clusters define only 2–4 representatives; tmdb 273481 missing. Bounds the synthetic recall eval. | ⏳ Filed (Joe-owned) |
| IN-PX-56 | `card_impressions` lacks `media_type` — movie/TV `content_id` collision class affects the `v_training_examples` join (migration 045). Pairs with IN-458. | ⏳ Filed |
| IN-PX-57 | Exploration-slot seen-set recent-1000 cap — revisit; likely absorbed by PLAT-3. | ⏳ Filed |

| IN-SL-005 | **The *New & actually good* preset returns 2 titles where the catalogue holds 363.** Three causes, measured 2026-09-09 while device-testing the refine row. (1) **The phrase describes reception, not content.** *"a recent, well-reviewed film or series … that both critics and audiences rated highly"* is a statement *about* a title, so nearest-neighbour retrieval returns titles whose overviews use that vocabulary — it returned **Mr. Scorsese**, a documentary about a director's critical reception. This is the dominant term and no pool-widening fixes it. The codebase already has the rule: *Free to watch* carries `phrase: null` because cost is a fact, not a feeling — and "new and actually good" is likewise two metadata predicates, so the card should carry no phrase and resolve down `/discover`, where both are applied server-side over the whole catalogue. (2) **Filtering happens after retrieval.** `match_titles_by_vector(vector, limit)` takes no filter arguments, so 150 neighbours are fetched and then post-filtered; only 4.9% of the 34,563 embedded titles are release-year ≥ currentYear−1 and 1.05% are that *and* rated ≥7. Of a real 150-pool: Just films 123, Under 2h 91, Higher rated 37, **Newer 21**, Newer+rated 6. Deepening is capped at 1,000 by migration 076, whose error text explains that past the HNSW `ef_search` ceiling the index returns ~1,000 rows *while reporting success*. Fix is a `match_titles_by_vector` variant taking a `release_date` floor. (3) **Some recent titles are not in the catalogue.** *Mousetrap* (2026) and *Mayday* (2026), both visible on the New tab, have no `titles` row at all — New reads TMDb `/discover` live, and vector search can only return what has been ingested and embedded. Scope of that ingest gap is unestablished and wants its own pass. Nothing was changed on the strength of this: the preset is a Session 3 artefact and the phrase change belongs with an eval run. Full measurement in [semantic-search-quality.md](../evaluations/semantic-search-quality.md) Finding 3. | ⚠ **Cause 1 fixed 2026-09-09 (refine-row session); causes 2 and 3 remain open.** `new-good` now carries `phrase: null`, joining `free` as a fact card, so a tap composes filters only and resolves down `/discover`. Measured against Joe's real seven-service stack: the semantic path put **2** titles on screen; `/discover` qualifies **205** (99 films + 106 series) and shows **40**, with *Mayday* (2026, 8.0) first — one of the two titles named as obviously missing. Gated eval metrics unchanged either side (p@10 1.000, MRR 0.900), as expected: retrieval did not move, one card stopped calling it. The fixture entry now uses the card's sentence and its `_note` preserves the retired phrase's measurement, so re-adding a phrase has to be justified against it. Script: `scripts/test/newgood-path-compare.mjs`. ✅ **Cause 2 closed 2026-09-09 (engine/web follow-up), applied and measured.** Migration 082 gives `match_titles_by_vector` a `min_release_year` argument applied inside the scan; `semanticCore` threads it through and keeps the post-filter behind it as a no-op safety. Across the eval fixture's sixteen queries: **7.4 mean survivors of 150 before, 150.0 after**, 16 of 16 queries short before and 0 of 16 after, for +25 ms rpc p50 (70 → 95 ms). The prediction that it would only widen the funnel was wrong, and the reason matters: only 4.89% of embedded titles clear the floor, and at that selectivity the planner drops the HNSW index and sequential-scans, so the answer is brute-force exact (`Seq Scan`, 1,690 rows, 67 ms). The HNSW post-filter caveat applies to the LESS selective branch instead — at a 2010 floor (51%) the planner keeps the index. Exactness is therefore a property of catalogue size, not a contract: a much larger catalogue pushes this case back onto the index and needs `hnsw.iterative_scan = 'relaxed_order'`. Unfiltered retrieval is untouched and still index-scans at 16 ms. **Still open:** cause 3, the ingest gap that leaves *Mousetrap* (2026) and *Mayday* (2026) with no `titles` row at all — to which device testing on the evening of 2026-09-09 added **Project Hail Mary**, absent from `titles` while a user was actively searching for it by name (see IN-SL-011). Three named examples now, all 2026 releases. |
| IN-SL-006 | **A refine chip re-armed the search-attribution taste boost.** The refine row shipped (2026-09-09, Session 4) stamping `mood_key: intent.moodKey` and the typed text on every chip toggle. `isContentIntentSearch` reads a `filter` row carrying a `mood_key` as a mood preset tapped with the semantic flag off — real content intent — so **every chip tap while a preset was lit re-armed the 60 s 1.3x boost** that IN-PX-43's own rule says a re-slice of the current page may never earn, and typing kept `moodKey`, so a chip on a typed grid boosted off a stale preset. The duplicated text was also aggregated a second time by the migration 079 rollup under `mode='filter'`. Neither failed loudly; the rows looked reasonable. The class of defect is what to remember: **a later session wrote metadata that an earlier session's rule interpreted as intent**, three sessions apart, the two definitions in files neither session had reason to open together. | ✅ **Closed 2026-09-09 (review follow-up A).** Both ends. The call site builds its metadata through `refineLogMetadata` (`src/lib/content/refineChips.ts`) — a function, not an object literal, because what makes the row safe is the fields it does *not* carry, and `query` is null so the 079 rollup never sees the term twice. And `isContentIntentSearch` excludes any `filter` row with a `refine` key outright, because the batch recompute still has to judge every row already written to production and a rule that holds only while each caller remembers is not a rule. Tests: refine row with a `mood_key` → not intent; preset tap with a `mood_key` → still intent; the emitted metadata carries no `mood_key` and no `query`. |
| IN-SL-007 | **`search_logging`'s flag read cost a network round trip per settled query, and never expired.** `getFlag` called `supabase.auth.getUser()` — a request to `/auth/v1/user` — *before* consulting its own memo, so the "a flag-off user costs no network at all" promise in the hook's header was false by one auth request per query. The memo had no TTL, so a flag turned **off** mid-session, which is how consent is withdrawn, kept logging until the app was restarted. Separately, `useSearchLogging` recorded a query in its once-per-search dedupe set *before* the gate ran, so a query settled while the flag was off was permanently invisible for the life of that mount even if the flag came on a minute later. | ✅ **Closed 2026-09-09 (review follow-up A).** `getSession()` (reads storage, no network) replaces `getUser()`; the memo carries a 10-minute TTL, so withdrawing consent reaches the app within ten minutes rather than at next launch; and the hook asks the gate before recording the dedupe key, with an in-flight set so overlapping terminal flushes still cannot double-write. Directly relevant to [IN-SL-003](#) — the interim consent mechanism is a per-user flag, and it now actually takes effect while the app is running. Covered by `src/lib/__tests__/featureFlags.test.ts`. |
| IN-SL-008 | **Browse routing, filtering and empty-state defects found by the 2026-09-09 review** (findings 2–5 and four nits). `describedRoute` was computed while Mode A was still fetching, so every settled query fired an embed call and flashed the described layout before the title card; `applyBrowseFilters` ran over "other matches" on the title-hit route where the refine row and *More filters* are both hidden; the zero-result copy named a chip to remove before checking whether Mode A had returned anything, and could name *Free to watch* on the one grid that ignores `cost`; the banner named the last card tapped rather than the card whose phrase was running; and a failed embed logged `result_count: 0` into the zero-result tripwire. | ✅ **Closed 2026-09-09 (review follow-up A).** Routing waits on `results !== undefined`; the title-hit grid is unfiltered (sort kept — reordering hides nothing); the refine copy needs `tightened \|\| !searching` and takes `clientSideOnly` so it drops chips that grid cannot apply; `intent.phraseKey` tracks the phrase-bearing card separately from `moodKey`; the semantic error path passes `undefined` to both loggers and holds. Also in the same PR: migration 081 (079's cutoff → `(now() AT TIME ZONE 'UTC')::date`, and its `ON CONFLICT` now adds rather than overwrites), the dead "not last week" branch deleted from `selectPresets`, the two unreachable eval-fixture entries marked, and `docs/legal/store-privacy-disclosures.md` widened to every metadata key the rows actually carry. |
| IN-SL-009 | **Review follow-up B — engine and web** (2026-09-09 review, findings 6, 7 and 9). `foryouRender.ts` now accumulates all 36 rendered ids into `usedIds`, so up to ~37 titles the user never sees unfiltered are excluded from *Outside Your Usual* and *New to rent or buy* — the unfiltered feed is not unchanged, contrary to the PR. `applyMMR` went from k=20/15 to k=36 with no CPU measurement; `ForYouPayload.renderMs` exists and can settle it from a week of Worker logs either side of 2026-09-09. And web search still partitions on `item.type === 'doc'` (`src/hooks/useSearch.ts`, `src/App.tsx`), so web "Movies" excludes documentary films — the instruction to replace every `=== 'doc'` branch was unconditional and the PR claimed it done. | ✅ **Closed 2026-09-09 (review follow-up B).** All three, plus the `released` push-down and two defects the grep turned up that the review had not listed. **Finding 6:** `usedIds` splits — the full 36 still dedups the two long rows against each other, because a filter can pull any of them into view, while everything built after them gets the visible head only (20 + 15). The trade is stated rather than avoided: a title can sit in the reserve tail AND in *Outside Your Usual*, which is the lesser fault against silently thinning two rows that are always on screen. **Finding 7:** "bytes, not compute" was wrong — MMR is quadratic in k over 1536-d vectors and the three passes in a cold render went from ~93 ms to ~318 ms (k=15 31 ms, k=20 54 ms, k=36 170 ms). `MMR_MAX_K = 20` returns it to ~108 ms; the reserve beyond the cap is filled by score with the genre spread applied. The visible row is unchanged, and that is a property rather than luck: greedy MMR is prefix-stable. **The measurement is a benchmark because production holds nothing** — `renderMs` is returned in the payload and logged only by the web client's browser console, so no Worker log line carries it and no dashboard access would have produced the comparison the review asked for. Anyone wanting cold-render latency watched has to move that `console.log` into `workers/api/src/index.ts` first. **Finding 9:** five web branches replaced, not two — plus the web Browse *Docs* segment and Home's *Docs* category, which each fetched movies only and constrained neither call to genre 99, so both returned every film on the user's services. `useContentService.ts` carries the same branch and has no callers, left for whoever deletes the hook. Every remaining `'doc'` in `src/` and `native/src/` is a filter VALUE (`filters.contentType === 'doc'`), not a per-item type test. `eval:eng1` and `eval:novelty` re-run green. See IN-SL-005 for the `released` push-down. |
| IN-SL-010 | **The two-card compose the recommendation is built on is not reachable in the UI.** §2.3 is explicit that a preset tap MERGES rather than replaces, and the brief's motivating sentence — *"a new film I don't have to pay for that isn't cheesy crap"* — is described throughout as **two taps**: a vibe card and a constraint card, stacking. It cannot be done. The four cards render only inside `BrowsePresearch`, which `browse.tsx` shows when `presearch` is true, and `presearch` requires `!searching && !semanticMode && activeCount === 0`. Every card sets a phrase, filters, or both, so the FIRST tap ends the pre-search state and the other three cards disappear. Reaching them again means *Clear all*, which resets the phrase, the preset and the filters — the exact state the second tap was meant to build on. Found 2026-09-09 while trying to reproduce review finding 5 on a device: that finding (the banner naming the last card tapped rather than the card whose phrase is running) describes a state no sequence of taps can produce, which is why the device test could not reproduce it and why nobody had noticed the composition gap either. | 🛑 **Discharged by decision (Joe, 2026-09-09): the refine row is the composition surface; the layout is not rebuilt.** What the cards actually add, checked against the chips before deciding: #5 *New & actually good* is `released` + `minRating`, which is *Newer* + *Higher rated*; #6 *Free to watch* is `cost`, which is the chip of the same name; #7 *Finish it tonight* is `contentType` + `runtime`, which is *Just films* + *Under 2h*. Only #8 *Whole family* carries filters no chip has. And `intent.phrase` is a single string, so a second phrase-bearing card REPLACES the first — two vibe cards could never have composed as a query whatever the layout did. That leaves exactly one real pairing, a vibe plus a phrase-less constraint (#5, #6), and it is reachable today through the chips: the brief's motivating sentence is three chips and needs no card at all. Rebuilding the layout would restore a second control cluster above the grid, which is what the refine row was built to remove on device evidence. What is genuinely lost: #7's and #8's phrases and #8's genres work as an opening move only, and the plain words on the cards — which are what teach a new user that anything composes — disappear after the first tap. **Reopening condition, written into §6 as a metric rather than left to instinct:** a *Clear all* followed by a preset tap within ~10 s is the observable form of "I wanted to stack these". If that is common after two weeks of real use, build the card affordance back INTO the refine block, not above the grid. §2.3 carries the correction and the reasoning. |
| IN-SL-011 | **A half-remembered title found nothing where the full one worked.** Device testing 2026-09-09: "Hail Mary" returned an empty grid, "Project Hail" returned the right film. `titleMatchScore` scaled every partial match by how many CHARACTERS of the title the query accounted for, and gave a match that starts the title (0.85) far more credit than one inside it (0.6). "hail mary" is 9 of the 17 characters of "project hail mary" and does not start it, scoring 0.32 against a 0.5 floor — **less than "sever" scores against "Severance"**, which the floor exists to reject. The user had named two of the title's three words; the scorer could not tell that from an arbitrary run of characters. Two things made it worse: the film is not in `titles` at all, so the Postgres ILIKE path that would have matched it substring-wise returned nothing (see IN-SL-005 cause 3); and once it routed to the described layout, the genres carried from a Comfort tap plus the recency and rating floor from *New & actually good* emptied the semantic grid too. | ✅ **Closed 2026-09-09.** `titleMatchScore` now recognises a contiguous run of WHOLE title words and scores it like a prefix, with coverage taken as the larger of the character share and the word share — `max`, so no existing score can fall. "hail mary" goes 0.32 → 0.567 and clears the floor; "project hail" stays at 0.60 exactly; "sever" stays at 0.47 and is still rejected, because a partial word is not a named one. Adjacency and order are both required, so "mary hail" and "project mary" fall to the weaker reordering rung. A partial name still cannot clear the confidence bar on the match alone (0.567 × 0.7 = 0.397), so ~256 votes of prominence are needed — the guard against opening a card for an obscure title that merely contains the words. The eight known-title fixtures and the eight preset sentences are now asserted against this module directly, which is what `titleHit.ts` always claimed and nothing enforced. |
| IN-SL-012 | **Title-hit scorer cannot tell a half-remembered name from a genre phrase.** The 2026-09-09 whole-word-run rule (IN-SL-011) that lets "hail mary" open *Project Hail Mary* also lets a short marker-less description that is a run inside a prominent longer title open a card: "true crime" → *True Crime Story*, "easy and warm" → *Easy and Warm Nights* (2/3 words, ≥ ~256 votes). 2/4 words does not; a description marker always wins. Pinned by tests in `src/lib/search/__tests__/titleHit.test.ts` ("the whole-word-run boundary") so the boundary cannot move silently. Not fixable in the scorer without losing IN-SL-011; the structural fix is the query-understanding step (recommendation §8.2). Watch the `route=title` rows in the search log for two-word genre phrases. | ⏳ Filed 2026-09-10 (review remainder 4). Resolves with query understanding. |

## Counts

- Total entries: **110** (Pre-PRE 1 + P0 13 + P0.5 7 + P0/0.5 cross 6 + P1 5 + P2 3 + P3 3 + P4 4 + P4.5 16 + OB 6 + XPS 14 + PX-21..35 15 + PX-36..38 3 + PX-39..45 7 + PX-50..54 5 + PX-55..57 3 + V3-001..003 3 + SL-001..003 3 + SL-005 1 + SL-006..011 6).
- ✅ Incorporated: **71** (H0 Stream D 2026-07-06 added: IN-PX-29, IN-PX-30, IN-PX-50, IN-XPS-003, IN-XPS-007, IN-461. Phase 5.5 close 2026-05-15 added: IN-PX-21..28 except 29/30/32, IN-PX-31, IN-PX-33, IN-PX-34, IN-PX-35, IN-PX-51, IN-XPS-001, IN-XPS-006, IN-465; bumped IN-XPS-012 from partial → ✅ on parity activation).
- ⏳ Pending / Not yet incorporated: **25**, plus IN-SL-004 recorded as a standing position rather than a task (H0 Stream D closed 6 of the prior 30; Phase 5.5 added: IN-XPS-014, IN-PX-52, IN-PX-53, IN-PX-54; reclassified IN-458, IN-462 to Phase 6; ENG-1 close 2026-06-10 added IN-PX-55, IN-PX-56, IN-PX-57; search-logging close 2026-09-08 added IN-SL-001, IN-SL-002, IN-SL-003 and closed IN-V3-003; presets session 2026-09-09 closed IN-SL-002; refine-row session 2026-09-09 closed IN-SL-001 and added IN-SL-005; the 2026-09-09 review added IN-SL-006..009 and follow-up A closed 006, 007 and 008 the same day; device testing that evening added IN-SL-010 and IN-SL-011, closing 011 and discharging 010 by decision; follow-up B closed IN-SL-009 the same evening).
- ⚠ Partial: **2** (IN-104; IN-XPS-004 — now unblocked but rotation is a pending Joe-owned dashboard ceremony).
- 🛑 Discharged: **3** (IN-260; IN-V3-003 retired 2026-09-08; IN-SL-010 decided 2026-09-09 — the refine row is the composition surface, with a reopening metric in §6).
- 🅿 Parked: **6** (IN-PX-06, IN-261, IN-XPS-008, IN-XPS-009, IN-OB-006, IN-PX-42).

## Pre-launch blockers (subset of pending)

See the dedicated [pre-launch-blockers register](pre-launch-blockers.md). Phase 5.5 closed items 5 / 6 / 26 (delete + export + privacy/ToS pages); items 7 / 8 (privacy policy counsel review + controller details) collapsed into **IN-XPS-014** as a single solicitor-review blocker. The IN-XPS-004 / IN-XPS-007 entries remain.
