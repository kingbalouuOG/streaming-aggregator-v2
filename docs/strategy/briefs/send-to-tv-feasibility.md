# Send to TV — feasibility assessment

**Date:** 2026-09-11 · **Status:** research only, no decision taken · **Asked by:** Joe · **Method:** five parallel research agents (Roku; Android TV + Fire TV; Samsung + LG; Apple TV + DIAL + Matter Casting + competitors; React Native implementation), plus a check of what identifiers the `streaming_availability` table already holds.

The idea: a title page in Videx gets a "Send to TV" button. The phone finds the TV on the home Wi‑Fi, the TV opens the streaming app, and the app lands on that title.

---

## Verdict in one paragraph

The technology exists and is in daily use by remote-control apps and Home Assistant, but it is **per TV platform**, not per streaming service, and it is **LAN-only** with pairing prompts on most TVs. "Open the right app on the TV" is achievable on every major platform except Fire TV and Sky boxes. "Open the right app **on this title**" is proven today only for a short list of platform × service pairs, with Netflix on LG webOS and the deep-link platforms (Apple TV, Roku via Disney+) the only ones with credible current evidence. Every route to Netflix, Prime, Disney+ and Apple TV+ is either reverse-engineered or an OS feature the service can quietly ignore, and Netflix's late-2025 retreat from phone casting shows the direction of travel. No cross-platform standard makes this tractable before ~2028. It is a 2–12 engineer-week feature depending on scope, and it does not fit the v1.1 roadmap's user-track priorities. Recommendation at the end.

---

## What Videx already has

The availability table holds an exact, service-native identifier for every row with a link (checked 2026-09-11):

| Service | Rows | Identifier in the link |
|---|---|---|
| Prime | 58,562 | Amazon ASIN (`amazon.co.uk/gp/video/detail/<ASIN>`) |
| Apple TV+ | 20,773 | `umc.cmc.*` ID |
| Netflix | 9,279 | Netflix title ID (`netflix.com/title/<id>`) |
| Disney+ | 3,855 | `browse/entity-<GUID>` |
| NOW | 2,147 | NOW programme ID |
| Crunchyroll, Channel 4, BBC iPlayer, Paramount+, Pluto, ITVX, HBO Max, MUBI, Discovery+ | 146–1,510 each | slugs / GUIDs |

This matters because the data problem that blocks most third parties (JustWatch and Reelgood only ever got Roku working, and only where they had partner IDs) is already solved for the two platforms that accept ordinary https deep links (Apple TV, Android TV). It is **not** solved for Roku, Samsung or LG, whose launch parameters are per-app conventions that have nothing to do with the web URL.

---

## Platform-by-platform

Reach figures are UK active-device share from Ofcom/Omdia's Dec 2024 connected-TV platform report (Sky Q 24%, Google/Android TV 14%, Samsung 13%, LG 8%, Fire OS 7%, Virgin 5%, Roku 4%, Apple 1%). Ad-traffic measures (Pixalate Q3 2025) put Fire TV and Roku much higher, but those measure viewing minutes, not households.

