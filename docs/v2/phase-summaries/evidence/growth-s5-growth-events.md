# Growth S5 device evidence: growth_events snapshot

Snapshot taken 2026-09-17 ~09:10 UTC from production `growth_events` (read-only query), **before** the C5 account deletion. C5 (deleting an Apple account that had used the same iPhone install) removed every row of install `9d9e…` at 09:18:43 UTC by design (migration 090, IN-GR-009), so rows 16–70 below no longer exist in the table. Rows 5–15 without an install and the Android `first_open` rows survive.

Install ids shortened: `9d9e` = Joe's iPhone ad-hoc 2.5.0 install (reinstalled 16 Sept ~17:40). Users: `1ef0` = joegreenwas@gmail.com test account, `625b` = Google test account created in C3. Times UTC.

| id | time | event | via | src | object | delivery | platform | ua / install | metadata |
|---|---|---|---|---|---|---|---|---|---|
| 6 | 09-16 15:58:08 | preview_opened | | | title movie-550 | | ios | human | curl check after IN-GR-002 deploy |
| 7 | 09-16 15:58:08 | preview_opened | | | title movie-550 | | other | human | curl check after IN-GR-002 deploy |
| 8 | 09-16 16:45:58 | first_open | | | | | android | bd33 | touch null, prior_install false |
| 9 | 09-16 16:53:37 | first_open | | | | | android | 7acf | touch null, prior_install false |
| 10 | 09-16 17:17:51 | first_open | | | | | android | 3ea9 | touch null, prior_install false |
| 11 | 09-16 17:36:38 | first_open | | | | | ios | 5e16 | touch null, prior_install false |
| 12 | 09-16 17:37:51 | preview_fetched | share | | title movie-550 | | other | crawler | agent slack |
| 13 | 09-16 17:38:17 | preview_opened | share | | title movie-550 | | ios | human | |
| 14 | 09-16 17:40:20 | preview_fetched | | | title movie-550 | | other | crawler | agent slack |
| 15 | 09-16 17:40:35 | preview_fetched | | | title movie-550 | | other | crawler | agent slack |
| 16 | 09-16 17:40:45 | first_open | | | title movie-550 | | ios | 9d9e | touch link, prior_install false |
| 17 | 09-16 17:40:45 | link_opened | | | title movie-550 | | ios | 9d9e | (A2 bare link) |
| 18 | 09-16 17:40:56 | link_opened | | | title movie-550 | | ios | 9d9e | (A2 stale slug) |
| 19 | 09-16 17:41:52 | share_initiated | share | organic | title tv-95396 | | ios | 9d9e · 1ef0 | surface detail |
| 20 | 09-16 17:41:53 | preview_fetched | share | | title tv-95396 | | other | crawler | agent imessage |
| 21 | 09-16 17:41:55 | share_completed | share | organic | title tv-95396 | | ios | 9d9e · 1ef0 | detail, to CopyToPasteboard, completion true |
| 22 | 09-16 17:42:36 | preview_fetched | share | | title tv-95396 | | other | crawler | agent slack |
| 23 | 09-16 17:43:21 | link_opened | share | | title tv-95396 | | ios | 9d9e · 1ef0 | |
| 24 | 09-16 17:43:36 | link_opened | share | | title tv-95396 | | ios | 9d9e (signed out) | |
| 25 | 09-16 17:45:23 | share_initiated | share | organic | title movie-11324 | | ios | 9d9e · 1ef0 | surface detail |
| 26 | 09-16 17:45:23 | preview_fetched | share | | title movie-11324 | | other | crawler | agent imessage |
| 27 | 09-16 17:45:27 | share_completed | share | organic | title movie-11324 | | ios | 9d9e · 1ef0 | detail, to CopyToPasteboard |
| 28 | 09-16 17:46:19 | preview_fetched | share | | title movie-11324 | | other | crawler | agent whatsapp |
| 29 | 09-16 17:46:47 | share_initiated | share | organic | title movie-11324 | | ios | 9d9e · 1ef0 | surface detail (cancelled: S4-3, no completion) |
| 30 | 09-16 17:46:47 | preview_fetched | share | | title movie-11324 | | other | crawler | agent imessage |
| 31 | 09-16 17:47:16 | share_initiated | share | organic | room 75b161d4… | | ios | 9d9e · 1ef0 | surface room_card |
| 32 | 09-16 17:47:17 | preview_fetched | share | | room 75b161d4… | | other | crawler | agent imessage |
| 33 | 09-16 17:47:24 | preview_fetched | share | | room 75b161d4… | | other | crawler | agent whatsapp |
| 34 | 09-16 17:47:27 | share_completed | share | organic | room 75b161d4… | | ios | 9d9e · 1ef0 | room_card, to WhatsApp |
| 35 | 09-16 17:48:10 | preview_opened | share | | room 75b161d4… | | other | human | desktop browser (A3 non-user page) |
| 36 | 09-16 17:59:35 | share_initiated | share | organic | title movie-550 | | ios | 9d9e · 1ef0 | surface detail |
| 37 | 09-16 17:59:36 | preview_fetched | share | | title movie-550 | | other | crawler | agent imessage |
| 38 | 09-16 17:59:38 | preview_fetched | share | | title movie-550 | | other | crawler | agent whatsapp |
| 39 | 09-16 17:59:40 | share_completed | share | organic | title movie-550 | | ios | 9d9e · 1ef0 | detail, to WhatsApp |
| 40 | 09-16 17:59:47 | link_opened | share | | title movie-550 | | ios | 9d9e · 1ef0 | A1 cold |
| 41 | 09-16 18:00:15 | link_opened | share | | title movie-550 | | ios | 9d9e · 1ef0 | A1 warm |
| 42 | 09-16 18:00:54 | share_initiated | share | organic | title movie-38 | | ios | 9d9e · 1ef0 | surface detail |
| 43 | 09-16 18:00:54 | preview_fetched | share | | title movie-38 | | other | crawler | agent imessage |
| 44 | 09-16 18:01:01 | preview_fetched | share | | title movie-38 | | other | crawler | agent whatsapp |
| 45 | 09-16 18:01:04 | share_completed | share | organic | title movie-38 | | ios | 9d9e · 1ef0 | detail, to WhatsApp |
| 46 | 09-16 18:01:42 | link_opened | share | | room 75b161d4… | | ios | 9d9e · 1ef0 | room link opens room screen |
| 47 | 09-16 18:01:44 | share_initiated | share | organic | room 75b161d4… | | ios | 9d9e · 1ef0 | surface room |
| 48 | 09-16 18:01:44 | preview_fetched | share | | room 75b161d4… | | other | crawler | agent imessage |
| 49 | 09-16 18:11:28 | notification_opened | push | push | title movie-388 | 0bc6e650… | ios | 9d9e · 1ef0 | type arrival (P1) |
| 50 | 09-16 18:11:36 | share_initiated | share | push | title movie-388 | | ios | 9d9e · 1ef0 | moment arrival, surface detail |
| 51 | 09-16 18:11:36 | preview_fetched | share | push | title movie-388 | | other | crawler | agent imessage |
| 52 | 09-16 18:11:46 | preview_fetched | share | push | title movie-388 | | other | crawler | agent whatsapp |
| 53 | 09-16 18:11:50 | share_completed | share | push | title movie-388 | | ios | 9d9e · 1ef0 | moment arrival, to WhatsApp |
| 54 | 09-16 18:12:17 | share_initiated | share | push | title tv-95396 | | ios | 9d9e · 1ef0 | surface detail (other title, same push session) |
| 55 | 09-16 18:12:18 | preview_fetched | share | push | title tv-95396 | | other | crawler | agent imessage |
| 56 | 09-16 18:12:20 | preview_fetched | share | push | title tv-95396 | | other | crawler | agent whatsapp |
| 57 | 09-16 18:12:53 | link_opened | share | push | title movie-388 | | ios | 9d9e · 1ef0 | |
| 58 | 09-16 18:17:24 | notification_opened | push | push | title movie-860508 | ba8b0485… | ios | 9d9e · 1ef0 | type leaving_soon (P2, cold) |
| 59 | 09-16 18:18:10 | preview_fetched | share | push | title movie-860508 | | other | crawler | agent imessage |
| 60 | 09-16 18:18:11 | share_initiated | share | push | title movie-860508 | | ios | 9d9e · 1ef0 | moment leaving_soon |
| 61 | 09-16 18:18:12 | preview_fetched | share | push | title movie-860508 | | other | crawler | agent whatsapp |
| 62 | 09-16 18:18:15 | share_completed | share | push | title movie-860508 | | ios | 9d9e · 1ef0 | moment leaving_soon, to WhatsApp |
| 63 | 09-16 18:26:23 | share_initiated | share | organic | title movie-860508 | | ios | 9d9e · 1ef0 | S4-10: 8 min after leaving the app, organic |
| 64 | 09-16 18:26:24 | preview_fetched | share | | title movie-860508 | | other | crawler | agent imessage |
| 65 | 09-16 18:26:26 | preview_fetched | share | | title movie-860508 | | other | crawler | agent whatsapp |
| 66 | 09-16 18:29:33 | notification_opened | push | push | | | ios | 9d9e · 1ef0 | type bundle (P3), delivery null |
| 67 | 09-17 08:51:49 | link_opened | share | push | title movie-860508 | | ios | 9d9e (signed out) | A4b |
| 68 | 09-17 08:53:14 | link_opened | share | | title movie-550 | | ios | 9d9e (signed out) | C3 |
| 69 | 09-17 08:53:58 | link_opened | share | | title movie-550 | | ios | 9d9e (signed out) | C3 |
| 70 | 09-17 08:55:43 | signup_completed | | | title movie-550 | | ios | 9d9e · 625b | touch link (first touch was the A2 bare link, so via null) |

