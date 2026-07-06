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
