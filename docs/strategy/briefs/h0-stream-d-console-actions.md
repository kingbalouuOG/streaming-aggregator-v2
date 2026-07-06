# H0 Stream D — actions Joe must do by hand

Companion to [`h0-stream-d-security-ops.md`](./h0-stream-d-security-ops.md) and its PR (`chore/h0-security-ops`). The PR lands all the code; the items below need a human in a dashboard/console and can't be done from the repo. Ordered by launch impact.

Supabase project: `fmusugdcnnwiuzkbjquo`.

---

## 0. ⭐ Play production-access check (D1 — do first, it sets the release schedule)

**Why first:** if it applies, it adds ~3 weeks of lead time and the friends-&-family shakeout (roadmap 0.6) must be re-shaped as a formal closed test.

**The rule (current, mid-2026):** Google Play requires **personal** developer accounts **created on/after 13 Nov 2023** to run a **closed test with ≥12 testers opted-in for 14 continuous days** before you can even *apply* for production access. Then there's a **manual review** (~7 days typical) on top. Org accounts and pre-13-Nov-2023 personal accounts are **exempt**. (The figure was 20 testers until 11 Dec 2024, now 12.)

**What only you can check** (I have no access to the Play Console):
1. **Account type** — Play Console → **Settings → Account details → Account type**. If it says **Organisation**, the gate does **not** apply → you can ignore the rest of this item. If **Personal**, continue.
2. **Creation date** — not cleanly shown in the UI; use your original Play registration email or the $25 fee receipt. If **on/after 13 Nov 2023** → the gate applies.
3. **Current status** — Play Console → your app → **Dashboard**; look for an **"Apply for production"** prompt / any closed-test progress already showing.

**If the gate applies (personal + post-13-Nov-2023):**
- The 0.6 shakeout becomes the closed test: **≥12 real testers** (friends & family are fine) opted-in via the closed-track opt-in link, kept opted-in **14 continuous days**. Recruit ~15–20 for buffer — dropping below 12 resets the streak. **Internal-testing track does NOT count** — it must be a **Closed** track.
- Budget **~3–4 weeks**: ~14 days test window + up to ~7 days production-access review + normal app review. Answer the production-access questionnaire with real "what feedback we got / what we changed" detail — thin answers get rejected and cost another cycle.

**→ Report your account type/date back so Stream E scheduling can be finalised.** Sources are in the PR description / wiki.

---

## 1. Enable leaked-password protection (blocker item 4 — 30 seconds, zero downside)

Confirmed **disabled** today (Supabase security advisor, 2026-07-06).

- Supabase Dashboard → **Authentication → Policies / Passwords** → enable **"Prevent use of leaked passwords"** (HaveIBeenPwned check).
- Docs: https://supabase.com/docs/guides/auth/password-security
- Optional (via Management API instead of the dashboard): `PATCH /v1/projects/{ref}/config/auth` with `{ "password_hibp_enabled": true }`.

---

## 2. Add the two backup secrets (blocker item 13 — unblocks the new backup workflow)

The PR adds `.github/workflows/db-backup.yml` (monthly encrypted `pg_dump` → GitHub artifact). It stays red until these exist. Repo → **Settings → Secrets and variables → Actions → New repository secret**:

- **`SUPABASE_DB_URL`** — the **direct** (port 5432) connection URI, *not* the pooler. Dashboard → **Database → Connection string → URI**.
- **`BACKUP_GPG_PASSPHRASE`** — a strong passphrase, saved in your password manager. **If you lose it, every backup is unrecoverable.**

Then run the workflow once manually (**Actions → DB off-site backup → Run workflow**) and confirm the encrypted artifact appears. Restore steps are in the workflow header + the backup-restore runbook.

---

## 3. Set up the GitLab push mirror (blocker item 14 — git redundancy)

Cheapest robust option is GitHub-side push mirroring:
1. Create an empty GitLab project (e.g. `videx` under your GitLab account) and a **project access token** with `write_repository` scope.
2. GitHub repo → **Settings → (there is no native mirror UI on GitHub)** → so use one of:
   - **Simplest:** add a GitLab remote locally and `git push gitlab --mirror` occasionally, **or**
   - **Automated:** add a tiny GitHub Action (I can add it in a follow-up) that pushes to GitLab on every push, using the GitLab token as a secret `GITLAB_MIRROR_TOKEN`.
   - **Or GitLab pull-mirror** (GitLab paid feature) — GitLab → your project → **Settings → Repository → Mirroring repositories** → *Pull* from the GitHub URL with a GitHub PAT.

Tell me which you prefer and I'll wire the automated option in the same PR or a fast-follow. Until then this stays **open**.

---

## 4. Service-role JWT rotation is now UNBLOCKED (IN-XPS-004 / blocker item 2 — your dashboard ceremony)

This was tooling-blocked in May. **It no longer is:** Supabase shipped **JWT Signing Keys** (asymmetric, rotatable; GA mid-2025, existing projects auto-migrated onto the system 1 Oct 2025). Legacy JWT API keys are on a deprecation clock (**end of 2026**). I've rewritten the [rotation runbook](../../../videx-wiki/wiki/concepts/operations/service-role-jwt-rotation.md) for the new model.

This is a **live-credential ceremony only you should run** (it touches signing keys; done wrong it can break cron / sign users out), so I did **not** do it autonomously. When you're ready:
1. Dashboard → **Settings → JWT Keys**. Confirm the current key is the legacy HS256 secret and a **Standby** action is available.
2. Generate a **standby** key (ES256 recommended) → **Rotate** (standby becomes current; old key still *verifies* existing tokens) → wait past access-token expiry (~1h15m) → **Revoke** the old key. No downtime; no forced sign-outs.
3. Re-mint the `service_role` JWT from the new current key, `vault.update_secret('service_role_key', <new>)`, and smoke-test one cron (`enrich-new-titles`).
4. Migrate CI/scripts (`SUPABASE_SERVICE_ROLE_KEY`) to a named `sb_secret_…` key for independent revocability.

Full step-by-step + caveats are in the runbook. This is the highest-value remaining security item but is not launch-gating on its own.

---

## What I did NOT need you for (landed in the PR)

- IN-PX-29 rate-limit, IN-PX-30 JWT guard, IN-PX-50 backfill function+cron, pricing refresh, IN-461 carve-out, backup workflow, pg_partman verification, wiki/register updates. **Deploy steps** for the two new migrations (048, 049) and the new Edge Function are in the PR description — those are `supabase db push` / `supabase functions deploy` when you next deploy, not dashboard clicks.
