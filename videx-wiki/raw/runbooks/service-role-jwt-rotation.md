---
title: Service-Role JWT Rotation Runbook
generated: 2026-04-26
status: planned (pre-launch)
parking_lot: IN-XPS-004
---

# Service-Role JWT Rotation Runbook

The Supabase service-role key bypasses RLS and grants admin-level DB access. It must be rotated periodically and immediately on any suspected exposure. Procedure documented here so the rotation is mechanical when needed.

## Where the key is used

| Location | How it gets the key |
|---|---|
| `.env` (local dev) | `SUPABASE_SERVICE_ROLE_KEY` |
| Sync scripts (`scripts/sync-content.ts`, `scripts/embeddings/*.ts`, `scripts/enrichment/*.ts`) | Read from `.env` |
| Edge Functions | `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` set via `supabase secrets set` |
| GitHub Actions (mood room recluster) | `secrets.SUPABASE_SERVICE_ROLE_KEY` |
| pg_cron (`sync-incremental` invocation) | Currently inlined into the cron job definition; should move to Supabase Vault |

## Rotation procedure

1. **Generate replacement key.**
   - Supabase Dashboard → Settings → API → Reset service-role key.
   - Copy new key immediately.
2. **Update consumers in priority order:**
   1. GitHub Actions secrets (`gh secret set SUPABASE_SERVICE_ROLE_KEY`).
   2. Edge Function secrets (`supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<new>`). Redeploy each function.
   3. pg_cron job definition. Use Vault if available; otherwise edit cron job SQL.
   4. Local `.env` files (notify any other developers).
3. **Smoke test each consumer.**
   - Trigger `sync-incremental` manually: `supabase functions invoke sync-incremental --no-verify-jwt`.
   - Trigger mood room recluster manually if outside window.
   - Run a sync script stage to verify local `.env` works.
4. **Old key is now revoked automatically.** Any consumer still using it will fail with 401.

## Vault migration (recommended pre-launch)

Move the key into Supabase Vault and reference it from cron job definitions via `vault.decrypted_secrets`:

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

Benefits:
- Key is not in plaintext in cron job SQL or audit logs.
- Rotation only requires updating the vault secret; cron jobs do not need editing.

## On suspected exposure

1. Rotate immediately (steps above, condensed).
2. Audit Supabase project logs for unusual queries since suspected exposure date.
3. Audit `card_impressions`, `user_interactions`, `streaming_history` for any rows with implausible timestamps or counts.
4. Document the incident.
