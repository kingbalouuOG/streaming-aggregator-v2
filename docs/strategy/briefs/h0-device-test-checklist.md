# H0 device-test checklist (v2.1.0 builds)

> **STATUS — CLOSED 2026-07-13.** All "before building" blockers cleared and
> the test script executed across the v2.1.0–v2.1.3 walk-throughs (server-side
> seeds run by CC, device actions by Joe). Everything passed, several with
> real bugs found and fixed along the way: reset E2E (three bugs → token_hash
> flow, `/reset` HTTPS bridge, warm-start router params — PRs #56/#62/#63),
> onboarding resume + completion (PRs #57/#69), sign-out token cleanup
> (PR #58), notifications (arrival/bundle/dedup/rate-limit/tap-routing all
> PASS on device), mark-watched dedup PASS, Sentry sessions confirmed.
> Superseded for future testing by the closed-test cycle on **v2.1.4**
> (versionCode 10) — the remaining unchecked box from this list is the
> Sentry *crash* event (sessions verified; a deliberate crash test is
> optional). Kept for the record.

## Before building (blockers for a meaningful test)

1. Apply migrations **053, 054, 060** + deploy Edge Functions: `backfill-missing-titles` (before 054) and **redeploy `send-notifications`** (stream_type filter fix). Then regen `database.types.ts` and commit.
2. **FCM V1 service-account key** uploaded to EAS credentials (Android push).
3. Supabase Auth → Redirect URLs: add `videx://reset-password`.
4. Sentry: real org/project, slugs fixed in `native/app.json`, `EXPO_PUBLIC_SENTRY_DSN` repo secret set (workflow line already added), DSN in local `native/.env`.
5. Bump `native/app.json`: version `2.1.0` / versionCode `6` / buildNumber `"3"`. Do one **build-only** `workflow_dispatch` of android-release.yml before tagging (first build with the new plugin train: expo-notifications + Sentry + googleServicesFile).
6. Local dev builds: `npx expo prebuild --platform android --clean` + recreate `local.properties` first.

## Android test script

**Onboarding & measurement (Stream A)**
1. Fresh install → complete onboarding → `onboarding_events` has `onboarding_started`, `services_completed`, `clusters_completed`, `onboarding_completed` (duration > 0), `first_home_view`, in time order. No push prompt at first launch.
2. Force-quit mid-onboarding on a second account, resume, finish — funnel rows still sane (duplicate `onboarding_started` expected; dashboard is distinct-user).
3. Detail page → flat-rate service click-out: `deep_link_click` metadata has `link_type` (`exact`/`search`) and `price_shown: null`. Rent/buy click-out: `price_shown` equals the rendered label verbatim.
4. Mark-watched the same title 3–4× fast: rows land in `user_interactions`, but the taste vector applies once (native guard) — verify `taste_profiles.updated_at` doesn't move after the repeats.
5. Sentry: trigger a test crash → event + session in Sentry, Release Health populated.
6. Password reset: request → email link opens the app at `/reset-password` → set password → signed in. Reuse the consumed link → clean "expired" state.
7. Availability report with "All" selected → success UI **and** a row with `service_id NULL` (first row ever in this table). Same-title resubmit same day → inline rate-limit message.
8. Home renders the seeded editor's note.

**Notifications (Stream B)**
9. Add a title to the watchlist → push prompt appears NOW (first value moment), once. Grant → one row in `user_push_tokens`; other account cannot SELECT it (RLS).
10. Profile → Notifications: toggles default ON; flipping writes `notification_preferences`.
11. Seed an arrival (`streaming_history` 'added', `stream_type='subscription'`, watchlisted title, subscribed service) → invoke `send-notifications` with the service-role bearer → ONE push, correct copy. Tap (backgrounded) → detail page. Repeat with app killed (cold-start race path).
12. Re-invoke immediately → NO second push (`notification_deliveries` dedup); later run flips `delivery_status` to `ok`.
13. Seed a rent/buy-only 'added' row → invoke → **no push** (stream_type filter).
14. Arrival + leaving-soon same run → one bundled push; fresh candidate same day → nothing (20h cap).
15. Toggle Arrivals OFF → seed → invoke → nothing (server-side consent).
16. Sign out → token row gone; sign in → silent re-register, no re-prompt. **Shared-device test:** sign out in airplane mode, sign in as account B online → B's registration claims the token (RPC 060) and A's alerts stop.

**Share & title pages (Stream B)**
17. Detail → share → sheet shows title + `/t/` URL; `share` row in `user_interactions`; taste vector unchanged.
18. Paste link in WhatsApp → OG unfurl with poster. Open in browser → services, Play Store button, TMDb attribution.
19. `/t/movie/999999999` → 404 page (not junk 200); `/t/foo/12` → 404.
20. App legal buttons + Worker `/privacy` `/terms` show the push-notifications section (updated policy).

**Security/ops spot-checks (Stream D)**
21. After 053 applied: 31 rapid `username_available` calls through the app → 31st throttled; signup flow itself unaffected at normal pace.
22. Dispatch `db-backup.yml` manually (after its 2 secrets) → download artifact → `gpg --decrypt` yields a restorable dump.
23. Invoke `backfill-missing-titles` with service-role bearer → `{status:'ok', …}`; non-service-role → 401; `cron.job` shows both crons active.

## iOS pass (when ready)
Repeat 1–20; specifically re-verify push via APNs, the share sheet `url` field, cold-start notification tap, and the `videx://reset-password` scheme.

## After a few days of shakeout
Run `supabase/queries/metrics-dashboard.sql`: funnel populated against `onboarding_started`, WWD non-zero on first correlated click-out, crash-free ≥99% in Sentry.
