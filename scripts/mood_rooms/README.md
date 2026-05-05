# Mood rooms clustering

Monthly job that clusters the Videx catalogue into 30-60 mood rooms using
HDBSCAN on 1536-dim OpenAI embeddings, labels each cluster with a short
evocative name via `gpt-4o-mini`, and writes a new version to the
`mood_rooms` and `mood_room_titles` Supabase tables.

Runs as a GitHub Actions cron (`.github/workflows/mood-rooms-recluster.yml`)
and is also runnable locally for dry-runs and debugging.

## What it does

1. Starts an audit row in `clustering_runs` with `status='running'`.
2. Pulls every title from `titles` that has an embedding.
3. L2-normalises embeddings and runs HDBSCAN (euclidean on unit vectors =
   cosine distance).
4. Computes per-cluster centroids and per-title centrality (cosine distance
   to the own cluster's centroid; lower is more central).
5. Picks the 20 most central titles per cluster for labelling.
6. For each new cluster, checks Jaccard similarity against the previous
   run's clusters. If at least 0.8, preserves the old UUID, label,
   description, and `is_curated` flag (label stability across months).
7. For clusters without a stable match, calls `gpt-4o-mini` with structured
   output to generate a name and description. On failure, writes a
   placeholder label and logs the failure on the `clustering_runs` row.
8. Writes all new rows into `mood_rooms` and `mood_room_titles` under a new
   `version` number inside a single transaction.
9. Updates the audit row to `status='success'` with counts and coverage.

Old versions stay in the tables; the frontend always queries
`WHERE version = (SELECT MAX(version) FROM mood_rooms)`. Retention of old
versions is deliberate as a rollback path.

## Local setup

Requires Python 3.11.

```bash
cd scripts/mood_rooms
python -m venv .venv
. .venv/Scripts/activate   # Windows: Git Bash
# or: source .venv/bin/activate   # macOS / Linux
pip install -r requirements.txt
```

Create a gitignored `.env` file at the repo root with:

```
SUPABASE_CONNECTION_STRING=postgresql://postgres:<password>@db.<project>.supabase.co:5432/postgres
OPENAI_API_KEY=<your key>
```

Use the **Direct** connection string from Supabase (Project Settings -> Database
-> Connection string -> Direct), not the Session or Transaction pooler. The
job holds the connection for 5-15 minutes and the pooled URLs drop it.

Never commit `.env`. Never echo `SUPABASE_CONNECTION_STRING`. The script
redacts it from any error written to `clustering_runs.error_message` but
the first line of defence is never letting it leave the local machine.

## Dry run

Always dry-run before the first real write in a new environment.

```bash
python scripts/mood_rooms/recluster.py --dry-run
```

A dry run:

- Reads embeddings from Supabase (no writes).
- Runs HDBSCAN.
- Prints cluster count, noise count, catalogue coverage.
- Prints up to 10 sample clusters with their 5 most central titles.
- If `OPENAI_API_KEY` is present, probes OpenAI on the **three largest
  clusters** and prints the generated labels. Failures are soft-logged,
  the clustering report still prints, and a banner at the top of the
  report surfaces any failure so it can't be missed.
- Does not insert a row into `clustering_runs` or any other table.

Expected output shape:

```
Titles embedded:        19993
Clusters found:         42
Noise count:            4512
Catalogue coverage:     77.4%

Sampling up to 10 clusters:
  Cluster 0  (titles in cluster: 124)
    [0.0812] Arrival (2016) [movie]
    [0.0891] Ex Machina (2014) [movie]
    ...
```

Pass or fail against IN-457:

- Cluster count in [30, 60]: pass / fail
- Catalogue coverage >= 70%: pass / fail
- Coherence spot-check on sampled clusters: Joe judges
- OpenAI probe succeeds on all 3 largest clusters and the labels look
  reasonable: verifies API shape and credentials live before first write

If the dry run fails the gates, tune `HDBSCAN_MIN_CLUSTER_SIZE` /
`HDBSCAN_MIN_SAMPLES` in `cluster.py`, or escalate to IN-457 fallback
(k-means or hybrid) before proceeding to a real run. If the probe fails
on all three clusters, fix the OpenAI integration before anything else.

## Real run

```bash
python scripts/mood_rooms/recluster.py
```

Writes a new version to `mood_rooms` and `mood_room_titles`. On failure,
stamps a `status='failed'` row into `clustering_runs` with the redacted
error message, and exits non-zero.

## GitHub Actions

The workflow at `.github/workflows/mood-rooms-recluster.yml` runs the
script with the same environment variables injected from repository
secrets.

The scheduled cron is commented out on first commit and will be enabled
only after Phase 4.5 Gate 3 passes. Until then, the workflow is triggered
manually via the Actions tab (`workflow_dispatch`).

Required repository secrets:

- `SUPABASE_CONNECTION_STRING`
- `OPENAI_API_KEY`

## Module layout

- `recluster.py` - entry point. Argparse, orchestration, transaction
  boundary, dry-run report.
- `cluster.py` - HDBSCAN, L2 normalisation, centroid + centrality maths,
  Jaccard similarity. Pure numpy, no I/O.
- `label.py` - Jaccard stability matching and OpenAI structured-output
  labelling with three-tier fallback.
- `persist.py` - psycopg2 connection management, embedding pull, genre
  lookup, previous-run lookup, bulk writes, connection-string redaction.
- `requirements.txt` - pinned dependencies. Versions verified against
  PyPI on 2026-04-19 (Python 3.11 compatible wheels available for all).
