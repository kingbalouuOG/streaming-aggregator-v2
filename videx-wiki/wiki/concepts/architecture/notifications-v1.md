---
title: Notifications v1 (arrival, leaving-soon and household nudges)
type: concept
tags: [notifications, push, expo, edge-function, cron, retention, h0, stream-b, g2, household]
created: 2026-07-06
updated: 2026-09-18
sources:
  - docs/strategy/briefs/h0-stream-b-notifications-share.md
  - docs/strategy/Videx_Product_Strategy_and_Roadmap_v1.0.md
  - docs/plans/2026-09-17-004-feat-phase-g2-household-loop-plan.md
  - docs/plans/2026-09-18-005-handoff-growth-h4-nudges.md
related:
  - wiki/concepts/architecture/platform-architecture.md
  - wiki/entities/codebase/event-taxonomy.md
  - wiki/concepts/techniques/rls-pattern.md
  - wiki/concepts/operations/sync-pipeline.md
---

# Notifications v1

Videx's retention loop (H0 Stream B, roadmap item 0.9). Two free, opt-in title alert types, both scoped to the user's own watchlist × their subscribed services, shipped *inside* v1. Growth G2 H4 (migration 095) adds a third type, `household_nudge`, sent by a second function; see "Household nudges" below.

| Type | Function | Schedule | Cap group | Quiet hours |
|---|---|---|---|---|
| `arrival`, `leaving_soon` | `send-notifications` | daily 08:00 UTC (059) | `titles` | exempt |
| `household_nudge` | `send-nudges` | every 15 min, `send-nudges-15m` (095) | `household` | 22:00 to 08:00 Europe/London |

Caps (`supabase/functions/_shared/pushPolicy.ts`, vitest): one push per cap group per 20 hours, plus a global floor of 3 pushes per person per rolling 24 hours across groups. A nudge never blocks an arrival and vice versa.

## The two alert types

| Type | Fires when | Source of truth | Tier |
|---|---|---|---|
| `arrival` | A watchlist title lands on a service the user has. | `streaming_history` `event_type='added'` (written by the incremental sync). | Free **forever** (retention loop + taste signal, strategy §5). |
| `leaving_soon` | A watchlist title on a subscribed service is ~7 days from expiry. | `streaming_availability.expires_on` — read **directly**, never inferred from history. | Free in v1; **future Premium anchor**. |

> ⚠ **Leaving-soon must NOT be derived from `streaming_history`.** The sync writes SA `expiring` changes as `event_type='updated'`, which is indistinguishable from a normal metadata update — an unusable signal. Only `streaming_availability.expires_on` (~2K titles carry forward-looking dates) is authoritative.

Type separation is kept clean so gating `leaving_soon` behind Premium later is **config, not surgery**: a `NOTIFICATION_TYPES` registry in the Edge Function carries a `tier` flag; flip `'free'`→`'premium'` + implement `userIsPremium()`. No schema or pipeline change.

## Data model (migrations 055–058)

| Table | Role | RLS |
|---|---|---|
| `user_push_tokens` | Expo push token + minimal device metadata, one row per device. **Row existence = OS push consent.** | owner-only ALL + service_role |
| `notification_preferences` | Per-type on/off. Normalised `(user_id, notification_type, enabled)`. **Absent row = enabled** (default-on). | owner-only ALL + service_role |
| `notification_deliveries` | Append-only sent-ledger: dedup (`UNIQUE(user, type, tmdb, media)` for title alerts; `UNIQUE(user, type, list_id, nudge_window)` for nudges, 095) + caps (`sent_at`) + receipt tracking + `push_id` (095). | owner read-own, service_role writes |

Migration 058 adds `share` to the `user_interactions` CHECK (Share v1, unrelated transport but same PR). All three tables `CASCADE` from `profiles`/`auth.users` → the existing **Delete my account** flow erases them (add them to the explicit `delete_own_account` list — follow-up).

## Consent (privacy-forward)

