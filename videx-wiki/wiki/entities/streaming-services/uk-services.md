---
title: UK streaming services (15 supported)
type: entity
tags: [streaming-services, uk, netflix, prime, disney, apple, now, paramount, itvx, channel4, bbc, skygo, hbo, discovery, crunchyroll, mubi, plutotv]
created: 2026-04-26
updated: 2026-09-10
sources:
  - raw/streaming-services/uk-services-reference.md
related:
  - wiki/entities/apis/tmdb.md
  - wiki/entities/apis/streaming-availability-api.md
  - wiki/concepts/architecture/service-fingerprints.md
  - wiki/concepts/operations/solutions/sa-api-uk-service-coverage-gaps.md
---

# UK streaming services (15 supported)

Master reference. Each entry: TMDb provider ID, SA API slug, deep link strategy, pricing tiers, brand colour, content category, gaps. Pricing reviewed quarterly per IN-XPS-007. The original ten were last verified April 2026; the wave-1 five were verified 10 September 2026.

Wave 1 (roadmap v1.1 item 1.5, shipped 10 Sept 2026) added HBO Max, Discovery+, Crunchyroll, MUBI and Pluto TV. This vault keeps one master page rather than a page per service, so the five are sections below, not new files.

## Index

| Slug | Display name | TMDb ID | SA API slug | Deep links via SA API |
|---|---|---|---|---|
| `netflix` | Netflix | 8 | `netflix` | yes |
| `prime` | Amazon Prime Video | 9 | `prime` | yes |
| `apple` | Apple TV+ | 350 | `apple` | yes |
| `disney` | Disney+ | 337 | `disney` | yes |
| `now` | NOW (Now TV) | 39 | `now` | yes |
| `paramount` | Paramount+ | 582 | `paramount` | yes |
| `itvx` | ITVX | 54 | `itvx` | yes |
| `channel4` | Channel 4 | 103 | `all4` | yes |
| `bbc` | BBC iPlayer | 38 | `iplayer` | **no** (catalogue empty) |
| `skygo` | Sky Go | 29 | (absent) | **no** (service absent) |
| `hbo` | HBO Max | 1899 | `hbo` | yes |
| `discovery` | Discovery+ | 524 | `discovery` | yes |
| `crunchyroll` | Crunchyroll | 283 | `crunchyroll` | yes |
| `mubi` | MUBI | 11 | `mubi` | yes |
| `plutotv` | Pluto TV | 300 | `plutotv` | yes |

Videx reuses the vendor's own slug for all five wave-1 ids, so the rows already sitting in `streaming_availability` needed no migration.

## Per-service summary

### Netflix

TMDb 8 / SA `netflix` / `#E50914`. Tiers: Std with Ads £4.99, Std £10.99, Premium £17.99. Variant: Std with Ads = TMDb 1796 → 8. Originals, films, licensed series, strong global catalogue.

### Amazon Prime Video

TMDb 9 / SA `prime` / `#00A8E1`. Monthly £8.99, Annual ~£7.92 (£95/yr). Ad-supported tier shipped Jan 2024. Variants: Amazon Video (rent/buy 10) → 9; Prime with Ads (2100) → 9. Originals, films, sports add-ons (Channels), rent/buy storefront.

### Apple TV+

TMDb 350 / SA `apple` / `#000000`. Std £8.99, Apple One bundle £18.95. Variant: Apple iTunes (rent/buy 2) → 350. Premium originals only; small but high-budget catalogue.

### Disney+

TMDb 337 / SA `disney` / `#113CCF`. Std with Ads £4.99, Std £7.99, Premium £10.99. Disney, Pixar, Marvel, Star Wars, Star.

> **Correction, 10 Sept 2026.** This entry used to read "Variant: Disney+ Basic with Ads (1899) → 337", matching a `PROVIDER_ID_VARIANTS` entry in the code. **TMDb provider 1899 is HBO Max, not a Disney+ ad tier** — checked against `/watch/providers/movie`, which carries no separate id for a Disney+ ad tier at all (122 Disney+, 337 Disney Plus, 508 DisneyNOW). The mapping was inert only while Videx ignored HBO Max; left in place it would have canonicalised every HBO Max availability into Disney+. Both the code entry and this line are removed.

### NOW (Now TV)

TMDb 39 / SA `now` / `#00E0FF`. Display: "NOW" (rebranded from "Now TV"). Entertainment £9.99, Cinema £9.99, both £14.99, Sports £34.99. Variants: "NOW" (591) → 39; Sky Store rent/buy (130) → 39. Sky-licensed content, HBO via Sky. Some titles have `expiresOn` set ("leaving soon").

### Paramount+

TMDb 582 / SA `paramount` / `#0064FF`. Single-tier UK £6.99. Variants: Paramount Plus, Paramount+ with SHOWTIME, Paramount+ Amazon Channel all normalise to 582. Paramount/CBS/Showtime catalogue.

### ITVX

TMDb 54 / SA `itvx` / `#000000`. Free (ad-supported) and Premium £5.99. Variants: ITV Hub legacy (41) → 54; ITVX Free (2087) → 54. ITV originals, free-to-air, US imports.

### Channel 4

TMDb 103 / SA `all4` (legacy "All 4") / `#0095D9`. Free only (ad-supported). Variants: All 4 (83) → 103; Channel 4 Free (1854) → 103. Channel 4, E4, More4, Film4 originals and acquired.

