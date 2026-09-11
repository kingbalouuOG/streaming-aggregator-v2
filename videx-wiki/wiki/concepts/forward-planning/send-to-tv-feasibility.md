---
title: Send to TV — feasibility (forward-planning)
type: concept
tags: [forward-planning, parked, deep-links, smart-tv, roku, android-tv, webos, tizen, apple-tv, matter-casting, local-network]
status: parked — recommended 2026-09-11, Joe not yet decided; not on Roadmap v1.1; revisit triggers below
horizon: H2+ (post user-track / search-track)
created: 2026-09-11
updated: 2026-09-11
sources:
  - docs/strategy/briefs/send-to-tv-feasibility.md (repo; not yet snapshotted into raw/)
related:
  - wiki/entities/streaming-services/uk-services.md
  - wiki/concepts/domain/uk-streaming-market.md
  - wiki/concepts/domain/justwatch.md
  - wiki/sources/strategy-roadmap-2026-07.md
  - wiki/registers/deferred-items.md
---

# Send to TV — feasibility

> **Status: parked.** Researched 2026-09-11 by five parallel agents (Roku; Android TV + Fire TV; Samsung + LG; Apple TV + DIAL + Matter Casting + competitors; React Native implementation). Full write-up with sources: `docs/strategy/briefs/send-to-tv-feasibility.md`. Not on [Roadmap v1.1](../../sources/strategy-roadmap-2026-07.md). Do not re-run the research; update this page if a trigger below fires.

## The idea

A title page gets a "Send to TV" button. The phone finds the TV on the home Wi‑Fi, the TV opens the streaming app, and the app lands on that title. Extends the existing phone deep links (see [UK services](../../entities/streaming-services/uk-services.md)).

## Verdict

- Technology exists and is in daily use (remote-control apps, Home Assistant), but it is **per TV platform, not per streaming service**, LAN-only, and mostly reverse-engineered with a pairing prompt on the TV.
- **"Open the app on the TV"** is achievable on Roku, Google TV, Samsung, LG, Apple TV. Not on Fire TV, Sky Glass/Stream/Q, Virgin 360, Freely (no third-party API; Sky alone ≈24% of UK connected TVs).
- **"Open the app on this title"** is proven only for: Netflix on LG (plain title id as `contentId`, reconfirmed 2026-08), several services on Apple TV (Companion `launch_app(url)` with the web URL), Disney+ on Roku (web GUID as `contentId`). Everything else is unverified or negative.
- No cross-platform standard rescues it before ~2028. DIAL is moribund (Netflix + YouTube only, title parameter unverified). Matter Casting is the right design but Amazon-only on the receiver side and each content app must whitelist the client's Vendor ID; Netflix/Disney+/Max have not adopted it.
- Netflix removed phone casting to almost every TV in 2025-11/12; ad-tier cannot cast at all. Treat Netflix as the service most likely to break.
- Effort: Roku-only spike 1.5–2 eng-weeks; + Google TV/LG/Samsung 8–12 total; + Apple TV +3–5 (high breakage risk per tvOS release).

## Platform matrix

UK reach = Ofcom/Omdia active-device share, 2024-12 (Sky Q 24 · Google/Android TV 14 · Samsung 13 · LG 8 · Fire OS 7 · Virgin 5 · Roku 4 · Apple 1). Ad-traffic shares (Pixalate) rank Fire TV and Roku far higher but measure minutes, not households.

