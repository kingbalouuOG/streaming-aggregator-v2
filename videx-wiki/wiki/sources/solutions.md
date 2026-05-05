---
title: Source — Solutions / post-mortems
type: source
tags: [solutions, post-mortems]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/solutions/authenticated-role-missing-rls-policy.md
  - raw/solutions/sa-api-uk-service-coverage-gaps.md
  - raw/solutions/supabase-advisor-accepted-warnings.md
  - raw/solutions/supabase-content-cache-dead-code.md
related:
  - wiki/concepts/operations/solutions/authenticated-role-missing-rls.md
  - wiki/concepts/operations/solutions/sa-api-uk-service-coverage-gaps.md
  - wiki/concepts/operations/solutions/supabase-advisor-accepted-warnings.md
  - wiki/concepts/operations/solutions/supabase-content-cache-dead-code.md
---

# Source: Solutions / post-mortems

Four post-mortems under `raw/solutions/`. Each maps to a wiki concept page under `wiki/concepts/operations/solutions/`.

| Raw | Wiki concept | Date | Category |
|---|---|---|---|
| `authenticated-role-missing-rls-policy.md` | [authenticated-role-missing-rls](../concepts/operations/solutions/authenticated-role-missing-rls.md) | 2026-03-22 | database-issues |
| `sa-api-uk-service-coverage-gaps.md` | [sa-api-uk-service-coverage-gaps](../concepts/operations/solutions/sa-api-uk-service-coverage-gaps.md) | 2026-03-16 | integration-issues |
| `supabase-advisor-accepted-warnings.md` | [supabase-advisor-accepted-warnings](../concepts/operations/solutions/supabase-advisor-accepted-warnings.md) | 2026-04-15 | database-issues |
| `supabase-content-cache-dead-code.md` | [supabase-content-cache-dead-code](../concepts/operations/solutions/supabase-content-cache-dead-code.md) | 2026-03-21 | logic-errors |

## Why it matters

Post-mortems crystallise hard-won lessons into reusable knowledge. The RLS one, in particular, is referenced by the [RLS pattern](../concepts/techniques/rls-pattern.md) page as the canonical silent-empty-bug example.
