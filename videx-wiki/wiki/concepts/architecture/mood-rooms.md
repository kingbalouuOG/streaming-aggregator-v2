---
title: Mood Rooms
type: concept
tags: [mood-rooms, hdbscan, umap, pillar-1, clustering, anchored-rooms]
created: 2026-04-26
updated: 2026-04-27
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.7.md
  - raw/v2-strategy/Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.4.md
  - raw/concepts/hdbscan-primer.md
related:
  - wiki/concepts/decisions/adr-005-hdbscan-python-github-actions.md
  - wiki/concepts/techniques/hdbscan.md
  - wiki/concepts/architecture/for-you-surface.md
  - wiki/concepts/operations/monthly-mood-room-recluster.md
  - wiki/entities/infrastructure/github-actions.md
  - wiki/entities/codebase/rpcs.md
  - wiki/entities/codebase/migrations.md
---

# Mood Rooms

Pillar 1 of the v2 USP. Organically clustered, LLM-labelled taste neighbourhoods emerging from the content embedding space.

**Two ranking layers.** The global clustering pipeline (below) produces a fixed set of named rooms shared across all users. Surfacing those rooms is layer-specific:

- **For You "Mood Rooms for Tonight" row (Phase 4.5 redirect, April 2026):** title-anchored generation. Five user-specific anchor titles per weekly refresh, one room per anchor. **Does not consume `mood_rooms` / `mood_room_titles`** — it generates rooms on demand from the user's taste vector and selected titles. See [Anchored ranking layer](#anchored-ranking-layer-phase-45-redirect) below.
- **v2.5 dedicated browse surface (deferred):** global rooms grid. Consumes `mood_rooms` / `mood_room_titles` directly via `get_mood_rooms_for_user` / `get_mood_room_detail` RPCs.
- **Phase 7 conversational discovery (deferred):** maps natural-language queries onto global rooms.

The split exists because the two surfaces optimise for different things: For You wants fast personalised tonight-fit, v2.5 wants exploration of the full catalogue.

## Pipeline

1. **UMAP preprocessing**: 1536D → 10D. Pure HDBSCAN on raw 1536D fails on this catalogue (2 clusters, 10% coverage) due to the curse of dimensionality. UMAP is the canonical fix used by BERTopic / Top2Vec.
2. **HDBSCAN** on the 10D output.
3. **Centroids and centrality** computed in the **original 1536D space** so frontend taste-fit scoring works against 1536D taste vectors.
4. **Two-pass LLM labelling**: GPT-4o on 20 most central titles per cluster → 2-4 word name + 1-sentence description. Manual editorial review and override of weak labels.

## Output (Phase 4.5 actuals)

- 68 mood rooms (target was 30-60; slight overshoot, monitor stability across runs 2-3).
- 53.5% catalogue coverage (target was 70-80%; coverage plateau is structural at this catalogue size and embedding model).
- ~45% of 20K titles sit in sparse regions of the embedding space without dense neighbours.

