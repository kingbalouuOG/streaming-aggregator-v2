---
title: Notifications v1 (arrival + leaving-soon alerts)
type: concept
tags: [notifications, push, expo, edge-function, cron, retention, h0, stream-b]
created: 2026-07-06
updated: 2026-09-16
sources:
  - docs/strategy/briefs/h0-stream-b-notifications-share.md
  - docs/strategy/Videx_Product_Strategy_and_Roadmap_v1.0.md
related:
  - wiki/concepts/architecture/platform-architecture.md
  - wiki/entities/codebase/event-taxonomy.md
  - wiki/concepts/techniques/rls-pattern.md
  - wiki/concepts/operations/sync-pipeline.md
---

# Notifications v1

Videx's retention loop (H0 Stream B, roadmap item 0.9). Two free, opt-in push alert types, both scoped to the user's own watchlist × their subscribed services. Ships *inside* v1, before the quiet store release.

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
| `notification_deliveries` | Append-only sent-ledger: dedup (`UNIQUE(user, type, tmdb, media)`) + cap (`sent_at`) + receipt tracking. | owner read-own, service_role writes |

Migration 058 adds `share` to the `user_interactions` CHECK (Share v1, unrelated transport but same PR). All three tables `CASCADE` from `profiles`/`auth.users` → the existing **Delete my account** flow erases them (add them to the explicit `delete_own_account` list — follow-up).

## Consent (privacy-forward)

- OS permission is the hard gate — no token without it, so a `user_push_tokens` row *is* the consent record.
- The permission prompt fires at the **first value moment** (first watchlist add → `maybePromptForPush`), never at first launch.
- Per-type toggles live under **Profile → Notifications** (`ProfileNotifications.tsx`) and are honoured **server-side** — the cron filters `notification_preferences`, not just the client.
- Withdrawal: in-app toggle off, sign-out (clears this device's token), OS-settings revoke (next send returns `DeviceNotRegistered` → token pruned), or account deletion.
- Data-model note for the solicitor pass: `docs/legal/notifications-data-model.md`.

## Delivery pipeline

**`send-notifications` Edge Function**, daily cron at **08:00 UTC** (migration 059) — after the 06:00 sync (which can time-out/resume) and the 06:30/06:45 enrich/embed jobs. Vault-backed service-role JWT (migration 039 pattern); asserts `role === 'service_role'`.

Per run:
1. **Receipt pass** — poll Expo receipts for the *previous* run's tickets; prune `DeviceNotRegistered` tokens.
2. **Per user with ≥1 token** (v1 scale is tiny; per-user loop is fine):
   - Skip if already pushed inside the 20h cap window.
   - Load enabled types, watchlist, subscribed services.
   - Gather arrival candidates (`streaming_history added`, 26h lookback) + leaving-soon candidates (`expires_on` within 7d), scoped to watchlist × services; drop already-delivered.
   - **Claim deliveries first** via `upsert … ignoreDuplicates` on the dedup key → only push for rows actually claimed (idempotent under double-fire).
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
| `via` | `push` | `push` |
| `service_id` | the service it landed on or is leaving | omitted |
| `expires_on` | leaving-soon only | omitted |

A push is single-title when its lead group holds one title (one arrival, or no arrival and one leaving-soon); an arrival-led push can still claim leaving-soon rows under the same ticket. Dedup, cap and send logic are unchanged. Deployed manually (`npx supabase functions deploy send-notifications`): version 8, 16 Sept 2026, so the 08:00 UTC run sends this payload from 17 Sept. Pushes sent before that carry only `url` and `type`.

On tap, `routeFromData` parses the URL with `parseInboundLink`, posts `notification_opened` to `growth_events` (with `delivery_id`), sets the session origin (`push`, object, type, service, expiry) and then `router.push`es (still bypassing `+native-intent`). Taps are handled once per notification identifier and the last response is cleared after handling, so the cold-start response, the listener and a later relaunch cannot double-count.

The detail page the push opened shows **"Tell someone"**: the top-right share button becomes a labelled accent pill and a dismissible banner sits under the meta line, "Severance has just landed on Apple TV+. Tell someone." (arrival, the stronger nudge) or "Heat leaves Netflix on Saturday 19 September. Tell someone." (leaving soon). Sharing from it leads the message with the moment ("Just landed on Apple TV+: Severance (2022). On Apple TV+ in the UK."). Bundles show nothing. The origin ends with the session (5 minutes backgrounded); an origin set in the last 10 seconds survives a reset that races the tap that woke the app. Measures: `growth-dashboard.sql` §6c (CTR by push type) and §6d (take-up).

## Related

- Growth loop (share + title pages) shares the same PR — see [event-taxonomy](../../entities/codebase/event-taxonomy.md) `share`.
- [platform-architecture](platform-architecture.md) for the three-surface layout the pipeline spans.
