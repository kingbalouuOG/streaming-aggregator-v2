# Growth S4 (sharing): summary

**Date:** 2026-09-16 · **Workstream:** Growth (G1) · **Scope:** G1-1 to G1-4 from [plan 2026-09-14-003](../../plans/2026-09-14-003-feat-phase-g0-g1-growth-foundations-and-sharing-plan.md), [handoff 2026-09-16-001](../../plans/2026-09-16-001-handoff-growth-s4-sharing.md) · **PRs:** #192 (S4, merge `adf2882`), plus this close-out docs PR

**Status: merged and deployed.** The Worker deployed through CI on merge, and Joe deployed `send-notifications` (version 8). No migration. The app side is on `main` but not in any build yet: it ships in the single rebuild of both platforms before S5, and the device checks are S5's (checklist items S4-1 to S4-11).

## What shipped

- **Share copy** (`src/lib/growth/shareCopy.ts`, unit-tested). The UK availability line is the hook:
  - Streaming on a subscription or free service: "Severance (2022). On Apple TV+ in the UK."
  - Rent or buy only: "Severance (2022). Rent or buy on Apple TV+ and Prime Video in the UK."
  - Nothing in the UK (still shares): "Severance (2022). See where to watch in the UK on Videx."
  - Two or three services are joined with "and"; four or more become "Netflix, NOW and 2 more". Add-on channels never count as the service.
  - Rooms: "More like Heat: 24 titles picked for the mood." Personal framing ("If you love Heat") is removed with the same rule the Worker applies to snapshots.
  - The link carries `?via=share`, plus `&src=push` when the share happens in a session a push tap opened. The canonical URLs are unchanged.
  - Service names come from `src/lib/growth/serviceLabels.ts`, which the Worker title page now re-exports, so a shared message and the page it opens always name services the same way. `neutraliseRoomLabel` moved into `src/lib/growth/roomSnapshot.ts` for the same reason. Page markup is unchanged, so `PAGE_CACHE_VERSION` was not bumped.
- **Share events** (`native/src/components/ShareButton.tsx`, `runShare`):
  - `share_initiated` when the share sheet opens; `share_completed` when the OS reports a share.
  - Metadata: `surface` (`detail`, `room`, `room_card`), `moment` (`arrival` or `leaving_soon`, when shared from "Tell someone"), and on completion `to_surface` (iOS activity type) and `platform_reports_completion` (true on iOS only, because Android reports a dismissed sheet as shared).
  - `user_interactions.share` is unchanged for titles (kept for the ranking-side history); rooms log nothing there.
- **Push payload** (`supabase/functions/send-notifications/compose.ts`, pure and unit-tested; `index.ts` imports it):
  - Single title: `{ url, type, delivery_id, via: 'push', service_id, expires_on? }`. `delivery_id` is the claimed `notification_deliveries` row; `expires_on` is leaving-soon only.
  - Bundle: `{ url: 'videx://watchlist', type: 'bundle', delivery_id: null, via: 'push' }`.
  - Dedup, cap and send logic are unchanged.
- **Push open** (`native/src/providers/notifications.tsx`):
  - Each tap posts `notification_opened` (with `delivery_id`, `via=push`, `src=push`, `metadata.type`), then marks the session as push-originated, then routes as before (still bypassing `+native-intent`).
  - Each tap is handled once (warm and cold start), and the handled response is cleared so a later relaunch cannot replay it (IN-GR-027).
- **Session origin** (`src/lib/instrumentation/sessionOrigin.ts`, unit-tested; `native/src/hooks/useSessionOrigin.ts`):
  - In memory. Ends with the session (5 minutes in the background).
  - An origin set in the last 10 seconds survives a session reset, because the tap that wakes a long-backgrounded app can arrive before the reset does.
- **"Tell someone"** on the detail page, when the push that opened the session was about the title on screen:
  - The top-right share button becomes a labelled accent pill ("Tell someone"), same position.
  - A dismissible banner under the meta line (`native/src/components/TellSomeoneBanner.tsx`): "Severance has just landed on Apple TV+. Tell someone." or "Heat leaves Netflix on Saturday 19 September. Tell someone."
  - Sharing from either puts the moment first: "Just landed on Apple TV+: Severance (2022). On Apple TV+ in the UK."
  - Nothing for bundles. Dismissing hides the banner for the session; the session stays push-originated.
- **Measures** (`supabase/queries/growth-dashboard.sql`):
  - §1 shares per WAU now reads `share_initiated`; the old `user_interactions.share` version is kept commented for the transition.
  - §6a iOS share completion rate by surface. §6b share rate in push-originated sessions (per notification open) vs organic (per active user). §6c notification click-through by push type, joined on `delivery_id`. §6d "Tell someone" take-up.
  - `metrics-dashboard.sql` §5 points at them.
- **Docs:** device checklist S4-1 to S4-11 (`docs/strategy/briefs/h0-device-test-checklist.md`); wiki event taxonomy, notifications-v1, growth-loops, parking lot, log.

