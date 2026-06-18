---
title: Cheatsheet — phases, branches, migrations, features at a glance
type: register
tags: [register, cheatsheet, phases, migrations, branches]
created: 2026-04-26
updated: 2026-06-18
sources:
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.3.3.md
  - raw/codebase-snapshots/migration-changelog.md
  - raw/reference/phase-timeline.md
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - docs/v2/phase-summaries/phase-5-summary.md
  - docs/v2/phase-summaries/phase-search-v2-summary.md
  - raw/phase-summaries/phase-5.5-summary.md
  - docs/v2/phase-summaries/phase-eng-1-summary.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/entities/codebase/migrations.md
---

# Cheatsheet

> **New to the repo?** Read [Platform architecture](../concepts/architecture/platform-architecture.md) first — one repo, three surfaces (web · native · Worker), one shared `src/lib` engine. The Expo app under `native/` is the **live** product (`app.videx.streaming` v2.0.0) since the NATIVE-4 cutover; the old `videx-native` worktree was consolidated into this single folder on 2026-06-18.

Single-page lookup table for "which phase, which branch, which migration, what shipped". For narrative detail, see the per-phase pages under [operations](../concepts/operations/phase-history.md).

## Phase / branch / migration map

| Phase | Branch | Status | Date | Migrations | Headline outcome |
|---|---|---|---|---|---|
| Pre-0 | direct on `main` | merged | 2026-04-08 | 011 | Profiles baseline. |
| 0 | `phase-0-instrumentation` | merged | 2026-04-10 | 012, 013, 014, **015**, **016** | Lifecycle manager, dwell timer, impression batcher, session ID. `dismiss` → `not_interested`. 14/14 verification PASS. |
| 0.5 | `phase-0.5-content-enrichment` | merged | 2026-04-11 | 017 | 19,993/20,000 titles enriched (`keywords`, `cast_top_5`, `director`, `content_rating`, `runtime`). New `supabase/cron/` directory. |
| 1 | (per source list `phase-1-embeddings` or merged commit `2fd4289`) | merged | 2026-04-12 → 14 | 018, 019 | 19,993 titles embedded with text-embedding-3-small. HNSW index 156 MB. Wire format spike: `JSON.parse(row.embedding as string)`. Backfill cost ~$0.047. |
| 2 | `phase-2-service-fingerprints` | merged | 2026-04-12 → 15 | 020 | 10 services fingerprinted (top-150 by popularity). MUBI, Discovery+ discriminate clearly. BBC/NOW/SkyGo absent → IN-250. |
| 2.5 | `phase-2.5-tmdb-provider-backfill` | merged | 2026-04-12 → 15 | 0 (data-only) | 600 SA rows inserted (BBC/NOW/SkyGo, 200 each). All 13 services fingerprinted. Cosine drift 0.0027 PASS. |
| 2.6 | `phase-2.6-fingerprint-signal-refinement` | merged | 2026-04-13 → 16 | 022 | v2 exclusivity-weighted centroids tested. Bottom-half variance gate FAIL (5/13). Decision: ship v1_popularity. |
| 3 | `phase-3-taste-vector` | merged | 2026-04-14 → 17 | 023, 024, 025, **028** | 1536D taste vector. Auth integrated into onboarding Step 1. Bootstrap dynamic 4-band weights. Quiz subsystem deleted (15 files). |
| 4 | `main` (direct commits) | merged | 2026-04-17 → 19 | 0 | Full multi-stage pipeline. 7 Home + 7 For You rows. 4 sliders + bottom-sheet tray + haptics. ~260ms time-to-first-render. |
| 4.5 | `phase-4.5-mood-rooms` | merged | 2026-04-19 → 27 | 029, 030, 031, 032, **033**, **034**, **035** | UMAP+HDBSCAN ships 68 mood rooms at 53.5% coverage. Gate 4 hotfix RPCs. Mid-phase redirect: title-anchored rooms (033), LLM thematic labels (034, IN-463), cold-start JSONB fix (035). IN-466 server-side For You render. |
| 5 | `phase-5-contextual-signals` (PR #4) | merged | 2026-05-06 | 036, 037, 038, 039 | Real `contextual.ts` (time 40 / viewing 40 / device 20) replaces 0.5 placeholder. MMR over embeddings replaces `applyGenreSpread` (retained as fallback). Security: taste_profiles RLS, `marked_watched` drop, `username_available` RPC, Vault-backed cron JWT. `<Database>` generic re-enabled. |
| v3 redesign | `v3design-system-exploration` (PR #7) | merged | 2026-05-09 | 040 (`editor_notes` — **in repo, NOT applied**) | Editorial-magazine redesign: tokens, MagazineHero / EditorsNote / LongRead / WideCard etc.; all major pages migrated. |
| Search V2 | `phase-search-v2` (PR #8) | merged | 2026-05-13 | 041 | Typed FilterState + URL sync, FilterSheet rewrite, 3-source Mode A retrieval, semantic Mode C behind `search_semantic` per-user flag (`user_feature_flags`). |
| 5.5 | `claude/zealous-dijkstra-0fe0d7` (PR #11) | merged | 2026-05-15 | 042, 043 | Quality/type/perf cluster (typegen, MMR fallback, embedding cache, vitest rig), legal cluster (delete account 042, data export 043, Privacy/ToS pages), catalogue gap closure (IN-465 backfill: titles 20,140 → 22,838). |
| ENG-1 | `phase-eng-1-multi-interest` | closed | 2026-06-10 | 044, 045 | Multi-interest centroids (K ≤ 3) + retrieval fan-out, avoid-set negative scoring (vectors positive-only), exploration slots (positions 6 + 14), training extract view. First E&P Hardening track phase. |
| REPO-1 | `phase-repo-1-hygiene` | merged 2026-06-10 (PR #15) | 2026-06-10 | 046 (applied) | Repo hygiene: docs reorganisation (`docs/v3-design/` → `docs/design/`), `npm test` single entry (146 tests), `no-explicit-any` → error, `title_genres`/`title_credits` dropped. |
| PLAT-1 | `phase-plat-1-client-data-layer` | closed (PR #16) | 2026-06-10 | — | TanStack Query everywhere (cache.ts deleted), React.lazy + idle prefetch, TanStack Virtual ×3 surfaces, LQIP images, Zustand store + memo. Bundle −44.5%. |
| PLAT-2 | `phase-plat-2-api-proxy` | closed 2026-06-12 | 2026-06-11 | — | `workers/api/` Worker (Hono) live on workers.dev: merged `/v1/title` (24h CDN, warm 114ms) + allowlisted `/v1/tmdb/*` passthrough. TMDb/OMDB keys out of the client bundle (dist-grep acceptance). Device smoke 188 reqs all Ok. Joe rotates both keys post-merge. |
| PLAT-3 | `phase-plat-3-single-engine` | closed 2026-06-12 | 2026-06-12 | — | Single engine: Worker imports src/lib directly (ADR-014 supersedes ADR-011/012). `/v1/foryou` + KV feed cache (~175ms hits) + nightly recompute cron. Mirror + drift CI + parity CI + render-foryou-rows DELETED (~3,700 LOC). Client pipeline survives one release (IN-PX-59). Joe deletes the deployed Edge fn post-merge. |
| UX-1 | `phase-ux-1-perceived-performance` | closed 2026-06-12 | 2026-06-12 | — | Keep-alive tabs (single-frame switches), persisted instant For You paint, idle-deferred hydration (4s freeze gone), M3 fade-through + Reveal cascade, LQIP dark-ghost clamp, splash-holds-til-paint. Frame-forensics method (am start NOT monkey). Residuals: IN-PX-61. |
| NATIVE-1 | `phase-native-1-expo-shell` | merged | 2026-06-12 | — | Capacitor → RN/Expo rebuild begins: Expo SDK 56 shell, shared `src/lib` via Metro junction. Device evidence: native p99 frame 15ms vs Capacitor 57ms. |
| NATIVE-2 | `phase-native-2-core-loop` | merged | 2026-06-13 | — | Core loop + design fidelity: Videx typography, Home parity, Detail + Where-to-Watch deep links, auth/session, Watchlist/Browse/For You. |
| NATIVE-3 (+3.5) | `phase-native-3-onboarding` (+`-3-5-home-composition`) | merged | 2026-06-13 | — | 5-step onboarding + taste bootstrap (retires DEV_SERVICES); then Home composition parity (genre spotlights + Recently Added). |
| NATIVE-4 + POLISH | `phase-native-4-profile-settings`, `phase-native-polish-gaps` | merged → **LIVE** | 2026-06-18 | **047** | Profile/Sign-Out, signal capture, MMKV persistence, in-app feedback loop. **Cutover: app id → `app.videx.streaming` v2.0.0** (PRs #24→#28, then #30/#31). The Expo app is now the live product; the `videx-native` worktree was consolidated into `native/`. |
| 6 / public launch | (gated) | in progress | — | — | Native app is live on the internal track. **Public** launch still gated by pre-launch blockers (headline: IN-XPS-014 solicitor review) + the `search_semantic` global flip. |
| 7 (post-v2) | — | not started | — | — | Conversational discovery on top of v2. See [v3 forward-planning](../concepts/forward-planning/v3-conversational-discovery.md). |

## Migration → phase

| # | File | Phase | Notes |
|---|---|---|---|
| 001 | `001_content_tables.sql` | B1 | Content cache foundation. |
| 002 | `002_fix_constraints.sql` | B1 | NULL-in-unique fix. |
| 003 | `003_monitoring_queries.sql` | C1 | Read-only views. |
| 004 | `004_data_quality.sql` | E1 | DQ views. |
| 005 | `005_authenticated_read_policies.sql` | B1 | **Critical RLS fix.** Silent-empty bug. |
| 006 | `006_cron_schedule.sql` | B1 | Daily 06:00 UTC sync. |
| 007 | `007_data_quality_checks.sql` | C1 | DQ functions. |
| 008 | `008_content_vectors.sql` | B1 | Legacy 24D `content_vector` (dropped in 019). |
| 009 | `009_streaming_history.sql` | C1 | Append-only availability log. |
| 010 | `010_user_interactions.sql` | C1 | Immutable event log. |
| 011 | `011_profiles_baseline.sql` | Pre-0 | Idempotent codification. |
| 012 | `012_profiles_v2_onboarding_fields.sql` | 0 | `age_range`, `viewing_context`. |
| 013 | `013_user_interactions_v2_expansion.sql` | 0 | `session_id`, `source_surface`; `dismiss`→`not_interested`. |
| 014 | `014_card_impressions_table.sql` | 0 | pg_partman + rollup + cron. |
| 015 | `015_card_impressions_partition_rls.sql` | **0 (deviation)** | Existing-partition RLS hardening. |
| 016 | `016_card_impressions_rls_event_trigger.sql` | **0 (deviation)** | Event trigger for new partitions. |
| 017 | `017_content_enrichment_columns.sql` | 0.5 | 4 enrichment columns. |
| 018 | `018_embeddings_pgvector.sql` | 1 | pgvector + HNSW work-queue index. |
| 019 | `019_drop_legacy_content_vector.sql` | 1 close-out | **Destructive.** |
| 020 | `020_service_fingerprints.sql` | 2 | `service_fingerprints` + RLS. |
| 021 | (skipped) | — | Reserved, rolled into 022. |
| 022 | `022_fingerprint_variant.sql` | 2.6 | `variant` column + `match_titles_by_vector` RPC. |
| 023 | `023_taste_vector_v2.sql` | 3 | `taste_vector_v2 vector(1536)` + sliders. |
| 024 | `024_drop_legacy_taste_vector.sql` | 3 cleanup | **Destructive.** v1 24D taste cols + `interaction_log`. |
| 025 | `025_fix_match_titles_rpc.sql` | 3 fix | Dynamic `hnsw.ef_search`. |
| 026 | `026_security_linter_fixes.sql` | 3 | Supabase advisor. |
| 027 | `027_function_search_path_pin.sql` | 3 | 10 functions hardened. |
| 028 | `028_available_tmdb_ids_rpc.sql` | 3 perf | JSON RPC; replaces 42 paginated REST calls. |
| 029 | `029_mood_rooms_table.sql` | 4.5 | `mood_rooms` + `clustering_runs`. |
| 030 | `030_mood_room_titles_table.sql` | 4.5 | Membership table. |
| 031 | `031_mood_rooms_rpcs.sql` | 4.5 (Gate 4 hotfix) | 3 RPCs (PostgREST 1000-row cap fix). |
| 032 | `032_card_impressions_mood_room_surface.sql` | 4.5 (Gate 4 hotfix) | Adds `'mood_room'` to source_surface CHECK. |
| 033 | `033_card_impressions_anchor_room_metadata.sql` | 4.5 (anchored-rooms redirect) | `'anchor_room'` surface + `metadata jsonb`. |
| 034 | `034_mood_room_anchor_labels.sql` | 4.5 (IN-463) | LLM thematic label columns. |
| 035 | `035_available_tmdb_ids_rpc_array_return.sql` | 4.5 (cold-start fix) | TABLE → JSONB array return. |
| 036 | `036_taste_profiles_rls.sql` | 5 | RLS on `taste_profiles`. |
| 037 | `037_drop_marked_watched_from_check.sql` | 5 | Drops `'marked_watched'` event_type. |
| 038 | `038_profiles_username_lookup_rpc.sql` | 5 | `username_available` SECURITY DEFINER RPC. |
| 039 | `039_cron_jobs_vault_jwt.sql` | 5 | Vault-backed cron JWT (storage only, not rotation). Sole source for cron jobs since 5.5. |
| 040 | `040_editor_notes.sql` | v3 redesign | **In repo, NOT applied.** `editor_notes` table. |
| 041 | `041_user_feature_flags.sql` | Search V2 | Per-user feature flag store (`search_semantic`). |
| 042 | `042_delete_own_account.sql` | 5.5 | GDPR delete RPC captured in source control. |
| 043 | `043_export_user_data.sql` | 5.5 | GDPR Article 20 export RPC. |
| 044 | `044_user_interest_centroids.sql` | ENG-1 | K ≤ 3 interest centroids; extends delete/export RPCs. |
| 045 | `045_training_extract_view.sql` | ENG-1 | `v_training_examples` view (ENG-2 dataset shape). |
| 046 | `046_drop_title_genres_credits.sql` | REPO-1 | Applied 2026-06-10. Drops `title_genres` + `title_credits`. |
| 047 | `047_app_feedback.sql` | NATIVE-POLISH | Applied. `app_feedback` (optional 1-5 rating + required message), RLS authenticated insert + read-own, immutable, CASCADE on account delete. Backs the native FeedbackSheet. |

## Service slug ↔ TMDb ↔ SA API ↔ deep links

| Slug | Display | TMDb ID | SA API slug | Deep links via SA API |
|---|---|---|---|---|
| `netflix` | Netflix | 8 | `netflix` | yes |
| `prime` | Amazon Prime Video | 9 | `prime` | yes |
| `apple` | Apple TV+ | 350 | `apple` | yes |
| `disney` | Disney+ | 337 | `disney` | yes |
| `now` | NOW | 39 | `now` | yes |
| `paramount` | Paramount+ | 582 | `paramount` | yes |
| `itvx` | ITVX | 54 | `itvx` | yes |
| `channel4` | Channel 4 | 103 | `all4` | yes |
| `bbc` | BBC iPlayer | 38 | `iplayer` | **no** (search-URL fallback) |
| `skygo` | Sky Go | 29 | (absent) | **no** (search-URL fallback) |

## Surface row composition (Phase 4 shipped)

| Home (max 7-9) | For You (max 7-8) |
|---|---|
| 1. Hero Carousel | 1. Sliders entry point (collapsed) |
| 2. Recently Added | 2. Recommended For You |
| 3. Trending Across Your Services | 3. Mood Rooms for Tonight (Phase 4.5) |
| 4. Coming Soon | 4. Hidden Gems |
| 5. Per-Service Charts (top 3 services) | 5. Because You Watched [Title] (max 2 rows; requires watchlist+thumbs_up) |
| 6. Critically Acclaimed (gated, currently disabled) | 6. More From [Director/Actor] (≥2 thumbs_up signals) |
| 7. Genre Spotlight (weekly rotation) | 7. Outside Your Usual (sized by Comfort Zone) |
| | 8. From Your Watchlist |

## Stage 2 weights (current)

| Component | Shipped | Strategy intent |
|---|---|---|
| Taste-vector similarity | 62.5% (cosine to source interest centroid since ENG-1) | 50% |
| Recency (modulated by Catalogue Age slider 10-30%) | 25% | 20% |
| Contextual fit (real scorer since Phase 5: time 40 / viewing 40 / device 20) | 12.5% | 10% |
| Genre spread | post-processing — MMR over embeddings since Phase 5 (genre-spread fallback) | 10% as scoring |
| Cross-service spread | post-processing | 10% as scoring |

ENG-1 additions outside the formula: avoid-set penalty (`finalScore −= 0.15 · max(0, maxCos)` vs last 50 `thumbs_down`/`not_interested`) and 2 exploration slots (positions 6 + 14 of Recommended For You).

## Daily / weekly / monthly schedules

| Cadence | Job | When | Where |
|---|---|---|---|
| Daily | `sync-incremental` | 06:00 UTC | Edge Function via pg_cron + pg_net (migration 006) |
| Daily | `enrich_new_titles` | 06:30 UTC | pg_cron, defined in migration 039 (the `supabase/cron/*.sql` files were deleted in Phase 5.5 — 039 is sole source) |
| Daily | `embed_new_titles` | 06:45 UTC | pg_cron, defined in migration 039 |
| Daily | `card_impression_daily_totals` rollup | (set in migration 014) | pg_cron |
| Weekly | `refresh-service-fingerprints` | Sunday 07:00 UTC | Edge Function + pg_cron |
| Weekly | "Mood Rooms for Tonight" rotation | Mondays | App-side selection from `mood_rooms` |
| Monthly | HDBSCAN recluster | 1st of month, 03:00 UTC | GitHub Actions (`mood-rooms-recluster.yml`) |

## Locked decisions (one-line summary)

- **v1 archived as Git tag** (`v1-archive`); v2 builds forward on `main`.
- **Supabase Pro tier** for v2 build and first months post-launch.
- **OpenAI `text-embedding-3-small` (1536D)** content embeddings, locked template.
- **pgvector + HNSW** vector store; `JSON.parse(row.embedding as string)` wire pattern.
- **`card_impressions` dedicated partitioned table** (pg_partman monthly), RLS via event trigger.
- **HDBSCAN runs in Python + GitHub Actions monthly cron**, psycopg2 direct connection.
- **`dismiss` → `not_interested`** event type rename (Phase 0).
- **Static genre mapping** retained over `title_genres` backfill (`title_genres` + `title_credits` dropped by migration 046, REPO-1, applied 2026-06-10).
- **Two surfaces**: Home (discovery, 15-20% taste) + For You (heavy personalisation, sliders, mood rooms).
- **Sliders Option C dual-access**: Profile + For You modal/tray, shared state.
- **Detail view alone is NOT positive** (anchor only).
- **Negative dwell session cap −1.0**.
- **Single engine tree** `src/lib/{recommendations-v2,taste-v2}` — the videx-api Worker imports it directly (ADR-014; the `_shared/` mirror is gone). Engine modules must stay importable outside Vite.
- **Multi-interest centroids K ≤ 3** (ENG-1, E&P D3); negative events feed the avoid set, taste vectors are positive-only.
- **Native app is the live product** — RN/Expo (`app.videx.streaming` v2.0.0) replaced the Capacitor WebView build at the NATIVE-4 cutover. ONE repo; the `videx-native` worktree was consolidated into `native/` (2026-06-18). See [Platform architecture](../concepts/architecture/platform-architecture.md).

## Cross-links

- [Phase history (narrative)](../concepts/operations/phase-history.md)
- [Migration changelog (per-row)](../entities/codebase/migrations.md)
- [Recommendation pipeline (architecture)](../concepts/architecture/recommendation-pipeline.md)
- [Sliders (per-slider detail)](../concepts/architecture/sliders.md)
- [UK services (per-service detail)](../entities/streaming-services/uk-services.md)
