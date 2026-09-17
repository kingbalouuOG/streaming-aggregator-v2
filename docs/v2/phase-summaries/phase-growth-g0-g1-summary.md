# Growth G0 + G1: phase summary (S1 to S5)

**Dates:** 14 to 17 September 2026 · **Workstream:** Growth (G0 foundations, G1 sharing and push-to-share) · **Plan:** [2026-09-14-003](../../plans/2026-09-14-003-feat-phase-g0-g1-growth-foundations-and-sharing-plan.md) · **S5 handoff:** [2026-09-16-002](../../plans/2026-09-16-002-handoff-growth-s5-verification.md) · **Session summaries:** [S1](phase-growth-s1-summary.md), [S4](phase-growth-s4-summary.md) (S2 and S3 outcomes are in plan §11b and §11c) · **Evidence:** [growth_events snapshot](evidence/growth-s5-growth-events.md), checklist `docs/strategy/briefs/h0-device-test-checklist.md` (Growth S5 section)

**Status: G0 and G1 verified on device on both platforms (2.5.0), with eight defects found. Six are fixed or configured, two are handed off, and two decisions are recorded.** The fixes that live in code (IN-GR-028, 030, 031, 033) are in PR #197 and on Joe's iPhone by OTA; they reach TestFlight and Play when the production binaries are built after #197 merges. The configuration fixes are live now (IN-GR-001 reopened and fixed in #201; Google Android OAuth client; App Store listing in #196).

## What shipped across S1 to S4

| Session | Scope | PRs | Server changes |
|---|---|---|---|
| S1 links | ADR-015 object URLs; Worker title pages `/t/{type}/{id}-{slug}` (301 to canonical, smart banner, `via`/`src` passthrough); room snapshots (`shared_rooms`, `/room/:id`, `/v1/room/:id`, `POST /v1/share/room`); `/list/:id` reserved; AASA and `assetlinks.json`; associated domains and the Android intent filter; `+native-intent` mapping and the 24h pending link; tabs beneath any cold-start link; `room/[id]` screen; share on For You room cards | #172, #183, #184, #185 | migration 088 |
| S2 attribution | `growth_events` (Worker-written, 12-month retention, delete/export by user and install); `POST /v1/growth/events`; `preview_fetched`/`preview_opened` on pages; install id, first touch, `first_open` (with `prior_install`), `link_opened`, `signup_completed`; Play Install Referrer as a local Kotlin Expo module carrying the object; `growth-dashboard.sql`; privacy wording and store-form rows | #188 | migration 090 |
| S3 sign-in | Apple (iOS) and Google via `signInWithIdToken`; placeholder usernames and "Choose your name"; email confirmation flow ("Check your email", `videx://confirm-email` via the `/reset` bridge); pending link resumed only for onboarded accounts; Apple token revocation on iPhone account deletion; policy copy | #187, #190 | migration 089; `revoke-apple-token` v1 |
| S4 sharing | Share copy with the UK availability line (labels shared with the Worker); `share_initiated`/`share_completed`; push payload `delivery_id`/`via`/`service_id`/`expires_on`; `notification_opened`; session origin; "Tell someone" button and banner; dashboard §1 and §6 | #192, #193 | `send-notifications` v8 |
| S5 verification | Device matrix on 2.5.0; fixes below; App Store listing live on pages; Play signing key in `assetlinks.json` | #195 (2.5.0), #196, #197, #201 | none |

## S5 build and setup

- 2.5.0 (iOS build 13, Android versionCode 16) bumped in #195. Android AAB submitted to Play internal by CI (run 35118797605).
- **iOS ad-hoc build failed first**: the stored EAS provisioning profiles predated the two new entitlements (Associated Domains, Sign in with Apple). Joe ran an interactive `eas build` locally for `preview` and `production`, which synced the App ID capability and regenerated both profiles, then failed at packaging as expected on Windows. The CI rebuild (run 35120355962) succeeded. The TestFlight production build is deliberately held until after this pass (Joe, 16 Sept), so fixes ship in the binary rather than by OTA.
- Confirm email was **not** flipped when testers updated: 2.4.0 is live on the App Store and has no "Check your email" state, so the permanent flip moves to the day 2.5.0 is public. C4 ran in a short on/off window on 17 Sept; Joe confirmed it is off again.

## Matrix results

Evidence is `growth_events` unless stated. iPhone rows 16 to 70 were deleted by C5 (see IN-GR-009 below) and are preserved in the [evidence snapshot](evidence/growth-s5-growth-events.md). Times UTC.

### A. Links

