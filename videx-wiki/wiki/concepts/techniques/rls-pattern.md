---
title: RLS pattern (Postgres Row-Level Security)
type: concept
tags: [rls, postgres, security, authenticated, anon, service-role, technique]
created: 2026-04-26
updated: 2026-09-18
sources:
  - raw/concepts/rls-pattern.md
  - raw/codebase-snapshots/database-schema-snapshot.md
  - raw/solutions/authenticated-role-missing-rls-policy.md
  - supabase/migrations/093_households.sql
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

## Membership RLS (households, migration 093)

The first policies in the codebase that let one user read another's rows. Until 093 every user-scoped policy was owner-only (`user_id = auth.uid()`; live check 2026-09-18 found no cross-user read anywhere else). The shape, for reuse:

- **One helper, used by every policy.** `is_household_member(hid uuid) returns boolean`, `SECURITY DEFINER`, `STABLE`, `search_path` pinned: `EXISTS (SELECT 1 FROM household_members WHERE household_id = hid AND user_id = auth.uid())`. Being definer, it reads `household_members` without that table's own policy, so the members policy can call it without recursion.
- **Parent tables** test their own key: `households` → `is_household_member(id)`; `household_members`, `watchlists` → `is_household_member(household_id)`.
- **Child tables** use an uncorrelated `IN` over the parents the caller can see, so the planner builds the set once rather than per row: `watchlist_items` → `watchlist_id IN (SELECT w.id FROM watchlists w WHERE is_household_member(w.household_id))`; `watchlist_reactions` goes one join further through `watchlist_items`.
- **Writes the app makes directly** add the identity in `WITH CHECK`: items `added_by = (SELECT auth.uid())` plus membership; reactions `user_id = (SELECT auth.uid())` plus membership (INSERT and UPDATE), own row only for UPDATE/DELETE. Item DELETE is the adder or the household owner. No item UPDATE in v1.
- **Grants narrow what policies cannot.** Column grants: `households` UPDATE `(name)` only (rename is the owner's one direct write); `watchlist_items` INSERT on the six client columns only, so `id` and `added_at` always take defaults. `watchlist_reactions` keeps table-level UPDATE because a PostgREST upsert sets every payload column.
- **Edges are RPCs, not policies.** Creating, inviting, joining, leaving and reading co-member names are SECURITY DEFINER functions with stable error codes ([RPC catalogue](../../entities/codebase/rpcs.md#households-growth-g2-migration-093)). `household_invites` has RLS on and no policy and no grant: the token is readable by nobody but the functions.
- **Three roles, stated explicitly** (the migration-005 lesson): `anon` holds no grant on any household table (a read raises `permission denied` rather than returning rows); `authenticated` gets only the verbs above; `service_role` keeps its defaults.
- **Test as each role.** `supabase/queries/verify-093-households.sql` switches role with `set_config('role', …)` plus `request.jwt.claims` inside one rolled-back transaction and asserts member, non-member and anon behaviour. It was mutation-tested before apply (in PGlite, against stubbed `auth`): dropping the `added_by` check, granting anon EXECUTE, ordering the hand-over by id, or firing the profiles trigger AFTER rather than BEFORE delete each make it fail.
- **Deletion outside the app.** `households.owner_id` cascades, so a `BEFORE DELETE` trigger on `profiles` (`profiles_leave_households`) runs the same leave logic first; an owner removed from Studio or the Auth admin API hands the household on instead of deleting it under its members.

## Hardening

- All RPC functions have `search_path` pinned (`SET search_path = public, pg_temp`) per migration 027. Neutralises role-default redirection attacks.
- All SECURITY DEFINER functions have `OWNER TO postgres` and `REVOKE EXECUTE FROM PUBLIC`.
- Per-partition work in event trigger wrapped in `BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING` so a blocked CREATE TABLE doesn't break daily partman cron.

## Pre-launch gap

`taste_profiles` was created without RLS (Phase 4 security review M1). GDPR/privacy blocker. Migration 033+ planned for Phase 5/6. Pre-existing gap, not introduced by Phase 4.
