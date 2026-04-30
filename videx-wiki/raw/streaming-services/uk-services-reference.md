---
title: UK Streaming Services Reference
generated: 2026-04-26
sources: [src/lib/constants/platforms.ts, src/lib/data/platformPricing.ts, docs/solutions/integration-issues/sa-api-uk-service-coverage-gaps.md]
last_pricing_verified: 2026-04
---

# UK Streaming Services Reference

Master reference for the 10 UK services Videx supports. Each entry covers TMDb provider IDs, SA API slug, deep link strategy, pricing tiers, brand colour, content category, and known gaps. Pricing reviewed quarterly per parking lot IN-XPS-007.

## Index

| Internal slug | Display name | TMDb ID | SA API slug | Deep links via SA API |
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

---

## Netflix

- **TMDb provider ID:** 8.
- **SA API slug:** `netflix`. Coverage: full UK catalogue.
- **Brand colour:** `#E50914`.
- **Tiers (UK, GBP/month):** Standard with Ads £4.99, Standard £10.99, Premium £17.99.
- **Free tier:** none.
- **Deep links:** SA API returns universal links of the form `https://www.netflix.com/title/{id}`. Native intent opens the Netflix app via Android App Links.
- **Variant IDs to canonicalise:** Netflix Standard with Ads = TMDb 1796 → 8.
- **Content category:** Originals, films, licensed series. Strong global catalogue.

## Amazon Prime Video

- **TMDb provider ID:** 9.
- **SA API slug:** `prime`.
- **Brand colour:** `#00A8E1`.
- **Tiers:** Monthly £8.99, Annual equivalent £7.92 (£95/year).
- **Free tier:** ad-supported tier shipped Jan 2024; Videx treats Amazon Prime Video with Ads (TMDb 2100) as canonical 9.
- **Deep links:** SA API returns `https://www.amazon.co.uk/gp/video/detail/{id}`. AppLauncher resolves to the Prime Video app on Android.
- **Variant IDs:** Amazon Video (rent/buy, TMDb 10) → 9; Prime with Ads (2100) → 9.
- **Content category:** Originals, films, sports add-ons (Channels), rent/buy storefront.

## Apple TV+

- **TMDb provider ID:** 350.
- **SA API slug:** `apple`.
- **Brand colour:** `#000000`.
- **Tiers:** Standard £8.99, Apple One bundle £18.95 (incl. Music + iCloud + Arcade).
- **Free tier:** none.
- **Deep links:** SA API returns `https://tv.apple.com/gb/show/...`. Native AppLauncher opens the TV app.
- **Variant IDs:** Apple iTunes (rent/buy, TMDb 2) → 350.
- **Content category:** Premium originals only; small but high-budget catalogue.

## Disney+

- **TMDb provider ID:** 337.
- **SA API slug:** `disney`.
- **Brand colour:** `#113CCF`.
- **Tiers:** Standard with Ads £4.99, Standard £7.99, Premium £10.99.
- **Free tier:** none.
- **Deep links:** SA API returns `https://www.disneyplus.com/movies/...` or `/series/...`. Android intent supported.
- **Variant IDs:** Disney+ Basic with Ads (TMDb 1899) → 337.
- **Content category:** Disney, Pixar, Marvel, Star Wars, Star (general entertainment).

## NOW (Now TV)

- **TMDb provider ID:** 39.
- **SA API slug:** `now`.
- **Display name:** "NOW" (rebranded from "Now TV").
- **Brand colour:** `#00E0FF`.
- **Tiers:** Entertainment £9.99, Cinema £9.99, Entertainment + Cinema £14.99, Sports £34.99.
- **Free tier:** none.
- **Deep links:** SA API returns `https://www.nowtv.com/...`. Some titles also have `expiresOn` set (NOW rotates content; useful for "leaving soon").
- **Variant IDs:** "NOW" string (TMDb 591) → 39; Sky Store rent/buy (TMDb 130) → 39.
- **Content category:** Sky-licensed content, HBO via Sky.

