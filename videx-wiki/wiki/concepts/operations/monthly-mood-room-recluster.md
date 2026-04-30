---
title: Monthly mood room recluster runbook
type: concept
tags: [runbook, mood-rooms, hdbscan, github-actions, python]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/runbooks/monthly-mood-room-recluster.md
related:
  - wiki/concepts/architecture/mood-rooms.md
  - wiki/concepts/techniques/hdbscan.md
  - wiki/concepts/decisions/adr-005-hdbscan-python-github-actions.md
  - wiki/entities/infrastructure/github-actions.md
---

# Monthly mood room recluster runbook

Generates a fresh set of Mood Rooms by clustering the title embedding space with HDBSCAN. Runs monthly via GitHub Actions; manual procedure documented for ad-hoc use.

## Schedule

- Cron: `0 3 1 * *` (1st of month, 03:00 UTC).
- Workflow: `.github/workflows/mood-rooms-recluster.yml` (raw runbook lists `recluster-mood-rooms.yml`; current name per Phase 4.5 is `mood-rooms-recluster.yml`).

## Prerequisites

- GitHub Actions secrets: `SUPABASE_CONNECTION_STRING` (psycopg2-compatible direct connection), `OPENAI_API_KEY`.
- Python script: `scripts/mood_rooms/recluster.py` (Python 3.11 + `hdbscan`, `psycopg2-binary`, `numpy`, `openai`).

## Manual run

```bash
cd scripts/mood_rooms
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export SUPABASE_CONNECTION_STRING='postgresql://...'
export OPENAI_API_KEY='sk-...'
python recluster.py
```

Or trigger via GitHub Actions `workflow_dispatch` from the Actions UI.

## What it does

1. Connects via psycopg2 (direct PostgreSQL, avoids PostgREST 1000-row cap).
2. `SELECT tmdb_id, embedding FROM titles WHERE embedding IS NOT NULL`.
3. UMAP preprocessing 1536D → 10D.
4. HDBSCAN with locked parameters (`min_cluster_size=30`, `min_samples=5`, `cluster_selection_method='eom'`, `metric='cosine'`).
5. For each cluster: compute centroid in **original 1536D space** (so frontend taste-fit scoring works), pick 5-20 most central titles, two-pass LLM labelling.
6. Insert new `mood_rooms` with `version = max + 1`, `mood_room_titles` with centrality, `clustering_runs` audit row.
7. Old version retained; app reads latest stable.

## Acceptance gate

Workflow fails (skips upsert) if:

- Cluster count < 10 or > 200.
- Mean cluster size < 20 or > 500.
- Noise fraction > 50%.

Failed runs leave previous version live. Audit row appended with `outcome='failed'`.

## Manual review

Labels are heuristic. Skim post-run, rename misleading ones:

```sql
SELECT id, label, title_count
FROM mood_rooms
WHERE version = (SELECT max(version) FROM mood_rooms)
ORDER BY title_count DESC;

UPDATE mood_rooms SET label = 'New label' WHERE id = '...';
```

Editorial overrides persist across re-clusterings as long as the cluster remains stable (>80% same core titles).

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `psycopg2.OperationalError` | `SUPABASE_CONNECTION_STRING` invalid or pooler issue | Use direct connection (port 5432), not pooler. |
| HDBSCAN OOM | Too many embeddings | Subsample or split by media_type. |
| Clusters dominated by one genre | Embedding template skew | Re-run cluster coherence eval; consider template change. |
| Coverage < 50% | Embedding-space sparsity | Structural per Phase 4.5; revisit per IN-459 after 3 monthly runs. |

## Phase 4.5 actuals

68 rooms at 53.5% coverage. Hybrid HDBSCAN+kmeans rejected (would degrade quality). See [mood-rooms](../architecture/mood-rooms.md).