| Platform | UK reach | Protocol | Status | Open the app | Open the title | Pairing UX | Main risk |
|---|---|---|---|---|---|---|---|
| **Roku** | ~4% | ECP: SSDP + HTTP POST `/launch/<ch>?contentId=…` | Official, documented | Yes | Only Disney+ has a credible public contentId format (web GUID). YouTube's broke Dec 2024. Netflix/Prime/Apple TV: no working public example, some negative reports. UK broadcasters: unknown. | None | Roku's ECP terms say mobile apps may not send ECP; OS 14.1 (Dec 2024) added a "Control by mobile apps" setting defaulting to Limited. `/launch` appears still allowed under Limited (unverified on-device); keypresses and PowerOn are not. |
| **Android TV / Google TV** (Sony, TCL, Hisense, Philips, Chromecast/Streamer, Shield) | ~14% | Android TV Remote v2: mDNS + TLS + protobuf, `RemoteAppLinkLaunchRequest(app_link)` | Reverse-engineered, stable since 2023, Google's own app uses it | Yes, every major app | **Unproven.** Passing `netflix.com/title/<id>` opens Netflix but not the title in the one documented test (Dec 2024). Whether a URL resolves is up to each TV app's intent filters; nobody has published a verified title-level matrix. | 6-digit PIN on TV, once | Google changed behaviour Aug 2026 (package-name launches broke). Fire TV excluded (no Remote Service). |
| **Samsung Tizen** | ~13% | WebSocket wss:8002 `ed.apps.launch` with `DEEP_LINK` + `metaTag` | Reverse-engineered | Yes (app IDs known for Netflix, Prime, Disney+, Apple TV, iPlayer, ITVX, All 4, NOW, Discovery+, Max) | **No.** No verified example of `metaTag` opening a title for any service; Tizen 9 (2025 sets) ignores it for Netflix/Disney+. DIAL launch of Netflix with a `m=…/watch/<id>` body claimed by one project, unconfirmed. | "Allow" popup on TV; newer sets prompt every connection unless the user changes a setting | A 2023 set lost `ed.apps.launch` after a firmware update. Official SmartThings cloud API launches apps but takes no content parameter. |
| **LG webOS** | ~8% | SSAP WebSocket wss:3001 `system.launcher/launch {id, contentId}` | Semi-official (LG Connect SDK dormant but still LG's stated answer) | Yes, 2017–2025 sets | **Netflix yes** (plain title ID as `contentId`, re-confirmed Aug 2026). YouTube yes. Prime, Disney+, Apple TV+, iPlayer, ITVX: nothing documented. | PROMPT on TV, once | Self-signed cert on 3001; per-model-year wake-on-LAN settings. |
| **Apple TV** | ~1% (higher among likely early adopters) | Companion Link: mDNS + HAP-style pairing, `launch_app(url)` | Reverse-engineered (pyatv); a Swift implementation shipped on the App Store in Feb 2026 (Itsytv) | Yes | **Yes, by URL.** pyatv documents deep-linking Netflix, Disney+, Apple TV+, HBO Max by their web URL, and tvOS routes it to the app. Strongest title-level evidence of any platform, and uses the exact URLs Videx already holds. | PIN on TV, once | Broke on tvOS 18.4 (Mar 2025), fixed 4 months later; pyatv shipped compatibility changes again Jun 2026. Expect breakage per tvOS release. Crypto port to mobile is 3–5 weeks alone. |
| **Fire TV** | ~7% | ADB (developer mode only), Fling SDK (ended Mar 2026), DIAL, Matter Casting | — | Not for consumers | No | — | Matter Casting is the sanctioned route but each content app must whitelist the client's Vendor ID; Prime Video and Tubi support it, Netflix/Disney+/Max do not. Blocked without a partnership. |
| **Sky Glass / Stream / Q, Virgin 360, Freely** | ~29% | Proprietary | — | No | No | — | No third-party API exists. Sky's Nov 2025 remote app uses mTLS with keys in the APK; reverse-engineered HA integration has no app launch. |

### Cross-cutting facts

- **Netflix is retreating.** In Nov/Dec 2025 Netflix removed casting from its phone app to almost every TV and streamer, keeping only remote-less Chromecasts and Nest Hubs, and ad-tier plans cannot cast at all. TV-side launches (ECP, app links, Companion) are OS features Netflix cannot easily block, but nothing in Netflix's terms permits third-party launches either. Design for Netflix as the service most likely to break.
- **No standard rescues this.** DIAL is moribund (Netflix + YouTube only, title parameter unverified). Matter Casting is the right design but is Amazon-only on the receiver side and opt-in per content app. Realistic UK usefulness: 2028 or later.
- **Precedents are thin.** Reelgood Remote (2020) and JustWatch "Watch on TV" both do Roku-only ECP. Google TV's "Watch on TV" is Google Cast and only reaches apps that opt in. The only project attempting title-level launch across platforms (smartest-tv, Apr 2026, 48 stars) gets Netflix on LG/DIAL and "just opens the app" for everything else.
- **Wake-from-off is a separate problem.** LG and Samsung need a user-enabled wake-on-LAN setting; Roku PowerOn is blocked under the new Limited default; Apple TV and Google TV vary. The "if the TV is on" framing in the original idea is the right one.

---

## Implementation notes (React Native / Expo 56)

- **Discovery on iOS.** SSDP needs the restricted `com.apple.developer.networking.multicast` entitlement (Apple form, days to weeks). The workaround is to browse Bonjour types the TVs already advertise (`_androidtvremote2._tcp`, `_companion-link._tcp`, `_airplay._tcp` with a Samsung/LG manufacturer string, `_hap._tcp` for HomeKit-capable Rokus) and confirm with a unicast HTTP probe. Older Roku/LG/Samsung sets then need manual IP entry.
- **Permissions.** iOS: `NSLocalNetworkUsageDescription` + an exact `NSBonjourServices` list; the prompt fails silently if denied and iOS 18 has flakiness reports. Android: `NEARBY_WIFI_DEVICES` now, `ACCESS_LOCAL_NETWORK` becomes a mandatory runtime permission at target SDK 37 (Android 17). Cleartext HTTP to LAN IPs needs a scoped network security config.
- **Transport.** RN's built-in WebSocket cannot accept self-signed certs (needed for LG 3001, Samsung 8002, Android TV). `react-native-tcp-socket` 6.4 can, with client-cert support, but the existing Android TV Remote RN port needed patches. Recommended shape: a small local Expo module exposing three primitives (Bonjour browse, TLS-permissive socket, permission probe) with all protocol logic in TypeScript. iOS iteration goes through EAS CI since there is no local iOS build on Windows.
- **Existing libraries.** Roku: trivial (`fetch`). LG: rewrite ~300 lines of `lgtv2` on a permissive WS. Samsung: same, undocumented JSON. Android TV: stale RN port to harden. Apple TV: no RN/JS port of the pairing crypto; the Swift `itsytv-core` is the closest starting point.
- **Backend role.** None for the protocols (all LAN). The Worker could host a launch-descriptor catalogue (per platform × service: app ID, parameter convention) so mappings can be fixed without an app release. That catalogue is the real product risk.

| Scope | Engineer-weeks | Maintenance risk |
|---|---|---|
| (a) Roku-only spike behind a flag: Bonjour + probe, ECP launch, permission UX | 1.5–2 | Low protocol risk; Roku policy and Limited-mode risk; ~4% UK reach |
| (b) Add Android TV, LG, Samsung: native TLS module, three pairing flows, four-TV test bench | 8–12 total | Medium; reverse-engineered on two of three |
| (c) Add Apple TV Companion | +3–5 | High; breaks with tvOS point releases |

---

## Recommendation

1. **Do not put this on the v1.1 roadmap.** The thesis is that users are the critical path; this is a delight feature for an installed base that does not yet exist, on a codebase with no local-network plumbing, and it competes with the user track and search track for the same engineer-weeks. Park it as an H2+ candidate.
2. **Reframe the feature as "Open on TV", not "Play on TV".** App-level launch is achievable on Roku, Google TV, Samsung and LG with one pairing prompt each. Title-level launch is a bonus where it works (LG + Netflix, Apple TV + several, Roku + Disney+) and should be presented as such, falling back to "we opened Netflix on your TV" rather than promising the title.
3. **If a spike is ever run, start with a 2-day bench test, not code.** Buy or borrow one Google TV device and one LG set, and use Home Assistant (which already implements every protocol above) to test which of Videx's stored URLs and IDs open a title on which app. That produces the launch-descriptor matrix for free and tells you whether the feature is worth building before a line of app code is written. Roku can be tested the same way with `roku-ecp-sniffer` capturing what Roku's own app sends.
4. **Watch two signals.** Matter Casting adoption beyond Amazon (any of Samsung, LG, Google, Netflix, Disney+ joining would change the picture), and whether Google formalises the Android TV Remote protocol after the Aug 2026 changes.
5. **The cheap related win** is not this feature at all: Videx's existing deep links already open the title on the phone, and every major TV app supports Continue Watching. The user experience "find on phone, press play, then pick it up from Continue Watching on the TV" needs no new technology and could be explained in onboarding copy.

---

## Sources (selection; full citations in the agent transcripts of 2026-09-11)

- Roku ECP docs: developer.roku.com/dev/docs/external-control-api · OS 14.1 lockdown: lowpass.cc/p/roku-remote-control-apps-not-working; home-assistant.io issue 36240
- Android TV Remote v2: github.com/tronikos/androidtvremote2; HA deep-link guide community.home-assistant.io/t/567921; HA core issue 133865 (Netflix title URL opens app only)
- Samsung: github.com/xchwarze/samsung-tv-ws-api (APPLICATIONS.md); github.com/Hybirdss/smartest-tv docs/reference/deep-link-support.md
- LG: github.com/hobbyquaker/lgtv2 issue 25 (Netflix contentId, Aug 2026 confirmation); github.com/home-assistant-libs/aiowebostv
- Apple TV: pyatv.dev/development/apps; github.com/postlund/pyatv issue 2656 (tvOS 18.4 break); itsytv.app (App Store Companion client, Feb 2026)
- Netflix casting removal: help.netflix.com/en/node/49; androidauthority.com/netflix-casting-chromecast-google-tv-streamer-3620784
- Matter Casting: developer.amazon.com/docs/fire-tv/overview-of-matter-casting.html; …/matter-casting-app-attestation.html (Vendor ID whitelist)
- UK platform share: informitv.com/2024/12/05/united-kingdom-connected-television-market (Ofcom/Omdia)
- iOS multicast entitlement: developer.apple.com/forums/thread/663875 · Android local network permission: developer.android.com/privacy-and-security/local-network-permission
