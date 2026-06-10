---
title: Source — Recommendation Engine v2 Strategy v1.6.3
type: source
tags: [strategy, recommendation-engine, v2]
created: 2026-04-26
updated: 2026-06-10
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
related:
  - wiki/concepts/architecture/two-surface-architecture.md
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/architecture/signal-architecture.md
  - wiki/concepts/architecture/mood-rooms.md
  - wiki/concepts/techniques/embeddings.md
  - wiki/concepts/architecture/onboarding-flow.md
  - wiki/concepts/architecture/sliders.md
  - wiki/concepts/decisions/adr-004-1536d-embeddings.md
  - wiki/concepts/decisions/adr-005-hdbscan-python-github-actions.md
  - wiki/concepts/decisions/adr-007-v1-archived-as-tag.md
  - wiki/concepts/decisions/adr-008-static-genre-mapping.md
  - wiki/concepts/decisions/adr-006-card-impressions-dedicated-table.md
  - wiki/entities/codebase/migrations.md
---

# Source: Recommendation Engine v2 Strategy (v1.6.3)

> Superseded by [Recommendation Engine v2 Strategy v1.8](engine-strategy-v1-8.md) (2026-04-30).

Author: Head of Strategy & Engineering with Joe. Date: April 2026. Most cross-referenced doc in the v2 set.

## v1.6.3 corrections (load-bearing)

- §6 migration numbers renumbered +2 from Phase 0.5 onwards to absorb Phase 0 in-phase deviations (migrations 015 and 016 for `card_impressions` partition RLS).
- Phase 0 description updated to reflect five migrations (012-016), not three.
- Subsequent phase migration references aligned: 0.5→017, 1→018/019, 2→020, 3→021/022 (021 reserved → rolled into 022 in actuals), 4.5→023.
- §6.4 `card_impressions` schema: `tmdb_id` → `content_id` (consistency with detail page spec §5.2).
- v1.6.0 corrections: `event_type` (not `interaction_type`), `content_id` (not `tmdb_id`).
- Share signal removed from weight tables (no share button in v1 codebase).
- Phase 3 hook rewrite scope: 9 files (added `LazyGenreSection.tsx`).
- Slider name standardised to "Focused ↔ Varied" (was "Depth vs breadth").

## Headline commitments

| Theme | Commitment |
|---|---|
| Migration model | v1 archived as Git tag, v2 builds forward on `main`. No parallel run, no feature flags, no Phase 6.5. |
| Surfaces | Two distinct primary surfaces — Home (discovery, light personalisation, 15-20% taste weight) and For You (heavy personalisation, sliders, mood rooms). Land on For You after onboarding. |
| Content metadata | Three-layer model: raw first-party (TMDb keywords/cast/director/runtime/content_rating), LLM-enriched Videx tags, vector embeddings. First-party metadata is a hard prerequisite. |
| Embeddings | OpenAI `text-embedding-3-small`, 1536D, locked template. ~£0.20 backfill, ~£0.50/month ongoing. |
| Vector store | pgvector + HNSW on Supabase Pro. ~350MB total budget. |
| User taste vector | Single 1536D vector. Weighted aggregate of content vectors. Decay 180d explicit / 90d behavioural. Confidence floor 1.5x for first 20 interactions. Bootstrap: service fingerprints + watched-grid + genre. |
| Pipeline stages | Stage 1 retrieval (top 500, cosine + filters), Stage 2 ranking (taste 50% / recency 20% / contextual 10% / diversity 10% / cross-service 10% as intent; shipped as taste 62.5% / recency 25% / contextual 12.5% three-component sum + diversity post-processing), Stage 3 row selection (split per surface), Stage 4 within-row ordering. |
| Detail page "More Like This" | Batch Supabase query for candidate embeddings + client-side cosine. Phase 1 wire format spike is prerequisite. |
| Mood rooms | UMAP (1536D → 10D) + HDBSCAN. Centroids in original 1536D space. 30-60 rooms intent; shipped 68 rooms at 53.5% coverage. Hybrid HDBSCAN+kmeans rejected (would degrade quality). Python + GitHub Actions monthly cron, psycopg2 direct connection, two-pass LLM labelling. |
| Onboarding | 5 steps, ~90s target. Step 1 account + age range + viewing context. Step 2 services. Step 3 watched grid (3 rounds × 6 titles). Step 4 genres (min 3). Step 5 sliders + taste summary. |
| Signal capture | Four delivery sliders (Catalogue Age, Comfort Zone, Content Mix, Focused ↔ Varied). Detail-page dwell + exit-outcome model; detail view alone is NOT positive. Deep-link click confidence high (+0.8) / low (+0.4). Negative dwell session cap −1.0. `not_interested` filter, no taste update. |
| Eval prerequisites | Card impressions in dedicated `card_impressions` table with pg_partman, batched client-side. Session ID. Dwell timer with pause/resume. "Not Interested" affordance. Lifecycle manager. |
| North Star metrics | Detail-view rate @10, Watchlist conversion @10, Deep-link CTR. Tier 2 diversity / serendipity. Tier 3 engagement. Dwell + scroll depth NOT used standalone. |
| Things v2 does NOT build | Two-tower neural model, thumbnail personalisation, RL, collaborative filtering, full conversational discovery, feature flags, A/B framework, v1-user migration. |
| Phase status (per §7.2) | Phase 0 complete, 0.5 complete, 1 complete, 2 complete, 2.5 complete, 2.6 complete, 3 complete, 4 complete, 4.5 complete. Phase 5 (contextual signals) and Phase 6 (launch) pending. |

## Why it matters

This document is the canonical specification for the v2 engine. Everything in `wiki/concepts/architecture/` and `wiki/concepts/techniques/` flows from it. When a phase summary deviates, this doc is the intent and the phase summary records the actual outcome.

## Conflict resolution applied

- Older claims of "interaction_type" / "tmdb_id" superseded by `event_type` / `content_id`.
- Older "Depth vs breadth" slider naming superseded by "Focused ↔ Varied".
- Original "30-60 rooms" expectation tempered by Phase 4.5 actuals (68 rooms at 53.5% coverage; coverage plateau structural).
- Stage 2 5-component table represents intent; Phase 4 shipped 3-component scoring sum (62.5/25/12.5) + diversity as post-processing, recorded in §5.2 Phase 4 implementation note.