| Check | iPhone | Android | Evidence |
|---|---|---|---|
| A1 link opens the app, cold and warm | ✅ | ✅ after #201 | iOS rows 40/41 (cold 17:59:47, warm 18:00:15, `via=share`); Slack taps rows 23/24. Android rows 85/86 after verification. Not every source app × state tap has its own row (Joe reported all passing). |
| A1 Android verification | n/a | ✅ after fix | `pm get-app-links`: `1024` on the Play install (signature `09:BC:66:B5…` not in `assetlinks.json`), then `verified` at 10:14 on 17 Sept after #201 and Google's cache refresh |
| A2 bare and stale slug | ✅ | ✅ | iOS rows 17/18; Android rows 87/88 |
| A3 room: second phone and non-user page | ✅ page | ✅ same titles | Row 35 (desktop `preview_opened`, both store CTAs after #196); Android row 90 opened room `75b161d4…` ("Gotham's Gritty Legacy", 30 titles) |
| A4 pending link through sign-in; Back to tabs | ✅ | not run | Joe; also found IN-GR-028 |
| A5 IN-GR-004: reset link cold; cold push tap | ✅ reset, ✅ push | ✅ push | P2 cold tap row 58; Android row 82 |
| A6 unfurls in WhatsApp, iMessage, Slack | ✅ | n/a | `preview_fetched` from all three agents for titles and the room (rows 12–48); screenshots with Joe |

### B. Attribution

| Check | Result | Evidence |
|---|---|---|
| B1 one `first_open` per install | ✅ | iOS: 5e16 (17:36) then 9d9e (17:40) was a reinstall (Joe). Android: one `first_open` per install (bd33, 7acf, 3ea9, 729f, 471e), none on relaunch |
| B1 `prior_install` on a 2.4.0 → 2.5.0 update | not observed | No tester update recorded yet; check the prior_install share after the TestFlight build (IN-GR-006) |
| B2 `link_opened` `via=share` | ✅ | rows 23, 40, 41 (iOS), 85, 86 (Android) |
| B3 Play store path (IN-GR-005 runtime) | ✅ | Android `preview_opened` 10:11:19 → `first_open` 10:11:50 `touch=install_referrer`, `via=share`, `movie-550`; app opened on Fight Club. The first attempt at 09:54 installed straight from Play (no referrer, as expected) |
| B4 `signup_completed` carries the first touch; `first_home_view` has `via` | ✅ Android | row 94 `signup_completed` `via=share`, `touch=install_referrer`; `onboarding_events.first_home_view` `via=share` for `joegreenwas+android`. iOS row 70 had `via` null because that install's first touch was the bare A2 link, which is correct |
| B5 `preview_fetched` vs `preview_opened` | ✅ | crawlers (`whatsapp`, `imessage`, `slack`) logged as `preview_fetched`; human taps as `preview_opened` |

### C. Sign-in

| Check | Result | Evidence |
|---|---|---|
| C1 Apple new (Hide My Email), name step, returning | ✅ | Apple account `7119b48a…` (privaterelay address) created 08:57:58, onboarding finished 09:17:43 |
| C2 Google on iPhone | ✅ | `josephgreen1515` account `625b7ad0…` created 08:54:16 |
| C2 Google on Android | ✅ after fix | failed on the Play build ("Couldn't sign in with Google"): the Android OAuth client carried the upload key SHA-1. Joe added a client with the Play signing SHA-1 `70:81:3D:08…`; sign-in then worked (identity linked to `joegreenwas@gmail.com`, email and google, 10:12) |
| C3 provider sign-up from a shared link (IN-GR-012) | ✅ iPhone | rows 68/69 → onboarding → Choose your name → Curating → Fight Club; row 70 `signup_completed` object `movie-550` |
| C4 email sign-up with Confirm email on | ✅ | `joegreenwas+confirm@gmail.com`: confirmation sent 09:16:00, confirmed 09:16:13 from the phone through the bridge, onboarding completed |
| C5 delete an Apple-linked account | ✅ with UX defects | a function booted 09:18:41, `delete_own_account` 204 at 09:18:43 (the app deletes only after a 200 revoke); auth user and profile gone. Found IN-GR-030 and IN-GR-031 |
| C6 existing email account unchanged | ✅ | `joegreenwas@gmail.com` signed in during A4 and A5 |

### D. Sharing and push

| Check | iPhone | Android | Evidence |
|---|---|---|---|
| S4-1 subscription copy | ✅ | ✅ sheet | rows 19–21 (Severance); Android rows 91–92 |
| S4-2 rent-or-buy and not-in-UK copy | ✅ | same code | rows 25–30 (Shutter Island), 42–45 (Eternal Sunshine) |
| S4-3 cancel | ✅ no completion | ✅ completion still arrives | row 29 alone; Android `platform_reports_completion=false` |
| S4-4 room share from card and room screen | ✅ | not run | rows 31–34 (`room_card`), 46–48 (`room`) |
| S4-5 `notification_opened` with `delivery_id` | ✅ | ✅ | row 49 (P1 `0bc6e650…`), row 82 (P4 `4aed5ea2…`) |
| S4-6 "Tell someone", `src=push`, other title keeps `src=push` | ✅ | ✅ | rows 50–54; Android rows 83–84 |
| S4-7 leaving soon | ✅ | not run | row 58 (P2 `ba8b0485…`), rows 60–62 `moment=leaving_soon` |
| S4-8 bundle | ✅ | not run | row 66 `type=bundle`, delivery null |
| S4-9 dismiss persists | ✅ | not run | Joe |
| S4-10 six minutes clears origin | ✅ | not run | left 18:18, row 63 at 18:26 `src=organic` |
| S4-11 relaunch does not replay (IN-GR-027) | ✅ | ✅ | no second `notification_opened` after relaunch |

Seeds used: `streaming_history` 115700 (P1), 115701/115702 (P3), 117068 (P4); P2 set `streaming_availability` 28c65a57… `expires_on` and restored it to null. The 20-hour cap was cleared between pushes by moving the previous delivery's `sent_at` back 21 hours (deliveries 0bc6e650, ba8b0485, b9e9d5fc, aa803816). No test rows were deleted. Shared room `75b161d4-a189-4dc8-b672-ced0c8f700d4` left in place.

## Defects and decisions

| ID | What | Status |
|---|---|---|
| IN-GR-001 (reopened) | Play App Signing uses a Google-generated key (SHA-256 `09:BC:66:B5…`, SHA-1 `70:81:3D:08…`), not the upload key. `assetlinks.json` and the Google Android OAuth client carried only the upload key, so on Play installs app links stayed unverified and Google sign-in failed | ✅ Fixed 17 Sept: #201 (both fingerprints), Joe added the Android OAuth client; both re-verified on device |
| IN-GR-002 | App Store CTA "coming soon" | ✅ Closed: #196, listing `id6785395342`; pages show "Get Videx on iOS"; desktop shows both stores |
| IN-GR-028 | Signed out, Add to Watchlist and Mark as Watched wrote locally and synced into the next account to sign in | ✅ Fixed in #197 (JS): both ask for sign-in and return to the title. First version pushed `/auth` over the detail screen, which cleared the pending link as the session arrived and landed on For You; corrected to `replace`. iPhone-verified via OTA (A4b) |
| IN-GR-029 | A Google sign-up's services matched the previous account's exactly, and Profile appeared to show others | 🅿 Not reproduced: iPhone retest (`+confirm`) and Android fresh-account check (AN8) both saved exactly what was picked |
| IN-GR-030 | Delete-account dialog had no way to dismiss the keyboard, which covered its buttons | ✅ Fixed in #197, iPhone-verified |
| IN-GR-031 | After a successful delete the dialog stayed over the sign-in screen until Cancel | ✅ Fixed in #197: closes and lands on sign-in with "Your account has been deleted."; iPhone-verified |
| IN-GR-032 | The system Apple button's label is larger than Google's and the Sign In CTA; its size cannot be set | ⏳ Handoff `docs/plans/2026-09-17-001-handoff-apple-button-custom.md` (custom button within the HIG) |
| IN-GR-033 | Sign In CTA should be passive until email and password are filled (Joe) | ✅ Built in #197, iPhone-verified |
| IN-GR-034 | Notification permission is only asked on the first watchlist add, so most installs never see it | ⏳ Decision (Joe, 17 Sept): ask after onboarding with an explainer. Handoff `docs/plans/2026-09-17-002-handoff-notification-prompt-after-onboarding.md` |
| IN-GR-004, 005, 012, 027 | Cold-start stack, referrer runtime, provider sign-up resume, replay | ✅ Closed on device (A5, B3, C3, S4-11) |
| IN-GR-009 | Account deletion removes every growth row of every install the account used | Confirmed in practice: C5 deleted the whole iPhone evidence trail (the Apple account had used the same install). Behaviour stands; test plans that delete accounts use a separate install |
| IN-GR-021 | Confirmation link opened on a computer | Not exercised on a computer in C4; still watch sign-up drop-off after the flip |

## What the plan got wrong across the phase

1. **Play signing.** S1 closed IN-GR-001 on "Play App Signing uses the upload key". It does not. Two Play-install features (app links, Google sign-in) failed only on a store install, which no session could see before S5. Anything keyed to the signing certificate needs both keys.
2. **Provisioning profiles.** Adding entitlements (Associated Domains, Sign in with Apple) invalidates stored EAS profiles; CI builds are non-interactive and cannot regenerate them. The first build after an entitlement change needs a local interactive credentials pass.
3. **Confirm email timing.** "Flip when testers update" ignored the public App Store app. The flip belongs to the public 2.5.0 release, which leaves a window where 2.5.0 installs have provider sign-in with auto-confirm on (IN-GR-011); acceptable for a closed test cohort, not after release.
4. **Signed-out detail screen.** S1 chose "no sign-in guard" so recipients see the object first, but the detail page's actions were not audited for signed-out writes (IN-GR-028).
5. **Deletion versus evidence.** The S5 plan did not account for IN-GR-009 when ordering C5 on the same install as the rest of the matrix.
6. **Notification consent.** "Ask at the first watchlist add" meant testers on fresh installs had no token and pushes silently reached nothing until permission was granted in Settings; recorded as a product change (IN-GR-034) rather than a defect.
7. **Evidence per tap.** "One row per step" held for events, but link taps from some source apps did not each produce a row; checks leaned on Joe's observation where rows were thin.

## Measures now live

All G1 measures in `growth-dashboard.sql` have real rows, all from test accounts; there is no real cohort yet, so no numbers are meaningful beyond "the pipeline records every step". Table state on 17 Sept after the pass (post-deletion): 26 `preview_fetched`, 9 `preview_opened`, 7 `link_opened`, 6 `first_open`, 2 `share_initiated`/`share_completed`, 1 `notification_opened`, 1 `signup_completed`. First real numbers come after the public 2.5.0 release.

## What Joe must still do

1. Merge #197 (S5 fixes and docs); then run the TestFlight production build (`ios-release.yml` profile production, submit true) and a new Android release, so the fixes reach testers in the binary.
2. Submit 2.5.0 to the App Store (his call after this pass), with the S2 and S3 store privacy rows filed (`docs/legal/store-privacy-disclosures.md`).
3. On the day 2.5.0 is public: turn Confirm email on permanently.
4. Approve the strategy doc v0.2 draft (separate commit in #197).
5. Run the two handoffs (IN-GR-032 Apple button, IN-GR-034 notification prompt) after #197 merges, so their OTAs do not replace the S5 fixes on the iPhone.

## G2 (households) readiness

**Reusable as is**
- URL grammar and routing (ADR-015): `/list/:id` is already reserved on the Worker (noindex 404) and mapped by `parseInboundLink`; `via=household` is already in the contract.
- Worker page shell (OG, smart banner, store CTAs for both stores, `PAGE_CACHE_VERSION`, attribution passthrough) and `preview_fetched`/`preview_opened` telemetry.
- Inbound links end to end: verified app links on both platforms, pending link through sign-in and onboarding, Play referrer carrying an object into a fresh install (proven by B3), tabs beneath cold starts.
- Sign-in: Apple and Google, email confirmation flow, placeholder usernames; an invitee can join without a password.
- `growth_events` contract and Worker ingest: household invites and joins are new `event_name` values plus a CHECK change.
- Push pipeline: `compose.ts` payloads, `delivery_id`, `notification_opened`, session origin, "Tell someone" pattern.
- `ShareButton` `runShare` (events, copy, `src`) for an invite link.

**Not reusable, or needs rework**
- No list or household entity: `watchlist` is per-user rows; G2 needs `households`, `household_members`, `watchlists`, `watchlist_items`, reactions, with member-scoped RLS and a migration of personal watchlists.
- Room snapshots are frozen and anonymous; a shared list is live and member-scoped, so the `/list/:id` page needs a membership-aware read path (and must not cache member data in the public page cache).
- Invite acceptance: no join or invite-code flow; the pending link resumes one object, not "join this household then show the list".
- Push cap is one push per account per 20 hours; household nudges would compete with arrivals, so the cap needs a per-type or per-channel policy. Bundle pushes have no per-push id (IN-GR-026).
- Consent: nudges need a token, so IN-GR-034 (ask after onboarding) is effectively a G2 prerequisite.
- Deletion semantics (IN-GR-009) and shared phones matter more when households share devices; decide what a member's deletion does to shared lists.
- Signed-out actions: IN-GR-028's pattern (ask for sign-in, resume) must apply to every list action on an invite page.
