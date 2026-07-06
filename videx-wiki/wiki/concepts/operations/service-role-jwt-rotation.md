---
title: Service-role JWT rotation runbook
type: concept
tags: [runbook, security, jwt, supabase, vault]
created: 2026-04-26
updated: 2026-07-06
sources:
  - raw/runbooks/service-role-jwt-rotation.md
  - docs/v2/phase-summaries/phase-5-summary.md
related:
  - wiki/entities/infrastructure/supabase.md
  - wiki/entities/infrastructure/rapidapi.md
  - wiki/entities/codebase/migrations.md
---

# Service-role JWT rotation runbook

**Status (2026-07-06 — UNBLOCKED, H0 Stream D):** the Phase 5 blocker is gone. Supabase shipped **JWT Signing Keys** (asymmetric, rotatable — ES256/RS256; GA mid-2025, existing projects auto-migrated onto the signing-keys system on **1 Oct 2025**). Legacy shared-HS256 JWT API keys are on a **deprecation clock (end of 2026)**. Cryptographic rotation is now possible via the dashboard **standby → rotate → revoke** flow with no downtime and no forced sign-outs. This remains a **live-credential ceremony for Joe** (not automated in the H0 Stream D PR). See [Cryptographic rotation](#cryptographic-rotation--now-available-2026-07) below. Tracked as parking-lot IN-XPS-004.

**Prior status (2026-05-07):** Phase 5 shipped a Vault storage migration (migration 039) — JWT moved out of source code into Supabase Vault; same value, no rotation, because the dashboard then had no path to issue a verifiable JWT (new `sb_secret_…` keys are opaque and fail `verify_jwt = true`).

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

## Cryptographic rotation — now available (2026-07)

The May-2026 blocker (no path to issue a verifiable JWT) is resolved: Supabase **JWT Signing Keys** let you rotate the project's signing key from the dashboard, and a JWT signed by the *current* signing key passes `verify_jwt = true` (the platform verifies against the project JWKS, `SUPABASE_JWKS`). The opaque `sb_secret_…` keys still fail `verify_jwt = true` **by design** — they are not JWTs; they authenticate via the `apikey` header on functions deployed `verify_jwt = false`. So the lowest-friction rotation keeps the existing Bearer-JWT cron shape and just retires the legacy HS256 key.

**Ceremony (Joe, dashboard — do NOT script; live credential):**

1. **Dashboard → Settings → JWT Keys.** Confirm current key = legacy HS256 and a **Standby** slot is available (generate one if absent; ES256 recommended).
2. **Rotate.** Standby becomes *current* (signs new JWTs); the old key moves to *previously used* and still **verifies** already-issued tokens — nothing breaks. State changes are throttled ~5 min apart.
3. **Wait** past access-token expiry + buffer (≈1h15m for a 1h expiry) so no live token was signed by the old key.
4. **Revoke** the old (legacy HS256) key.
5. **Re-mint the `service_role` JWT** from the new current signing key, then `SELECT vault.update_secret('service_role_key', '<new-jwt>');` — cron jobs pick it up at next firing (no cron re-schedule needed). Smoke-test one job (`enrich-new-titles` is soonest, 06:30 UTC).
6. **Migrate CI/scripts** (`SUPABASE_SERVICE_ROLE_KEY`) to a named `sb_secret_…` key for independent revocability (separate credential from the cron path).

**Why not fully automate:** rotating signing keys and re-minting a service-role credential is a live operation that can break cron or sign users out if botched; it needs dashboard access Claude does not have. H0 Stream D documented and unblocked it but left execution to Joe.

**Legacy exposure note:** the original legacy JWT is still in git history (`006_cron_schedule.sql:19`). Only the **revoke** step (4) actually invalidates it — the Vault storage migration alone never did. Do the full rotation before end-2026 to stay ahead of the legacy-key deprecation.

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
