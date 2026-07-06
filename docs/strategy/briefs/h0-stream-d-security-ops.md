# H0 Stream D — Security & ops batch

**Context:** Roadmap v1.0 H0 item 0.11 + the Play production-access check from 0.12. Independent of Streams A/B — safe to run in parallel any time. Mostly small items; one session should clear the lot. Registers: `videx-wiki/wiki/registers/pre-launch-blockers.md` + `parking-lot.md` carry the item history.

**Deliverable:** one PR (branch `chore/h0-security-ops`) + a few dashboard/console actions documented for Joe.

## D1 — Play production-access check (from 0.12 — do FIRST, it affects scheduling)

Google Play requires personal developer accounts created after 13 Nov 2023 to run a closed test with 12+ testers for 14 continuous days before production access. Check Joe's Play Console account type/creation date and current production-access status for `app.videx.streaming`. Document the answer in this brief's PR + the wiki. If it applies, the friends-&-family shakeout (0.6) must be structured as that closed test — 14 days of lead time enters the release schedule.

## D2 — Security quickies

- **Leaked-password protection** (Supabase Auth dashboard toggle — pre-launch blocker item 4; seconds, Joe or via management API). Zero downside.
- **IN-PX-29:** rate-limit `username_available` (SECURITY DEFINER RPC from migration 038) — defence against username enumeration. Gateway-level (Worker) or Edge/RPC-level throttle; pick the cheapest robust option and document it.
- **IN-PX-30:** defence-in-depth in `extractUserIdFromJwt` (signature verification or the `_no_auth_/` runtime assertion flagged at Phase 5.5).
- **IN-XPS-004** (service-role JWT rotation): still tooling-blocked on Supabase JWT-format secret keys — verify whether Supabase has shipped them since 2026-05; if yes, rotate per the runbook (`videx-wiki/wiki/concepts/operations/service-role-jwt-rotation.md`); if not, leave the tracked-blocked note.

## D3 — Ops hygiene

- **Off-site backup:** monthly `pg_dump` of the Supabase DB to storage outside Supabase (GitHub Actions cron + encrypted artefact or cloud bucket — see `videx-wiki/wiki/concepts/operations/supabase-backup-restore.md`). Pre-launch blocker item 13.
- **GitLab mirror** for git redundancy (blocker item 14) — push mirror of the GitHub repo.
- **pg_partman verification (IN-XPS-003, overdue):** likely already healthy — `card_impressions_p20260801` and `_p20260901` exist in prod (observed 5 Jul), suggesting auto-creation works. Verify the partman config + retention/rollup jobs are behaving (90-day retention → `card_impression_daily_totals`), then close the item.
- **Pricing refresh (IN-XPS-007, overdue):** update `platformPricing.ts` against current UK prices (2025–26 rises: Netflix ads £5.99/Standard £12.99/Premium £18.99; Disney+ £5.99/£9.99/£14.99; Apple TV+ £8.99; Paramount+ £4.99/£10.99; re-verify all 10 at implementation time — prices move quarterly). Spend dashboard accuracy is a trust feature.
- **IN-PX-50:** wrap `scripts/enrichment/backfill_missing_titles.ts` logic in a scheduled Edge Function `backfill-missing-titles` (+ migration for the cron; TMDb key via Vault — same pattern as migration 039). Closes the recurring half of IN-465 (currently manual monthly).
- **IN-461 (overdue):** review `FORBIDDEN_WORDS` compound-noun carve-outs after the recent mood-room recluster runs.

## Done means

PR green · dashboard/console actions listed with what Joe must click himself (leaked-password toggle, GitLab mirror auth, Play Console check) · registers updated (pre-launch-blockers items 4/13/14 + parking-lot IN-PX-29/30/50, IN-XPS-003, IN-461 statuses) · wiki log entry · D1's answer communicated clearly since it schedules Stream E.

---

## Outcomes (executed 2026-07-06, PR `chore/h0-security-ops`)

Joe-facing manual actions are collected in [`h0-stream-d-console-actions.md`](./h0-stream-d-console-actions.md).

