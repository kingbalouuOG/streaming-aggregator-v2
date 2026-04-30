---
title: Edge Function Deployment Runbook
generated: 2026-04-26
---

# Edge Function Deployment Runbook

Deploys Deno-based Supabase Edge Functions. The Supabase CLI cannot resolve paths outside `supabase/functions/`, so shared code is duplicated into `supabase/functions/_shared/`.

## Functions in repo

- `sync-incremental` — daily SA API delta sync.
- `embed-new-titles` — generate embeddings for new titles.
- `enrich-new-titles` — TMDb enrichment (keywords, cast, director, content rating).
- `refresh-service-fingerprints` — recompute per-service centroids.

## Prerequisites

- Supabase CLI installed (`npm i -g supabase`).
- Logged in: `supabase login`.
- Linked to project: `supabase link --project-ref <ref>`.
- Function secrets set in Supabase dashboard or via `supabase secrets set KEY=VALUE`.

## Deploy a single function

```bash
supabase functions deploy sync-incremental --no-verify-jwt
```

Use `--no-verify-jwt` for functions called by pg_cron via `pg_net` (no JWT in the request).

## Deploy all

```bash
for f in supabase/functions/*/; do
  name=$(basename "$f")
  if [[ "$name" != "_shared" ]]; then
    supabase functions deploy "$name" --no-verify-jwt
  fi
done
```

## Shared code pattern

Because Docker-based bundling is not available locally, shared modules live in `supabase/functions/_shared/`. Each function imports via relative path:

```ts
// supabase/functions/sync-incremental/index.ts
import { saApi } from '../_shared/saApi.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
```

`_shared/` modules must be self-contained (no imports from outside `supabase/functions/`).

When updating shared code:

1. Edit the module under `_shared/`.
2. Redeploy every function that imports it.
3. Test each function end-to-end after deploy.

## Verify

```bash
supabase functions invoke sync-incremental --no-verify-jwt
```

Check the function logs in the Supabase dashboard for any errors. Check downstream tables (`streaming_history`, `streaming_availability`) updated correctly.

## Rollback

Edge Functions do not have a built-in rollback. To revert:

1. Check out the previous commit.
2. Redeploy.

## Secrets

| Secret | Used by |
|---|---|
| `SA_API_KEY` | `sync-incremental` |
| `OPENAI_API_KEY` | `embed-new-titles` |
| `TMDB_API_KEY` | `enrich-new-titles` |
| `SUPABASE_SERVICE_ROLE_KEY` | all |

Set via:

```bash
supabase secrets set SA_API_KEY=<value>
```

Verify:

```bash
supabase secrets list
```

## Quirks

- **Local emulator:** `supabase functions serve` works but does not reproduce production runtime exactly. Test against deployed function before declaring done.
- **Bundle size:** Edge Functions cold-start faster with smaller bundles. Avoid pulling large npm packages into `_shared/`.
- **Timeout:** 150 seconds (Pro tier). Long-running backfills must run as scripts, not Edge Functions.
