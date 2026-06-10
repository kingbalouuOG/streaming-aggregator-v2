---
title: Phase History
type: concept
tags: [phase-history, timeline, deliverables]
created: 2026-04-26
updated: 2026-05-15
sources:
  - raw/phase-summaries/Videx_v2_Phase_0_End_of_Phase_Summary.md
  - raw/phase-summaries/Videx_v2_Phase_0_5_End_of_Phase_Summary.md
  - raw/phase-summaries/phase-1-summary.md
  - raw/phase-summaries/phase-2-summary.md
  - raw/phase-summaries/phase-2.5-summary.md
  - raw/phase-summaries/phase-2.6-summary.md
  - raw/phase-summaries/phase-3-summary.md
  - raw/phase-summaries/phase-4-summary.md
  - raw/phase-summaries/phase-4-and-4.5-summary.md
  - raw/phase-summaries/phase-4.5-anchored-rooms-summary.md
  - raw/phase-summaries/IN-466-server-side-foryou-render-summary.md
  - docs/v2/phase-summaries/phase-5-summary.md
  - raw/phase-summaries/phase-5.5-summary.md
  - raw/research/in-465-catalogue-sync-gap.md
  - raw/reference/phase-timeline.md
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.8.md
related:
  - wiki/sources/phase-summaries.md
  - wiki/entities/codebase/migrations.md
  - wiki/concepts/operations/phase-0.md
  - wiki/concepts/operations/phase-0-5.md
  - wiki/concepts/operations/phase-1.md
  - wiki/concepts/operations/phase-2.md
  - wiki/concepts/operations/phase-2-5.md
  - wiki/concepts/operations/phase-2-6.md
  - wiki/concepts/operations/phase-3.md
  - wiki/concepts/operations/phase-4.md
  - wiki/concepts/operations/phase-5.md
  - wiki/concepts/operations/phase-5-5.md
---

# Phase History

Compressed timeline of v2 phases. One row per phase. Click into per-phase pages for deviations, lessons, evidence.

