---
title: Solution — Authenticated role missing RLS policy
type: concept
tags: [solution, post-mortem, rls, supabase, silent-failure]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/solutions/authenticated-role-missing-rls-policy.md
related:
  - wiki/concepts/techniques/rls-pattern.md
  - wiki/entities/codebase/migrations.md
  - wiki/entities/codebase/database-schema.md
---

# Solution — Authenticated role missing RLS policy

Date: 2026-03-22. Category: database-issues.

## Problem

After deploying the content cache (B1-E1), signed-in users saw rent/buy pills with no prices and all deep links fell back to search URLs. `streaming_availability` returned zero rows despite having 41,875 entries.

## Root cause

RLS policies were created for `anon` (SELECT) and `service_role` (ALL), but **not for `authenticated`**. When a user is signed in, the Supabase JS client sends queries with the user's JWT, which maps to the `authenticated` role, not `anon`. Without a matching policy, RLS silently returns empty results — no error, just `[]`.

```sql
-- What we had:
CREATE POLICY "anon_read_streaming" ON streaming_availability FOR SELECT TO anon USING (true);
-- What we were missing:
CREATE POLICY "authenticated_read_streaming" ON streaming_availability FOR SELECT TO authenticated USING (true);
```

## Symptoms

- `getStreamingLinks()` returned `[]` for all titles.
- Console: `[Cache] Miss: sa_links_549_tv` but no `[Cache] Set:` (nothing to cache).
- DevTools network tab showed 200 OK.
- SQL Editor (postgres role) showed data existed.
- `SET ROLE anon; SELECT count(*)` returned 41,875.
- `SET ROLE authenticated; SELECT count(*)` returned 0.

## Solution

Add `authenticated` SELECT policies to all content cache tables:

```sql
CREATE POLICY "authenticated_read_streaming" ON streaming_availability FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_titles" ON titles FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_genres" ON title_genres FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_credits" ON title_credits FOR SELECT TO authenticated USING (true);
```

Migration 005 backfilled these.

## Prevention

- When creating RLS for new tables, **always add policies for BOTH `anon` AND `authenticated`** if the app supports both signed-out and signed-in states.
- Supabase RLS failures are silent. Always test with an actual signed-in user session, not just SQL Editor (which runs as `postgres`).
- Add smoke test: query from app while signed in and assert non-empty results.
- See [RLS pattern](../../techniques/rls-pattern.md) for canonical templates and pre-deploy checklist.