## Paramount+

- **TMDb provider ID:** 582.
- **SA API slug:** `paramount`.
- **Brand colour:** `#0064FF`.
- **Tiers:** Standard £6.99 (single tier in UK).
- **Free tier:** none.
- **Deep links:** SA API returns `https://www.paramountplus.com/gb/...`. Android intent supported.
- **Variant IDs:** "Paramount Plus", "Paramount+ with SHOWTIME", "Paramount+ Amazon Channel" all normalise to Paramount+.
- **Content category:** Paramount/CBS/Showtime catalogue.

## ITVX

- **TMDb provider ID:** 54.
- **SA API slug:** `itvx`.
- **Brand colour:** `#000000`.
- **Tiers:** Free (ad-supported), Premium £5.99.
- **Free tier:** yes (ad-supported).
- **Deep links:** SA API returns `https://www.itv.com/watch/...`. Resolves to ITVX app on Android.
- **Variant IDs:** ITV Hub (TMDb 41) → 54 (legacy brand); ITVX Free (TMDb 2087) → 54.
- **Content category:** ITV originals, free-to-air, US imports.

## Channel 4

- **TMDb provider ID:** 103.
- **SA API slug:** `all4` (legacy brand name "All 4").
- **Brand colour:** `#0095D9`.
- **Tiers:** Free only.
- **Free tier:** yes (ad-supported); no paid tier.
- **Deep links:** SA API returns `https://www.channel4.com/programmes/...`. Android intent supported.
- **Variant IDs:** All 4 (TMDb 83) → 103; Channel 4 Free (TMDb 1854) → 103.
- **Content category:** Channel 4, E4, More4, Film4 originals and acquired.

## BBC iPlayer

- **TMDb provider ID:** 38.
- **SA API slug:** `iplayer` — **catalogue empty**.
- **Brand colour:** `#FF0000`.
- **Tiers:** Free (TV Licence required).
- **Free tier:** yes (TV Licence funded).
- **Deep links:** SA API returns no entries. Videx falls back to a search URL: `https://www.bbc.co.uk/iplayer/search?q={title}`. Service detection uses TMDb watch/providers.
- **Variant IDs:** BBC One/Two/Three/Four/iPlayer/CBBC/CBeebies network names all map to provider 38 via `NETWORK_TO_PROVIDER_ID`.
- **Known issue:** Filed upstream issue with Movie of the Night re catalogue. See `docs/solutions/integration-issues/sa-api-uk-service-coverage-gaps.md`.

## Sky Go

- **TMDb provider ID:** 29.
- **SA API slug:** none — **service absent from SA API**.
- **Brand colour:** `#0072C9`.
- **Tiers:** Essential £26.00, Stream £29.00 (Sky Go is bundled with Sky TV subscription).
- **Free tier:** none.
- **Deep links:** Videx falls back to: `https://www.sky.com/watch/search?term={title}`. Service detection uses TMDb watch/providers.
- **Variant IDs:** Sky Atlantic / Sky One / Sky Max / Sky Arts network names map to provider 39 (NOW) via `NETWORK_TO_PROVIDER_ID`, **not** Sky Go. This is intentional — Sky-broadcast content tends to surface on NOW for streaming.

---

## Cross-cutting notes

- Service detection (which logos to show on a card) uses TMDb watch/providers exclusively; SA API is only consulted when generating a deep link.
- For ad-tier and rent/buy variants, see `PROVIDER_ID_VARIANTS` in `lib/constants/platforms.ts` for the canonical mapping.
- Network-name fallback (e.g. "BBC One" → 38) is used only when watch/providers is empty and the title has a `network` field from TMDb. Useful for new titles where JustWatch data has not propagated.
- Pricing reviewed quarterly. Last verified April 2026. Source: each provider's UK pricing page.