| Phase | Date | Branch | Migrations | Outcome | Per-phase page |
|---|---|---|---|---|---|
| 0 — Instrumentation | 2026-04-10 | `phase-0-instrumentation` | 012, 013, 014, **015**, **016** (deviation +2) | Lifecycle manager, dwell timer, impression batcher, session ID, dismiss→not_interested rename. 14/14 end-to-end checks PASS. | [phase-0](phase-0.md) |
| 0.5 — Content enrichment | 2026-04-11 | `phase-0.5-content-enrichment` | 017 | 4 columns added to titles. 19,993/20,000 enriched. Director gate split by media_type (movies 99.7%, TV 54.9%). New `supabase/cron/` directory. | [phase-0-5](phase-0-5.md) |
| 1 — Content embeddings | 2026-04-12 | (merged commit `2fd4289`) | 018, 019 | 19,993 titles embedded with text-embedding-3-small. HNSW index. Wire format spike: `JSON.parse(row.embedding as string)`. Cluster eval conditional pass. Backfill cost ~£0.04. | [phase-1](phase-1.md) |
| 2 — Service fingerprints | 2026-04-12 | `phase-2-service-fingerprints` | 020 | 10 services fingerprinted (top-150 by popularity). Discrimination conditional pass (catalogue overlap structural). 3 services (BBC/NOW/SkyGo) absent → IN-250. | [phase-2](phase-2.md) |
| 2.5 — TMDb backfill | 2026-04-12 | `phase-2.5-tmdb-provider-backfill` | 0 (data-only) | 600 SA rows inserted (BBC/NOW/SkyGo, 200 each). All 13 services fingerprinted. BBC × MUBI conditional pass (BBC catalogue is broader than expected). Cosine drift 0.0027 PASS. | [phase-2-5](phase-2-5.md) |
| 2.6 — Fingerprint refinement | 2026-04-13 | `phase-2.6-fingerprint-signal-refinement` | 022 | v2 exclusivity-weighted centroids tested. Bottom-half variance gate FAIL (5/13). WU-3 skipped per early-exit. Decision: ship v1_popularity. `match_titles_by_vector` RPC added (Phase 3 inheritance). | [phase-2-6](phase-2-6.md) |
| 3 — Taste vector v2 | 2026-04-14 → 16 | `phase-3-taste-vector` | 023, 024, 025, **028** | 1536D taste vector. Auth integrated into onboarding Step 1. Bootstrap dynamic 4-band weights by watched-grid count. Quiz subsystem deleted (15 files, ~5,227 lines). 10 hooks rewritten. | [phase-3](phase-3.md) |
| 4 — Ranking pipeline & rows | 2026-04-17 → 19 | `main` (direct commits) | 0 | Stage 2 implemented as 3-component sum (62.5/25/12.5) + diversity post-processing. 7 Home rows + 7 For You rows. 4 sliders wired with bottom-sheet tray + haptic feedback. ~260ms time-to-first-render. | [phase-4](phase-4.md) |
| 4.5 — Mood Rooms | 2026-04-19 → 27 | `phase-4.5-mood-rooms` | 029, 030, 031, 032, **033**, **034**, **035** | Gates 1–4: UMAP+HDBSCAN ships 68 rooms at 53.5% coverage. GitHub Actions monthly cron. RPCs for ranking, thumbnails, detail. Gate 4 hotfix (PostgREST 1000-row cap → RPCs; `card_impressions.source_surface` CHECK fix). Redirect: title-anchored mood rooms replace global rooms on For You row. IN-463 LLM thematic labels via `label-anchor-room` Edge Function. IN-466 server-side render via `render-foryou-rows` Edge Function. Cold-start fix: 035 changes `get_available_tmdb_ids` to JSONB array. | [phase-4-and-4.5-summary.md](../../../docs/v2/phase-summaries/phase-4-and-4.5-summary.md) |
| 5 — Contextual signals + pre-launch hardening | 2026-05-06 (closed) | `phase-5-contextual-signals` (PR #4, merge `ca678bb`) | 036, 037, 038, 039 | Real `contextual.ts` (time 40% / viewing 40% / device 20%) replaces 0.5 placeholder. MMR over 1536D embeddings replaces `applyGenreSpread` (genre-spread retained as fallback). 4 security migrations: taste_profiles RLS, drop `marked_watched` event_type, `username_available` SECURITY DEFINER RPC, cron jobs Vault-backed JWT (storage hygiene only — full rotation deferred). CORS tightened on browser-callable Edge Functions. `<Database>` generic re-enabled (52 errors closed). New CI: `edge-fn-jwt-guard`, `foryou-parity` (latter pending secrets). Migration 040 (IN-458 typed pairs) deferred to 5.5. | [phase-5](phase-5.md) |
| Search V2 — Filtered + semantic search | 2026-05-13 (closed) | `phase-search-v2` (PR #8) | 041 | Single PR, two commit clusters. **Cluster A (unflagged):** typed `FilterState` + URL serialisation, FilterSheet 9-section rewrite (DECADE + UK RATING dropped), new primitives (`ServiceTile`, `ActiveFilterPill`, `MoodChip`), `<ContentCard>` 3-state vocabulary (on-service / on-service-rent-or-buy / off-service tint with `£` price-pill fallback), three-parallel-sources retrieval (TMDb movie + TV + Postgres ILIKE — A8 reverted from pre-call RPC mid-phase) with shared `useItemAvailability` hook, as-you-type suggestions, recents, instrumentation (`mode`, `query_hash`, `filter_set_hash` in `card_impressions.metadata`). **Cluster B (flagged behind `search_semantic`):** migration 041 `user_feature_flags` composite-PK table + typed `getFlag` accessor (first per-user flag store, reusable pattern), `embed-query` Edge function with in-memory LRU cache, shared 60/25/15 ranker at `_shared/recommendations-v2/search/semanticRetrieval.ts` (single source, drift-impossible), Mode C UI affordances, eval rig (`scripts/test/search-semantic-eval.ts` + 2-query stub) + CI workflow. Reordered **ahead of Phase 5.5** (kickoff brief had 5.5 first). Three-agent close-out: security SAFE-TO-MERGE, TypeScript SHIP-IT (two trivial follow-ups filed), performance FIX-FIRST → fixed (commit `9ec4868` — mood-chip Mode A clobber). | [phase-search-v2](phase-search-v2.md) |
| 5.5 — Quality + legal + catalogue hardening | 2026-05-15 (closed) | `claude/zealous-dijkstra-0fe0d7` (PR #11) | 042, 043 | **30 commits across three clusters.** Cluster A (quality / type / perf): regen `database.types.ts` + 28 `as any` casts removed at the Supabase boundary + `typegen-check` CI; `ViewingContext` narrowed at the profile boundary; `buildRowFromPool` options object; MMR returns `{ selected, bailedOut }` with partial-coverage fallback to `applyGenreSpread`; embedding cache 24h client localStorage + per-Edge-instance Map keyed `userId + taste_profiles.updated_at`; `Map<string, number[]>` → `Map<string, { vec: Float32Array; norm: number }>` at MMR consumers (~3× hot-loop speedup via cached cosine norms); vitest + 10 pure-function tests; `edge-fn-jwt-guard` extended to central `supabase/config.toml`; `supabase/cron/*.sql` deleted (migration 039 sole source); foryou-parity golden probe + JWT refresh script + activation (5 secrets + golden seed). Cluster B (legal): migration 042 `delete_own_account` (belt-and-braces explicit DELETEs across 8 tables — closes the source-of-truth gap) + UI flip + type-username confirm; migration 043 `export_user_data` SECURITY DEFINER RPC + `@capacitor/filesystem` Documents write / Blob download; Privacy Policy + ToS markdown authored with lawyer-vetting caveat (IN-XPS-014 filed as hard pre-launch blocker) and rendered via `react-markdown` from `?raw` Vite imports. Cluster C (catalogue gap, IN-465): investigation diagnosed 5,446 missing tmdb_ids (84% Prime back-catalogue, 74% pre-2010, 79% popularity-q1, TMDb `/discover` 500-page cap structural); **critical pipeline-split finding** — `daily-content-sync` cron only writes to `streaming_availability`, never `titles`, so `scripts/backfill_missing_titles.ts` (its `LEFT JOIN ... WHERE titles IS NULL` query) IS the recurring fix. Production run: 2,698 upserted / 2,748 TMDb-404 / 0 errored; `titles` grew 20,140 → 22,838. Two mid-run bug fixes: PostgREST 1000-row default pagination + TMDb empty-string date null-coerce. Post-merge review pass (kieran-typescript-reviewer + repo-research-analyst): SHIP-IT with 2 MUST-FIX nits (`clearEmbeddingCache` on SIGNED_OUT + Edge dead code) both fixed pre-merge in commit `e9c8560`. Four follow-ups filed for Phase 6: **IN-XPS-014** (UK solicitor review — hard pre-launch blocker), **IN-PX-50** (scheduled Edge backfill automation), **IN-PX-52/53/54** (Edge typegen, Safari 5MB cache cap, CI check for user-scoped tables in delete + export RPCs). | [phase-5-5](phase-5-5.md) |
| v3 editorial redesign + pre-launch chrome | 2026-05-09 (closed) | `v3design-system-exploration` (PR #7, squash-merge `2dfc685`) | 040 (`editor_notes`) | Full editorial-magazine redesign across 35+ matrix rows in `docs/design/redesign-plan.md`. New tokens (paper / ink / cream surfaces, atmosphere / service tints, glass-scrim weights, badge halo, star, type ramp at `--t-body 13`). New components: `MagazineHero`, `EditorsNote`, `LongRead`, `NumberedChart`, `FreeTonight`, `WideCard` (real TMDb backdrops), `CalendarList`, `TopAppBar`, `genreIcons`. ContentCard / WatchlistPage / FilterSheet / ProfilePage / DetailPage / OnboardingFlow / auth screens all migrated to the editorial vocabulary. Bottom-nav glyphs normalised to a 4→20 (16×16) optical-weight bbox. ServiceBadge fallback uses `var(--svc-*)`; ServiceStack outline removed (Disney+ / Prime brand colours bleed edge-to-edge). Independent code review (kieran-typescript-reviewer) ran pre-merge; all must-fixes addressed. Post-merge polish on Android device: hero/LongRead full-bleed on mobile, TopAppBar non-sticky with `calc(env(safe-area-inset-top) + 20px)` symmetric padding (the earlier `pt-5 safe-top` mix was silently overriding the env-inset), CategoryFilter retained on Home as static chips with the trailing filter button suppressed. Parking-lot follow-ups filed: IN-V3-001 (Long Read data layer), IN-V3-002 (taste-v2 surface for hero match% + mood), IN-V3-003 (mood refiner real wiring — UI shipped behind `MOOD_REFINER_ENABLED=false` flag). | [redesign-plan.md](../../../../docs/design/redesign-plan.md) |
| 6 — Launch | not started | — | (none planned today) | APK release build (signing keystore, versionCode/Name bump). Full pre-launch blocker review (see [pre-launch-blockers register](../../registers/pre-launch-blockers.md)). Two prototype users re-onboard. Cryptographic service-role JWT rotation if Supabase tooling supports JWT-format secrets by then. | — |

## Conflict resolutions captured

- Migration 021 reserved → rolled into 022 (Phase 2.6). Numbering continues 023+.
- Strategy v1.5 said Phase 0 would ship 3 migrations; actual Phase 0 shipped 5 (012-016). Strategy v1.6.3 §6 renumbered downstream by +2.
- Strategy v1.6.3 §5.2 5-component weight table represents intent; Phase 4 actuals shipped 3-component scoring sum + diversity as post-processing per §5.2 Phase 4 implementation note.
- Mood rooms target 30-60 rooms in strategy; actual Phase 4.5 shipped 68 rooms at 53.5% coverage. Strategy doc updated; per-phase reality stands.
- Phase 3 hook rewrite scope: brief said 9 files; actual 10 (added `useTasteProfile`).
- Phase 0.5 enrichment scope: brief said 5 columns; actual 4 + opportunistic backfill of pre-existing `runtime`.
- Phase 0.5 director coverage: brief had a single 80% gate; phase split it by media_type post hoc (movies ≥95%, TV best-effort), recorded as IN-PX-07 policy.
- Phase 4.5 expanded mid-phase: original Gates 1–4 shipped global mood rooms; mid-phase redirect re-targeted For You row to title-anchored rooms (migration 033). IN-463 LLM thematic labels (migration 034) and IN-466 server-side render shipped under the same branch before merge.
- Phase 5 framing change on migration 039: original plan was a service-role JWT cryptographic rotation. Reality: Supabase dashboard moved to opaque `sb_secret_…` tokens that fail `verify_jwt = true` on Edge Functions. Phase 5 shipped Vault storage migration only (same JWT value, different storage location); cryptographic rotation deferred to Phase 6+ pending Supabase tooling.
- Phase 5 latent bug fix: `INTERACTION_WEIGHTS` keyed on `marked_watched` (legacy name) but DB event_type is `watched`; the per-click incremental update was silently no-op'ing on every "Mark as watched" click since Phase 3. Renamed in Phase 5; vectors rebase on next 24h taste-recompute cycle.
- Bootstrap weights flipped from watched-grid-dominant to cluster-dominant on 2026-05-08 (interphase, ADR-013). Validated via 2,280-trial simulation sweep: CAF 1.06 → 1.22, Persona-Distinctness 0.022 → 0.190. Cluster representatives also deduplicated (each title in exactly one cluster) and TV reps added to four movie-only clusters (`tasteClusters.ts`). Watched-grid candidate pool restructured into dual query — movies `vote_count ≥ 5000`, TV `vote_count ≥ 1500` AND `popularity ≥ 20`, both ordered by `vote_count` DESC (`OnboardingFlow.tsx`); service-availability filter removed. Existing prototype profiles do **not** auto-rebootstrap (`recomputeFromInteractions` uses saved bootstrap as anchor) — backfill required.

## Realistic timeline note

Strategy v1.6.3 §7.2 estimates 14-18 weeks for Phases 0–6 of focused effort. Actuals through Phase Search V2: ~34 days of elapsed wall time (2026-04-10 → 2026-05-13). Phase Search V2 itself landed in one focused push (~3 days of active work against the 6–8d kickoff estimate, with substantial mid-flight UX iteration driven by live testing).

## Phase order shift

The kickoff brief for Phase Search V2 assumed Phase 5.5 would merge first. Reality: Phase Search V2 was prioritised ahead of 5.5 so the family-tester search flow could land before legal-cluster blockers. H1 of the kickoff brief (the "5.5 first" assumption) is void; 5.5 picks up after Search V2.
