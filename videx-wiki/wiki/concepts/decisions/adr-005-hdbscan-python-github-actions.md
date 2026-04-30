---
title: ADR-005 — HDBSCAN runs in Python + GitHub Actions, not TypeScript
type: concept
tags: [adr, decision, hdbscan, mood-rooms, python, github-actions, locked]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/adrs/adrs-combined.md
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
related:
  - wiki/concepts/techniques/hdbscan.md
  - wiki/concepts/architecture/mood-rooms.md
  - wiki/entities/infrastructure/github-actions.md
  - wiki/concepts/operations/monthly-mood-room-recluster.md
---

# ADR-005 — HDBSCAN runs in Python + GitHub Actions, not TypeScript

**Status:** locked.

## Context

Mood Rooms require HDBSCAN clustering of the embedding space monthly. TypeScript HDBSCAN ports lack production-grade memory handling and parity with scikit-learn.

## Decision

Run clustering in Python with `hdbscan` package + `psycopg2` direct DB connection, scheduled monthly via GitHub Actions cron. No PL/Python on Supabase.

## Consequences

- Clean Python environment with pinned versions.
- Reliable monthly cadence.
- One extra system to operate.
- Secrets must live in both Supabase and GitHub Actions.

## Reference

Strategy v1.6.3 §5.2, parking lot IN-455 to IN-457.

## Implementation

- Workflow: `.github/workflows/mood-rooms-recluster.yml`, cron `'0 3 1 * *'` (03:00 UTC on the 1st).
- Script: `scripts/mood_rooms/recluster.py`.
- Dependencies: `hdbscan`, `numpy`, `psycopg2-binary`, `openai` pinned in `requirements.txt`.
- Connection: psycopg2 with Supabase direct PostgreSQL connection string (avoids PostgREST 1000-row cap).
- Runtime: 5-15 minutes per run at 20K titles.
- Secrets: `SUPABASE_CONNECTION_STRING`, `OPENAI_API_KEY` via GitHub Actions Secrets.
