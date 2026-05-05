---
title: HDBSCAN (UMAP + density-based clustering)
type: concept
tags: [hdbscan, umap, clustering, mood-rooms, technique]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/concepts/hdbscan-primer.md
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
related:
  - wiki/concepts/architecture/mood-rooms.md
  - wiki/concepts/decisions/adr-005-hdbscan-python-github-actions.md
  - wiki/concepts/operations/monthly-mood-room-recluster.md
  - wiki/entities/infrastructure/github-actions.md
---

# HDBSCAN (UMAP + density-based clustering)

Hierarchical Density-Based Spatial Clustering of Applications with Noise. Used in Videx for monthly mood-room generation over the title embedding space.

## Why density-based, not k-means

- No fixed cluster count required (k-means assumes you know k).
- Handles noise and outliers natively (titles in sparse regions stay unclustered rather than forced into the nearest cluster).
- Variable cluster densities (some mood rooms are tight neighbourhoods of 30 titles; others span 800).
- Hierarchical structure means cluster identity is more stable across re-clusterings if data shifts modestly.

## Why UMAP preprocessing

Pure HDBSCAN on raw 1536D embeddings fails on the Videx catalogue: 2 clusters, 10% coverage. The curse of dimensionality flattens density variation in high dimensions; HDBSCAN can't find the variation to cluster on.

UMAP (Uniform Manifold Approximation and Projection) reduces 1536D → 10D while preserving local neighbourhood structure. This is the canonical fix used by BERTopic and Top2Vec.

After UMAP:

- Clustering happens in 10D.
- **Centroids and centrality re-computed in original 1536D space** so the frontend's taste-fit scoring works against 1536D taste vectors.

## Phase 4.5 actuals

- Catalogue size: 19,993 titles.
- Output: 68 clusters (target 30-60; slight overshoot).
- Coverage: 53.5% (target 70-80%; coverage plateau structural).
- ~45% of titles in sparse regions of the embedding space without dense neighbours.

Phase 4.5 ran four orthogonal tuning passes (UMAP `n_neighbors`, HDBSCAN `min_cluster_size`, `cluster_selection_method`, `max_cluster_size`). Coverage stayed within a 51-58% band.

## Why hybrid HDBSCAN+kmeans was rejected

Kmeans-on-noise would assign sparse-region titles to nearest centroid, raising coverage to ~90%+. Rejected because it would force titles into clusters they don't belong to (incoherent synthetic rooms), undermining the mood-rooms UX. Quality prioritised over coverage.

Non-clustered titles still surface via other For You rows (Recommended For You, Hidden Gems, Because You Watched).

Revisit per parking-lot IN-459 after 3 monthly runs if engagement data shows under-served titles in sparse regions.

## Execution

Python via GitHub Actions monthly cron. See [ADR-005](../decisions/adr-005-hdbscan-python-github-actions.md). TypeScript HDBSCAN ports lack production-quality memory handling and parity with scikit-learn.

| Field | Value |
|---|---|
| Library | `hdbscan` (Python) |
| DB connection | `psycopg2` direct PostgreSQL (Supabase Pro) |
| Schedule | `'0 3 1 * *'` (03:00 UTC, 1st of month) |
| Runtime | 5-15 min per run at 20K titles |

## Stability

Re-clustering preserves cluster IDs for clusters that remain >80% stable (same core titles). Editorial label overrides persist as long as the cluster remains stable.
