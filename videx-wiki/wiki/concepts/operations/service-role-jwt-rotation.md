---
title: Service-role JWT rotation runbook
type: concept
tags: [runbook, security, jwt, supabase, vault]
created: 2026-04-26
updated: 2026-05-07
sources:
  - raw/runbooks/service-role-jwt-rotation.md
  - docs/v2/phase-summaries/phase-5-summary.md
related:
  - wiki/entities/infrastructure/supabase.md
  - wiki/entities/infrastructure/rapidapi.md
  - wiki/entities/codebase/migrations.md
---

# Service-role JWT rotation runbook

**Status (2026-05-07):** Phase 5 shipped a Vault storage migration (migration 039) — JWT moved out of source code into Supabase Vault. **Cryptographic rotation is deferred to Phase 6+** pending Supabase tooling. The same JWT value is now read from Vault rather than inlined in cron schedules; future rotation is a single `vault.update_secret()` call once Supabase ships JWT-format secret keys (current `sb_secret_…` opaque format fails `verify_jwt = true` on Edge Functions). Tracked as parking-lot IN-XPS-004.

The Supabase service-role key bypasses RLS and grants admin-level DB access. Must be rotated periodically and immediately on any suspected exposure.

## Where the key is used

| Location | How it gets the key |
|---|---|
| `.env` (local dev) | `SUPABASE_SERVICE_ROLE_KEY` |
| Sync scripts (`scripts/sync-content.ts`, `scripts/embeddings/*`, `scripts/enrichment/*`) | Read from `.env` |
| Edge Functions | `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` set via `supabase secrets set` |
| GitHub Actions (mood room recluster) | `secrets.SUPABASE_SERVICE_ROLE_KEY` |
| pg_cron (`daily-content-sync` + 3 others) | **Phase 5 (migration 039):** reads from `vault.decrypted_secrets WHERE name = 'service_role_key'` at job-run time. Same JWT value as previous inline registrations; storage location only. |

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

## Vault migration — ✅ shipped Phase 5 (migration 039)

The Vault entry `service_role_key` was created via the Supabase Studio SQL editor on 2026-05-06. Migration 039 unschedules + reschedules the four affected cron jobs (`daily-content-sync`, `embed-new-titles`, `enrich-new-titles`, `refresh-service-fingerprints`) using the pattern below. The three `supabase/cron/*.sql` files were also updated to use the same Vault read so re-applying them doesn't re-introduce inline JWTs.

```sql
-- One-time setup (done 2026-05-06)
SELECT vault.create_secret('<existing-legacy-jwt>', 'service_role_key', 'Service role JWT used by pg_cron jobs.');

-- In every cron registration body
SELECT net.http_post(
  url := 'https://fmusugdcnnwiuzkbjquo.supabase.co/functions/v1/<function-name>',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || (
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1
    )
  ),
  body := '{}'::jsonb
);
```

**Verification queries** post-apply:

```sql
-- All four jobs registered + active.
SELECT jobname, schedule, active FROM cron.job
WHERE jobname IN ('daily-content-sync','embed-new-titles','enrich-new-titles','refresh-service-fingerprints');

-- No inline JWTs anywhere.
SELECT count(*) FROM cron.job WHERE command LIKE '%Bearer ey%';  -- expect 0

-- After next scheduled run (06:30 UTC enrich-new-titles is soonest).
SELECT jobname, status, return_message, end_time FROM cron.job_run_details
WHERE jobname IN ('daily-content-sync','embed-new-titles','enrich-new-titles','refresh-service-fingerprints')
ORDER BY end_time DESC LIMIT 10;  -- expect status = 'succeeded'
```

## Cryptographic rotation — deferred to Phase 6+

The Supabase dashboard no longer exposes a path to issue a new long-lived JWT signed by the current ECC signing key. New API keys are opaque `sb_secret_…` tokens. Edge Functions configured `verify_jwt = true` reject opaque tokens. Two unblock paths, either gates the rotation:

1. Supabase ships JWT-format secret keys via the new API key model.
2. Edge Function auth refactored to validate `sb_secret_…` tokens via custom-header check (would also need `verify_jwt = false` on cron-callable functions, conflicting with Phase 5's `edge-fn-jwt-guard` CI workflow — IN-XPS-011).

Until then, the same legacy HS256 JWT remains in Vault. The original key is still in git history (`006_cron_schedule.sql:19`), so storage migration alone does not invalidate prior exposures.

## Pause / resume cron without rotating

`daily-content-sync` is currently paused (RapidAPI quota cap). Pattern for surgical pause/resume that preserves the Vault-read body:

```sql
-- Pause
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'daily-content-sync'),
  active := false
);

-- Resume
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'daily-content-sync'),
  active := true
);
```

Avoid `cron.unschedule` here — it deletes the schedule body, so re-enabling means re-running the relevant section of migration 039.

## On suspected exposure

1. Rotate immediately via whatever path is available (currently — disable legacy keys + create new sb_secret + refactor Edge auth; otherwise wait for Supabase tooling).
2. Audit Supabase project logs since suspected exposure date.
3. Audit `card_impressions`, `user_interactions`, `streaming_history` for implausible timestamps or counts.
4. Document the incident.