Phase 4.5 ran four orthogonal tuning passes (UMAP `n_neighbors`, HDBSCAN `min_cluster_size`, `cluster_selection_method`, `max_cluster_size`). Coverage moved within a 51-58% band. Hybrid HDBSCAN+kmeans fallback rejected: would buy coverage at the cost of incoherent synthetic rooms (titles forced into clusters they don't belong to). Quality prioritised over coverage. Revisit after 3 monthly runs per parking-lot IN-459 if engagement data reveals under-served titles in sparse regions.

## Execution environment

Locked: Python via GitHub Actions monthly cron. See [ADR-005](../decisions/adr-005-hdbscan-python-github-actions.md). HDBSCAN has no production-quality TypeScript implementation; Python `hdbscan` is the right tool. Running from GitHub Actions avoids dedicated Python service overhead.

| Field | Value |
|---|---|
| Workflow | `.github/workflows/mood-rooms-recluster.yml` |
| Cron | `'0 3 1 * *'` (03:00 UTC, 1st of each month) |
| Script | `scripts/mood_rooms/recluster.py` |
| Dependencies | `hdbscan`, `numpy`, `psycopg2-binary`, `openai` |
| Connection | psycopg2 with Supabase direct PostgreSQL connection string (avoids PostgREST 1000-row cap; faster for bulk vector reads) |
| Runtime | 5-15 minutes per run at 20K titles |
| Secrets | `SUPABASE_CONNECTION_STRING`, `OPENAI_API_KEY` via GitHub Actions Secrets |

## Re-clustering cadence

Monthly with stability constraints. Clusters that remain >80% stable across re-clustering (same core titles) preserve their ID, label, and user data. Editorial label overrides persist across re-clusterings as long as the cluster remains stable.

## Storage

| Table | Purpose | Migration |
|---|---|---|
| `mood_rooms` | Cluster metadata + `centroid vector(1536)`. Authenticated SELECT, service_role only on `clustering_runs`. | 029 |
| `mood_room_titles` | Membership: `(mood_room_id, tmdb_id, media_type)` composite PK, `centrality REAL`. No FK to `titles` (matches project convention). | 030 |
| `clustering_runs` | Monthly job audit log. | 029 |

## RPCs (migration 031)

- `get_mood_rooms_for_user(user_id, limit)` — taste-ranked, availability-filtered top N.
- `get_mood_room_thumbnails(mood_room_id, limit)` — top-N most central titles for thumbnails.
- `get_mood_room_detail(mood_room_id, user_id, limit)` — full per-room title list.

These RPCs were a **Gate 4 hotfix** in Phase 4.5: a PostgREST 1000-row cap was silently filtering most rooms out of the client-side display pool (only the 2 biggest rooms surfaced).

## UX surface

Phase 4.5 Gates 1–4 originally shipped the "Mood Rooms for Tonight" row on For You as a global-cosine-ranked horizontal scroll (3-5 rotating rooms, weekly refresh, time-of-day reorder). The Phase 4.5 redirect (April 2026) flipped this row to title-anchored — see [Anchored ranking layer](#anchored-ranking-layer-phase-45-redirect) below.

Dedicated mood rooms browse surface deferred to v2.5 — that surface continues to use the global rooms.

Migration 032 added `'mood_room'` to `card_impressions.source_surface` CHECK constraint (Gate 4 hotfix; original 014 constraint silently rejected every batch flush containing a mood_room row). Migration 033 (April 2026) extended source_surface with `'anchor_room'` and added a `metadata jsonb` column for per-impression anchor context.

## Anchored ranking layer (Phase 4.5 redirect)

Locked April 2026 after Phase 4.5 Gates 1–4 surfaced a centroid-flattening problem in the global cosine-distance ranking: niche cluster picks (history-war, true-crime, epic-scifi, mind-bending) were being ranked below tonally-adjacent generic rooms because the user's averaged taste vector landed nearest the densest neighbourhoods. Diagnostic: `docs/v2/Mood_Rooms_Ranking_Quality_Investigation_2026_04_22.md`. Probe: `docs/v2/Mood_Rooms_Anchored_Probe_2026_04_26.md`.

The For You row now generates one room per anchor around 5 user-specific anchor titles per weekly refresh.

### Anchor selection ladder

`src/lib/recommendations-v2/anchorSelection.ts`. Three tiers, with a shared cluster-collision rule.

| Tier | Source | Guards |
|---|---|---|
| 1 | `thumbs_up ∩ (watched ∪ watchlist_add)` over last 60 days | (G1) combined-signal requirement; (G2) `cos_sim(taste, anchor) >= 0.55`; (G3) cluster-coherence (active when `taste_vector_interaction_count <= 5`) requiring anchor within `cosine_distance <= 0.40` of at least one user-selected cluster centroid |
| 2 | Cluster representative titles ranked by similarity to user vector | One per cluster (top-similarity rep wins). Skip clusters occupied by Tier 1 |
| 3 | Top finalScore from existing pipeline | `finalScore > 0.65` confidence floor; only fires if Tier 1+2 yield < 5 |

**Cross-tier collision rule.** Each Tier 1 anchor occupies any cluster whose centroid is within `cosine_distance <= 0.40`. Tier 2 picks skip occupied clusters.

### Reusable primitive

`src/lib/recommendations-v2/anchoredRoom.ts` exports `buildAnchoredRoom(opts)`. Steps: fetch anchor embedding → `match_titles_by_vector(anchor_embedding, 200)` → drop the anchor → `applyAnchorHardFilters` (services, dismissed, thumbs_down, optionally watchlist) → cap at 30 → hydrate ContentItems.

Consumed by both the For You anchored row (`useAnchorMoodRooms`) and the Because You Watched row (`useForYouContent`). The Phase 6+ detail-page "Make a room from this title" affordance (parking lot IN-464) will consume the same primitive.

### Persistence

No `user_anchor_rooms` table. Anchor selections are cached in localStorage keyed on `(userId, weekBucket)` mirroring the legacy global-rooms hook's pattern. `featuredLastWeek` exclusion ensures the row feels fresh week-on-week. Room contents are recomputed every render.

### Card design

`<AnchorMoodRoomCard>` is structurally identical to the legacy `<MoodRoomCard>`: 200×280 frame, 2×2 thumbnail grid in the top portion. Label is `"If you love"` prefix + anchor title (LLM-generated thematic labels deferred to IN-463).

### Detail page

`<MoodRoomPage>` is parameterised with a `kind: 'global' | 'anchor'` discriminated union (April 2026 refactor). Both kinds share impression batching, scroll preservation, and pagination. The fetcher branches by kind: global uses `getMoodRoomDetail` (RPC), anchor uses `buildAnchoredRoom` and projects the result to the same `MoodRoomDetail` shape.

### Instrumentation

Per-impression metadata logged via `card_impressions.metadata` (jsonb, migration 033) for `source_surface = 'anchor_room'`:

```
{ anchor_tmdb_id, anchor_media_type, anchor_tier, anchor_source_cluster_id, tier_1_inside_stated_cluster }
```

This data is what answers IN-OB-006 (onboarding cluster taxonomy review under v2 engine assumptions) with telemetry instead of guesswork: frequency of Tier 1 anchors falling outside any user-selected cluster, per-cluster anchor surfacing rate, CTR by anchor source tier.

### Tunable thresholds

All in `src/lib/recommendations-v2/anchorSelection.ts` constants block at the top:
- `TIER_1_LOOKBACK_DAYS = 60`
- `TIER_1_SIMILARITY_GATE = 0.55`
- `CLUSTER_PROXIMITY_DISTANCE = 0.40`
- `COLD_START_INTERACTION_THRESHOLD = 5`
- `TIER_3_CONFIDENCE_THRESHOLD = 0.65`
- `ANCHORS_PER_USER = 5`

## Conflict resolution applied

- Strategy v1.5 expected 30-60 rooms at 70-80% coverage. Phase 4.5 actuals: 68 rooms at 53.5% coverage. Strategy v1.6.3 §5.2 acknowledges plateau is structural. Wiki reflects actual outcome.
- Hybrid HDBSCAN+kmeans considered and rejected; documented in strategy v1.6.3 risk row.
