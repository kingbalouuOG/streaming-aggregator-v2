---
title: "Supabase Security Advisor — accepted warnings"
category: database-issues
date: 2026-04-15
tags: [supabase, security-advisor, pg_partman, pgvector, auth, linter]
---

## Context

On 2026-04-15 the Supabase Security Advisor flagged 10 ERRORs and 13 WARNs against project `fmusugdcnnwiuzkbjquo`. The ERRORs and the fixable WARNs were resolved in migrations [026_security_linter_fixes.sql](../../../supabase/migrations/026_security_linter_fixes.sql) and [027_function_search_path_pin.sql](../../../supabase/migrations/027_function_search_path_pin.sql).

Three WARN-level items remain **intentionally unresolved**. This note records why, so they don't get re-litigated every time the advisor is reviewed.

## Accepted: `extension_in_public` — `vector`

Supabase wants pgvector moved out of `public` into an `extensions` schema.

**Why we're not moving it:**
- Every `embedding vector(1536)` column on `titles` and related tables resolves `vector` via `public`. Moving the extension means rewriting the type references to `extensions.vector` on every column and in every function/RPC body that touches them, including [025_fix_match_titles_rpc.sql](../../../supabase/migrations/025_fix_match_titles_rpc.sql) and [018_embeddings_pgvector.sql](../../../supabase/migrations/018_embeddings_pgvector.sql).
- The `<=>` / `<->` operators would also need to be resolved via the new schema or pulled onto the function `search_path`.
- The warning is informational — extension objects don't expose data. There is no attacker path opened by leaving it in public.

**When to revisit:** if we do a full Phase 4 vector refactor, bundle the move into that work. Not before.

## Accepted: `extension_in_public` — `pg_partman`

Same warning, same recommendation to move to a dedicated schema.

**Why we're not moving it:**
- Supabase installs pg_partman into `public` by default — this is documented in the header of [014_card_impressions_table.sql](../../../supabase/migrations/014_card_impressions_table.sql#L26-L43). A prior attempt at using a `partman` schema failed with `schema "partman" does not exist`.
- Moving the extension renames `part_config`, `part_config_sub`, `create_parent()`, `run_maintenance_proc()`, and the auto-generated `template_public_card_impressions` table. The daily cron job (`pg_partman_maintenance`) calls `run_maintenance_proc()` unqualified — partition creation would start failing silently after the move.
- The `template_public_card_impressions` table we already locked down in migration 026 via RLS-with-no-policies, which is what the advisor actually cared about from a data-exposure standpoint.

**When to revisit:** only if Supabase changes their default install location upstream, or if we rip out pg_partman entirely.

## Accepted (pending manual toggle): `auth_leaked_password_protection`

This is an Auth dashboard setting, not a SQL fix. Enabling it makes Supabase Auth check new/reset passwords against HaveIBeenPwned.

**Action for Joe:** Supabase dashboard → Authentication → Sign In / Providers → "Password-based sign-in" → enable **Prevent use of leaked passwords**. Zero downside; takes seconds.

Once toggled, this warning will disappear on its own — no migration needed.

## Summary

| Warning | Status | Owner |
|---|---|---|
| `extension_in_public: vector` | Accepted — too disruptive to move | — |
| `extension_in_public: pg_partman` | Accepted — Supabase default, too disruptive to move | — |
| `auth_leaked_password_protection` | Pending dashboard toggle | Joe |
