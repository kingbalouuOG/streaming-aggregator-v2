---
title: RLS Pattern (anon vs authenticated vs service_role)
generated: 2026-04-26
sources: [docs/solutions/database-issues/authenticated-role-missing-rls-policy.md, supabase/migrations/005_*]
---

# RLS Pattern

Three Postgres roles, three policy classes. Getting one wrong is silent: the query returns `[]` with no error.

## Roles

| Role | Who uses it | Default policy without explicit grant |
|---|---|---|
| `anon` | Unauthenticated client requests via the Supabase anon key. | Denied |
| `authenticated` | Client requests carrying a user JWT. | Denied |
| `service_role` | Edge Functions, sync scripts, GitHub Actions jobs using the service-role key. | Bypasses RLS entirely |

## The silent-empty bug

If a table has a policy for `anon` but **not** `authenticated`, signed-in users see empty results. Postgres does not error; RLS just filters every row. The `anon` policy does not apply to authenticated requests because the role is different.

Symptoms:
- Console shows successful query with `data: []`.
- DevTools network tab shows 200 OK.
- SQL Editor (postgres role) shows the rows exist.
- `SET ROLE anon; SELECT ...` returns rows.
- `SET ROLE authenticated; SELECT ...` returns nothing.

This bit Videx in March 2026 (B1-E1 deploy). Migration 005 backfilled `authenticated` policies. See `docs/solutions/database-issues/authenticated-role-missing-rls-policy.md`.

## Policy template

For a content table that should be readable by anyone (signed in or not):

```sql
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_my_table" ON my_table
  FOR SELECT TO anon USING (true);

CREATE POLICY "authenticated_read_my_table" ON my_table
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_role_my_table" ON my_table
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

For a user-scoped table:

```sql
CREATE POLICY "Users can read own rows" ON my_table
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own rows" ON my_table
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "service_role_all" ON my_table
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

## Pre-deploy checklist for any new table

1. Did you `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`? (Otherwise Postgres skips RLS entirely.)
2. Is there an `anon` policy if the data is public?
3. Is there an `authenticated` policy matching the `anon` one (or stricter, for user-scoped data)?
4. Is there a `service_role` policy for sync/Edge Function writes?
5. If partitioned: are the policies on the parent **plus** every child partition? See `card_impressions` migrations 015 and 016 for the event-trigger replication pattern.

## Verification commands

```sql
-- Show effective policies
SELECT * FROM pg_policies WHERE tablename = 'my_table';

-- Test as anon
SET LOCAL ROLE anon;
SELECT count(*) FROM my_table;
RESET ROLE;

-- Test as authenticated (requires JWT or test helper)
SET LOCAL ROLE authenticated;
SELECT count(*) FROM my_table;
RESET ROLE;
```

## Linter

Supabase's database linter flags missing-policy patterns; results land in the dashboard advisor. Migration 026 resolved a batch of findings; periodic re-run is on the operations checklist.
