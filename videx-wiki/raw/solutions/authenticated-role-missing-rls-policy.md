---
title: "Supabase content cache returns empty for signed-in users — missing authenticated RLS policy"
category: database-issues
date: 2026-03-22
tags: [supabase, rls, authenticated, anon, streaming-availability, content-cache, silent-failure]
---

## Problem

After deploying the content cache (B1-E1), signed-in users saw rent/buy pills with no prices and all deep links fell back to search URLs instead of exact SA API links. The Supabase `streaming_availability` table returned zero rows despite having 41,875 entries.

## Root Cause

RLS policies were created for `anon` (SELECT) and `service_role` (ALL), but **not for `authenticated`**. When a user is signed in, the Supabase JS client sends queries with the user's JWT, which maps to the `authenticated` role — not `anon`. Without a matching policy, RLS silently returns empty results (no error, just `[]`).

```sql
-- What we had:
CREATE POLICY "anon_read_streaming" ON streaming_availability FOR SELECT TO anon USING (true);
-- What we were missing:
CREATE POLICY "authenticated_read_streaming" ON streaming_availability FOR SELECT TO authenticated USING (true);
```

## Symptoms

- `getStreamingLinks()` returned empty arrays for all titles
- Console showed `[Cache] Miss: sa_links_549_tv` but no subsequent `[Cache] Set:` (nothing to cache)
- Direct Supabase query from browser DevTools confirmed: `Error: null, Rows: 0, Data: []`
- SQL Editor queries (which run as `postgres` role) showed data existed
- `SET ROLE anon; SELECT COUNT(*) ...` returned 41,875 rows — confirming anon could see data but the app wasn't using anon

## Solution

Add `authenticated` SELECT policies to all content cache tables:

```sql
CREATE POLICY "authenticated_read_streaming" ON streaming_availability FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_titles" ON titles FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_genres" ON title_genres FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read_credits" ON title_credits FOR SELECT TO authenticated USING (true);
```

## Prevention

- **When creating RLS policies for new Supabase tables, always add policies for BOTH `anon` AND `authenticated` roles** if the app supports both signed-out and signed-in states.
- Supabase RLS failures are silent — queries return empty results, not errors. Always test with an actual signed-in user session, not just the SQL Editor (which runs as `postgres`).
- Add a smoke test: after creating tables with RLS, query from the app while signed in and verify non-empty results.