## Verified

- **Checks before merge:** root lint (0 errors), 798 tests, web build; native lint, `tsc --noEmit`, `expo export --platform android`; `deno check` on the Edge Function. CI on the merge commit: Build, Typecheck and Deploy API Worker all green.
- **Worker after deploy:** `/t/tv/95396` 301s to `/t/tv/95396-severance-2022`, and the page still lists "Stream now" with Apple TV+ (the moved label map is live).
- **Edge Function after deploy:** `send-notifications` version 8, active, `verify_jwt` true; its deployed files are the merged `index.ts` and `compose.ts`; an unauthenticated POST returns 401. The daily 08:00 UTC run sends the new payload from its next run.
- **Dashboard queries**, run read-only against production. Shapes (every count is 0 or null until a build with S4 is on devices):
  - §1: `week | weekly_active_users | shares | sharing_users | shares_per_wau` (8 weeks)
  - §6a: `surface | initiated | completed | completion_pct` (plus a total row)
  - §6b: `session_origin | shares | denominator | denominator_count | shares_per_denominator` (rows `push`, `organic`)
  - §6c: `push_type | pushes_sent | opened | ctr_pct | method` (rows `arrival`, `bundle`, `leaving_soon`)
  - §6d: `moment | push_opens | moment_shares | moment_shares_completed_ios | shares_per_open` (rows `arrival`, `leaving_soon`)
- **Not verified:** nothing has run on a phone. That is S5.

## What Joe did

- Merged #192.
- Deployed `send-notifications` (`npx supabase functions deploy send-notifications --project-ref fmusugdcnnwiuzkbjquo`).

## Still open

- **Device checks S4-1 to S4-11 in S5**, after the rebuild: the three title copy cases in WhatsApp and Messages, room shares from a card and the room screen, a push tap giving a `notification_opened` row with `delivery_id` and the right banner, `src=push` in the URL and on the events, the banner gone after six minutes in the background, and no replay on a normal relaunch.
- **IN-GR-023:** for a new series with no provider data, the detail page falls back to the network that made it, so the copy could say "On BBC iPlayer" when it isn't streaming there.
- **IN-GR-024:** a room card records `share_initiated` only after its snapshot is created, so failed snapshot attempts go uncounted.
- **IN-GR-025:** the push copy keeps its own copy of the service-name map, and its single-title bodies use em dashes against the tone guide.
- **IN-GR-026:** bundle opens can't be joined to deliveries (no `delivery_id`), and banner views aren't logged, so take-up is shares per single-title open rather than per banner shown.
- **IN-GR-027:** mitigated (handled response cleared); confirm on a device (S4-11).

## Where the plan was wrong or incomplete

1. **The rent-or-buy example contradicted the label rule.** The handoff's "Rent or buy on Apple TV and Prime" doesn't match the Worker labels the copy must use; the copy says "Apple TV+ and Prime Video".
2. **`notification_opened` could not carry metadata.** The S2 `GrowthEvent` union had no metadata field for it; one was added (additive, the Worker already accepted metadata).
3. **"Single-title push" is not "one delivery row".** A push led by one arrival can claim leaving-soon rows under the same Expo ticket and still be sent as a single-title push. The payload and the CTR query (§6c) decide from the lead title, not the row count.
4. **A room card cannot log `share_initiated` on tap.** The shared room id doesn't exist until `POST /v1/share/room` returns, so the event is sent after the snapshot succeeds (IN-GR-024).
5. **Edge Function tests.** The handoff described a Deno test. The repo already had a pattern (pure helper module tested by the root vitest, as `_shared/appleClientSecret.ts`), so `compose.ts` follows it and CI runs the tests; `deno check` still passes.
6. **Replay risk found along the way.** `getLastNotificationResponseAsync` returns the most recent response, not only the one that launched the app. With S4 a replay would also log a second open and restore a push session, so the handled response is now cleared (IN-GR-027).
7. **Banner position.** "Under the hero title" became "under the meta line": the hero title sits over the image, and the meta line is the first row below it.

## Notes for S5

- **Order:** rebuild both platforms → testers update → flip Confirm email → provider sign-in checks. S4's checks need only the rebuild and the deployed function.
- **Seeding a push:** checklist item 11 (arrival) and S4-7 (leaving soon, `expires_on` within 7 days); two titles in one run give a bundle (S4-8). The 20-hour cap applies per account, so seed across days or clear the test account's recent `notification_deliveries` rows between runs.
- **Rows to watch:** `growth_events` for the test install (query at the top of the S4 checklist section).
- **Android build:** the Android Release run on 16 Sept (`386e26a`) succeeded, which is the first compile of S2's Kotlin install-referrer module; IN-GR-005's compile question looks answered, and runtime is still S5's.
- **Unrelated:** the "Pipeline health" workflow failed on 15 and 16 Sept, before S4 merged; worth a look separately.
