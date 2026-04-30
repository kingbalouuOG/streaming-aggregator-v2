---
title: GitHub Actions
type: entity
tags: [github-actions, ci, cron, workflows]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/infrastructure/hdbscan-and-github-actions.md
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.3.3.md
related:
  - wiki/concepts/decisions/adr-005-hdbscan-python-github-actions.md
  - wiki/concepts/architecture/mood-rooms.md
  - wiki/concepts/techniques/hdbscan.md
  - wiki/concepts/operations/monthly-mood-room-recluster.md
---

# GitHub Actions

Used for two things in v2: lightweight CI (typecheck + lint + build) and the monthly mood-room reclustering job.

## CI workflows

| Workflow | Trigger | What it runs |
|---|---|---|
| `.github/workflows/typecheck-lint.yml` | push to `phase-*`, pull request to `main` | `npx tsc --noEmit` and `npx eslint . --ext .ts,.tsx` |
| `.github/workflows/build-verify.yml` | push to `main` | `npm run build` (with stub env vars or GitHub Secrets) |

No automated tests yet (test coverage minimal; building it is not a Phase 0 concern). No deployment automation. No preview environments.

## Mood-room recluster workflow

`.github/workflows/mood-rooms-recluster.yml`. Triggered by cron `'0 3 1 * *'` (03:00 UTC, 1st of each month) and manually via `workflow_dispatch` for testing.

```yaml
jobs:
  recluster:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11', cache: 'pip' }
      - run: pip install -r scripts/mood_rooms/requirements.txt
      - run: python scripts/mood_rooms/recluster.py
        env:
          SUPABASE_CONNECTION_STRING: ${{ secrets.SUPABASE_CONNECTION_STRING }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

Script: `scripts/mood_rooms/recluster.py`. Dependencies (`hdbscan`, `numpy`, `psycopg2-binary`, `openai`) pinned in `scripts/mood_rooms/requirements.txt`.

Connection: psycopg2 with Supabase direct PostgreSQL connection string (avoids PostgREST 1000-row cap; faster for bulk vector reads).

Runtime: 5-15 minutes per run at 20K titles. Within GitHub Actions' 6-hour per-job limit and ~2,000 minute/month free tier.

Secrets: `SUPABASE_CONNECTION_STRING`, `OPENAI_API_KEY` via GitHub Actions Secrets.

Failure handling: if clustering produces fewer than 10 rooms or more than 200, workflow fails and skips the upsert. Previous version remains live. All runs append to `clustering_runs` regardless of outcome.

## Why GitHub Actions for clustering, not pg_cron

HDBSCAN is CPU-heavy and benefits from a clean Python environment with pinned scientific package versions. PL/Python is not available on Supabase Pro; no pgvector clustering extension exists. GitHub Actions monthly cron is the simplest reliable scheduler. See [ADR-005](../../concepts/decisions/adr-005-hdbscan-python-github-actions.md).
