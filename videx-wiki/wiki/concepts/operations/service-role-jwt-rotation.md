---
title: Service-role JWT rotation runbook
type: concept
tags: [runbook, security, jwt, supabase, vault]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/runbooks/service-role-jwt-rotation.md
related:
  - wiki/entities/infrastructure/supabase.md
  - wiki/entities/infrastructure/rapidapi.md
---

# Service-role JWT rotation runbook

Status: planned (pre-launch). Tracked as parking-lot IN-XPS-004.

The Supabase service-role key bypasses RLS and grants admin-level DB access. Must be rotated periodically and immediately on any suspected exposure.

## Where the key is used

| Location | How it gets the key |
|---|---|
| `.env` (local dev) | `SUPABASE_SERVICE_ROLE_KEY` |
| Sync scripts (`scripts/sync-content.ts`, `scripts/embeddings/*`, `scripts/enrichment/*`) | Read from `.env` |
| Edge Functions | `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` set via `supabase secrets set` |
| GitHub Actions (mood room recluster) | `secrets.SUPABASE_SERVICE_ROLE_KEY` |
| pg_cron (`sync-incremental` invocation) | Currently inlined into cron job definition; should move to Supabase Vault |

## Rotation procedure

1. **Generate replacement.** Supabase Dashboard → Settings → API → Reset service-role key. Copy immediately.
2. **Update consumers in priority order:**
   1. GitHub Actions secrets (`gh secret set SUPABASE_SERVICE_ROLE_KEY`).
   2. Edge Function secrets (`supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<new>`). Redeploy each function.
   3. pg_cron job definition. Use Vault if available; otherwise edit cron job SQL.
   4. Local `.env` files (notify other developers).
3. **Smoke-test each consumer.**
   - Trigger `sync-incremental` manually.
   - Trigger mood room recluster manually if outside window.
   - Run a sync script stage to verify local `.env`.
4. **Old key revoked automatically.** Any consumer still using it will fail with 401.

## Vault migration (recommended pre-launch)

Move key into Supabase Vault and reference from cron via `vault.decrypted_secrets`:

```sql
-- One-time setup
SELECT vault.create_secret('<service-role-key>', 'service_role_key');

-- In cron job definition
SELECT net.http_post(
  url := 'https://<ref>.supabase.co/functions/v1/sync-incremental',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'
    )
  )
);
```

Benefits: key not plaintext in cron SQL or audit logs; rotation only requires updating vault secret.

## On suspected exposure

1. Rotate immediately.
2. Audit Supabase project logs since suspected exposure date.
3. Audit `card_impressions`, `user_interactions`, `streaming_history` for implausible timestamps or counts.
4. Document the incident.
