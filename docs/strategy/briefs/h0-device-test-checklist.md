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

## Growth S4: sharing and push-to-share (run in S5, both platforms)
Build carries S1 to S4. Watch rows land with `select event_name, via, src, object_id, delivery_id, platform, metadata, occurred_at from growth_events where install_id = '<this install>' order by occurred_at desc;` (install id: MMKV `install_id`, or the newest `first_open` for the test account).

S4-1. Share a title streaming on a subscription service (e.g. Severance) into WhatsApp and into Messages. The message reads "Severance (2022). On Apple TV+ in the UK." then the link ending `?via=share`; the unfurl still shows. Service names match the page the link opens.
S4-2. Share a rent-or-buy-only title: "… Rent or buy on … in the UK." Share a title with nothing in the UK: "… See where to watch in the UK on Videx." (still shares).
S4-3. Each share: one `share_initiated` (`via=share`, `src=organic`, `metadata.surface=detail`) when the sheet opens; `share_completed` with `metadata.to_surface` and `platform_reports_completion` after sending. iOS: cancel the sheet → no `share_completed`. Android: cancel → `share_completed` still arrives (known, the dashboard counts iOS only). `user_interactions` still gets its `share` row for titles.
S4-4. Share a room from a For You room card and from the room screen (`/room/{id}`): "More like X: N titles picked for the mood." (no "If you love"); `share_initiated` with `object_type=room`, `metadata.surface` = `room_card` / `room`; no `user_interactions` row.
S4-5. Seed a single arrival for the test account (item 11), invoke `send-notifications` (after Joe deploys the S4 version), tap the push. `notification_opened` row carries `delivery_id` = that title's `notification_deliveries.id`, `via=push`, `src=push`, `metadata.type=arrival`. Repeat cold (app killed): exactly one `notification_opened`.
S4-6. On the detail page the push opened: the top-right button reads "Tell someone" and the banner under the meta line reads "{Title} has just landed on {Service}. Tell someone." Share from the banner: message starts "Just landed on {Service}: …", URL ends `?via=share&src=push`, `share_initiated` has `src=push` and `metadata.moment=arrival`. Open a different title in the same session: plain share button, but its share still carries `src=push`.
S4-7. Leaving-soon single title (seed `expires_on` within 7 days): banner "{Title} leaves {Service} on {Weekday D Month}. Tell someone."; `metadata.moment=leaving_soon`.
S4-8. Bundle push (two titles): lands on the watchlist, `notification_opened` with `delivery_id` null and `metadata.type=bundle`; no banner on any detail page.
S4-9. Dismiss the banner (X): it stays gone on returning to the title; the button stays "Tell someone".
S4-10. Background the app for six minutes, return: banner and "Tell someone" gone, shares now `src=organic`.
S4-11. Relaunch the app normally (not from a push) after a push-opened session: no new `notification_opened` and no banner (the handled response is cleared, IN-GR-027).

## iOS pass (when ready)
Repeat 1–20; specifically re-verify push via APNs, the share sheet `url` field, cold-start notification tap, and the `videx://reset-password` scheme.

## After a few days of shakeout
Run `supabase/queries/metrics-dashboard.sql`: funnel populated against `onboarding_started`, WWD non-zero on first correlated click-out, crash-free ≥99% in Sentry.

## Growth S5 matrix (2.5.0, started 16 Sept 2026)

Build: 2.5.0 (iOS 13 ad-hoc `preview` on Joe's iPhone, TestFlight `production` for testers; Android versionCode 16, APK on Joe's phone, AAB on Play internal). Handoff: `docs/plans/2026-09-16-002-handoff-growth-s5-verification.md`. Evidence per check goes into the S5 PR; results table in `docs/v2/phase-summaries/phase-growth-g0-g1-summary.md`.

**Evidence query** (run by CC after each check, read-only):
`select event_name, via, src, object_type, object_id, delivery_id, platform, ua_class, metadata, occurred_at from growth_events where occurred_at > now() - interval '1 day' order by occurred_at;`
Baseline before S5: one row (`preview_fetched`, 2026-09-16 14:51 UTC, the S4 Worker check). `shared_rooms` empty.

**Order (revised 16 Sept with Joe).** Device checks run on the ad-hoc iPhone build and the Play internal Android build **before** the TestFlight production build, so fixes ship by OTA and are then baked into the binary testers and App Review get. Confirm email is **not** flipped when testers update: 2.4.0 is live on the App Store and has no "Check your email" state, so the permanent flip happens when 2.5.0 is released publicly. C1 to C3, C5 and C6 run with Confirm email off (Joe's own accounts, so IN-GR-011 is not a concern); C4 runs in a short on/off window. Walkthrough order: fresh installs (B1 iPhone, B3+B1 Android via Play, pm get-app-links) → links (A1, A2, B2) → sharing (S4-1..4, A3, A6, B5) → signed out on iPhone (A4/C6, A5 reset) → push P1/P2/P3 (S4-5..11, A5 cold taps) → provider sign-in (C3/B4, C2, C1) → C4 window → C5 last (deleting an account removes that install's growth rows, IN-GR-009, so evidence is saved first). Joe's walkthrough page: https://claude.ai/artifact/QXSnG1bqgG6LNgcdNXYfsS. Seed titles for S4-2: Shutter Island (`movie-11324`, rent or buy only) and Eternal Sunshine of the Spotless Mind (`movie-38`, no UK availability).