| Platform | Reach | Protocol | Status | App launch | Title launch | Pairing | Main risk |
|---|---|---|---|---|---|---|---|
| Roku | 4% | ECP: SSDP + `POST /launch/<ch>?contentId=…&mediaType=…` | Official, documented | Yes | Disney+ only (web GUID). YouTube broke 2024-12. Netflix/Prime/Apple: no working public example. UK broadcasters: unknown. | None | ECP terms forbid mobile-app senders; OS 14.1 (2024-12) defaults "Control by mobile apps" to Limited. `/launch` appears allowed under Limited (> ⚠ unverified on device); keypress/PowerOn blocked. |
| Android TV / Google TV | 14% | Remote v2: mDNS `_androidtvremote2._tcp` + TLS + protobuf `RemoteAppLinkLaunchRequest` | Reverse-engineered; Google's own app uses it | Yes, all major apps | Unproven. `netflix.com/title/<id>` opened Netflix, not the title (HA core #133865, 2024-12). Depends on each TV app's intent filters. | 6-digit PIN once | Google changed launch behaviour 2026-08 (package-name launches broke). Fire TV excluded. |
| Samsung Tizen | 13% | wss:8002 `ed.apps.launch` `DEEP_LINK` + `metaTag` | Reverse-engineered | Yes (app ids known for Netflix, Prime, Disney+, Apple TV, iPlayer, ITVX, All 4, NOW, Discovery+, Max) | No. `metaTag` ignored on Tizen 9 for Netflix/Disney+; no verified example for any service. | "Allow" popup; newer sets prompt every connection unless user changes a setting | Firmware updates have removed `ed.apps.launch` on a 2023 set. SmartThings cloud launches apps, no content param. |
| LG webOS | 8% | SSAP wss:3001 `system.launcher/launch {id, contentId}` | Semi-official (Connect SDK dormant) | Yes, 2017–2025 sets | Netflix yes; YouTube yes; Prime/Disney+/Apple TV+/iPlayer/ITVX nothing documented. | PROMPT once | Self-signed cert on 3001; per-model-year wake-on-LAN setting. |
| Apple TV | 1% | Companion Link: mDNS `_companion-link._tcp`, HAP-style pairing, `launch_app(url)` | Reverse-engineered (pyatv); Swift client shipped on App Store 2026-02 (Itsytv) | Yes | Yes by URL (Netflix, Disney+, Apple TV+, HBO Max documented). Uses the URLs Videx already stores. | PIN once | Broke on tvOS 18.4 (2025-03, fixed 4 months later); pyatv compat changes again 2026-06. No JS/RN port of the pairing crypto. |
| Fire TV | 7% | ADB (dev mode), Fling (ended 2026-03), DIAL, Matter Casting | — | Not for consumers | No | — | Matter Casting needs CSA cert + per-app Vendor ID whitelist; Prime Video/Tubi only. Blocked without a partnership. |
| Sky / Virgin / Freely | ~29% | Proprietary | — | No | No | — | No API. Sky's 2025-11 remote app is mTLS with keys in the APK; the HA reverse-engineering has no app launch. |

## What Videx already holds

`streaming_availability.deep_link_url` carries a service-native id on every linked row (checked 2026-09-11): Netflix title id, Apple `umc.cmc.*`, Disney+ `browse/entity-<GUID>`, Prime ASIN, NOW programme id, plus slugs/GUIDs for iPlayer, ITVX, Channel 4, Paramount+, Pluto, HBO Max, MUBI, Discovery+, Crunchyroll. This solves the data problem for the URL-accepting platforms (Apple TV, Android TV). It does **not** help Roku, Samsung or LG, whose launch parameters are per-app conventions unrelated to the web URL — that per-platform × per-service launch-descriptor catalogue is the real product risk, and is why [JustWatch](../domain/justwatch.md) and Reelgood only ever shipped Roku.

## Implementation notes (RN / Expo 56)

- iOS SSDP needs the restricted multicast entitlement (`com.apple.developer.networking.multicast`, Apple form). Workaround: browse Bonjour types the TVs already advertise (`_androidtvremote2._tcp`, `_companion-link._tcp`, `_airplay._tcp` + manufacturer string for Samsung/LG, `_hap._tcp` for HomeKit Rokus) and confirm with a unicast HTTP probe. Older sets need manual IP entry.
- Permissions: iOS `NSLocalNetworkUsageDescription` + exact `NSBonjourServices` list (denial fails silently; iOS 18 flakiness reports). Android `NEARBY_WIFI_DEVICES` now; `ACCESS_LOCAL_NETWORK` mandatory runtime permission at targetSdk 37 (Android 17). Cleartext HTTP to LAN needs a scoped network security config.
- RN's built-in WebSocket cannot accept self-signed certs (LG 3001, Samsung 8002, Android TV). `react-native-tcp-socket` 6.4 can, with client certs. Recommended shape: a small local Expo module exposing Bonjour browse, TLS-permissive socket, permission probe; protocol logic in TS. iOS iteration goes through EAS CI (no local iOS build on Windows).
- Backend has no role in the protocols (all LAN). The Worker could host the launch-descriptor catalogue so mappings change without an app release.
- `native/app.json` currently has no `NSBonjourServices`, no entitlements, no networking libs beyond axios — everything is net-new.

## Recommendation (as filed 2026-09-11)

1. Not on v1.1. Users are the critical path; this competes with the user and search tracks for the same weeks. Park as H2+.
2. If revisited, reframe as **"Open on TV"** with title-level a bonus where proven; fall back to "we opened Netflix on your TV".
3. Before any app code: a 2-day bench test with one Google TV device and one LG set, using Home Assistant (implements every protocol above) to test Videx's stored URLs/ids per app. Produces the launch-descriptor matrix for free. Roku via `roku-ecp-sniffer` capturing what Roku's own app sends.
4. Cheap adjacent win needing no technology: phone deep link + the TV app's Continue Watching row already gives the handoff; onboarding copy could say so.

## Revisit triggers

- Matter Casting adopted by any of Samsung, LG, Google, Netflix, Disney+ (receiver or content side).
- Google formalises/documents the Android TV Remote protocol, or a verified title-level app-link matrix appears.
- Videx has an installed base that justifies delight features (Premium band, ~5–8K MAU per Roadmap v1.1).
- A partnership route to a TV platform or to Netflix/Disney+ opens.
