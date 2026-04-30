---
title: TMDb (The Movie Database)
type: entity
tags: [api, tmdb, content-metadata, providers]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/api-references/tmdb-api-reference.md
related:
  - wiki/entities/apis/omdb.md
  - wiki/entities/apis/streaming-availability-api.md
  - wiki/entities/codebase/database-schema.md
  - wiki/entities/codebase/module-map.md
  - wiki/entities/streaming-services/uk-services.md
---

# TMDb

Primary source for content metadata, search, discover, and watch-provider availability detection across all 10 UK services.

## Auth and base

- v3 API key (`VITE_TMDB_API_KEY`). Bundled into client; rate-limited per IP.
- Auth via query parameter `api_key=<key>`.
- Base URL: `https://api.themoviedb.org/3`.

## Endpoints used

| Endpoint | Purpose |
|---|---|
| `/discover/movie`, `/discover/tv` | Filterable catalogue. Powers Browse, genre rows, per-service charts, bulk sync seed data. Caps at page 500. |
| `/search/movie`, `/search/tv`, `/search/multi` | Free-text search. Used by `useSearch`. |
| `/movie/{id}`, `/tv/{id}` | Detail. Folded with `append_to_response=credits,keywords,recommendations,watch/providers,videos,release_dates`. |
| `/movie/{id}/watch/providers`, `/tv/{id}/watch/providers` | Per-region availability. `results.GB.{flatrate,rent,buy,ads,free}`. |
| `/genre/movie/list`, `/genre/tv/list` | Static genre list. Cached at build time in `lib/constants/genres.ts`. |

## Image URLs

`https://image.tmdb.org/t/p/{size}/{path}`. Sizes used: `w92`, `w154`, `w185`, `w342`, `w500`, `w780`, `original`. Card grid uses `w342`; detail hero uses `w780`.

## Service detection

Lives in `lib/adapters/platformAdapter.ts`:

1. Read `flatrate` (subscription).
2. Read `ads` and `free`.
3. Apply `PROVIDER_ID_VARIANTS` to map ad-tier and rent/buy variants to canonical IDs.
4. Fall back to `NETWORK_TO_PROVIDER_ID` (network-name lookup) when `watch/providers` is empty.

## UK provider IDs

```
Netflix (8), Amazon Prime Video (9), Apple TV+ (350), Disney+ (337),
NOW (39), BBC iPlayer (38), ITVX (54), Channel 4 (103),
Paramount+ (582), Sky Go (29).
```

Variants: Netflix Standard with Ads = 1796 → 8; Disney+ Basic with Ads = 1899 → 337; ITV Hub (legacy 41) → ITVX (54); Amazon Video (rent/buy 10) → Prime (9); Apple iTunes (2) → Apple TV+ (350); Sky Store (130) → NOW (39).

## Quirks and gotchas

- Discover pagination is region-aware. `watch_region=GB` plus `with_watch_providers` returns substantially fewer titles than unfiltered global discover. Sync uses unfiltered discover and filters availability separately via SA API.
- `watch/providers` lags release. New TMDb titles often have empty `watch/providers` for days to weeks. Network-name fallback partly mitigates.
- Provider IDs drift; ongoing maintenance needed in `PROVIDER_ID_VARIANTS`.
- TMDb uses sentinel zeros for missing numeric data (`runtime: 0`, `vote_count: 0`, `popularity: 0`, `episode_count: 0`). Filter to `n > 0`. Lesson from Phase 0.5.
- TMDb's `created_by[]` is the TV showrunner field, not a general director field. Structurally empty for documentaries, reality, anthology, old/foreign titles. See [phase-0-5](../../concepts/operations/phase-0-5.md) for the 54.9% TV director fill rate.

## Rate limits

50 req/sec per IP, ~1M/day historically. Videx stays well under via `cache.ts` and bulk-then-incremental sync.

## Attribution

Required: "This product uses the TMDB API but is not endorsed or certified by TMDB." Logo display required. See `docs/Attributions.md`.
