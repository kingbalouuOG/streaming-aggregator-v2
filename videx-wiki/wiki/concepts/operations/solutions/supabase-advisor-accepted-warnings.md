---
title: Solution — Supabase Security Advisor accepted warnings
type: concept
tags: [solution, supabase, security-advisor, pgvector, pg_partman, auth]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/solutions/supabase-advisor-accepted-warnings.md
related:
  - wiki/entities/codebase/migrations.md
  - wiki/entities/infrastructure/supabase.md
---

# Solution — Supabase Security Advisor accepted warnings

Date: 2026-04-15. Category: database-issues.

## Context

Supabase Security Advisor flagged 10 ERRORs and 13 WARNs against project `fmusugdcnnwiuzkbjquo` on 2026-04-15. ERRORs and fixable WARNs resolved in migrations 026 and 027.

Three WARN-level items remain **intentionally unresolved**. Recorded here so they don't get re-litigated.

## Accepted: `extension_in_public` — `vector`

Advisor wants pgvector moved out of `public` into an `extensions` schema.

**Why we're not moving it:**

- Every `embedding vector(1536)` column on `titles` and related tables resolves `vector` via `public`. Moving means rewriting type references to `extensions.vector` on every column and in every function/RPC body, including migrations 025, 018.
- The `<=>` / `<->` operators would need to be resolved via the new schema or pulled onto function `search_path`.
- Warning is informational; extension objects don't expose data. No attacker path opened by leaving it in `public`.

When to revisit: bundle into a future Phase 4+ vector refactor if one happens.

## Accepted: `extension_in_public` — `pg_partman`

Same warning, same recommendation.

**Why we're not moving it:**

- Supabase installs pg_partman into `public` by default — documented in the header of migration 014. A prior attempt at using a `partman` schema failed with `schema "partman" does not exist`.
- Moving renames `part_config`, `part_config_sub`, `create_parent()`, `run_maintenance_proc()`, and the auto-generated `template_public_card_impressions` table. Daily cron job (`pg_partman_maintenance`) calls `run_maintenance_proc()` unqualified — partition creation would start failing silently after the move.
- The `template_public_card_impressions` table was already locked down in migration 026 via RLS-with-no-policies, which is what the advisor actually cared about from a data-exposure standpoint.

When to revisit: only if Supabase changes default install location upstream, or if pg_partman is removed entirely.

## Accepted (pending manual toggle): `auth_leaked_password_protection`

Auth dashboard setting, not a SQL fix. Enabling makes Supabase Auth check new/reset passwords against HaveIBeenPwned.

**Action for Joe:** Supabase dashboard → Authentication → Sign In / Providers → "Password-based sign-in" → enable **Prevent use of leaked passwords**. Zero downside; takes seconds.

Once toggled, this warning disappears automatically. No migration needed.

## Summary

| Warning | Status | Owner |
|---|---|---|
| `extension_in_public: vector` | Accepted, too disruptive | — |
| `extension_in_public: pg_partman` | Accepted, Supabase default | — |
| `auth_leaked_password_protection` | Pending dashboard toggle | Joe |
