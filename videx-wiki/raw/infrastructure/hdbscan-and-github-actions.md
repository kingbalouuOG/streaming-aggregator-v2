---
title: HDBSCAN and GitHub Actions
generated: 2026-04-26
sources: [docs/v2/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md §5.2, parking lot IN-455 to IN-457]
---

# HDBSCAN + GitHub Actions

Mood Rooms are produced by clustering the 1536D title embeddings with HDBSCAN. The job runs monthly outside Postgres because HDBSCAN's TypeScript implementations are not production-grade.

## Tooling

- **Algorithm:** HDBSCAN (`hdbscan` Python package, `scikit-learn-contrib`).
- **Language:** Python 3.11.
- **Database driver:** `psycopg2-binary`.
- **Runner:** GitHub Actions, scheduled via cron in the workflow file.
- **Secrets:** Supabase service-role key, project URL.

## Why not TypeScript

TypeScript HDBSCAN ports lack proper memory handling for the dataset size, do not match scikit-learn's implementation accurately, and impose a maintenance burden disproportionate to the monthly cadence. Decision recorded as ADR-005.

## Why not pg_cron

The clustering job is CPU-heavy and benefits from a clean Python environment with pinned scientific package versions. Running it inside Postgres would require PL/Python (not available on Supabase Pro) or a pgvector extension that does not exist.

## Workflow shape

1. Workflow triggers on cron schedule (1st of month, 03:00 UTC).
2. Python script connects to Supabase via psycopg2.
3. Pulls all `titles.embedding` where embedding IS NOT NULL.
4. Runs HDBSCAN with parameters tuned for ~30-80 clusters of 30-300 titles each.
5. Generates labels via a small heuristic on top centroids' nearest titles.
6. Writes new `mood_rooms`, `clustering_runs`, and `mood_room_titles` rows.
7. Old `mood_rooms` rows kept for the previous version; `version` column lets the app pin to current version.

## Parameters

- `min_cluster_size`: 30
- `min_samples`: 5
- `cluster_selection_method`: 'eom' (excess of mass)
- `metric`: 'cosine'

Exact values may change over time; truth lives in the GitHub Actions workflow YAML.

## Failure handling

- If clustering produces fewer than 10 rooms or more than 200, the workflow fails and skips the upsert. Previous version remains live.
- All runs append to `clustering_runs` regardless of outcome (success / failure / parameters / row counts).