## Push deliveries (notification_deliveries, joegreenwas)

| id | type | title | service | sent (original) | status |
|---|---|---|---|---|---|
| 0bc6e650… | arrival | Inside Man (movie-388) | netflix | 09-16 18:10:03 (moved back 21h for P2 cap) | ok |
| ba8b0485… | leaving_soon | The Whisper Man (movie-860508) | netflix | 09-16 18:17:07 (moved back 21h for P3 cap) | ok |
| b9e9d5fc… / aa803816… | arrival (bundle) | The Order (movie-1082195), Lucky (tv-278624) | prime, apple | 09-16 18:29:11 | ok |

Seeds left in place: `streaming_history` 115700 (s5-seed-p1), 115701 and 115702 (s5-seed-p3). The P2 `expires_on` on `streaming_availability` 28c65a57… was restored to null at 18:27 UTC. Shared room created: `75b161d4-a189-4dc8-b672-ced0c8f700d4` (anchor, "Gotham's Gritty Legacy", 30 titles).

## After the snapshot (from other tables and logs)

- C4: `joegreenwas+confirm@gmail.com` created 09:16:00, confirmation sent 09:16:00, confirmed 09:16:13 (Confirm email on); onboarding services saved match the selection (bbc, disney, hbo, netflix, paramount, prime).
- C5: Apple account `7119b48a…` signed in 09:17:23, onboarding finished 09:17:43, a function booted 09:18:41, `delete_own_account` returned 204 at 09:18:43; auth user and profile gone. The install-scoped delete removed rows 16 onward.
