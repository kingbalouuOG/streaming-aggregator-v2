---
title: RLS pattern (Postgres Row-Level Security)
type: concept
tags: [rls, postgres, security, authenticated, anon, service-role, technique]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/concepts/rls-pattern.md
  - raw/codebase-snapshots/database-schema-snapshot.md
  - raw/solutions/authenticated-role-missing-rls-policy.md
related:
  - wiki/entities/codebase/database-schema.md
  - wiki/concepts/operations/solutions/authenticated-role-missing-rls.md
  - wiki/concepts/decisions/adr-010-pg-partman-card-impressions.md
---

# RLS pattern

Three roles, three policy classes. Every user-scoped or content table in Videx follows this template.

## Roles and policies

| Role | Default policies |
|---|---|
| `anon` | SELECT on public content tables (`titles`, `streaming_availability`, `streaming_history`, `mood_rooms`, `mood_room_titles`, `service_fingerprints` is **not** anon-readable post-Phase 2 review). |
| `authenticated` | SELECT on the same content tables. INSERT/SELECT on user-scoped tables (`user_interactions`, `card_impressions`, `taste_profiles`) filtered by `user_id = auth.uid()`. |
| `service_role` | ALL on every table. Used by Edge Functions and sync scripts. Bypasses RLS. |

## Idempotent policy creation

Always:

```sql
DROP POLICY IF EXISTS "policy_name" ON table_name;
CREATE POLICY "policy_name" ON table_name FOR ... USING (...);
```

Phase 2 review surfaced that `CREATE POLICY` without prior `DROP IF EXISTS` fails on re-run.

## The silent-empty bug (migration 005)

v1 migrations created `anon` and `service_role` policies but **forgot `authenticated`**. Authenticated users (signed-in real users) got empty SELECT results silently — the table existed, RLS was on, no policy matched, query returned no rows with no error.

Migration 005 fixed all v1 content tables. Locked rule going forward: **every content table needs all three role classes considered explicitly**, even if some get no policy. See [authenticated-role-missing-rls solution](../operations/solutions/authenticated-role-missing-rls.md).

## Partitioned tables (`card_impressions`)

Postgres does **not** propagate RLS from a partitioned parent to child partitions. pg_partman's `template_table` mechanism propagates constraints, indexes, CLUSTER settings — **NOT** RLS.

Solution: a `ddl_command_end` event trigger that fires on every `CREATE TABLE`, filters to the target partition name prefix, and applies `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY` inline.

Reference implementation: migration 016 (`card_impressions_rls_event_trigger.sql`). Migration 015 hardens existing partitions at apply time. Both required because new partitions are created automatically by pg_partman daily maintenance.

This is now a reusable Videx pattern (parking-lot IN-PX-01) for any future partitioned table.

## Hardening

- All RPC functions have `search_path` pinned (`SET search_path = public, pg_temp`) per migration 027. Neutralises role-default redirection attacks.
- All SECURITY DEFINER functions have `OWNER TO postgres` and `REVOKE EXECUTE FROM PUBLIC`.
- Per-partition work in event trigger wrapped in `BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING` so a blocked CREATE TABLE doesn't break daily partman cron.

## Pre-launch gap

`taste_profiles` was created without RLS (Phase 4 security review M1). GDPR/privacy blocker. Migration 033+ planned for Phase 5/6. Pre-existing gap, not introduced by Phase 4.