### BBC iPlayer

TMDb 38 / SA `iplayer` (**catalogue empty**) / `#FF0000`. Free (TV Licence required). SA API returns no entries; falls back to search URL `https://www.bbc.co.uk/iplayer/search?q={title}`. Service detection uses TMDb watch/providers. BBC One/Two/Three/Four/iPlayer/CBBC/CBeebies network names map to 38 via `NETWORK_TO_PROVIDER_ID`. Phase 2.5 backfilled 200 titles via TMDb watch/providers. Filed upstream issue with Movie of the Night.

### Sky Go

TMDb 29 / SA absent / `#0072C9`. Tiers: Essential £26, Stream £29 (Sky Go bundled with Sky TV subscription). Falls back to `https://www.sky.com/watch/search?term={title}`. Sky Atlantic / Sky One / Sky Max / Sky Arts network names map to provider 39 (NOW) via `NETWORK_TO_PROVIDER_ID`, **not** Sky Go (intentional — Sky-broadcast content surfaces on NOW for streaming). Phase 2.5 backfilled 200 titles via TMDb watch/providers.

### HBO Max

TMDb 1899 / SA `hbo` / `#991EEB`. Std with Ads £5.99, Std £9.99, Premium £14.99 (TNT Sports tiers £30.99 / £36.98 excluded as bolt-ons). Deep links are `https://play.hbomax.com/{movie|show}/{uuid}`. **No usable unauthenticated search route** — `hbomax.com/gb/en` exposes no search link signed out and `play.hbomax.com/search?q=` redirects to the marketing home page — so the fallback is a site-scoped Google search, the same treatment Sky Go gets. UK launch 26 March 2026. HBO, Max Originals, DC, Warner films.

### Discovery+

TMDb 524 / SA `discovery` / `#0271E5`. One UK plan: Entertainment £3.99 (the old Premium and Sports tiers are gone, the sport having moved to HBO Max's TNT Sports plans in the Warner Bros. Discovery restructure). Deep links are `https://www.discoveryplus.com/gb/en/shows/{slug}/{uuid}`. Search is gated behind sign-in, so the fallback is a site-scoped Google search. Factual, reality and real-life. **Thin fingerprint:** only 15 of its 140 titles clear `vote_count >= 50`, which is the genre, not a data fault.

### Crunchyroll

TMDb 283 / SA `crunchyroll` / `#FF5E00`. Fan £5.99, Mega Fan £6.99 (VAT inclusive). Deep links are `https://www.crunchyroll.com/series/{id}/{slug}`; search fallback `https://www.crunchyroll.com/search?q={title}` works signed out. Anime and simulcasts. Its catalogue is 1,502 entries of which Videx holds titles for only 71 — anime is badly under-represented in the Videx `titles` table.

### MUBI

TMDb 11 / SA `mubi` / `#001489`. MUBI £11.99, MUBI GO £18.99 (GO adds a weekly cinema ticket, so it is a tier rather than a bolt-on). Deep links are `https://mubi.com/films/{slug}` and `https://mubi.com/series/{slug}`; search fallback `https://mubi.com/en/search?query={title}`. Curated arthouse, a rotating selection rather than a fixed library — expect churn.

### Pluto TV

TMDb 300 / SA `plutotv` / `#FFF200`. Free and ad-funded, no paid tier. The only wave-1 service whose rows are `stream_type = 'free'`, so it joins BBC iPlayer, ITVX and Channel 4 in the "Free tonight" row and answers the *Free to watch* cost filter. Deep links are `https://pluto.tv/{region}/on-demand/{movies|series}/{id}`; the region segment self-corrects on redirect, so a stored `/gsa/` link resolves to `/gb_ie/` for a UK user.

## Cross-cutting

- Service detection (logos on cards) uses TMDb `watch/providers` exclusively; SA API is consulted only for deep link generation.
- Ad-tier and rent/buy variant mapping in `lib/constants/platforms.ts` (`PROVIDER_ID_VARIANTS`).
- **TMDb "<service> Amazon Channel" ids are deliberately not variants** (1825 HBO Max, 584 Discovery+, 1968 Crunchyroll, 201 MUBI). They describe a Prime add-on entitlement the user may not hold — the same surprise-paywall risk that keeps `stream_type = 'addon'` out of the per-service charts. All five wave-1 canonical ids return healthy GB discover counts unaided, so no variant is needed.
- **The five wave-1 services are absent from `NETWORK_TO_PROVIDER_ID` on purpose.** That map is a last-resort guess from a title's production network, and a wrong guess reads to the user as "it's on HBO Max" when it is not.
- **Sky Go stays unmodelled (wave 2).** The review floated aliasing it onto NOW's tiers. It is not a one-line mapping: NOW models its tiers as `addon` rows (Entertainment 1,484 · Cinema 201 · Hayu 156) on top of 287 plain subscription rows, so an alias needs a NOW-add-on ↔ Sky-pack correspondence and a notion of which pack the user holds, neither of which Videx has. Sky Go's own 262 rows are `tmdb-backfill`, a different source again.
- Network-name fallback (`NETWORK_TO_PROVIDER_ID`) used only when `watch/providers` is empty and title has a `network` field. Useful for new titles where JustWatch data has not propagated.
