---
title: Monthly Mood Room Recluster Runbook
generated: 2026-04-26
---

# Monthly Mood Room Recluster Runbook

Generates a fresh set of Mood Rooms by clustering the title embedding space with HDBSCAN. Runs monthly via GitHub Actions. Manual run procedure documented for ad-hoc use.

## Schedule

- Cron: `0 3 1 * *` (1st of month, 03:00 UTC).
- Workflow: `.github/workflows/recluster-mood-rooms.yml`.

## Prerequisites

- GitHub Actions secrets:
  - `SUPABASE_DB_URL` — direct Postgres connection string (psycopg2-compatible).
  - `SUPABASE_SERVICE_ROLE_KEY` — for any HTTP calls via Supabase client.
- Python script in `scripts/clustering/recluster.py` (Python 3.11 + `hdbscan`, `psycopg2-binary`, `numpy`, `scikit-learn`).

## Manual run

```bash
cd scripts/clustering
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export SUPABASE_DB_URL='postgresql://...'
python recluster.py
```

## What it does

1. Connects to Supabase via psycopg2.
2. `SELECT tmdb_id, embedding FROM titles WHERE embedding IS NOT NULL`.
3. Runs HDBSCAN with locked parameters (`min_cluster_size=30`, `min_samples=5`, `cluster_selection_method='eom'`, `metric='cosine'`).
4. For each cluster:
   - Computes centroid.
   - Picks 5 most central titles for label heuristic.
   - Generates label string (genre + keyword combination).
5. Inserts new `mood_rooms` rows with `version = current_max + 1`.
6. Inserts `mood_room_titles` rows with centrality scores.
7. Inserts `clustering_runs` audit row.

## Acceptance gate

Workflow fails (and skips upsert) if:

- Cluster count < 10 or > 200.
- Mean cluster size < 20 or > 500.
- Noise fraction > 50% (HDBSCAN labelled too many titles as outliers).

Failed runs leave previous version live. The audit row is still inserted with `outcome = 'failed'`.

## Manual review

Labels are heuristic. Skim the new `mood_rooms` rows post-run; rename any label that is misleading. Suggested SQL:

```sql
SELECT id, label, title_count
FROM mood_rooms
WHERE version = (SELECT max(version) FROM mood_rooms)
ORDER BY title_count DESC;
```

Update labels via:

```sql
UPDATE mood_rooms SET label = 'New label' WHERE id = '...';
```

## Promoting a version

The app reads the most recent stable version. To pin to a specific version (e.g. roll back), set the `current_version` config value (mechanism TBD; for now, deleting/disabling newer rows works).

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Workflow fails on `psycopg2.OperationalError` | `SUPABASE_DB_URL` invalid or pooler issue | Verify URL; prefer direct connection (port 5432), not pooler. |
| HDBSCAN OOM | Too many embeddings | Subsample or split by media_type. |
| Clusters dominated by one genre | Embedding template skew | Re-run cluster coherence eval; consider template change. |