### D1 — Play production-access check → **DECISION NEEDED FROM JOE, schedules Stream E**
The 12-testers/14-continuous-days closed-test gate is **real and current** (was 20 testers until Dec 2024, now **12**). It applies **only** to **personal** Play accounts created **on/after 13 Nov 2023**; **org accounts and older personal accounts are exempt**. Completion only lets you *apply* for production access, which is then **manually reviewed (~7 days typical)**. Internal-testing does **not** count — must be a **Closed** track; friends & family qualify as testers.
- **I cannot see the Play Console**, so Joe must confirm two things (console-actions doc §0): account **type** (Settings → Account details) and **creation date** (registration email/receipt).
- **Scheduling impact:** if the gate applies, the 0.6 shakeout must be run as the closed test → **~3–4 weeks lead time** (14-day window + production-access review + app review) enters the Stream E schedule. If the account is Organisation type, **no delay**.

### D2 — Security
- **IN-PX-29** ✅ migration `053_username_available_rate_limit.sql` — in-DB per-IP fixed-window limit (30/min) inside the RPC. Gateway/Worker throttle rejected: the client calls the RPC directly against PostgREST, never through the Worker, so only an in-function limit covers the real path. Fails open when no IP is attributable.
- **IN-PX-30** ✅ `extractUserIdFromJwt` now throws if invoked from the reserved `_no_auth_/` namespace (unverified-signature context). Chose the runtime assertion over `jose`+JWKS because a JWKS-only verify would reject the project's current legacy-HS256 tokens (see IN-XPS-004) — that path opens up once the signing-key rotation lands.
- **Leaked-password protection** — confirmed **disabled** via advisor; **Joe toggle** (console-actions §1).
- **IN-XPS-004** — **UNBLOCKED.** Supabase shipped JWT Signing Keys (GA mid-2025, projects auto-migrated 1 Oct 2025); legacy keys deprecated end-2026. Rotation is now a **Joe-owned dashboard ceremony** (not done autonomously — live credential). Runbook rewritten for the new model; steps in console-actions §4.

### D3 — Ops
- **Off-site backup** ✅ workflow `db-backup.yml` (monthly encrypted `pg_dump` → artifact). **Awaiting Joe's 2 repo secrets** (console-actions §2) before it can run.
- **GitLab mirror** — options documented (console-actions §3); **Joe to pick one**, then I wire the automated variant.
- **pg_partman (IN-XPS-003)** ✅ **verified healthy, closed.** partman config correct (1-mon interval, premake 2, 3-mon retention dropping tables, auto-maintenance on); daily maintenance + rollup crons both `succeeded`. `card_impression_daily_totals` is empty **by design** — the rollup only aggregates rows `> 90 days` old and the earliest impression is 2026-06-15, so it correctly no-ops until ~mid-Sept 2026. Spot-check the totals table after the first data crosses 90 days.
- **Pricing (IN-XPS-007)** ✅ `platformPricing.ts` refreshed against July-2026 UK prices — nearly every service moved (Netflix, Disney+, Apple TV, Paramount+ 3-tier, Prime standalone £7.99, NOW/Sky restructure incl. Sky Go now bundle-only).
- **IN-PX-50** ✅ Edge Function `backfill-missing-titles` + migration `054` (anti-join RPC + weekly Sun 05:00 UTC cron, Vault-sourced bearer). TMDb key uses the existing `TMDB_API_KEY` secret (enrich-new-titles precedent), not Vault — documented deviation.
- **IN-461** ✅ compound-noun carve-out added to `label.py` (`ALLOWED_COMPOUNDS = {"fairy tales"}`). Reviewed all 69 current labels: the only forbidden-word case is **"Bedtime Fairy Tales"** (contains "Tales"), preserved via Jaccard stability but rejected on regeneration — the carve-out fixes that without weakening the bare-"Tales" block.

### Deploy steps (Joe / next deploy — not dashboard clicks)
1. `supabase functions deploy backfill-missing-titles --project-ref fmusugdcnnwiuzkbjquo` **then** apply migrations `053` + `054` (054's cron calls the function — deploy order matters).
2. Migrations `053`/`054` are **not** applied to prod by this PR (they change a live signup RPC + add a cron) — apply via the normal migration path after review.
