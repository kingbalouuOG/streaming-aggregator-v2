# Push Notifications — Data-Model Note

**Prepared:** 2026-07-06 · **For:** launch compliance now; the deferred H2 solicitor pass later.
**Status:** describes what H0 Stream B (Notifications v1) adds to the data inventory. Written against the real migrations (`supabase/migrations/055`–`059`), deployed to prod.

Per **Decision 6** the paid solicitor review is deferred to the H2 monetisation gate, so this note now has two jobs:

1. **Launch compliance (now).** It backs the push rows already stubbed in [store-privacy-disclosures.md](./store-privacy-disclosures.md) — Google Play "Device or other IDs" and Apple "Device ID", both marked **(H0)** — and the [launch-compliance checklist](./launch-compliance-checklist.md), and the push slot in Privacy Policy §2. When notifications go live at submission, un-stub those rows.
2. **H2 solicitor pass (later).** It carries forward as the push surface for the deferred paid review (see [solicitor-review-pack.md](./solicitor-review-pack.md) and the parked [solicitor-briefing-pack.md](./solicitor-briefing-pack.md)).

---

## What is stored, and why

Notifications v1 sends two free, opt-in alert types to users who have installed the app and granted the OS notification permission:

- **Arrival alerts** — a title on the user's watchlist becomes available on a service they subscribe to.
- **Leaving-soon alerts** — a watchlist title on a subscribed service is about to expire (~7 days out).

To do that it stores three new tables, **all keyed to the user's account id and all owner-only under Row-Level Security**:

| Table | What it holds | Why | Contains PII? |
|---|---|---|---|
| `user_push_tokens` | The device's **Expo push token** (an opaque delivery address issued by Expo's push service), `platform` (ios/android), and *minimal* device metadata: an Expo install id, an optional coarse device label (e.g. "Pixel 7"), app version, timestamps. | The address we push to. One row per device. | The push token is a device identifier (a pseudonymous delivery handle), tied to the account. **No** advertising id, **no** location, **no** hardware fingerprint, **no** contacts. |
| `notification_preferences` | Per-type on/off flags (`arrival`, `leaving_soon`) for the user. | Honour the user's in-app toggles. | No — booleans keyed to the account. |
| `notification_deliveries` | An append-only log of which alert was sent to which user for which title, with timestamp and delivery status. | Dedupe (never alert twice for the same title), enforce the ~1/day cap, and prune dead device tokens via Expo delivery receipts. | Links account → titles the user was alerted about (a viewing-interest signal, same sensitivity class as the existing `user_interactions`/`watchlist` tables). |

No notification **content** beyond the title name and its availability is generated, and none of it leaves our infrastructure except the push payload sent to Expo → Apple/Google for delivery (see processors below).

## How consent is captured

- **OS permission is the gate.** An Expo push token *cannot be minted without the user granting the OS-level notification permission.* So the existence of a `user_push_tokens` row is itself the record that the user consented on that device.
- **Asked at the right moment.** The permission prompt is shown **after the user's first value moment** (e.g. their first watchlist add), never at first launch — a privacy-forward pattern, not a launch-screen wall.
- **Per-type refinement.** Once granted, the user can turn each alert type on/off under Profile → Notifications. These write `notification_preferences` rows. The daily job filters on them **server-side** (not just in the client), so a disabled type is never sent even if a client is stale.

## How consent is withdrawn

Any of these stops delivery:

- **In-app** — toggling the alert types off (Profile → Notifications). Turning everything off also clears the device's token.
- **Sign-out** — deletes this device's token row.
- **OS settings** — revoking the notification permission; the next delivery attempt returns a "DeviceNotRegistered" receipt and the token row is pruned.
- **Account deletion** — all three tables are removed. `user_push_tokens`, `notification_preferences`, and `notification_deliveries` each `CASCADE` from `profiles`/`auth.users`, so the existing in-app **Delete my account** flow already erases them with no code change. *(These three tables must be added to the `delete_own_account` hand-maintained list — tracked, see §Follow-ups.)*

## Retention

- **Tokens:** live until the device token dies (Expo receipt says the device is no longer registered) or the account is deleted. Dead tokens are pruned by the daily job.
- **Preferences:** live until changed or the account is deleted.
- **Delivery log:** retained for dedup correctness (a title should not re-alert). Same "indefinite until deletion" posture as the rest of the inventory (Privacy Policy §7) — flagged in the review pack as a general question; a periodic prune of old delivery rows is possible without breaking dedup if the solicitor advises a fixed retention window.

## Processors / third parties (new for this surface)

Push delivery introduces one new sub-processor chain beyond those already listed in the review pack §2:

- **Expo** (Expo Application Services) — receives the push token + payload (title name + short availability text) and relays it to the platform push gateway. Expo does not receive account credentials or the taste profile.
- **Apple Push Notification service (APNs)** / **Google Firebase Cloud Messaging (FCM)** — the OS-level gateways that actually deliver the notification to the device.

No user PII beyond the push token and the alert text passes to these. This is the standard mobile-push processor chain.

## Open questions

**Resolve now (launch compliance):**
1. **Play / Apple disclosure.** Push token = "Device or other IDs" (Play) / "Device ID" (Apple), purpose "delivering notifications the user opted into". The "titles you were alerted about" delivery log sits under existing App-activity/Product-interaction rows. Both already stubbed in [store-privacy-disclosures.md](./store-privacy-disclosures.md) — un-stub at submission.
2. **Processor disclosure.** Add Expo / APNs / FCM to the Privacy Policy §2 processor list (currently a marked-pending push slot).

**Deferred to the H2 solicitor pass:**
3. **Lawful basis for push.** Arrival/leaving-soon alerts are opt-in and tied to the user's own watchlist. Is OS-permission-grant + in-app toggle sufficient consent under UK GDPR/PECR, or is anything more needed given PECR's treatment of electronic messaging? (Low residual risk for the prototype user base; confirm before scale.)
4. **Retention.** Is "indefinite until deletion" acceptable for the delivery log, or is a fixed prune window advisable (feasible without breaking dedup)?

## Follow-ups (engineering, not legal)

- Add `user_push_tokens`, `notification_preferences`, `notification_deliveries` to the `delete_own_account` DB function's explicit table list (they CASCADE today, so deletion already works, but the list should be explicit — same drift risk flagged as IN-PX-54 in the review pack).
- Update Privacy Policy §2 inventory to include the three tables + the Expo/APNs/FCM processors (the §2 inventory is already noted as stale in the review pack).