### A. Links (both platforms)
- [ ] A1 `https://videxstreaming.com/t/movie/550-fight-club-1999?via=share` from WhatsApp, Messages, Slack; cold and warm; detail opens directly, no browser flash. Android: `adb shell pm get-app-links app.videx.streaming` → `videxstreaming.com: verified`.
- [ ] A2 bare `/t/movie/550` and stale `/t/movie/550-wrong-slug` still open Fight Club.
- [ ] A3 share a room from For You → open the link on the other phone (same titles); open it in a desktop browser as a non-user (preview, poster grid, store CTA).
- [ ] A4 signed out → tap link → sign in with email → land on the object; Back → tabs.
- [ ] A5 (IN-GR-004) password-reset link cold start; cold notification tap (from D); tabs beneath both.
- [ ] A6 paste a title link and a room link into WhatsApp, iMessage, Slack; screenshot the unfurls (poster, title, availability line).

### B. Attribution
- [ ] B1 delete app → install → launch → relaunch: exactly one `first_open` for the new install id. Tester devices updating 2.4.0 → 2.5.0: `first_open.metadata.prior_install = true`.
- [ ] B2 A1's taps produce `link_opened` with `via=share`.
- [ ] B3 (Android, IN-GR-005 runtime) uninstall → Chrome opens the title page → Get Videx → install from Play internal → first launch lands on Fight Club; `first_open` carries the referrer touch (`t=movie-550`).
- [ ] B4 (after C) `signup_completed` carries the first-touch `via`; `onboarding_events` `first_home_view` metadata has `via`.
- [ ] B5 A6's pastes: `preview_fetched` (fetcher `ua_class`) vs `preview_opened` for the taps.

### C. Sign-in (after Confirm email ON)
- [ ] C1 iPhone Apple: new account (name prefilled → choose name → Connect Services), returning account, Hide My Email.
- [ ] C2 Google on iPhone (nonce error = Skip nonce check off) and Android.
- [ ] C3 (IN-GR-012) signed out → shared link → provider sign-up → onboarding → Choose your name → Curating → shared title opens.
- [ ] C4 email sign-up: "Check your email" → link opens app via `/reset` bridge → onboarding continues; resend; change email. Opened on a computer → note IN-GR-021 behaviour.
- [ ] C5 iPhone: delete an Apple-linked account → Apple sheet → `revoke-apple-token` 200 → deleted.
- [ ] C6 an existing pre-2.5.0 email account signs in unchanged.

### D. Sharing and push
S4-1 to S4-11 above, both platforms. Push plan for `joegreenwas@gmail.com` (`1ef0db27-…`, iOS and Android tokens on one account, so one push lands on both phones; 20h cap per account). Seed titles checked 16 Sept: on this account's watchlist, on a subscribed service, never sent, on no other token holder's watchlist.

| Push | Seed | Checks |
|---|---|---|
| P1 arrival | Inside Man (`movie-388`) on Netflix, `streaming_history` 'added' | S4-5, S4-6, S4-9, S4-10, S4-11, A5 cold tap |
| P2 leaving soon | The Whisper Man (`movie-860508`) on Netflix, `expires_on` = now + 4 days (restore to null after) | S4-7. Leaving soon turned ON by Joe in Settings (row updated 2026-09-16 15:55 UTC). |
| P3 bundle | The Order (`movie-1082195`) on Prime + Lucky (`tv-278624`) on Apple TV+, both 'added' | S4-8 |

Between pushes the cap is cleared by moving the previous delivery back 21 hours (rows kept as evidence), not by deleting it. Every write below is proposed to Joe before it runs.

```sql
-- P1 seed (arrival)
insert into streaming_history (tmdb_id, media_type, service_id, event_type, stream_type, sync_run_id)
values (388, 'movie', 'netflix', 'added', 'subscription', 's5-seed-p1') returning id;

-- cap clear before P2 / P3 (ids from the previous run)
update notification_deliveries set sent_at = sent_at - interval '21 hours'
where user_id = '1ef0db27-ba5d-4fba-aaaf-5d81702deac3' and sent_at > now() - interval '20 hours' returning id, tmdb_id, sent_at;

-- P2 seed (leaving soon); restore after the check
update streaming_availability set expires_on = now() + interval '4 days'
where tmdb_id = 860508 and media_type = 'movie' and service_id = 'netflix' and stream_type = 'subscription' and addon_id is null
returning id, expires_on;
-- restore
update streaming_availability set expires_on = null
where tmdb_id = 860508 and media_type = 'movie' and service_id = 'netflix' and stream_type = 'subscription' and addon_id is null;

-- P3 seed (bundle)
insert into streaming_history (tmdb_id, media_type, service_id, event_type, stream_type, sync_run_id)
values (1082195, 'movie', 'prime', 'added', 'subscription', 's5-seed-p3'),
       (278624, 'tv', 'apple', 'added', 'subscription', 's5-seed-p3') returning id;
```

Invoke (Joe, Git Bash from the repo root; values come from `.env`):
```bash
set -a; . ./.env; set +a; curl -sS -X POST "$VITE_SUPABASE_URL/functions/v1/send-notifications" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{}'
```
Check before each invoke: `select tmdb_id, media_type, service_id, recorded_at from streaming_history where event_type='added' and stream_type in ('subscription','free') and recorded_at > now() - interval '26 hours'` joined against every token holder's watchlist, so no real account receives a seeded push.

### E. Register
- [x] IN-GR-002: listing live (Joe, 16 Sept); PR #196 merged, Worker deployed 15:56 UTC. Curl `/t/movie/550-fight-club-1999`: iPhone UA → "Get Videx on iOS" linking `apps.apple.com/gb/app/videx-streaming-guide/id6785395342`, no "coming soon"; desktop UA → both store links; `x-videx-cache: miss` (v3 key).
- [ ] IN-GR-004 (A5), IN-GR-005 runtime (B3), IN-GR-012 (C3), IN-GR-021 (C4), IN-GR-027 (S4-11).
