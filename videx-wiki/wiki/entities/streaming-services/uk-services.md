---
title: UK streaming services (10 supported)
type: entity
tags: [streaming-services, uk, netflix, prime, disney, apple, now, paramount, itvx, channel4, bbc, skygo]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/streaming-services/uk-services-reference.md
related:
  - wiki/entities/apis/tmdb.md
  - wiki/entities/apis/streaming-availability-api.md
  - wiki/concepts/architecture/service-fingerprints.md
  - wiki/concepts/operations/solutions/sa-api-uk-service-coverage-gaps.md
---

# UK streaming services (10 supported)

Master reference. Each entry: TMDb provider ID, SA API slug, deep link strategy, pricing tiers, brand colour, content category, gaps. Pricing reviewed quarterly per IN-XPS-007. Last verified April 2026.

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

## Per-service summary

### Netflix

TMDb 8 / SA `netflix` / `#E50914`. Tiers: Std with Ads £4.99, Std £10.99, Premium £17.99. Variant: Std with Ads = TMDb 1796 → 8. Originals, films, licensed series, strong global catalogue.

### Amazon Prime Video

TMDb 9 / SA `prime` / `#00A8E1`. Monthly £8.99, Annual ~£7.92 (£95/yr). Ad-supported tier shipped Jan 2024. Variants: Amazon Video (rent/buy 10) → 9; Prime with Ads (2100) → 9. Originals, films, sports add-ons (Channels), rent/buy storefront.

### Apple TV+

TMDb 350 / SA `apple` / `#000000`. Std £8.99, Apple One bundle £18.95. Variant: Apple iTunes (rent/buy 2) → 350. Premium originals only; small but high-budget catalogue.

### Disney+

TMDb 337 / SA `disney` / `#113CCF`. Std with Ads £4.99, Std £7.99, Premium £10.99. Variant: Disney+ Basic with Ads (1899) → 337. Disney, Pixar, Marvel, Star Wars, Star.

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

## Cross-cutting

- Service detection (logos on cards) uses TMDb `watch/providers` exclusively; SA API is consulted only for deep link generation.
- Ad-tier and rent/buy variant mapping in `lib/constants/platforms.ts` (`PROVIDER_ID_VARIANTS`).
- Network-name fallback (`NETWORK_TO_PROVIDER_ID`) used only when `watch/providers` is empty and title has a `network` field. Useful for new titles where JustWatch data has not propagated.
