---
title: Edge Function deployment runbook
type: concept
tags: [runbook, edge-functions, supabase, deno]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/runbooks/edge-function-deployment.md
related:
  - wiki/entities/infrastructure/supabase.md
  - wiki/concepts/decisions/adr-011-edge-function-shared-modules.md
---

# Edge Function deployment runbook

Deploys Deno-based Supabase Edge Functions. Supabase CLI cannot resolve paths outside `supabase/functions/`, so shared code is duplicated into `_shared/` per [ADR-011](../decisions/adr-011-edge-function-shared-modules.md).

## Functions

`sync-incremental`, `embed-new-titles`, `enrich-new-titles`, `refresh-service-fingerprints`. Plus `_shared/` modules.

## Prerequisites

- Supabase CLI installed (`npm i -g supabase`).
- `supabase login` and `supabase link --project-ref <ref>`.
- Function secrets set in dashboard or via `supabase secrets set KEY=VALUE`.

## Deploy

```bash
supabase functions deploy sync-incremental --no-verify-jwt
```

`--no-verify-jwt` for functions called by pg_cron via `pg_net` (no JWT in the request).

Deploy all (except `_shared/`):

```bash
for f in supabase/functions/*/; do
  name=$(basename "$f")
  if [[ "$name" != "_shared" ]]; then
    supabase functions deploy "$name" --no-verify-jwt
  fi
done
```

## Shared code pattern

`supabase/functions/_shared/` contains self-contained modules. Each function imports via `../_shared/`. Updating shared code requires redeploying every dependent function.

## Verify

```bash
supabase functions invoke sync-incremental --no-verify-jwt
```

Check function logs in Supabase dashboard. Check downstream tables (`streaming_history`, `streaming_availability`).

## Rollback

No built-in rollback. To revert: check out previous commit, redeploy.

## Secrets

| Secret | Used by |
|---|---|
| `SA_API_KEY` | `sync-incremental` |
| `OPENAI_API_KEY` | `embed-new-titles` |
| `TMDB_API_KEY` | `enrich-new-titles` |
| `SUPABASE_SERVICE_ROLE_KEY` | all |

```bash
supabase secrets set SA_API_KEY=<value>
supabase secrets list
```

## Quirks

- Local emulator `supabase functions serve` does not reproduce production runtime exactly. Test against deployed function.
- Smaller bundles cold-start faster.
- Edge Function timeout: 150s (Pro tier). Long-running backfills must be scripts, not Edge Functions.
