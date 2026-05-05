---
title: HDBSCAN Primer
generated: 2026-04-26
sources: [docs/v2/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md §5.2]
---

# HDBSCAN Primer

HDBSCAN (Hierarchical Density-Based Spatial Clustering of Applications with Noise) discovers clusters of varying density. Videx uses it to generate Mood Rooms from the 1536D title embedding space, monthly.

## Why HDBSCAN over k-means

| Property | k-means | HDBSCAN |
|---|---|---|
| Number of clusters | Specify in advance | Discovered automatically |
| Cluster shape | Spherical, equal size | Arbitrary density-based |
| Outlier handling | Assigns every point | Marks low-density points as noise |
| Stability across runs | Sensitive to seed | Deterministic given parameters |

Videx wants natural groupings of taste-similar titles. We do not know the right value of `k`, and we want noise (titles that do not fit any cluster) to be excluded from Mood Rooms rather than forced into the nearest centroid.

## Parameters used

| Parameter | Value | Reason |
|---|---|---|
| `min_cluster_size` | 30 | Minimum titles for a Mood Room to be useful in the UI. |
| `min_samples` | 5 | Controls how conservative cluster boundaries are; lower → more clusters. |
| `cluster_selection_method` | `'eom'` | Excess of Mass; tends to produce more, smaller clusters. Alternative `'leaf'` produces fewer, larger clusters. |
| `metric` | `'cosine'` | Matches the distance pgvector uses. |

## Output

- ~30-80 mood rooms per run, each with 30-300 titles.
- Each title gets a `centrality` score (closer to cluster centroid = more central). Used to pick thumbnails.
- Cluster centroid stored as `vector(1536)` for fast nearest-cluster lookup at user time.

## Labelling

HDBSCAN does not name clusters. Videx applies a heuristic on cluster contents:

1. Take the 5 most central titles in the cluster.
2. Extract the most common genres and keywords across them.
3. Combine into a label like "Slow-burn psychological thrillers" or "British period drama".

Labels are reviewed manually post-run before the new `version` is exposed to users.

## Execution

Runs monthly via GitHub Actions cron, in Python with `psycopg2` reading from Supabase directly. See `raw/infrastructure/hdbscan-and-github-actions.md` and ADR-005 for the choice of execution environment.

## Versioning

`mood_rooms.version` lets the app pin to the current cluster set. Old versions are retained so historic membership can be audited; the app reads only the latest stable version.
