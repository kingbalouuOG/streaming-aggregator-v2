---
title: Cheatsheet — phases, branches, migrations, features at a glance
type: register
tags: [register, cheatsheet, phases, migrations, branches]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.3.3.md
  - raw/codebase-snapshots/migration-changelog.md
  - raw/reference/phase-timeline.md
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/entities/codebase/migrations.md
---

# Cheatsheet

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
| 4.5 | (no end-of-phase summary) | merged | 2026-04-19 → 22 | 029, 030, 031, 032 | UMAP+HDBSCAN ships 68 mood rooms at 53.5% coverage. Gate 4 hotfix RPCs. |
| 5 | (planned) | not started | — | — | Replace `contextual.ts` placeholder. Re-evaluate 62.5/25/12.5 weight split. |
| 6 | (planned) | not started | — | 033+ planned (taste_profiles RLS) | APK build, install, end-to-end verify. |
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

| Component | Phase 4 ship | Strategy intent |
|---|---|---|
| Taste-vector similarity | 62.5% | 50% |
| Recency (modulated by Catalogue Age slider 10-30%) | 25% | 20% |
| Contextual fit (placeholder 0.5; Phase 5 replaces) | 12.5% | 10% |
| Genre spread | post-processing | 10% as scoring |
| Cross-service spread | post-processing | 10% as scoring |

## Daily / weekly / monthly schedules

| Cadence | Job | When | Where |
|---|---|---|---|
| Daily | `sync-incremental` | 06:00 UTC | Edge Function via pg_cron + pg_net (migration 006) |
| Daily | `enrich_new_titles` | 06:30 UTC | `supabase/cron/enrich_new_titles.sql` |
| Daily | `embed_new_titles` | 06:45 UTC | `supabase/cron/embed_new_titles.sql` |
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
- **Static genre mapping** retained over `title_genres` backfill.
- **Two surfaces**: Home (discovery, 15-20% taste) + For You (heavy personalisation, sliders, mood rooms).
- **Sliders Option C dual-access**: Profile + For You modal/tray, shared state.
- **Detail view alone is NOT positive** (anchor only).
- **Negative dwell session cap −1.0**.
- **Edge Function shared modules** in `supabase/functions/_shared/`.

## Cross-links

- [Phase history (narrative)](../concepts/operations/phase-history.md)
- [Migration changelog (per-row)](../entities/codebase/migrations.md)
- [Recommendation pipeline (architecture)](../concepts/architecture/recommendation-pipeline.md)
- [Sliders (per-slider detail)](../concepts/architecture/sliders.md)
- [UK services (per-service detail)](../entities/streaming-services/uk-services.md)
