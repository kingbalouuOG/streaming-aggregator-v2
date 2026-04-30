---
title: TMDb API Reference
generated: 2026-04-26
source: https://developer.themoviedb.org/reference/intro/getting-started
client: src/lib/api/tmdb.ts
---

# TMDb API Reference (Videx slice)

The Movie Database API is the primary source for content metadata, search, discover, and watch-provider availability detection across all 10 UK services.

## Auth

- v3 API key (`VITE_TMDB_API_KEY`). Bundled into client; rate-limited per IP.
- Auth via query parameter `api_key=<key>` or header `Authorization: Bearer <v4-token>` (Videx uses v3 query-param form).

## Base URL

```
https://api.themoviedb.org/3
```

## Endpoints used by Videx

### `/discover/movie`, `/discover/tv`

Filterable catalogue queries. Powers Browse, genre rows, per-service charts, and bulk sync seed data.

Common parameters used:
- `with_genres=<comma>`
- `with_watch_providers=<provider_ids>` (UK provider IDs from `platforms.ts`)
- `watch_region=GB`
- `sort_by=popularity.desc` | `vote_average.desc` | `release_date.desc`
- `vote_count.gte=<n>` (used to gate Critically Acclaimed row)
- `with_original_language=en` | omit for global
- `page=<1..500>` — cap; pagination beyond 500 is rejected

### `/search/movie`, `/search/tv`, `/search/multi`

Free-text title search. Used by `useSearch` (debounced).

### `/movie/{id}`, `/tv/{id}`

Detail endpoint. Returns title, overview, runtime, genres, popularity, release_date.

`append_to_response` query param folds extra payloads into one call:
- `credits` — cast and crew (used to populate `cast_top_5`, `director`).
- `keywords` — keyword tags (joined into embedding template).
- `recommendations` — TMDb's recommendations.
- `watch/providers` — availability per region.
- `videos` — trailers.
- `release_dates` — content rating (UK certification under `iso_3166_1: 'GB'`).

### `/movie/{id}/watch/providers`, `/tv/{id}/watch/providers`

Returns `{ results: { GB: { flatrate, rent, buy, ads, free } } }`. Each entry has `provider_id`, `provider_name`, `logo_path`.

Service detection logic (in `lib/adapters/platformAdapter.ts`):
1. Read `flatrate` (subscription).
2. Read `ads` and `free` (ad-supported / free tiers).
3. Apply `PROVIDER_ID_VARIANTS` to map ad-tier and rent/buy variants back to canonical IDs.
4. Fall back to `NETWORK_TO_PROVIDER_ID` (network-name lookup) when watch/providers is empty.

### `/genre/movie/list`, `/genre/tv/list`

Static genre list. Cached at build time via `lib/constants/genres.ts` rather than fetched at runtime.

### Image URLs

```
https://image.tmdb.org/t/p/{size}/{path}
```

Sizes used: `w92`, `w154`, `w185`, `w342`, `w500`, `w780`, `original`. Card grid uses `w342` for posters; detail hero uses `w780`.

## Quirks and gotchas

- **Discover pagination is region-aware.** `watch_region=GB` plus `with_watch_providers` returns substantially fewer titles than unfiltered global discover. Sync uses unfiltered discover and filters availability separately via SA API.
- **`watch/providers` lags release.** New TMDb titles often have empty `watch/providers` for days to weeks. Network-name fallback partly mitigates.
- **Provider IDs drift.** Variants (Netflix Standard with Ads = 1796, Disney+ Basic with Ads = 1899, ITV Hub = 41 → ITVX = 54) need ongoing maintenance in `PROVIDER_ID_VARIANTS`.
- **Rent/Buy aliases.** Amazon Video (10) maps to Prime (9); Apple iTunes (2) maps to Apple TV+ (350); Sky Store (130) maps to Now TV (39).
- **No bulk export.** Sync iterates discover with `popularity.desc` until target count reached.

## UK provider IDs used by Videx

```
Netflix (8), Amazon Prime Video (9), Apple TV+ (350), Disney+ (337),
Now TV / NOW (39), BBC iPlayer (38), ITVX (54), Channel 4 (103),
Paramount+ (582), Sky Go (29).
```

## Rate limits

- 50 requests / second per IP, 1M / day historically. Videx stays well under via client-side `cache.ts` and bulk-then-incremental sync.

## Attribution requirement

`docs/Attributions.md` carries the required line: "This product uses the TMDB API but is not endorsed or certified by TMDB." Logo must be displayed somewhere in the app per terms of use.
