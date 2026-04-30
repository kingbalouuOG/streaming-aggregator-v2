---
title: Source — Infrastructure references
type: source
tags: [infrastructure, supabase, capacitor, github-actions, rapidapi, pgvector]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/infrastructure/supabase-configuration.md
  - raw/infrastructure/capacitor-reference.md
  - raw/infrastructure/pgvector-pg_partman-pg_cron.md
  - raw/infrastructure/rapidapi.md
  - raw/infrastructure/hdbscan-and-github-actions.md
related:
  - wiki/entities/infrastructure/supabase.md
  - wiki/entities/infrastructure/capacitor.md
  - wiki/entities/infrastructure/pgvector-pg_partman-pg_cron.md
  - wiki/entities/infrastructure/rapidapi.md
  - wiki/entities/infrastructure/github-actions.md
---

# Source: Infrastructure references

Five reference docs under `raw/infrastructure/`. Each maps to a wiki entity page under `wiki/entities/infrastructure/`.

| Raw | Wiki entity |
|---|---|
| `supabase-configuration.md` | [Supabase](../entities/infrastructure/supabase.md) |
| `capacitor-reference.md` | [Capacitor](../entities/infrastructure/capacitor.md) |
| `pgvector-pg_partman-pg_cron.md` | [Postgres extensions](../entities/infrastructure/pgvector-pg_partman-pg_cron.md) |
| `rapidapi.md` | [RapidAPI](../entities/infrastructure/rapidapi.md) |
| `hdbscan-and-github-actions.md` | [GitHub Actions](../entities/infrastructure/github-actions.md) |

## Why it matters

Configuration baselines for the Videx stack. Pin extension versions, plan tiers, deploy quirks. Re-snapshot when any of these changes upstream (Supabase plan changes, Capacitor major version, RapidAPI tier change).