- OS permission is the hard gate — no token without it, so a `user_push_tokens` row *is* the consent record.
- **When we ask (IN-GR-034, Joe 2026-09-17; PR #208, iPhone-verified 2026-09-18):** once per install and account, after onboarding, on For You, never at cold launch. `PushExplainerHost` (`native/src/components/PushExplainerSheet.tsx`) is mounted by For You once its feed has loaded and shows a bottom-sheet explainer ("Get told when something on your watchlist lands on your services, or is about to leave") with **Turn on** / **Not now** before any OS prompt. Turn on records the ask, then shows the system prompt and registers on grant (`acceptPushPrompt`); Not now (or Android back) records `declined` and is never re-asked automatically; Profile → Notifications stays the way in.
  - Rule: the pure `decidePushPrompt` in `src/lib/notifications/promptDecision.ts` (tested): granted → register silently; blocked → never; already asked or declined → never; a pending shared link → wait; otherwise explain.
  - Timing: For You must stay focused for 1.2s. At the end of onboarding `curating.tsx` pushes a pending shared title a tick after landing on For You, which blurs it and cancels the timer, so the explainer shows after the person comes back from the title, never over it. Existing installs never asked get it on their next For You visit.
  - Record: MMKV `push_prompt_shown` (`'1'` asked, including the legacy watchlist-add value; `'declined'`), cleared by `clearPushToken` on sign-out so the next account on a shared phone gets its own ask.
  - Permission state is read from `canAskAgain`, not `status`: on Android 13+ a fresh install reports `status: 'denied'` with `canAskAgain: true` (notifications are disabled until POST_NOTIFICATIONS is granted; expo-notifications declares the permission in its manifest and requests it); `canAskAgain` turns false after the second Android denial and after any iOS denial. The request creates the Android channel first, since the Android 13 dialog does not appear until one exists.
  - The old first-watchlist-add trigger (`maybePromptForPush` in `WatchlistActions`) is removed: one entry point.
- Per-type toggles live under **Profile → Notifications** (`ProfileNotifications.tsx`) and are honoured **server-side** — the cron filters `notification_preferences`, not just the client.
- Withdrawal: in-app toggle off, sign-out (clears this device's token), OS-settings revoke (next send returns `DeviceNotRegistered` → token pruned), or account deletion.
- Data-model note for the solicitor pass: `docs/legal/notifications-data-model.md`.

## Delivery pipeline

**`send-notifications` Edge Function**, daily cron at **08:00 UTC** (migration 059) — after the 06:00 sync (which can time-out/resume) and the 06:30/06:45 enrich/embed jobs. Vault-backed service-role JWT (migration 039 pattern); asserts `role === 'service_role'`.

Per run:
1. **Receipt pass** — poll Expo receipts for earlier tickets (title alerts and nudges share the table); prune `DeviceNotRegistered` tokens. The Expo transport (send, receipts, pruning) lives in `_shared/expoPush.ts` since G2 H4.
2. **Per user with ≥1 token** (v1 scale is tiny; per-user loop is fine):
   - Skip if the `titles` group pushed inside 20h, or 3 pushes of any type went in 24h (`capBlock` from `_shared/pushPolicy.ts`, G2 H4; before that any push of any type blocked for 20h).
   - Load enabled types, watchlist, subscribed services.
   - Gather arrival candidates (`streaming_history added`, 26h lookback) + leaving-soon candidates (`expires_on` within 7d), scoped to watchlist × services; drop already-delivered.
   - **Claim deliveries first** via `upsert … ignoreDuplicates` on the dedup key → only push for rows actually claimed (idempotent under double-fire). Every claimed row of one push carries the same `push_id` (095), also sent in the payload.
   - Compose ONE bundled push (cap ~1/day; arrivals lead). Fan out to every device token.
   - Tap → `videx://detail/<type>-<tmdbId>` (single) or `videx://watchlist` (bundle), routed by `NotificationsProvider`.

### Mass-fire safety

Bundling into one push/day per user + dedup means a catch-up sync that adds 50 titles at once produces **one** push per affected user, not fifty. Manual bulk syncs (`scripts/sync-content.ts`) write **no** history events — a known blind spot the 26h window + dedup tolerate without back-firing.

## Native client

- `native/src/notifications/push.ts` — token register/refresh/clear, prefs, permission (`expo-notifications`, SDK 56: `getExpoPushTokenAsync({ projectId })`, handler returns `shouldShowBanner`/`shouldShowList`). Lives OUTSIDE the `native/src/lib` junction (native-only deps).
- `native/src/providers/notifications.tsx` — handler + Android channel + token lifecycle across auth transitions + tap routing (warm + cold via `getLastNotificationResponseAsync`).
- Plugin: `["expo-notifications", { color }]` in `app.json`; EAS FCM v1 / APNs credentials **in place and device-verified 2026-07-13** (arrival, bundling, dedup, 20h cap, warm/cold tap routing — see `docs/strategy/briefs/h0-device-test-checklist.md`); the roadmap 0.12 release valve was never needed. *Correction 2026-09-10: this page said "blocked on credentials" for two months after they landed; as of 10 Sept there are 10 push tokens and 5 test deliveries, and no real (non-seeded) alert has been observed only because there is no cohort yet.*

## Payload, opens and "Tell someone" (Growth S4)

The push `data` is built in `supabase/functions/send-notifications/compose.ts` (pure, vitest-tested; `index.ts` imports it):

| Field | Single title | Bundle |
|---|---|---|
| `url` | `videx://detail/{type}-{id}` | `videx://watchlist` |
| `type` | `arrival` \| `leaving_soon` | `bundle` |
| `delivery_id` | id of that title's claimed `notification_deliveries` row (the claim upsert returns ids) | `null` |
| `push_id` | one id per push (095; added by `index.ts` after composing) | same |
| `via` | `push` | `push` |
| `service_id` | the service it landed on or is leaving | omitted |
| `expires_on` | leaving-soon only | omitted |

A push is single-title when its lead group holds one title (one arrival, or no arrival and one leaving-soon); an arrival-led push can still claim leaving-soon rows under the same ticket. Dedup, cap and send logic are unchanged. Deployed manually (`npx supabase functions deploy send-notifications`): version 8, 16 Sept 2026, so the 08:00 UTC run sends this payload from 17 Sept. Pushes sent before that carry only `url` and `type`.

On tap, `routeFromData` resolves the route with `pushRoute` (object links through `parseInboundLink`, so `videx://list/{id}` lands on `/list/{id}`; other app paths keep the old `videx://` strip), posts `notification_opened` to `growth_events` (with `delivery_id`; `metadata.type`, `metadata.push_id` when present, and `metadata.kind = 'household_nudge'` for a nudge), sets the session origin (`push`, object, type, service, expiry) and then `router.push`es (still bypassing `+native-intent`). The pure half is `src/lib/notifications/pushTap.ts` (vitest). Since G2 H4 the Worker refuses a `notification_opened` without a verified JWT (401) or naming a delivery that is not the caller's (403) (IN-GR-041). Taps are handled once per notification identifier and the last response is cleared after handling, so the cold-start response, the listener and a later relaunch cannot double-count.

The detail page the push opened shows **"Tell someone"**: the top-right share button becomes a labelled accent pill and a dismissible banner sits under the meta line, "Severance has just landed on Apple TV+. Tell someone." (arrival, the stronger nudge) or "Heat leaves Netflix on Saturday 19 September. Tell someone." (leaving soon). Sharing from it leads the message with the moment ("Just landed on Apple TV+: Severance (2022). On Apple TV+ in the UK."). Bundles show nothing. The origin ends with the session (5 minutes backgrounded); an origin set in the last 10 seconds survives a reset that races the tap that woke the app. Measures: `growth-dashboard.sql` §6c (CTR by push type) and §6d (take-up).

### Device-verified (Growth S5, 2026-09-16..17)

iPhone (APNs) and Android (FCM): arrival push → tap → `notification_opened` with the claimed `delivery_id` → "Tell someone" button and banner → share with `src=push` and `moment`; leaving-soon banner with the weekday and date; bundle lands on the watchlist with no banner; dismiss persists; six minutes backgrounded clears the origin; a normal relaunch does not replay (IN-GR-027). Test technique: the 20-hour cap is per account, so a test clears it by moving the previous delivery's `sent_at` back 21 hours (the row stays as evidence) and seeds titles no other token holder has watchlisted, because `send-notifications` scans every account with a token.

## Household nudges (Growth G2 H4, migration 095)

When a member adds titles to a shared list, the other members get one bundled push within the hour. Plan D9 (policy), D10 (daily digest: stub only, no code), D13 (opens are `notification_opened` with `metadata.kind`).

**`send-nudges` Edge Function** (`supabase/functions/send-nudges/`, `verify_jwt = true`, asserts `role === 'service_role'`), cron `send-nudges-15m` `*/15 * * * *` in the 059 pattern. Per run:

1. Quiet hours (22:00 to 07:59 Europe/London, `Intl` with the zone explicit, so BST is handled): return at once.
2. Read `watchlist_items` added in the last 60 minutes (`added_by` not null, at most 2000 rows), their `watchlists`, `households` and `household_members`; for those members, push tokens, `household_nudge` preferences, 24 hours of deliveries, and the adders' `profiles.username`.
3. `selectNudges` (pure, `compose.ts`): for each member other than the adder with a token and the type not turned off, the items after the later of (now minus 60 min) and their last nudge for that list; one nudge per recipient per run (the list with the newest add wins); the `household` cap group and the global floor applied; at most 200 recipients, longest-waiting first (the next run takes the rest).
4. Claim then send: one `notification_deliveries` row per recipient (`household_nudge`, `list_id`, `nudge_window` = the current UTC hour, a fresh `push_id`, `title` = household name, `tmdb_id` null), `upsert … ignoreDuplicates` on `(user_id, notification_type, list_id, nudge_window)`; push only for rows claimed; ticket ids written back in one upsert; rows with nothing delivered deleted so the next run can retry.

A run is a fixed handful of reads, one claim, `ceil(messages / 100)` Expo calls and one write-back, well inside pg_net's 30 seconds. Receipts are polled by the 08:00 `send-notifications` run.

**Copy** (tone guide: no dashes, no exclamation marks): `joe added Severance to Sofa` (one title) / `joe added 3 titles to Sofa` / `joe and sam added 4 titles to Sofa` / `joe and 2 others added 5 titles to Sofa`; body `Open Videx to react.`; a missing username reads `Someone`.

**Payload:** `{ url: 'videx://list/{listId}', type: 'household_nudge', delivery_id, push_id, via: 'push' }`, never the invite token. The tap lands on the list screen (`native/src/app/list/[id].tsx`, newest first), which a member opens without an invite.

**Opt-out:** Profile → Notifications → **Household activity** ("When someone adds to a shared list"), the same preference upsert as the other two rows; absent row = on.

**Schema (095):** both type CHECKs gain `household_nudge`; `tmdb_id` / `media_type` nullable; `list_id` (→ `watchlists`, `ON DELETE SET NULL`), `nudge_window`, `push_id`; `notification_deliveries_shape_check` (title rows carry the title and no list columns; nudge rows carry `nudge_window` and no title columns); a BEFORE INSERT trigger requires `list_id` on a nudge (a CHECK could not, because deleting the household nulls it). The two unique indexes are **not partial**: PostgREST's `on_conflict` cannot infer a partial index (42P10, verified live 2026-09-18), and NULLs are distinct, so each index only ever matches its own type.

**Measures:** `growth-dashboard.sql` §6c (CTR by type, bundles and nudges joined on `push_id`), §6d, §7 (household loop: households per 100 sign-ups, members per household, two-active-member households, adds per household per week, nudge-to-open).

**Not built (filed):** a "tonight" reaction nudge (IN-GR-049); a "reply" moment on the list after a nudge opens it (IN-GR-050); the daily digest (D10 stub).

## Related

- Growth loop (share + title pages) shares the same PR — see [event-taxonomy](../../entities/codebase/event-taxonomy.md) `share`.
- [platform-architecture](platform-architecture.md) for the three-surface layout the pipeline spans.
